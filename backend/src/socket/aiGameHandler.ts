import { Server, Socket } from "socket.io";
import crypto from "crypto";
import { ClientToServerEvents, ServerToClientEvents } from "../types/index.js";
import {
  AiChatMessage,
  AiGameState,
  AiGameResumedData,
} from "../types/aiGame.js";
import {
  aiGameService,
  AiGameEnd,
  PacedChat,
} from "../services/aiGameService.js";
import { getPersona, toPublicPersona } from "../data/aiPersonas.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_CHAT_LENGTH = 280;
const CHAT_FLOOD_WINDOW_MS = 10_000;
const CHAT_FLOOD_MAX = 4;
const MAX_CHAT_PER_TURN = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isGenAiConfigured(): boolean {
  if (process.env.GOOGLE_API_KEY) return true;
  return (
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" &&
    !!process.env.FIREBASE_CLIENT_EMAIL &&
    !!process.env.FIREBASE_PRIVATE_KEY
  );
}

/**
 * Emits a bot turn's chat with human-like pacing: an initial "reading your
 * move" pause, a typing indicator sized to the message, and jittered gaps
 * between messages. The service enqueues as the LLM streams; emission runs
 * asynchronously against the game room so it survives socket reconnects.
 */
class PacedChatEmitter implements PacedChat {
  private queue: AiChatMessage[] = [];
  private accepted: AiChatMessage[] = [];
  private processing = false;
  private flushed = false;
  private firstMessage = true;
  private cancelDelay: (() => void) | null = null;
  private drainResolvers: (() => void)[] = [];

  constructor(
    private io: GameServer,
    private gameId: string,
    private turnIndex: number,
    private turnStart: number,
  ) {}

  enqueue(text: string): AiChatMessage {
    const message: AiChatMessage = {
      id: crypto.randomUUID(),
      from: "bot",
      text: text.slice(0, 200),
      ts: Date.now(),
      turnIndex: this.turnIndex,
    };
    if (this.accepted.length >= MAX_CHAT_PER_TURN) {
      return message; // over the per-turn cap: dropped, not emitted or stored
    }
    this.accepted.push(message);
    this.queue.push(message);
    void this.process();
    return message;
  }

  messages(): AiChatMessage[] {
    return this.accepted;
  }

  whenDrained(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.drainResolvers.push(resolve));
  }

  flushNow(): void {
    this.flushed = true;
    this.cancelDelay?.();
  }

  private delay(ms: number): Promise<void> {
    if (this.flushed || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.cancelDelay = null;
        resolve();
      }, ms);
      this.cancelDelay = () => {
        clearTimeout(timeout);
        this.cancelDelay = null;
        resolve();
      };
    });
  }

  private room(): string {
    return `ai:${this.gameId}`;
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      if (this.firstMessage) {
        this.firstMessage = false;
        // Let the opponent "read" the player's move before typing starts.
        await this.delay(800 - (Date.now() - this.turnStart));
      }

      while (this.queue.length > 0) {
        const message = this.queue.shift()!;
        if (!this.flushed) {
          this.io
            .to(this.room())
            .emit("ai-typing", { gameId: this.gameId, typing: true });
          await this.delay(clamp(600 + 35 * message.text.length, 900, 3200));
        }
        message.ts = Date.now();
        this.io
          .to(this.room())
          .emit("ai-chat-message", { gameId: this.gameId, message });
        this.io
          .to(this.room())
          .emit("ai-typing", { gameId: this.gameId, typing: false });
        if (this.queue.length > 0 && !this.flushed) {
          await this.delay(400 + Math.random() * 500);
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length === 0) {
        this.drainResolvers.forEach((resolve) => resolve());
        this.drainResolvers = [];
      } else {
        // A message was enqueued while we were resolving — keep going.
        void this.process();
      }
    }
  }
}

export class AiGameHandler {
  // Per-game sliding window for the chat flood guard.
  private chatTimestamps: Map<string, number[]> = new Map();

  constructor(private io: GameServer) {}

  register(socket: GameSocket): void {
    socket.on("ai-start", (data) => this.handleStart(socket, data));
    socket.on("ai-submit-move", (data) => this.handleSubmitMove(socket, data));
    socket.on("ai-send-chat", (data) => this.handleSendChat(socket, data));
    socket.on("ai-resign", (data) => this.handleResign(socket, data));
    socket.on("ai-reconnect", (data) => this.handleReconnect(socket, data));
    socket.on("ai-get-review", (data) => this.handleGetReview(socket, data));
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
  private startBotTurn(gameId: string, turnIndex: number): void {
    const paced = new PacedChatEmitter(this.io, gameId, turnIndex, Date.now());
    const turn = aiGameService.runBotTurn(gameId, paced);
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
      this.startBotTurn(created.state.id, 0);
    }
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

    this.startBotTurn(data.gameId, result.state.moves.length);
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

    // During the bot's turn the message just waits for the next move turn.
    if (!aiGameService.isPlayersTurn(added.state)) return;

    const reply = await aiGameService.tryGenerateChatReply(
      data.gameId,
      uid,
      text,
    );
    if (!reply) return;

    // Paced single-message emission: typing indicator sized to the reply.
    this.io
      .to(this.room(data.gameId))
      .emit("ai-typing", { gameId: data.gameId, typing: true });
    await new Promise((resolve) =>
      setTimeout(resolve, clamp(600 + 35 * reply.text.length, 900, 3200)),
    );
    this.io
      .to(this.room(data.gameId))
      .emit("ai-chat-message", { gameId: data.gameId, message: reply });
    this.io
      .to(this.room(data.gameId))
      .emit("ai-typing", { gameId: data.gameId, typing: false });
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
