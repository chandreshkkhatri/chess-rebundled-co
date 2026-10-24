import { Server, Socket } from "socket.io";
import { runGameMutation } from "../lib/gameMutationQueue.js";
import { ClientToServerEvents, ServerToClientEvents } from "../types/index.js";
import {
  AiMoveParseRequest,
  AiGameState,
  AiGameResumedData,
} from "../types/aiGame.js";
import {
  aiGameService,
  AiGameEnd,
} from "../services/aiGameService.js";
import { getPersona, toPublicPersona } from "../data/aiPersonas.js";

import { guardSocketRequest, hasText, validTextParse, validAudioParse } from "../lib/socketRequest.js";
import { aiUsageLimiter } from "../services/aiUsageLimiter.js";
import { parseChessMoveWithAI } from "../services/aiMoveParser.js";
import { parseChessMoveFromAudio } from "../services/geminiAudioParser.js";
import { chessFromHistory } from "../lib/chessHistory.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_CHAT_LENGTH = 280;
const CHAT_FLOOD_WINDOW_MS = 10_000;
const CHAT_FLOOD_MAX = 4;

function hasStringFields(data: unknown, fields: string[]): data is Record<string, string> {
  return typeof data === "object" && data !== null && !Array.isArray(data) &&
    fields.every((field) => typeof (data as Record<string, unknown>)[field] === "string");
}

function hasGameId(data: unknown): data is Record<string, string> {
  return hasStringFields(data, ["gameId"]) && data.gameId.length > 0 && data.gameId.length <= 128;
}

function isGenAiConfigured(): boolean {
  if (process.env.GOOGLE_API_KEY) return true;
  return (
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" &&
    !!process.env.FIREBASE_CLIENT_EMAIL &&
    !!process.env.FIREBASE_PRIVATE_KEY
  );
}

export class AiGameHandler {
  // Per-game sliding window for the chat flood guard.
  private chatRepliesInProgress = new Set<string>();
  private chatTimestamps: Map<string, number[]> = new Map();

  constructor(private io: GameServer) {}

  register(socket: GameSocket): void {
    // Socket.io does not consume promises returned by event listeners.
    const guard = <T>(handler: (data: T) => Promise<void>, valid: (data: unknown) => boolean) =>
      (data: T): void => {
        if (!valid(data)) {
          socket.emit("ai-error", { message: "Invalid AI request" });
          return;
        }
        void Promise.resolve().then(() => handler(data)).catch((error) => {
          console.error("[AiGame] Request failed:", error);
          socket.emit("ai-error", { message: "Unable to process AI request. Please try again." });
        });
      };

    for (const audio of [false, true]) {
      socket.on(audio ? "ai-parse-audio" : "ai-parse-move", (data: AiMoveParseRequest) =>
        guardSocketRequest(
          (request: AiMoveParseRequest) => this.handleParseMove(socket, request, audio),
          request => hasGameId(request) && hasText(request, "requestId") && hasText(request, "fen", 200) &&
            (audio ? validAudioParse(request) : validTextParse(request)),
          message => socket.emit("ai-parse-error", {
            requestId: typeof data?.requestId === "string" ? data.requestId : "", message,
          }),
        )(data));
    }

    socket.on("ai-start", guard(this.handleStart.bind(this, socket), (data) =>
      hasStringFields(data, ["personaId", "playerColor"]) &&
      data.personaId.length > 0 && data.personaId.length <= 128 &&
      ["white", "black", "random"].includes(data.playerColor)));
    socket.on("ai-submit-move", guard(this.handleSubmitMove.bind(this, socket), (data) =>
      hasGameId(data) && hasStringFields(data, ["move"]) &&
      data.move.length > 0 && data.move.length <= 100));
    socket.on("ai-send-chat", guard(this.handleSendChat.bind(this, socket), (data) =>
      hasGameId(data) && hasStringFields(data, ["text"])));
    socket.on("ai-resign", guard(this.handleResign.bind(this, socket), hasGameId));
    socket.on("ai-reconnect", guard(this.handleReconnect.bind(this, socket), hasGameId));
    socket.on("ai-get-review", guard(this.handleGetReview.bind(this, socket), hasGameId));
  }

