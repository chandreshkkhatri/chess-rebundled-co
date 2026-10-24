import { Chess, type Move } from "chess.js";
import { chessFromHistory } from "../lib/chessHistory.js";
import crypto from "crypto";
import { runGameMutation } from "../lib/gameMutationQueue.js";
import {
  AiChatMessage,
  AiDecisionSummary,
  AiGameEndReason,
  AiGameOverData,
  AiGameState,
  AiMoveMadeData,
  AiMoveSource,
  AiReviewData,
  AiTurnRecord,
} from "../types/aiGame.js";
import { GEMINI_MODEL } from "../lib/genaiClient.js";
import { minimumAiTurnMs } from "./aiTurnTiming.js";
import { aiGameStore } from "./aiGameSessionStore.js";
import { aiUsageLimiter } from "./aiUsageLimiter.js";
import {
  AiPersona,
  getPersona,
  toPublicPersona,
} from "../data/aiPersonas.js";
import {
  generateChatReply,
  generateFarewell,
  chooseMoveTurn,
  opponentErrorInfo,
  type MoveTurnParams,
} from "./aiOpponentLlm.js";

const MOVE_CAP_HALF_MOVES = 200; // adjudicated draw beyond this
const RECENT_DECISION_TURNS = 3;
const CHAT_REPLY_MIN_GAP_MS = 20_000;
const CHAT_REPLIES_PER_GAME = 20;
const BOT_TURN_HARD_CAP_MS = 25_000;
const PRIMARY_REQUEST_MS = 19_000;

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AiGameEnd {
  data: AiGameOverData;
  farewell: AiChatMessage | null;
}

export interface BotTurnResult {
  pendingChat: boolean;
  moveData: AiMoveMadeData;
  gameOver: AiGameEnd | null;
}

export type PlayerMoveResult =
  | { ok: false; error: "not-found" | "busy" | "not-your-turn" }
  | { ok: false; error: "illegal"; reason: string }
  | {
      ok: true;
      state: AiGameState;
      moveData: AiMoveMadeData;
      gameOver: AiGameEnd | null;
    };

export class AiGameService {
  private botTurnLocks: Map<string, Promise<BotTurnResult | null>> = new Map();

  isBotTurnInProgress(gameId: string): boolean {
    return this.botTurnLocks.has(gameId);
  }

  async createGame(
    uid: string,
    playerName: string,
    personaId: string,
    playerColor: "white" | "black",
  ): Promise<
    | { ok: true; state: AiGameState; persona: AiPersona }
    | { ok: false; error: "unknown-persona" | "limit-reached" }
  > {
    const persona = getPersona(personaId);
    if (!persona) return { ok: false, error: "unknown-persona" };

    if (!(await aiUsageLimiter.tryConsumeGame(uid))) {
      return { ok: false, error: "limit-reached" };
    }

    const chess = new Chess();
    const state: AiGameState = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      uid,
      playerName,
      playerColor,
      personaId,
      status: "active",
      fen: chess.fen(),
      moves: [],
      chat: [],
      turns: [],
      pendingPlayerChat: [],
      chatRepliesUsed: 0,
      lastChatReplyAt: 0,
      result: null,
      endReason: null,
      winner: null,
      createdAt: Date.now(),
      completedAt: null,
      aiNotice: null,
    };

