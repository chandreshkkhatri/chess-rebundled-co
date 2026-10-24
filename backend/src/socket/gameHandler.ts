import { Server, Socket } from "socket.io";
import { PracticeService } from "../services/practiceService.js";
import {
  parseChessMoveWithAI,
  AIParsedMove,
} from "../services/aiMoveParser.js";
import { parseChessMoveFromAudio } from "../services/geminiAudioParser.js";
import { ClientToServerEvents, ServerToClientEvents } from "../types/index.js";
import {
  saveCompletedSession,
  ensureUserExists,
  processGamification,
} from "../services/firestoreService.js";
import { getVoiceCalibration } from "../services/firestoreService.js";
import {
  getPlayerList,
  getRandomGameByPlayer,
  getRandomGame,
} from "../services/gameRepository.js";
import crypto from "crypto";
import { ownsPracticeSession } from "../lib/practiceOwnership.js";
import { guardSocketRequest, hasText, isRecord, validAudioParse, validPracticeOptions, validTextParse } from "../lib/socketRequest.js";
import { aiUsageLimiter } from "../services/aiUsageLimiter.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// AI parsing cache entry
interface AIParseCacheEntry {
  result: AIParsedMove;
  timestamp: number;
}

export class GameHandler {
  private practiceService: PracticeService;
  // AI parsing response cache (keyed by hash of transcript + fen)
  private aiParseCache: Map<string, AIParseCacheEntry> = new Map();
  // Voice calibration cache (keyed by user uid)
  private calibrationCache: Map<
    string,
    { confusionMap: Record<string, string[]> | null; loadedAt: number }
  > = new Map();
  private static readonly AI_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly AI_CACHE_MAX_SIZE = 500;
  private static readonly CALIBRATION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.practiceService = new PracticeService();
  }

  private async getOwnedSession(socket: GameSocket, sessionId: string) {
    const session = await this.practiceService.getSession(sessionId);
    return session && ownsPracticeSession(
      session, socket.id, socket.data.uid, socket.handshake.auth?.guestToken,
    ) ? session : undefined;
  }

  // Generate cache key for AI parsing
  private getAIParseCacheKey(transcript: string, fen: string): string {
    const data = `${transcript.toLowerCase().trim()}:${fen}`;
    return crypto.createHash("md5").update(data).digest("hex");
  }

  // Get cached AI parse result if valid
  private getCachedAIParse(
    transcript: string,
    fen: string,
  ): AIParsedMove | null {
    const key = this.getAIParseCacheKey(transcript, fen);
    const entry = this.aiParseCache.get(key);
    if (entry && Date.now() - entry.timestamp < GameHandler.AI_CACHE_TTL_MS) {
      return entry.result;
    }
    // Remove expired entry
    if (entry) {
      this.aiParseCache.delete(key);
    }
    return null;
  }

  // Cache AI parse result
  private cacheAIParse(
    transcript: string,
    fen: string,
    result: AIParsedMove,
  ): void {
    const key = this.getAIParseCacheKey(transcript, fen);
    this.aiParseCache.set(key, { result, timestamp: Date.now() });

    // Evict oldest entries if cache exceeds max size
    if (this.aiParseCache.size > GameHandler.AI_CACHE_MAX_SIZE) {
      const entries = Array.from(this.aiParseCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, 50);
      toDelete.forEach(([k]) => this.aiParseCache.delete(k));
    }
  }

  // Get user's voice calibration confusion map (cached)
  private async getUserConfusionMap(
    uid: string | undefined,
  ): Promise<Record<string, string[]> | undefined> {
    if (!uid) return undefined;

    const cached = this.calibrationCache.get(uid);
    if (
      cached &&
      Date.now() - cached.loadedAt < GameHandler.CALIBRATION_CACHE_TTL_MS
    ) {
      return cached.confusionMap || undefined;
    }

    try {
      const calibration = await getVoiceCalibration(uid);
      const confusionMap = calibration?.confusionMap || null;
      this.calibrationCache.set(uid, { confusionMap, loadedAt: Date.now() });
      return confusionMap || undefined;
    } catch (error) {
      console.warn(
        "[GameHandler] Failed to load calibration for user",
        uid,
        error,
      );
      return undefined;
    }
  }

  register(socket: GameSocket): void {
    const guard = <T>(handler: (data: T) => void | Promise<void>, valid: (data: unknown) => boolean,
      event: 'practice-error' | 'parse-error' | 'audio-parse-error' = 'practice-error') =>
      guardSocketRequest(handler, valid, message => socket.emit(event, { message }));
    const session = (data: unknown) => hasText(data, 'sessionId');
    const player = (data: unknown) => hasText(data, 'historicalPlayerName') && isRecord(data) &&
      (data.role === 'white' || data.role === 'black');

    socket.on('start-practice', guard(this.handleStartPractice.bind(this, socket), validPracticeOptions));
    socket.on('start-practice-random', guard(this.handleStartPracticeRandom.bind(this, socket), validPracticeOptions));
    socket.on('start-practice-by-player', guard(this.handleStartPracticeByPlayer.bind(this, socket),
      data => validPracticeOptions(data) && player(data)));
    socket.on('get-random-practice-game', guard(() => this.handleGetRandomPracticeGame(socket), () => true));
    socket.on('get-player-practice-game', guard(this.handleGetPlayerPracticeGame.bind(this, socket), player));
    socket.on('get-player-list', guard(() => this.handleGetPlayerList(socket), () => true));
    socket.on('submit-practice-move', guard(this.handleSubmitPracticeMove.bind(this, socket),
      data => session(data) && hasText(data, 'move', 100)));
    socket.on('abandon-practice', guard(this.handleAbandonPractice.bind(this, socket), session));
    socket.on('resume-session', guard(this.handleResumeSession.bind(this, socket), session));
    socket.on('parse-move-with-ai', guard(this.handleParseMoveWithAI.bind(this, socket),
      data => session(data) && validTextParse(data), 'parse-error'));
    socket.on('parse-audio-move-with-gemini', guard(this.handleParseAudioMoveWithGemini.bind(this, socket),
      data => session(data) && validAudioParse(data), 'audio-parse-error'));
    socket.on('disconnect', guard(() => this.handleDisconnect(socket), () => true));
  }

  private async allowParsing(socket: GameSocket): Promise<boolean> {
    const identity = socket.data.uid ? `user:${socket.data.uid}` :
      `guest-ip:${crypto.createHash('sha256').update(socket.handshake.address || 'unknown').digest('hex')}`;
    return aiUsageLimiter.tryConsumeParse(identity);
  }

  private async handleDisconnect(socket: GameSocket): Promise<void> {
    // Don't remove active practice sessions - allow reconnection
    // Only remove sessions that are completed or abandoned
    await this.practiceService.removeInactiveSessionsBySocketId(socket.id);
  }

  private async handleStartPractice(
    socket: GameSocket,
    data: {
      gameId?: string;
      playerName: string;
      mode?: "both-sides" | "one-side";
      playerColor?: "white" | "black";
    },
  ): Promise<void> {
    try {
      // Get uid from socket auth data
      const uid = socket.data.uid;
      const email = socket.data.email;

      // Ensure user exists in Firestore (if authenticated) - non-blocking
      if (uid) {
        ensureUserExists(uid, email ?? null).catch((err) => {
          console.warn("[GameHandler] Failed to ensure user exists:", err);
        });
      }

      // If no gameId provided, use random game selection
      if (!data.gameId) {
        return this.handleStartPracticeRandom(socket, {
          playerName: data.playerName,
          mode: data.mode,
          playerColor: data.playerColor,
        });
      }

      const startData = await this.practiceService.startSession(
        socket.id,
        data.playerName,
        data.gameId,
        data.mode || "both-sides",
        data.playerColor || null,
        uid,
        socket.handshake.auth?.guestToken,
      );

      if (!startData) {
        socket.emit("practice-error", {
          message: "Could not start practice session",
        });
        return;
      }

      socket.emit("practice-started", startData);
    } catch (error) {
      console.error("Error starting practice session:", error);
      socket.emit("practice-error", {
        message: "Failed to start practice session due to server error",
      });
    }
  }

  private async handleStartPracticeRandom(
    socket: GameSocket,
    data: {
      playerName: string;
      mode?: "both-sides" | "one-side";
      playerColor?: "white" | "black";
    },
  ): Promise<void> {
    try {
      // Get uid from socket auth data
      const uid = socket.data.uid;
      const email = socket.data.email;

      // Ensure user exists in Firestore (if authenticated) - non-blocking
      if (uid) {
        ensureUserExists(uid, email ?? null).catch((err) => {
          console.warn("[GameHandler] Failed to ensure user exists:", err);
        });
      }

      const startData = await this.practiceService.startSessionWithRandomGame(
        socket.id,
        data.playerName,
        data.mode || "both-sides",
        data.playerColor || null,
        uid,
        socket.handshake.auth?.guestToken,
      );

      if (!startData) {
        socket.emit("practice-error", {
          message: "Could not start practice session - no games available",
        });
        return;
      }

      socket.emit("practice-started", startData);
    } catch (error) {
      console.error("Error starting random practice session:", error);
      socket.emit("practice-error", {
        message: "Failed to start practice session due to server error",
      });
    }
  }

  private async handleGetPlayerList(socket: GameSocket): Promise<void> {
    try {
      const playerList = await getPlayerList();
      socket.emit("player-list", playerList);
    } catch (error) {
      console.error("Error fetching player list:", error);
      socket.emit("practice-error", { message: "Failed to fetch player list" });
    }
  }

  private async handleStartPracticeByPlayer(
    socket: GameSocket,
    data: {
      playerName: string;
      historicalPlayerName: string;
      role: "white" | "black";
      mode?: "both-sides" | "one-side";
      playerColor?: "white" | "black";
    },
  ): Promise<void> {
    try {
      const uid = socket.data.uid;
      const email = socket.data.email;

      if (uid) {
        ensureUserExists(uid, email ?? null).catch((err) => {
          console.warn("[GameHandler] Failed to ensure user exists:", err);
        });
      }

      const game = await getRandomGameByPlayer(
        data.historicalPlayerName,
        data.role,
      );
      if (!game) {
        socket.emit("practice-error", {
          message: `No games found for player "${data.historicalPlayerName}" as ${data.role}`,
        });
        return;
      }

      const startData = await this.practiceService.startSession(
        socket.id,
        data.playerName,
        game.id,
        data.mode || "both-sides",
        data.playerColor || null,
        uid,
        socket.handshake.auth?.guestToken,
      );

      if (!startData) {
        socket.emit("practice-error", {
          message: "Could not start practice session",
        });
        return;
      }

      socket.emit("practice-started", startData);
    } catch (error) {
      console.error("Error starting practice by player:", error);
      socket.emit("practice-error", {
        message: "Failed to start practice session due to server error",
      });
    }
  }

  private async handleGetRandomPracticeGame(socket: GameSocket): Promise<void> {
    try {
      const game = await getRandomGame();
      if (!game) {
        socket.emit("practice-error", { message: "No games available" });
        return;
      }
      socket.emit("practice-game-details", game);
    } catch (error) {
      console.error("Error fetching random practice game:", error);
      socket.emit("practice-error", {
        message: "Failed to fetch game details",
      });
    }
  }

  private async handleGetPlayerPracticeGame(
    socket: GameSocket,
    data: { historicalPlayerName: string; role: "white" | "black" },
  ): Promise<void> {
    try {
      const game = await getRandomGameByPlayer(
        data.historicalPlayerName,
        data.role,
      );
      if (!game) {
        socket.emit("practice-error", {
          message: `No games found for player "${data.historicalPlayerName}" as ${data.role}`,
        });
        return;
      }
      socket.emit("practice-game-details", game);
    } catch (error) {
      console.error("Error fetching player practice game:", error);
      socket.emit("practice-error", {
        message: "Failed to fetch game details",
      });
    }
  }

  private async handleSubmitPracticeMove(
    socket: GameSocket,
    data: { sessionId: string; move: string },
  ): Promise<void> {
    try {
      // Update socket ID if reconnected
      const session = await this.getOwnedSession(socket, data.sessionId);
      if (!session) {
        socket.emit("practice-error", { message: "Session not found or access denied" });
        return;
      }
      if (session.socketId !== socket.id) {
        await this.practiceService.updateSessionSocketId(
          data.sessionId,
          socket.id,
        );
      }

      const result = await this.practiceService.processMove(
        data.sessionId,
        data.move,
      );

      if (!result) {
        socket.emit("practice-error", { message: "Could not process move" });
        return;
      }

      // Check if session is complete and prepare response data
      const isComplete = await this.practiceService.isSessionComplete(
        data.sessionId,
      );
      const completedData = isComplete
        ? await this.practiceService.completeSession(data.sessionId)
        : null;
      const nextMoveData = !isComplete
        ? await this.practiceService.getNextMoveData(data.sessionId)
        : null;

      // Save to Firestore and process gamification if session completed and user is authenticated
      let gamificationResult = null;
      if (completedData && session?.uid) {
        // Get user's timezone from socket handshake (if provided)
        const timezone = socket.handshake.query.timezone as string | undefined;

        // Process gamification and save session
        try {
          const [savedSessionId, gamification] = await Promise.all([
            saveCompletedSession(session.uid, session, completedData),
            processGamification(session.uid, session, completedData, timezone),
          ]);
          gamificationResult = gamification;
        } catch (err) {
          console.error(
            "[GameHandler] Failed to save session/gamification to Firestore:",
            err,
          );
        }
      }

      // Emit combined response (single round-trip instead of 2)
      socket.emit("practice-move-response", {
        result,
        nextMove: nextMoveData || undefined,
        completed: completedData || undefined,
        gamification: gamificationResult || undefined,
      });

      // Also emit legacy events for backward compatibility
      socket.emit("practice-move-result", result);
      if (completedData) {
        socket.emit("practice-completed", completedData);
      } else if (nextMoveData) {
        socket.emit("practice-next-move", nextMoveData);
      }
    } catch (error) {
      console.error("Error submitting practice move:", error);
      socket.emit("practice-error", {
        message: "Server error processing move",
      });
    }
  }

  private async handleAbandonPractice(
    socket: GameSocket,
    data: { sessionId: string },
  ): Promise<void> {
    if (!(await this.getOwnedSession(socket, data.sessionId))) {
      socket.emit("practice-error", { message: "Session not found or access denied" });
      return;
    }
    await this.practiceService.abandonSession(data.sessionId);
  }

  private async handleResumeSession(
    socket: GameSocket,
    data: { sessionId: string },
  ): Promise<void> {
    const session = await this.getOwnedSession(socket, data.sessionId);

    if (!session) {
      socket.emit("session-not-found", {
        sessionId: data.sessionId,
        reason: "Session not found, expired, or access denied",
      });
      return;
    }

    if (session.status !== "playing") {
      socket.emit("session-not-found", {
        sessionId: data.sessionId,
        reason: "Session is no longer active",
      });
      return;
    }

    // Update socket ID for reconnection
    await this.practiceService.updateSessionSocketId(data.sessionId, socket.id);

    const resumeData = await this.practiceService.getSessionResumeData(
      data.sessionId,
    );

    if (!resumeData) {
      socket.emit("session-not-found", {
        sessionId: data.sessionId,
        reason: "Could not restore session state",
      });
      return;
    }

    console.log(
      `[GameHandler] Session ${data.sessionId} resumed for socket ${socket.id}`,
    );
    socket.emit("session-resumed", resumeData);
  }

  private async handleParseMoveWithAI(
    socket: GameSocket,
    data: { sessionId: string; transcript: string; rawTranscript?: string },
  ): Promise<void> {
    const session = await this.getOwnedSession(socket, data.sessionId);
    if (!session) {
      socket.emit("parse-error", { message: "Session not found or access denied" });
      return;
    }

    // Update socket ID if reconnected
    if (session.socketId !== socket.id) {
      await this.practiceService.updateSessionSocketId(
        data.sessionId,
        socket.id,
      );
    }

    const currentFen = await this.practiceService.getCurrentPosition(
      data.sessionId,
    );
    const legalMoves = await this.practiceService.getLegalMoves(data.sessionId);

    try {
      // Check cache first for AI parsing results
      // Use rawTranscript for AI when available (gives better context than locally-parsed move)
      const transcriptForAI = data.rawTranscript || data.transcript;
      let parsed = this.getCachedAIParse(transcriptForAI, currentFen);

      if (!parsed) {
        if (!(await this.allowParsing(socket))) {
          socket.emit('parse-error', { message: 'Daily voice parsing limit reached. Please type your move.' });
          return;
        }
        const confusionMap = await this.getUserConfusionMap(socket.data.uid);
        parsed = await parseChessMoveWithAI(
          transcriptForAI,
          currentFen,
          legalMoves,
          { confusionMap },
        );
        // Cache the result
        this.cacheAIParse(transcriptForAI, currentFen, parsed);
      }

      socket.emit("move-parsed", {
        transcript: data.transcript,
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });
    } catch (error) {
      console.error("[GameHandler] AI parse error:", error);
      socket.emit("parse-error", {
        message: `AI parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  private async handleParseAudioMoveWithGemini(
    socket: GameSocket,
    data: { sessionId: string; audioBase64: string; mimeType: string },
  ): Promise<void> {
    const session = await this.getOwnedSession(socket, data.sessionId);
    if (!session) {
      socket.emit("audio-parse-error", { message: "Session not found or access denied" });
      return;
    }

    // Update socket ID if reconnected
    if (session.socketId !== socket.id) {
      await this.practiceService.updateSessionSocketId(
        data.sessionId,
        socket.id,
      );
    }

    const currentFen = await this.practiceService.getCurrentPosition(
      data.sessionId,
    );
    const legalMoves = await this.practiceService.getLegalMoves(data.sessionId);

    try {
      if (!(await this.allowParsing(socket))) {
        socket.emit('audio-parse-error', { message: 'Daily voice parsing limit reached. Please type your move.' });
        return;
      }
      const confusionMap = await this.getUserConfusionMap(socket.data.uid);
      const parsed = await parseChessMoveFromAudio(
        data.audioBase64,
        data.mimeType,
        currentFen,
        legalMoves,
        { confusionMap },
      );

      socket.emit("audio-move-parsed", {
        transcript: parsed.transcription || "[audio input]",
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
        transcription: parsed.transcription,
      });
    } catch (error) {
      console.error("[GameHandler] Gemini audio parse error:", error);
      socket.emit("audio-parse-error", {
        message: `Audio parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }
}
