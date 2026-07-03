import { Chess, type Move } from "chess.js";
import crypto from "crypto";
import {
  AiChatMessage,
  AiGameEndReason,
  AiGameOverData,
  AiGameState,
  AiMoveMadeData,
  AiMoveSource,
  AiReviewData,
  AiTurnRecord,
} from "../types/aiGame.js";
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
  retryMoveStructured,
  streamMoveTurn,
} from "./aiOpponentLlm.js";

const MOVE_CAP_HALF_MOVES = 200; // adjudicated draw beyond this
const RECENT_THINKING_TURNS = 3;
const RECENT_CHAT_WINDOW = 10;
const CHAT_REPLY_MIN_GAP_MS = 20_000;
const CHAT_REPLIES_PER_GAME = 20;
const BOT_TURN_HARD_CAP_MS = 25_000;

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

/**
 * Handler-provided pacing surface for a single bot turn. The service pushes
 * chat into it as the LLM streams; the handler emits with human-like typing
 * delays to the game room.
 */
export interface PacedChat {
  /** Queue a bot chat message for paced emission; returns the message record. */
  enqueue(text: string): AiChatMessage;
  /** Messages actually emitted (or queued) this turn, in order. */
  messages(): AiChatMessage[];
  /** Resolves once every queued message has been emitted. */
  whenDrained(): Promise<void>;
  /** Emit everything still queued immediately (turn overran its budget). */
  flushNow(): void;
}

export interface AiGameEnd {
  data: AiGameOverData;
  farewell: AiChatMessage | null;
}

export interface BotTurnResult {
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
    const state = await this.getGameForUser(gameId, uid);
    if (!state) return { ok: false, error: "not-found" };
    if (state.status === "bot-thinking" || this.isBotTurnInProgress(gameId)) {
      return { ok: false, error: "busy" };
    }
    if (state.status !== "active" || !this.isPlayersTurn(state)) {
      return { ok: false, error: "not-your-turn" };
    }

