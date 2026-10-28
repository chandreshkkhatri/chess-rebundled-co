import { Server, Socket } from "socket.io";
import { MultiplayerService } from "../services/multiplayerService.js";
import { MatchmakingService } from "../services/matchmakingService.js";
import {
  parseChessMoveWithAI,
  transcriptCacheText,
  AIParsedMove,
} from "../services/aiMoveParser.js";
import { parseChessMoveFromAudio } from "../services/geminiAudioParser.js";
import { ClientToServerEvents, ServerToClientEvents } from "../types/index.js";
import { TimeControl } from "../types/multiplayer.js";
import { WaitingPlayer } from "../services/matchmakingService.js";
import { getVoiceCalibration, getVoiceCalibrationVersion } from "../services/firestoreService.js";
import crypto from "crypto";
import { guardSocketRequest, hasText, isRecord, spokenGuesses, validAudioParse, validTextParse, validTimeControl } from "../lib/socketRequest.js";
import { aiUsageLimiter } from "../services/aiUsageLimiter.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// AI parsing cache entry
interface AIParseCacheEntry {
  result: AIParsedMove;
  timestamp: number;
}

export class MultiplayerHandler {
  private multiplayerService: MultiplayerService;
  private matchmakingService: MatchmakingService;
  private aiParseCache: Map<string, AIParseCacheEntry> = new Map();
  private static readonly AI_CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly AI_CACHE_MAX_SIZE = 500;