  private room(gameId: string): string {
    return `ai:${gameId}`;
  }

  private requireUid(socket: GameSocket): string | null {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit("ai-error", {
        message: "Sign in to play against the AI",
        code: "AUTH_REQUIRED",
      });
      return null;
    }
    return uid;
  }

  private emitGameEnd(gameId: string, gameOver: AiGameEnd): void {
    if (gameOver.farewell) {
      this.io
        .to(this.room(gameId))
        .emit("ai-chat-message", { gameId, message: gameOver.farewell });
    }
    this.io.to(this.room(gameId)).emit("ai-game-over", gameOver.data);
  }

  /**
   * Kick off the bot's move turn. Fire-and-forget from the caller's side —
   * everything is emitted to the game room, not the triggering socket.
   */
  private startBotTurn(gameId: string): void {
    const turn = aiGameService.runBotTurn(gameId);
    if (!turn) return; // already running

    this.io.to(this.room(gameId)).emit("ai-bot-turn-started", { gameId });

    void turn.then((result) => {
      if (!result) {
        // Turn aborted (game completed mid-turn, e.g. resignation) — the end
        // flow already emitted; just release the input lock.
        this.io.to(this.room(gameId)).emit("ai-bot-turn-ended", { gameId });
        return;
      }
      this.io.to(this.room(gameId)).emit("ai-move-made", result.moveData);
      this.io.to(this.room(gameId)).emit("ai-bot-turn-ended", { gameId });
      if (result.gameOver) {
        this.emitGameEnd(gameId, result.gameOver);
      } else if (result.pendingChat) {
        // The move has already been emitted; conversation never delays it.
        void this.replyToChat(gameId);
      }
    });
  }

  private buildResumeData(state: AiGameState): AiGameResumedData {
    const persona = getPersona(state.personaId);
    return {
      gameId: state.id,
      playerColor: state.playerColor,
      persona: persona
        ? toPublicPersona(persona)
        : {
            id: state.personaId,
            name: "AI Opponent",
            emoji: "🤖",
            tagline: "",
            rating: 0,
          },
      fen: state.fen,
      moves: state.moves,
      turn: state.fen.split(" ")[1] === "b" ? "black" : "white",
      chat: state.chat,
      status: state.status,
      aiNotice: state.aiNotice ?? null,
      botTurnInProgress:
        state.status === "bot-thinking" ||
        aiGameService.isBotTurnInProgress(state.id),
      result: state.result,
      endReason: state.endReason,
      winner: state.winner,
    };
  }

  private async handleStart(
    socket: GameSocket,
    data: { personaId: string; playerColor: "white" | "black" | "random" },
  ): Promise<void> {
    const uid = this.requireUid(socket);
    if (!uid) return;

    if (!isGenAiConfigured()) {
      socket.emit("ai-error", {
        message: "AI opponent is offline",
        code: "AI_UNAVAILABLE",
      });
      return;
    }

    await runGameMutation(`ai-user:${uid}`, async () => {
      // One active AI game per user — hand the existing one back for resume.
      const existingGameId = await aiGameService.getActiveGameId(uid);
      if (existingGameId) {
        const existing = await aiGameService.getGameForUser(existingGameId, uid);
        if (existing && existing.status !== "completed") {
          socket.join(this.room(existingGameId));
          socket.emit("ai-game-resumed", this.buildResumeData(existing));
          return;
        }
      }

      const playerColor =
        data.playerColor === "random"
          ? Math.random() < 0.5
            ? "white"
            : "black"
          : data.playerColor;
      const playerName = socket.data.email?.split("@")[0] || "Player";

      const created = await aiGameService.createGame(
        uid,
        playerName,
        data.personaId,
        playerColor,
      );
      if (!created.ok) {
        socket.emit("ai-error", {
          message:
            created.error === "limit-reached"
              ? "Daily AI game limit reached — come back tomorrow!"
              : "Unknown opponent selected",
          code: created.error === "limit-reached" ? "LIMIT_REACHED" : undefined,
        });
        return;
      }

      socket.join(this.room(created.state.id));
      socket.emit("ai-game-started", {
        gameId: created.state.id,
        playerColor,
        persona: toPublicPersona(created.persona),
        fen: created.state.fen,
      });

      // Bot opens the game when the player took black.
      if (playerColor === "black") {
        this.startBotTurn(created.state.id);
      }
    });
  }

  private async handleSubmitMove(
    socket: GameSocket,
    data: { gameId: string; move: string },
  ): Promise<void> {
    const uid = this.requireUid(socket);
    if (!uid) return;

    const result = await aiGameService.applyPlayerMove(
      data.gameId,
      uid,
      data.move,
    );

    if (!result.ok) {
      switch (result.error) {
        case "not-found":
          socket.emit("ai-game-not-found", {
            gameId: data.gameId,
            reason: "Game not found or expired",
          });
          return;
        case "busy":
          socket.emit("ai-error", {
            message: "Your opponent is still thinking",
            code: "BUSY",
          });
          return;
        case "not-your-turn":
          socket.emit("ai-error", { message: "It's not your turn" });
          return;
        case "illegal":
          socket.emit("ai-illegal-move", {
            gameId: data.gameId,
            move: data.move,
            reason: result.reason,
          });
          return;
      }
    }

    this.io.to(this.room(data.gameId)).emit("ai-move-made", result.moveData);

    if (result.gameOver) {
      this.emitGameEnd(data.gameId, result.gameOver);
      return;
    }

    this.startBotTurn(data.gameId);
  }

  private isChatFlooding(gameId: string): boolean {
    const now = Date.now();
    const window = (this.chatTimestamps.get(gameId) || []).filter(
      (ts) => now - ts < CHAT_FLOOD_WINDOW_MS,
    );
    if (window.length >= CHAT_FLOOD_MAX) {
      this.chatTimestamps.set(gameId, window);
      return true;
    }
    window.push(now);
    this.chatTimestamps.set(gameId, window);
    return false;
  }

  private async handleSendChat(
    socket: GameSocket,
    data: { gameId: string; text: string },
  ): Promise<void> {
    const uid = this.requireUid(socket);
    if (!uid) return;

    const text = (data.text || "").trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;

    if (this.isChatFlooding(data.gameId)) {
      socket.emit("ai-error", {
        message: "Slow down a little",
        code: "LIMIT_REACHED",
      });
      return;
    }

    const added = await aiGameService.addPlayerChat(data.gameId, uid, text);
    if (!added) {
      socket.emit("ai-game-not-found", {
        gameId: data.gameId,
        reason: "Game not found or already over",
      });
      return;
    }

    // Echo so every tab of the player stays in sync.
    this.io
      .to(this.room(data.gameId))
      .emit("ai-chat-message", { gameId: data.gameId, message: added.message });

    // Messages received while the bot thinks are answered after its move.
    if (aiGameService.isPlayersTurn(added.state)) await this.replyToChat(data.gameId);
  }

  private async replyToChat(gameId: string): Promise<void> {
    if (this.chatRepliesInProgress.has(gameId)) return;
    this.chatRepliesInProgress.add(gameId);
    this.io.to(this.room(gameId)).emit("ai-typing", { gameId, typing: true });
    try {
      const reply = await aiGameService.tryGeneratePendingChatReply(gameId);
      if (reply) this.io.to(this.room(gameId)).emit("ai-chat-message", { gameId, message: reply });
    } catch {
      console.warn("[AiGame] Conversation reply unavailable");
    } finally {
      this.chatRepliesInProgress.delete(gameId);
      this.io.to(this.room(gameId)).emit("ai-typing", { gameId, typing: false });
    }
  }

  private async handleParseMove(socket: GameSocket, data: AiMoveParseRequest, audio: boolean): Promise<void> {
    const fail = (message: string) => socket.emit("ai-parse-error", { requestId: data.requestId, message });
    const uid = socket.data.uid;
    if (!uid) { fail("Sign in to use speech input"); return; }
    const state = await aiGameService.getGameForUser(data.gameId, uid);
    if (!state || !aiGameService.isPlayersTurn(state) || aiGameService.isBotTurnInProgress(data.gameId) || state.fen !== data.fen) {
      fail("The position changed or it is not your turn");
      return;
    }
    if (!(await aiUsageLimiter.tryConsumeParse(`user:${uid}`))) {
      fail("Daily voice parsing limit reached. Please type your move.");
      return;
    }
    const { getVoiceCalibration } = await import("../services/firestoreService.js");
    const confusionMap = (await getVoiceCalibration(uid))?.confusionMap;
    const legalMoves = chessFromHistory(state.moves).moves();
    const options = { allowGuessOnUnclear: false, confusionMap };
    const parsed = audio
      ? await parseChessMoveFromAudio(data.audioBase64!, data.mimeType!, state.fen, legalMoves, options)
      : await parseChessMoveWithAI(data.rawTranscript || data.transcript!, state.fen, legalMoves, options);
    const fresh = await aiGameService.getGameForUser(data.gameId, uid);
    if (!fresh || !aiGameService.isPlayersTurn(fresh) || fresh.fen !== data.fen) {
      fail("The position changed. Please enter your move again.");
      return;
    }
    socket.emit("ai-move-parsed", {
      gameId: data.gameId, requestId: data.requestId, fen: data.fen,
      transcript: "transcription" in parsed && typeof parsed.transcription === "string"
        ? parsed.transcription : data.transcript || "[audio input]",
      parsedMove: parsed.move, confidence: parsed.confidence,
      alternatives: parsed.alternatives, reasoning: parsed.reasoning,
    });
  }

  private async handleResign(
    socket: GameSocket,
    data: { gameId: string },
  ): Promise<void> {
    const uid = this.requireUid(socket);
    if (!uid) return;

    const gameOver = await aiGameService.resign(data.gameId, uid);
    if (!gameOver) {
      socket.emit("ai-game-not-found", {
        gameId: data.gameId,
        reason: "Game not found or already over",
      });
      return;
    }
    this.emitGameEnd(data.gameId, gameOver);
  }

  private async handleReconnect(
    socket: GameSocket,
    data: { gameId: string },
  ): Promise<void> {
    const uid = this.requireUid(socket);
    if (!uid) return;

    const state = await aiGameService.getGameForUser(data.gameId, uid);
    if (!state) {
      socket.emit("ai-game-not-found", {
        gameId: data.gameId,
        reason: "Game not found or expired",
      });
      return;
    }

    socket.join(this.room(data.gameId));
    socket.emit("ai-game-resumed", this.buildResumeData(state));
    if (state.status !== "completed" && state.fen.split(" ")[1] !== (state.playerColor === "white" ? "w" : "b")) {
      this.startBotTurn(state.id);
    }
  }

  private async handleGetReview(
    socket: GameSocket,
    data: { gameId: string },
  ): Promise<void> {
    const uid = this.requireUid(socket);
    if (!uid) return;

    const review = await aiGameService.getReviewData(data.gameId, uid);
    if (!review) {
      socket.emit("ai-game-not-found", {
        gameId: data.gameId,
        reason: "No completed game found to review",
      });
      return;
    }
    socket.emit("ai-review-data", review);
  }
}
