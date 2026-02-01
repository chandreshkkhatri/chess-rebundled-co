import { Server, Socket } from 'socket.io';
import { PracticeService } from '../services/practiceService.js';
import { parseChessMoveWithAI, AIParsedMove } from '../services/aiMoveParser.js';
import { parseChessMoveFromAudio } from '../services/geminiAudioParser.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';
import { saveCompletedSession, ensureUserExists, processGamification } from '../services/firestoreService.js';
import crypto from 'crypto';

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
  private static readonly AI_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly AI_CACHE_MAX_SIZE = 500;

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.practiceService = new PracticeService();
  }

  // Generate cache key for AI parsing
  private getAIParseCacheKey(transcript: string, fen: string): string {
    const data = `${transcript.toLowerCase().trim()}:${fen}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // Get cached AI parse result if valid
  private getCachedAIParse(transcript: string, fen: string): AIParsedMove | null {
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
  private cacheAIParse(transcript: string, fen: string, result: AIParsedMove): void {
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

  register(socket: GameSocket): void {

    // Practice mode events
    socket.on('start-practice', (data) => this.handleStartPractice(socket, data));
    socket.on('start-practice-random', (data) => this.handleStartPracticeRandom(socket, data));
    socket.on('submit-practice-move', (data) => this.handleSubmitPracticeMove(socket, data));
    socket.on('abandon-practice', (data) => this.handleAbandonPractice(socket, data));
    socket.on('resume-session', (data) => this.handleResumeSession(socket, data));
    socket.on('parse-move-with-ai', (data) => this.handleParseMoveWithAI(socket, data));
    socket.on('parse-audio-move-with-gemini', (data) => this.handleParseAudioMoveWithGemini(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private async handleDisconnect(socket: GameSocket): Promise<void> {
    // Don't remove active practice sessions - allow reconnection
    // Only remove sessions that are completed or abandoned
    await this.practiceService.removeInactiveSessionsBySocketId(socket.id);
  }

  private async handleStartPractice(
    socket: GameSocket,
    data: { gameId?: string; playerName: string; mode?: 'both-sides' | 'one-side'; playerColor?: 'white' | 'black' }
  ): Promise<void> {
    try {
      // Get uid from socket auth data
      const uid = socket.data.uid;
      const isAnonymous = socket.data.isAnonymous;
      const email = socket.data.email;

      // Ensure user exists in Firestore (if authenticated) - non-blocking
      if (uid) {
        ensureUserExists(uid, email ?? null, isAnonymous ?? true).catch((err) => {
          console.warn('[GameHandler] Failed to ensure user exists:', err);
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
        data.mode || 'both-sides',
        data.playerColor || null,
        uid
      );

      if (!startData) {
        socket.emit('practice-error', { message: 'Could not start practice session' });
        return;
      }

      socket.emit('practice-started', startData);
    } catch (error) {
      console.error('Error starting practice session:', error);
      socket.emit('practice-error', { message: 'Failed to start practice session due to server error' });
    }
  }

  private async handleStartPracticeRandom(
    socket: GameSocket,
    data: { playerName: string; mode?: 'both-sides' | 'one-side'; playerColor?: 'white' | 'black' }
  ): Promise<void> {
    try {
      // Get uid from socket auth data
      const uid = socket.data.uid;
      const isAnonymous = socket.data.isAnonymous;
      const email = socket.data.email;

      // Ensure user exists in Firestore (if authenticated) - non-blocking
      if (uid) {
        ensureUserExists(uid, email ?? null, isAnonymous ?? true).catch((err) => {
          console.warn('[GameHandler] Failed to ensure user exists:', err);
        });
      }

      const startData = await this.practiceService.startSessionWithRandomGame(
        socket.id,
        data.playerName,
        data.mode || 'both-sides',
        data.playerColor || null,
        uid
      );

      if (!startData) {
        socket.emit('practice-error', { message: 'Could not start practice session - no games available' });
        return;
      }

      socket.emit('practice-started', startData);
    } catch (error) {
      console.error('Error starting random practice session:', error);
      socket.emit('practice-error', { message: 'Failed to start practice session due to server error' });
    }
  }

  private async handleSubmitPracticeMove(
    socket: GameSocket,
    data: { sessionId: string; move: string }
  ): Promise<void> {
    try {
      // Update socket ID if reconnected
      const session = await this.practiceService.getSession(data.sessionId);
      if (session && session.socketId !== socket.id) {
        await this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
      }

      const result = await this.practiceService.processMove(data.sessionId, data.move);

      if (!result) {
        socket.emit('practice-error', { message: 'Could not process move' });
        return;
      }

      // Check if session is complete and prepare response data
      const isComplete = await this.practiceService.isSessionComplete(data.sessionId);
      const completedData = isComplete ? await this.practiceService.completeSession(data.sessionId) : null;
      const nextMoveData = !isComplete ? await this.practiceService.getNextMoveData(data.sessionId) : null;

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
          console.error('[GameHandler] Failed to save session/gamification to Firestore:', err);
        }
      }

      // Emit combined response (single round-trip instead of 2)
      socket.emit('practice-move-response', {
        result,
        nextMove: nextMoveData || undefined,
        completed: completedData || undefined,
        gamification: gamificationResult || undefined,
      });

      // Also emit legacy events for backward compatibility
      socket.emit('practice-move-result', result);
      if (completedData) {
        socket.emit('practice-completed', completedData);
      } else if (nextMoveData) {
        socket.emit('practice-next-move', nextMoveData);
      }
    } catch (error) {
       console.error('Error submitting practice move:', error);
       socket.emit('practice-error', { message: 'Server error processing move' });
    }
  }

  private async handleAbandonPractice(
    socket: GameSocket,
    data: { sessionId: string }
  ): Promise<void> {
    await this.practiceService.abandonSession(data.sessionId);
  }

  private async handleResumeSession(
    socket: GameSocket,
    data: { sessionId: string }
  ): Promise<void> {
    const session = await this.practiceService.getSession(data.sessionId);

    if (!session) {
      socket.emit('session-not-found', {
        sessionId: data.sessionId,
        reason: 'Session not found or expired',
      });
      return;
    }

    if (session.status !== 'playing') {
      socket.emit('session-not-found', {
        sessionId: data.sessionId,
        reason: 'Session is no longer active',
      });
      return;
    }

    // Update socket ID for reconnection
    await this.practiceService.updateSessionSocketId(data.sessionId, socket.id);

    const resumeData = await this.practiceService.getSessionResumeData(data.sessionId);

    if (!resumeData) {
      socket.emit('session-not-found', {
        sessionId: data.sessionId,
        reason: 'Could not restore session state',
      });
      return;
    }

    console.log(`[GameHandler] Session ${data.sessionId} resumed for socket ${socket.id}`);
    socket.emit('session-resumed', resumeData);
  }

  private async handleParseMoveWithAI(
    socket: GameSocket,
    data: { sessionId: string; transcript: string }
  ): Promise<void> {
    const session = await this.practiceService.getSession(data.sessionId);
    if (!session) {
      socket.emit('parse-error', { message: 'Session not found' });
      return;
    }

    // Update socket ID if reconnected
    if (session.socketId !== socket.id) {
      await this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
    }

    const currentFen = await this.practiceService.getCurrentPosition(data.sessionId);
    const legalMoves = await this.practiceService.getLegalMoves(data.sessionId);

    try {
      // Check cache first for AI parsing results
      let parsed = this.getCachedAIParse(data.transcript, currentFen);

      if (!parsed) {
        // Cache miss - call AI
        parsed = await parseChessMoveWithAI(
          data.transcript,
          currentFen,
          legalMoves
        );
        // Cache the result
        this.cacheAIParse(data.transcript, currentFen, parsed);
      }

      socket.emit('move-parsed', {
        transcript: data.transcript,
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });
    } catch (error) {
      console.error('[GameHandler] AI parse error:', error);
      socket.emit('parse-error', {
        message: `AI parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private async handleParseAudioMoveWithGemini(
    socket: GameSocket,
    data: { sessionId: string; audioBase64: string; mimeType: string }
  ): Promise<void> {
    const session = await this.practiceService.getSession(data.sessionId);
    if (!session) {
      socket.emit('audio-parse-error', { message: 'Session not found' });
      return;
    }

    // Update socket ID if reconnected
    if (session.socketId !== socket.id) {
      await this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
    }

    const currentFen = await this.practiceService.getCurrentPosition(data.sessionId);
    const legalMoves = await this.practiceService.getLegalMoves(data.sessionId);

    try {
      const parsed = await parseChessMoveFromAudio(
        data.audioBase64,
        data.mimeType,
        currentFen,
        legalMoves
      );

      socket.emit('audio-move-parsed', {
        transcript: parsed.transcription || '[audio input]',
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
        transcription: parsed.transcription,
      });
    } catch (error) {
      console.error('[GameHandler] Gemini audio parse error:', error);
      socket.emit('audio-parse-error', {
        message: `Audio parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
}
