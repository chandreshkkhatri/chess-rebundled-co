import { Server, Socket } from 'socket.io';
import { PracticeService } from '../services/practiceService.js';
import { parseChessMoveWithAI, AIParsedMove } from '../services/aiMoveParser.js';
import { parseChessMoveFromAudio } from '../services/geminiAudioParser.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';
import { saveCompletedSession, ensureUserExists } from '../services/firestoreService.js';
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
    socket.on('parse-move-with-ai', (data) => this.handleParseMoveWithAI(socket, data));
    socket.on('parse-audio-move-with-gemini', (data) => this.handleParseAudioMoveWithGemini(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private handleDisconnect(socket: GameSocket): void {
    // Don't remove active practice sessions - allow reconnection
    // Only remove sessions that are completed or abandoned
    this.practiceService.removeInactiveSessionsBySocketId(socket.id);
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

      // Ensure user exists in Firestore (if authenticated)
      if (uid) {
        await ensureUserExists(uid, email ?? null, isAnonymous ?? true);
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

      // Ensure user exists in Firestore (if authenticated)
      if (uid) {
        await ensureUserExists(uid, email ?? null, isAnonymous ?? true);
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
      const session = this.practiceService.getSession(data.sessionId);
      if (session && session.socketId !== socket.id) {
        this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
      }

      const result = this.practiceService.processMove(data.sessionId, data.move);

      if (!result) {
        socket.emit('practice-error', { message: 'Could not process move' });
        return;
      }

      // Check if session is complete and prepare response data
      const isComplete = this.practiceService.isSessionComplete(data.sessionId);
      const completedData = isComplete ? this.practiceService.completeSession(data.sessionId) : null;
      const nextMoveData = !isComplete ? this.practiceService.getNextMoveData(data.sessionId) : null;

      // Save to Firestore if session completed and user is authenticated
      if (completedData && session?.uid) {
        // Save asynchronously - don't block the response
        saveCompletedSession(session.uid, session, completedData).catch((err) => {
          console.error('[GameHandler] Failed to save session to Firestore:', err);
        });
      }

      // Emit combined response (single round-trip instead of 2)
      socket.emit('practice-move-response', {
        result,
        nextMove: nextMoveData || undefined,
        completed: completedData || undefined,
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

  private handleAbandonPractice(
    socket: GameSocket,
    data: { sessionId: string }
  ): void {
    this.practiceService.abandonSession(data.sessionId);
  }

  private async handleParseMoveWithAI(
    socket: GameSocket,
    data: { sessionId: string; transcript: string }
  ): Promise<void> {
    const session = this.practiceService.getSession(data.sessionId);
    if (!session) {
      socket.emit('parse-error', { message: 'Session not found' });
      return;
    }

    // Update socket ID if reconnected
    if (session.socketId !== socket.id) {
      this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
    }

    const currentFen = this.practiceService.getCurrentPosition(data.sessionId);
    const legalMoves = this.practiceService.getLegalMoves(data.sessionId);

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
    const session = this.practiceService.getSession(data.sessionId);
    if (!session) {
      socket.emit('audio-parse-error', { message: 'Session not found' });
      return;
    }

    // Update socket ID if reconnected
    if (session.socketId !== socket.id) {
      this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
    }

    const currentFen = this.practiceService.getCurrentPosition(data.sessionId);
    const legalMoves = this.practiceService.getLegalMoves(data.sessionId);

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