  // Track socket -> gameId for disconnect handling
  private socketToGame: Map<string, string> = new Map();
  private onLobbyChange: (() => void) | null = null;

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.multiplayerService = new MultiplayerService(io);
    this.matchmakingService = new MatchmakingService();
  }

  setOnLobbyChange(callback: () => void): void {
    this.onLobbyChange = callback;
  }

  getWaitingPlayers(): WaitingPlayer[] {
    return this.matchmakingService.getWaitingPlayers();
  }

  register(socket: GameSocket): void {
    const guard = <T>(handler: (data: T) => void | Promise<void>, valid: (data: unknown) => boolean,
      event: 'mp-error' | 'mp-parse-error' | 'mp-audio-parse-error' = 'mp-error') =>
      guardSocketRequest(handler, valid, message => socket.emit(event, { message }));
    const game = (data: unknown) => hasText(data, 'gameId');
    socket.on('mp-find-game', guard(this.handleFindGame.bind(this, socket),
      data => isRecord(data) && validTimeControl(data.timeControl, true)));
    socket.on('mp-cancel-find', guard(() => this.handleCancelFind(socket), () => true));
    socket.on('mp-create-invite', guard(this.handleCreateInvite.bind(this, socket),
      data => isRecord(data) && validTimeControl(data.timeControl)));
    socket.on('mp-join-invite', guard(this.handleJoinInvite.bind(this, socket), data => hasText(data, 'inviteCode', 8)));
    socket.on('mp-submit-move', guard(this.handleSubmitMove.bind(this, socket), data => game(data) && hasText(data, 'move', 100)));
    socket.on('mp-resign', guard(this.handleResign.bind(this, socket), game));
    socket.on('mp-offer-draw', guard(this.handleOfferDraw.bind(this, socket), game));
    socket.on('mp-respond-draw', guard(this.handleRespondDraw.bind(this, socket),
      data => game(data) && isRecord(data) && typeof data.accept === 'boolean'));
    socket.on('mp-reconnect', guard(this.handleReconnect.bind(this, socket), game));
    socket.on('mp-parse-move-with-ai', guard(this.handleParseMoveWithAI.bind(this, socket),
      data => game(data) && validTextParse(data), 'mp-parse-error'));
    socket.on('mp-parse-audio-move-with-gemini', guard(this.handleParseAudioMove.bind(this, socket),
      data => game(data) && validAudioParse(data), 'mp-audio-parse-error'));
    socket.on('disconnect', guard(() => this.handleDisconnect(socket), () => true));
  }

  // --- Matchmaking ---

  private async handleFindGame(
    socket: GameSocket,
    data: { timeControl: TimeControl | null | "any" },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit("mp-error", {
        message: "Authentication required for multiplayer",
      });
      return;
    }

    const displayName = socket.data.email?.split("@")[0] || "Player";

    // Check if already in a game
    const existingGameId = await this.multiplayerService
      .getGame((await this.getActiveGameId(uid)) || "")
      .then((g) => g?.id);
    if (existingGameId) {
      socket.emit("mp-error", { message: "You already have an active game" });
      return;
    }

    const matchResult = this.matchmakingService.addToQueue(
      { uid, displayName, socketId: socket.id, joinedAt: Date.now() },
      data.timeControl,
    );

    if (matchResult) {
      const { opponent, matchedTimeControl } = matchResult;

      // Match found - create game with the resolved time control
      const game = await this.multiplayerService.createGame(
        opponent.uid,
        opponent.displayName,
        opponent.socketId,
        matchedTimeControl,
      );

      const joinResult = await this.multiplayerService.joinGame(
        game.id,
        uid,
        displayName,
        socket.id,
      );

      if (!joinResult) {
        socket.emit("mp-error", { message: "Failed to create game" });
        return;
      }

      const { game: fullGame } = joinResult;

      // Both sockets join the room
      const opponentSocket = this.io.sockets.sockets.get(opponent.socketId);
      if (opponentSocket) {
        opponentSocket.join(`mp:${fullGame.id}`);
        this.socketToGame.set(opponent.socketId, fullGame.id);
      }
      socket.join(`mp:${fullGame.id}`);
      this.socketToGame.set(socket.id, fullGame.id);

      // Emit to creator (opponent in queue)
      if (opponentSocket) {
        const creatorColor =
          fullGame.white.uid === opponent.uid ? "white" : "black";
        const creatorOpponent =
          creatorColor === "white" ? fullGame.black : fullGame.white;
        opponentSocket.emit("mp-game-found", {
          gameId: fullGame.id,
          playerColor: creatorColor,
          opponent: {
            uid: creatorOpponent.uid,
            displayName: creatorOpponent.displayName,
          },
          fen: fullGame.fen,
          timeControl: fullGame.timeControl,
          whiteTimeMs: fullGame.white.timeRemainingMs,
          blackTimeMs: fullGame.black.timeRemainingMs,
        });
      }

      // Emit to joiner (this socket)
      const joinerColor = fullGame.white.uid === uid ? "white" : "black";
      const joinerOpponent =
        joinerColor === "white" ? fullGame.black : fullGame.white;
      socket.emit("mp-game-found", {
        gameId: fullGame.id,
        playerColor: joinerColor,
        opponent: {
          uid: joinerOpponent.uid,
          displayName: joinerOpponent.displayName,
        },
        fen: fullGame.fen,
        timeControl: fullGame.timeControl,
        whiteTimeMs: fullGame.white.timeRemainingMs,
        blackTimeMs: fullGame.black.timeRemainingMs,
      });

      console.log(
        `[Multiplayer] Game ${fullGame.id} started: ${fullGame.white.displayName} vs ${fullGame.black.displayName}`,
      );
      this.onLobbyChange?.();
    } else {
      // Queued, waiting for opponent
      socket.emit("mp-searching");
      this.onLobbyChange?.();
    }
  }

  private handleCancelFind(socket: GameSocket): void {
    const uid = socket.data.uid;
    if (!uid) return;

    this.matchmakingService.removeFromQueue(uid);
    socket.emit("mp-search-cancelled");
    this.onLobbyChange?.();
  }

  private async handleCreateInvite(
    socket: GameSocket,
    data: { timeControl: TimeControl | null },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit("mp-error", {
        message: "Authentication required for multiplayer",
      });
      return;
    }

    const displayName = socket.data.email?.split("@")[0] || "Player";
    const inviteCode = crypto.randomBytes(4).toString("hex"); // 8 char code

    const game = await this.multiplayerService.createGame(
      uid,
      displayName,
      socket.id,
      data.timeControl,
      inviteCode,
    );

    socket.join(`mp:${game.id}`);
    this.socketToGame.set(socket.id, game.id);

    socket.emit("mp-invite-created", { inviteCode, gameId: game.id });
    console.log(
      `[Multiplayer] Invite created: ${inviteCode} for game ${game.id}`,
    );
  }

  private async handleJoinInvite(
    socket: GameSocket,
    data: { inviteCode: string },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit("mp-error", {
        message: "Authentication required for multiplayer",
      });
      return;
    }

    const { multiplayerStore } =
      await import("../services/multiplayerSessionStore.js");
    const gameId = await multiplayerStore.getGameIdByInviteCode(
      data.inviteCode,
    );
    if (!gameId) {
      socket.emit("mp-error", { message: "Invite code not found or expired" });
      return;
    }

    const displayName = socket.data.email?.split("@")[0] || "Player";
    const joinResult = await this.multiplayerService.joinGame(
      gameId,
      uid,
      displayName,
      socket.id,
    );

    if (!joinResult) {
      socket.emit("mp-error", {
        message: "Could not join game. It may have already started.",
      });
      return;
    }

    const { game } = joinResult;

    socket.join(`mp:${game.id}`);
    this.socketToGame.set(socket.id, game.id);

    // Notify creator
    const creatorSocket =
      game.white.uid !== uid
        ? this.io.sockets.sockets.get(game.white.socketId!)
        : this.io.sockets.sockets.get(game.black.socketId!);

    if (creatorSocket) {
      const creatorColor = game.white.uid !== uid ? "white" : "black";
      const creatorOpponent =
        creatorColor === "white" ? game.black : game.white;
      creatorSocket.emit("mp-game-found", {
        gameId: game.id,
        playerColor: creatorColor,
        opponent: {
          uid: creatorOpponent.uid,
          displayName: creatorOpponent.displayName,
        },
        fen: game.fen,
        timeControl: game.timeControl,
        whiteTimeMs: game.white.timeRemainingMs,
        blackTimeMs: game.black.timeRemainingMs,
      });
    }

    // Notify joiner
    const joinerColor = game.white.uid === uid ? "white" : "black";
    const joinerOpponent = joinerColor === "white" ? game.black : game.white;
    socket.emit("mp-game-found", {
      gameId: game.id,
      playerColor: joinerColor,
      opponent: {
        uid: joinerOpponent.uid,
        displayName: joinerOpponent.displayName,
      },
      fen: game.fen,
      timeControl: game.timeControl,
      whiteTimeMs: game.white.timeRemainingMs,
      blackTimeMs: game.black.timeRemainingMs,
    });

    console.log(`[Multiplayer] Player joined via invite: game ${game.id}`);
  }

  // --- Gameplay ---

  private async handleSubmitMove(
    socket: GameSocket,
    data: { gameId: string; move: string },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit("mp-error", { message: "Authentication required" });
      return;
    }

    const result = await this.multiplayerService.processMove(
      data.gameId,
      uid,
      data.move,
    );

    if (!result.success) {
      socket.emit("mp-illegal-move", {
        move: data.move,
        reason: result.error || "Invalid move",
      });
      return;
    }

    // Broadcast move to both players
    this.io.to(`mp:${data.gameId}`).emit("mp-move-made", {
      gameId: data.gameId,
      move: result.move!,
      fen: result.fen!,
      turn: result.turn!,
      moveCount: result.moveCount!,
      whiteTimeMs: result.whiteTimeMs!,
      blackTimeMs: result.blackTimeMs!,
      isCheck: result.isCheck || false,
    });

    // Broadcast game over if applicable
    if (result.gameOver) {
      const game = await this.multiplayerService.getGame(data.gameId);
      if (game) {
        const { Chess } = await import("chess.js");
        const chess = new Chess();
        for (const m of game.moves) {
          try {
            chess.move(m);
          } catch {
            break;
          }
        }
        this.io.to(`mp:${data.gameId}`).emit("mp-game-over", {
          gameId: data.gameId,
          result: result.gameOver.result,
          endReason: result.gameOver.reason,
          winner: result.gameOver.winner,
          fen: result.fen!,
          pgn: chess.pgn(),
          moves: game.moves,
          whiteTimeMs: result.whiteTimeMs!,
          blackTimeMs: result.blackTimeMs!,
        });
      }
    }
  }

  private async handleResign(
    socket: GameSocket,
    data: { gameId: string },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    const gameOverData = await this.multiplayerService.resign(data.gameId, uid);
    if (gameOverData) {
      this.io.to(`mp:${data.gameId}`).emit("mp-game-over", gameOverData);
    }
  }

  private async handleOfferDraw(
    socket: GameSocket,
    data: { gameId: string },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    const offeredBy = await this.multiplayerService.offerDraw(data.gameId, uid);
    if (offeredBy) {
      this.io
        .to(`mp:${data.gameId}`)
        .emit("mp-draw-offered", { by: offeredBy });
    }
  }

  private async handleRespondDraw(
    socket: GameSocket,
    data: { gameId: string; accept: boolean },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    const gameOverData = await this.multiplayerService.respondToDraw(
      data.gameId,
      uid,
      data.accept,
    );
    if (gameOverData) {
      // Draw accepted
      this.io.to(`mp:${data.gameId}`).emit("mp-game-over", gameOverData);
    } else if (!data.accept) {
      // Draw declined
      this.io.to(`mp:${data.gameId}`).emit("mp-draw-declined");
    }
  }

  // --- Connection ---

  private async handleReconnect(
    socket: GameSocket,
    data: { gameId: string },
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit("mp-game-not-found", {
        gameId: data.gameId,
        reason: "Authentication required",
      });
      return;
    }

    const resumeData = await this.multiplayerService.handlePlayerReconnect(
      data.gameId,
      uid,
      socket.id,
    );

    if (!resumeData) {
      socket.emit("mp-game-not-found", {
        gameId: data.gameId,
        reason: "Game not found or already completed",
      });
      return;
    }

    socket.join(`mp:${data.gameId}`);
    this.socketToGame.set(socket.id, data.gameId);

    socket.emit("mp-game-resumed", resumeData);

    // Notify opponent
    socket.to(`mp:${data.gameId}`).emit("mp-opponent-connected", {
      displayName: resumeData.opponent.displayName,
    });

    console.log(`[Multiplayer] Player reconnected to game ${data.gameId}`);
  }

  private async handleDisconnect(socket: GameSocket): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    // Remove from matchmaking queue
    this.matchmakingService.removeFromQueue(uid);
    this.onLobbyChange?.();

    // Handle active game disconnect
    const gameId = this.socketToGame.get(socket.id);
    if (gameId) {
      this.socketToGame.delete(socket.id);

      await this.multiplayerService.handlePlayerDisconnect(gameId, uid);

      // Notify opponent
      socket.to(`mp:${gameId}`).emit("mp-opponent-disconnected");
    }
  }

  // --- AI Parsing ---

  private async handleParseMoveWithAI(
    socket: GameSocket,
    data: { gameId: string; transcript: string; rawTranscript?: string; transcripts?: string[] },
  ): Promise<void> {
    const game = await this.multiplayerService.getGame(data.gameId);
    if (!game || !socket.data.uid || !this.multiplayerService.getPlayerColor(game, socket.data.uid) || game.status !== 'active') {
      socket.emit("mp-parse-error", { message: "Game not found or access denied" });
      return;
    }

    const legalMoves = this.multiplayerService.getLegalMoves(game.fen);

    try {
      // The cache key covers every recognizer guess, since a different set can change the answer.
      const guesses = spokenGuesses(data);
      const cacheKey = this.getAIParseCacheKey(transcriptCacheText(guesses.transcript, guesses.alternatives), game.fen, socket.data.uid);
      let cached = this.aiParseCache.get(cacheKey);
      let parsed: AIParsedMove;

      if (
        cached &&
        Date.now() - cached.timestamp < MultiplayerHandler.AI_CACHE_TTL_MS
      ) {
        parsed = cached.result;
      } else {
        if (!(await aiUsageLimiter.tryConsumeParse(`user:${socket.data.uid}`))) {
          socket.emit('mp-parse-error', { message: 'Daily voice parsing limit reached. Please type your move.' });
          return;
        }
        const confusionMap = await this.getUserConfusionMap(socket.data.uid);
        parsed = await parseChessMoveWithAI(
          guesses.transcript,
          game.fen,
          legalMoves,
          {
            allowGuessOnUnclear: false,
            confusionMap,
            alternativeTranscripts: guesses.alternatives,
          },
        );
        this.cacheAIParse(cacheKey, parsed);
      }

      socket.emit("mp-move-parsed", {
        transcript: data.transcript,
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });
    } catch (error) {
      socket.emit("mp-parse-error", {
        message: `AI parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  private async handleParseAudioMove(
    socket: GameSocket,
    data: { gameId: string; audioBase64: string; mimeType: string },
  ): Promise<void> {
    const game = await this.multiplayerService.getGame(data.gameId);
    if (!game || !socket.data.uid || !this.multiplayerService.getPlayerColor(game, socket.data.uid) || game.status !== 'active') {
      socket.emit("mp-audio-parse-error", { message: "Game not found or access denied" });
      return;
    }

    const legalMoves = this.multiplayerService.getLegalMoves(game.fen);

    try {
      if (!(await aiUsageLimiter.tryConsumeParse(`user:${socket.data.uid}`))) {
        socket.emit('mp-audio-parse-error', { message: 'Daily voice parsing limit reached. Please type your move.' });
        return;
      }
      const confusionMap = await this.getUserConfusionMap(socket.data.uid);
      const parsed = await parseChessMoveFromAudio(
        data.audioBase64,
        data.mimeType,
        game.fen,
        legalMoves,
        { allowGuessOnUnclear: false, confusionMap },
      );

      socket.emit("mp-audio-move-parsed", {
        transcript: parsed.transcription || "[audio input]",
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });
    } catch (error) {
      socket.emit("mp-audio-parse-error", {
        message: `Audio parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  // --- Helpers ---

  private async getUserConfusionMap(
    uid: string | undefined,
  ): Promise<Record<string, string[]> | undefined> {
    if (!uid) return undefined;

    try {
      return (await getVoiceCalibration(uid))?.confusionMap;
    } catch (error) {
      console.warn(
        "[MultiplayerHandler] Failed to load calibration for user",
        uid,
        error,
      );
      return undefined;
    }
  }

  private async getActiveGameId(uid: string): Promise<string | undefined> {
    const { multiplayerStore } =
      await import("../services/multiplayerSessionStore.js");
    return multiplayerStore.getGameIdByUid(uid);
  }

  private getAIParseCacheKey(transcript: string, fen: string, uid?: string): string {
    const data = `${uid ?? "guest"}:${getVoiceCalibrationVersion(uid)}:${transcript.toLowerCase().trim()}:${fen}`;
    return crypto.createHash("md5").update(data).digest("hex");
  }

  private cacheAIParse(key: string, result: AIParsedMove): void {
    this.aiParseCache.set(key, { result, timestamp: Date.now() });
    if (this.aiParseCache.size > MultiplayerHandler.AI_CACHE_MAX_SIZE) {
      const entries = Array.from(this.aiParseCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 50).forEach(([k]) => this.aiParseCache.delete(k));
    }
  }
}