    await aiGameStore.setGame(state.id, state);
    await aiGameStore.setUidMapping(uid, state.id);
    return { ok: true, state, persona };
  }

  async getGameForUser(
    gameId: string,
    uid: string,
  ): Promise<AiGameState | undefined> {
    const state = await aiGameStore.getGame(gameId);
    return state && state.uid === uid ? state : undefined;
  }

  async getActiveGameId(uid: string): Promise<string | undefined> {
    return aiGameStore.getGameIdByUid(uid);
  }

  private botColor(state: AiGameState): "white" | "black" {
    return state.playerColor === "white" ? "black" : "white";
  }

  private turnFromFen(fen: string): "white" | "black" {
    return fen.split(" ")[1] === "b" ? "black" : "white";
  }

  isPlayersTurn(state: AiGameState): boolean {
    return (
      state.status === "active" &&
      this.turnFromFen(state.fen) === state.playerColor
    );
  }

  async applyPlayerMove(
    gameId: string,
    uid: string,
    moveInput: string,
  ): Promise<PlayerMoveResult> {
    return runGameMutation(`ai:${gameId}`, async () => {
      const state = await this.getGameForUser(gameId, uid);
      if (!state) return { ok: false, error: "not-found" };
      if (state.status === "bot-thinking" || this.isBotTurnInProgress(gameId)) {
        return { ok: false, error: "busy" };
      }
      if (state.status !== "active" || !this.isPlayersTurn(state)) {
        return { ok: false, error: "not-your-turn" };
      }

      const chess = chessFromHistory(state.moves);
      let moveResult: Move | null = null;
      try {
        moveResult = chess.move(moveInput, { strict: false });
      } catch {
        moveResult = null;
      }
      if (!moveResult) {
        return { ok: false, error: "illegal", reason: "Move is not legal" };
      }

      state.fen = chess.fen();
      state.moves.push(moveResult.san);

      const moveData: AiMoveMadeData = {
        gameId,
        by: "player",
        move: {
          san: moveResult.san,
          from: moveResult.from,
          to: moveResult.to,
        },
        fen: state.fen,
        turn: this.turnFromFen(state.fen),
        moveCount: state.moves.length,
        isCheck: chess.isCheck(),
      };

      const endReason = this.detectGameEnd(chess, state);
      if (endReason) {
        const gameOver = await this.finishGame(state, endReason, "player");
        return { ok: true, state, moveData, gameOver };
      }

      await aiGameStore.setGame(gameId, state);
      return { ok: true, state, moveData, gameOver: null };
    });
  }

  /** Choose a move without conversation; save review summaries only on commit. */
  runBotTurn(gameId: string): Promise<BotTurnResult | null> | null {
    if (this.botTurnLocks.has(gameId)) return null;
    const promise = this.executeBotTurn(gameId)
      .catch((error): BotTurnResult | null => {
        console.error("[AiGame] Bot turn failed unexpectedly:", opponentErrorInfo(error));
        return null;
      })
      .finally(() => this.botTurnLocks.delete(gameId));
    this.botTurnLocks.set(gameId, promise);
    return promise;
  }

  private async executeBotTurn(gameId: string): Promise<BotTurnResult | null> {
    const turnStart = Date.now();
    const state = await runGameMutation(`ai:${gameId}`, async () => {
      const current = await aiGameStore.getGame(gameId);
      if (!current || current.status === "completed" || this.turnFromFen(current.fen) === current.playerColor) return null;
      current.status = "bot-thinking";
      await aiGameStore.setGame(gameId, current);
      return current;
    });
    if (!state) return null;
    const persona = getPersona(state.personaId);
    if (!persona) return null;

    const chess = chessFromHistory(state.moves);
    const legalMoves = chess.moves();
    if (!legalMoves.length) return null;
    const params: MoveTurnParams = {
      persona, fen: state.fen, movesSan: state.moves, botColor: this.botColor(state), legalMoves,
      recentDecisions: state.turns.slice(-RECENT_DECISION_TURNS).flatMap(turn =>
        turn.decision ? [{ move: turn.move, plan: turn.decision.plan }] : []),
    };
    let move: string | null = null;
    let decision: AiDecisionSummary | null = null;
    let source: AiMoveSource = "llm";
    const llmAllowed = await aiUsageLimiter.tryConsumeLlmTurn(state.uid);
    if (llmAllowed) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = BOT_TURN_HARD_CAP_MS - (Date.now() - turnStart);
        if (remaining < 500) break;
        try {
          const selected = await chooseMoveTurn(params, Math.min(remaining, attempt === 0 ? PRIMARY_REQUEST_MS : 6000), attempt > 0);
          move = selected.move;
          decision = selected.decision;
          source = attempt === 0 ? "llm" : "llm-retry";
          break;
        } catch (error) {
          const info = opponentErrorInfo(error);
          console.warn("[AiGame] request-failed", JSON.stringify({ model: GEMINI_MODEL, attempt: attempt + 1, ...info }));
          if (!info.retryable) break;
          // Retries are real provider calls and consume the same daily allowance.
          if (attempt === 0 && !(await aiUsageLimiter.tryConsumeLlmTurn(state.uid))) break;
        }
      }
    }
    const generationMs = Date.now() - turnStart;
    if (!move) {
      move = this.heuristicMove(chess);
      source = "heuristic";
    }
    if (!move) {
      move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      source = "random";
    }
    const aiNotice = source === "heuristic" || source === "random"
      ? llmAllowed
        ? "The AI couldn't choose a move. A simple chess fallback is playing until it recovers."
        : "Today's AI allowance has been used. A simple chess fallback will finish the game."
      : null;
    const waitMs = Math.min(
      BOT_TURN_HARD_CAP_MS - (Date.now() - turnStart),
      minimumAiTurnMs(chess, state.moves.length) - generationMs,
    );
    if (waitMs > 0) await sleep(waitMs);

    return runGameMutation(`ai:${gameId}`, async () => {
      // Reload before saving: player chat may have arrived mid-turn.
      const fresh = await aiGameStore.getGame(gameId);
      if (!fresh || fresh.status === "completed" || fresh.fen !== state.fen) return null;

      const turnIndex = fresh.moves.length;
      const applied = chess.move(move) as Move; // legal by construction
      fresh.fen = chess.fen();
      fresh.moves.push(applied.san);
      fresh.aiNotice = aiNotice;
      fresh.turns.push({
        turnIndex,
        fenBefore: state.fen,
        // Older deployed frontends can still show the chosen move's summary.
        thinking: decision ? [
          decision.summary,
          ...decision.alternatives.map(alternative => `Alternative ${alternative.move}: ${alternative.reason}`),
          `Threat: ${decision.threat}`,
          `Plan: ${decision.plan}`,
        ].join("\n") : "",
        ...(decision ? { decision } : {}),
        chatEmitted: [],
        move: applied.san,
        moveSource: source,
        llmProposedMove: decision ? move : null,
        durationMs: Date.now() - turnStart,
      } satisfies AiTurnRecord);

      const moveData: AiMoveMadeData = {
        gameId,
        by: "bot",
        move: { san: applied.san, from: applied.from, to: applied.to },
        fen: fresh.fen,
        turn: this.turnFromFen(fresh.fen),
        moveCount: fresh.moves.length,
        isCheck: chess.isCheck(),
        aiNotice,
      };
      console.info("[AiGame] turn-completed", JSON.stringify({
        model: GEMINI_MODEL, source, generationMs, durationMs: Date.now() - turnStart,
        hasSummary: decision !== null,
      }));

      const endReason = this.detectGameEnd(chess, fresh);
      if (endReason) {
        const gameOver = await this.finishGame(fresh, endReason, "bot");
        return { moveData, gameOver, pendingChat: false };
      }

      fresh.status = "active";
      await aiGameStore.setGame(gameId, fresh);
      return { moveData, gameOver: null, pendingChat: fresh.pendingPlayerChat.length > 0 };
    });
  }

  /**
   * Dependency-free stand-in when the LLM can't produce a legal move:
   * prefer mate > best capture > check > castling > development.
   */
  private heuristicMove(chess: Chess): string | null {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    let best: { san: string; score: number }[] = [];
    for (const move of moves) {
      let score = 0;
      const scratch = new Chess(chess.fen());
      scratch.move(move.san);
      if (scratch.isCheckmate()) {
        score = 1000;
      } else {
        if (move.captured) {
          score +=
            PIECE_VALUES[move.captured] * 10 - PIECE_VALUES[move.piece];
        }
        if (scratch.isCheck()) score += 5;
        if (move.flags.includes("k") || move.flags.includes("q")) score += 4;
        const isCenterPawnPush =
          move.piece === "p" && ["d4", "d5", "e4", "e5"].includes(move.to);
        const isMinorDevelopment =
          (move.piece === "n" || move.piece === "b") &&
          (move.from[1] === "1" || move.from[1] === "8");
        if (isCenterPawnPush || isMinorDevelopment) score += 3;
      }
      if (best.length === 0 || score > best[0].score) {
        best = [{ san: move.san, score }];
      } else if (score === best[0].score) {
        best.push({ san: move.san, score });
      }
    }
    return best[Math.floor(Math.random() * best.length)].san;
  }

  private detectGameEnd(
    chess: Chess,
    state: AiGameState,
  ): AiGameEndReason | null {
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isStalemate()) return "stalemate";
    if (chess.isInsufficientMaterial()) return "insufficient_material";
    if (chess.isThreefoldRepetition()) return "threefold_repetition";
    if (chess.isDraw()) return "fifty_move_rule";
    if (state.moves.length >= MOVE_CAP_HALF_MOVES) return "move_cap";
    return null;
  }

  async resign(gameId: string, uid: string): Promise<AiGameEnd | null> {
    return runGameMutation(`ai:${gameId}`, async () => {
      const state = await this.getGameForUser(gameId, uid);
      if (!state || state.status === "completed") return null;
      return this.finishGame(state, "resignation", "player-resigned");
    });
  }

  /**
   * Finalize the game: compute the result, generate the bot's farewell,
   * persist to Redis (24h) and Firestore, and free the uid slot.
   */
  private async finishGame(
    state: AiGameState,
    endReason: AiGameEndReason,
    lastMover: "player" | "bot" | "player-resigned",
  ): Promise<AiGameEnd> {
    let result: "1-0" | "0-1" | "1/2-1/2";
    let winner: "player" | "bot" | null;

    if (endReason === "checkmate") {
      winner = lastMover === "bot" ? "bot" : "player";
      const winnerColor =
        winner === "player" ? state.playerColor : this.botColor(state);
      result = winnerColor === "white" ? "1-0" : "0-1";
    } else if (endReason === "resignation") {
      winner = "bot";
      result = this.botColor(state) === "white" ? "1-0" : "0-1";
    } else {
      winner = null;
      result = "1/2-1/2";
    }

    state.status = "completed";
    state.result = result;
    state.endReason = endReason;
    state.winner = winner;
    state.completedAt = Date.now();

    // In-character goodbye; canned persona line if the LLM call fails.
    const persona = getPersona(state.personaId);
    let farewell: AiChatMessage | null = null;
    if (persona && state.chat.some(message => message.from === "player")) {
      const summary =
        winner === "bot"
          ? `you won (${endReason.replace(/_/g, " ")})`
          : winner === "player"
            ? `you lost (${endReason.replace(/_/g, " ")})`
            : `it was a draw (${endReason.replace(/_/g, " ")})`;
      const llmAllowed = await aiUsageLimiter.tryConsumeLlmTurn(state.uid);
      const text =
        (llmAllowed
          ? await generateFarewell(persona, summary, state.chat.slice(-6))
          : null) || persona.fallbackFarewell;
      farewell = {
        id: crypto.randomUUID(),
        from: "bot",
        text,
        ts: Date.now(),
        turnIndex: state.moves.length,
      };
      state.chat.push(farewell);
    }

    await aiGameStore.setGame(state.id, state);
    await aiGameStore.deleteUidMapping(state.uid);

    // Permanent history — fire and forget.
    import("./firestoreService.js")
      .then(({ saveCompletedAiGame }) =>
        saveCompletedAiGame(state.uid, state),
      )
      .catch((error) =>
        console.error("[AiGame] Firestore save failed:", error),
      );

    return {
      data: {
        gameId: state.id,
        result,
        endReason,
        winner,
        fen: state.fen,
        pgn: this.buildPgn(state.moves),
        moves: state.moves,
        finalBotMessage: farewell?.text ?? null,
      },
      farewell,
    };
  }

  private buildPgn(moves: string[]): string {
    const chess = new Chess();
    for (const san of moves) {
      try {
        chess.move(san);
      } catch {
        break;
      }
    }
    return chess.pgn();
  }

  /**
   * Record an incoming player chat message. Returns the stored message, or
   * null when the game isn't accepting chat.
   */
  async addPlayerChat(
    gameId: string,
    uid: string,
    text: string,
  ): Promise<{ state: AiGameState; message: AiChatMessage } | null> {
    return runGameMutation(`ai:${gameId}`, async () => {
      const state = await this.getGameForUser(gameId, uid);
      if (!state || state.status === "completed") return null;

      const message: AiChatMessage = {
        id: crypto.randomUUID(),
        from: "player",
        text,
        ts: Date.now(),
        turnIndex: state.moves.length,
      };
      state.chat.push(message);
      state.pendingPlayerChat.push(text);
      state.pendingPlayerChat = state.pendingPlayerChat.slice(-10);
      await aiGameStore.setGame(gameId, state);
      return { state, message };
    });
  }

  /** Conversation queued during a bot turn is answered after its move. */
  async tryGeneratePendingChatReply(gameId: string): Promise<AiChatMessage | null> {
    const state = await aiGameStore.getGame(gameId);
    const message = state?.pendingPlayerChat.at(-1);
    if (!state || !message) return null;
    return this.tryGenerateChatReply(gameId, state.uid, message);
  }

  /**
   * Chat-only reply while it's the player's turn. Enforces the per-game and
   * rate limits; returns null (message stays queued for the next move turn)
   * when a reply is not warranted or the LLM fails.
   */
  async tryGenerateChatReply(
    gameId: string,
    uid: string,
    playerMessage: string,
  ): Promise<AiChatMessage | null> {
    const state = await runGameMutation(`ai:${gameId}`, async () => {
      const current = await this.getGameForUser(gameId, uid);
      if (!current || !this.isPlayersTurn(current) ||
          current.chatRepliesUsed >= CHAT_REPLIES_PER_GAME ||
          Date.now() - current.lastChatReplyAt < CHAT_REPLY_MIN_GAP_MS) return null;
      current.chatRepliesUsed += 1;
      current.lastChatReplyAt = Date.now();
      await aiGameStore.setGame(gameId, current);
      return current;
    });
    if (!state) return null;
    const persona = getPersona(state.personaId);
    if (!persona || !(await aiUsageLimiter.tryConsumeLlmTurn(uid))) return null;

    const text = await generateChatReply(
      persona,
      state.fen,
      state.moves,
      state.chat.slice(-6),
      playerMessage,
    );
    if (!text) return null;

    return runGameMutation(`ai:${gameId}`, async () => {
      // Reload: the pending queue may have moved while the LLM ran.
      const fresh = await aiGameStore.getGame(gameId);
      if (!fresh || fresh.uid !== uid || !this.isPlayersTurn(fresh) || fresh.fen !== state.fen) return null;

      const message: AiChatMessage = {
        id: crypto.randomUUID(),
        from: "bot",
        text,
        ts: Date.now(),
        turnIndex: fresh.moves.length,
      };
      fresh.chat.push(message);
      // The reply answered this message; don't re-feed it to the next turn.
      const pendingIndex = fresh.pendingPlayerChat.lastIndexOf(playerMessage);
      if (pendingIndex !== -1) fresh.pendingPlayerChat.splice(0, pendingIndex + 1);
      await aiGameStore.setGame(gameId, fresh);
      return message;
    });
  }

  async getReviewData(
    gameId: string,
    uid: string,
  ): Promise<AiReviewData | null> {
    let state = await aiGameStore.getGame(gameId);
    if (!state) {
      const { getAiGame } = await import("./firestoreService.js");
      state = (await getAiGame(uid, gameId)) ?? undefined;
    }
    if (!state || state.uid !== uid || state.status !== "completed") {
      return null;
    }

    const persona = getPersona(state.personaId);
    return {
      gameId: state.id,
      persona: persona
        ? toPublicPersona(persona)
        : {
            id: state.personaId,
            name: "AI Opponent",
            emoji: "🤖",
            tagline: "",
            rating: 0,
          },
      playerColor: state.playerColor,
      moves: state.moves,
      result: state.result,
      endReason: state.endReason,
      winner: state.winner,
      pgn: this.buildPgn(state.moves),
      turns: state.turns.map((t) => ({
        turnIndex: t.turnIndex,
        fenBefore: t.fenBefore,
        move: t.move,
        thinking: t.thinking,
        ...(t.decision ? { decision: t.decision } : {}),
        moveSource: t.moveSource,
      })),
      chat: state.chat,
    };
  }
}

export const aiGameService = new AiGameService();