    const chess = new Chess(state.fen);
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
  }

  /**
   * Run the bot's turn: stream the LLM (chat paced out via `paced`, thinking
   * accumulated privately), resolve a guaranteed-legal move, persist the turn
   * record, and report the move + any game end. Never rejects; never leaves
   * the game stuck. Returns null if a turn is already running for this game.
   */
  runBotTurn(
    gameId: string,
    paced: PacedChat,
  ): Promise<BotTurnResult | null> | null {
    if (this.botTurnLocks.has(gameId)) return null;
    const promise = this.executeBotTurn(gameId, paced)
      .catch((error): BotTurnResult | null => {
        console.error("[AiGame] Bot turn failed unexpectedly:", error);
        return null;
      })
      .finally(() => this.botTurnLocks.delete(gameId));
    this.botTurnLocks.set(gameId, promise);
    return promise;
  }

  private async executeBotTurn(
    gameId: string,
    paced: PacedChat,
  ): Promise<BotTurnResult | null> {
    const turnStart = Date.now();
    const state = await aiGameStore.getGame(gameId);
    if (!state || state.status === "completed") return null;

    const persona = getPersona(state.personaId);
    if (!persona) return null;

    // Snapshot + clear the pending player chat this turn will answer. Saving
    // now (with the thinking status) lets mid-turn chat accumulate freshly.
    const pendingPlayerChat = [...state.pendingPlayerChat];
    state.pendingPlayerChat = [];
    state.status = "bot-thinking";
    await aiGameStore.setGame(gameId, state);

    const chess = new Chess(state.fen);
    const legalMoves = chess.moves();
    const botColor = this.botColor(state);

    let thinking = "";
    let proposedMove: string | null = null;
    let source: AiMoveSource = "llm";

    const llmAllowed = await aiUsageLimiter.tryConsumeLlmTurn(state.uid);
    if (llmAllowed) {
      try {
        const stream = streamMoveTurn({
          persona,
          fen: state.fen,
          movesSan: state.moves,
          botColor,
          legalMoves,
          recentThinking: state.turns
            .slice(-RECENT_THINKING_TURNS)
            .map((t) => ({ turnIndex: t.turnIndex, thinking: t.thinking })),
          recentChat: state.chat.slice(-RECENT_CHAT_WINDOW),
          pendingPlayerChat,
          isFirstMove: state.moves.length === 0,
        });
        for await (const event of stream) {
          if (event.type === "chat") {
            paced.enqueue(event.text);
          } else if (event.type === "think") {
            thinking += (thinking ? "\n" : "") + event.text;
          } else {
            proposedMove = event.san;
          }
        }
      } catch (error) {
        console.warn("[AiGame] Bot turn stream error:", error);
      }
    } else {
      // Daily LLM budget exhausted mid-game: play on silently via the
      // heuristic. Announce it once, not every turn.
      const lastTurn = state.turns[state.turns.length - 1];
      if (!lastTurn || lastTurn.moveSource === "llm" || lastTurn.moveSource === "llm-retry") {
        paced.enqueue("I'll play on in silence from here.");
      }
    }

    // Move resolution — fallback chain, always ends with a legal move.
    let move = this.matchLegalMove(proposedMove, legalMoves, state.fen);
    if (!move && llmAllowed) {
      move = await retryMoveStructured(
        state.fen,
        state.moves,
        legalMoves,
        proposedMove,
      );
      if (move) source = "llm-retry";
    }
    if (!move) {
      move = this.heuristicMove(chess);
      source = "heuristic";
    }
    if (!move) {
      move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      source = "random";
    }
    if (source !== "llm") {
      console.warn("[AiGame] fallback", {
        gameId,
        turnIndex: state.moves.length,
        proposed: proposedMove,
        source,
      });
    }

    // If the LLM produced neither chat nor a usable stream, cover the silence
    // with a canned in-character filler so the typing pause reads as human.
    if (llmAllowed && paced.messages().length === 0 && source !== "llm") {
      paced.enqueue(persona.fallbackFiller);
    }

    // Human pacing: never move instantly; if the turn overran, stop pacing.
    const minTurnMs = 3500 + Math.random() * 2500;
    const elapsed = Date.now() - turnStart;
    if (elapsed > BOT_TURN_HARD_CAP_MS) {
      paced.flushNow();
    } else if (elapsed < minTurnMs) {
      await sleep(minTurnMs - elapsed);
    }
    await paced.whenDrained();

    // Reload before saving: player chat may have arrived mid-turn.
    const fresh = await aiGameStore.getGame(gameId);
    if (!fresh || fresh.status === "completed") return null;

    const turnIndex = fresh.moves.length;
    const applied = chess.move(move) as Move; // legal by construction
    fresh.fen = chess.fen();
    fresh.moves.push(applied.san);
    fresh.chat.push(...paced.messages());
    fresh.turns.push({
      turnIndex,
      fenBefore: state.fen,
      thinking,
      chatEmitted: paced.messages().map((m) => m.text),
      move: applied.san,
      moveSource: source,
      llmProposedMove: proposedMove,
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
    };

    const endReason = this.detectGameEnd(chess, fresh);
    if (endReason) {
      const gameOver = await this.finishGame(fresh, endReason, "bot");
      return { moveData, gameOver };
    }

    fresh.status = "active";
    await aiGameStore.setGame(gameId, fresh);
    return { moveData, gameOver: null };
  }

  /** Steps 1–2 of the fallback chain: exact then fuzzy SAN matching. */
  private matchLegalMove(
    proposed: string | null,
    legalMoves: string[],
    fen: string,
  ): string | null {
    if (!proposed) return null;
    if (legalMoves.includes(proposed)) return proposed;

    const strip = (san: string) => san.replace(/[+#!?]/g, "").toLowerCase();
    const match = legalMoves.find((m) => strip(m) === strip(proposed));
    if (match) return match;

    // Last fuzzy attempt: let chess.js parse it leniently (handles LAN etc.)
    try {
      const scratch = new Chess(fen);
      const result = scratch.move(proposed, { strict: false });
      if (result) return result.san;
    } catch {
      // fall through
    }
    return null;
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
    const state = await this.getGameForUser(gameId, uid);
    if (!state || state.status === "completed") return null;
    return this.finishGame(state, "resignation", "player-resigned");
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
    if (persona) {
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
    await aiGameStore.setGame(gameId, state);
    return { state, message };
  }

  /**
   * Chat-only reply while it's the player's turn. Enforces the per-game and
   * rate limits; returns null (message stays queued for the next move turn)
   * when a reply isn't warranted or the LLM fails.
   */
  async tryGenerateChatReply(
    gameId: string,
    uid: string,
    playerMessage: string,
  ): Promise<AiChatMessage | null> {
    const state = await this.getGameForUser(gameId, uid);
    if (!state || !this.isPlayersTurn(state)) return null;
    if (state.chatRepliesUsed >= CHAT_REPLIES_PER_GAME) return null;
    if (Date.now() - state.lastChatReplyAt < CHAT_REPLY_MIN_GAP_MS) {
      return null;
    }

    const persona = getPersona(state.personaId);
    if (!persona) return null;
    if (!(await aiUsageLimiter.tryConsumeLlmTurn(uid))) return null;

    const text = await generateChatReply(
      persona,
      state.fen,
      state.moves,
      state.chat.slice(-6),
      playerMessage,
    );
    if (!text) return null;

    // Reload: the pending queue may have moved while the LLM ran.
    const fresh = await aiGameStore.getGame(gameId);
    if (!fresh || fresh.status !== "active") return null;

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
    if (pendingIndex !== -1) fresh.pendingPlayerChat.splice(pendingIndex, 1);
    fresh.chatRepliesUsed += 1;
    fresh.lastChatReplyAt = Date.now();
    await aiGameStore.setGame(gameId, fresh);
    return message;
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
        moveSource: t.moveSource,
      })),
      chat: state.chat,
    };
  }
}

export const aiGameService = new AiGameService();
