import {
  PracticeSession,
  PracticeMoveResult,
  PracticeCompletedData,
  PracticeStartedData,
  HistoricalGame,
  MoveDetails,
  PracticeMode,
  SessionResumedData,
} from '../types/index.js';
import { PgnService } from './pgnService.js';
import { getRandomGame, getGameById as getGameByIdFromDb } from './gameRepository.js';
import { sessionStore } from './redisSessionStore.js';

export class PracticeService {
  private pgnService: PgnService;
  private moveStartTimes: Map<string, number> = new Map();
  // Performance optimizations (ephemeral caches - safe to lose on restart)
  private positionCache: Map<string, string> = new Map(); // sessionId:moveIndex -> FEN
  private legalMovesCache: Map<string, string[]> = new Map(); // sessionId:moveIndex -> legal moves
  private static readonly MAX_CACHE_SIZE = 1000;

  constructor() {
    this.pgnService = new PgnService();
  }

  // Start session with a random game from MongoDB
  async startSessionWithRandomGame(
    socketId: string,
    playerName: string,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null,
    uid?: string
  ): Promise<PracticeStartedData | null> {
    const game = await getRandomGame();
    if (!game) return null;

    return this.createSession(socketId, playerName, game, mode, playerColor, uid);
  }

  // Start session with a specific game (for backward compatibility)
  async startSession(
    socketId: string,
    playerName: string,
    gameId: string,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null,
    uid?: string
  ): Promise<PracticeStartedData | null> {
    const game = await getGameByIdFromDb(gameId);
    if (!game) return null;

    return this.createSession(socketId, playerName, game, mode, playerColor, uid);
  }

  private async createSession(
    socketId: string,
    playerName: string,
    game: HistoricalGame,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null,
    uid?: string
  ): Promise<PracticeStartedData | null> {
    const sessionId = `practice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // For one-side mode, if playing as black, start at move index 1 (after white's first move)
    const startingMoveIndex = (mode === 'one-side' && playerColor === 'black') ? 1 : 0;

    const session: PracticeSession = {
      id: sessionId,
      socketId,
      uid,
      playerName,
      historicalGame: game,
      currentMoveIndex: startingMoveIndex,
      moveResults: [],
      startedAt: Date.now(),
      status: 'playing',
      mode,
      playerColor,
    };

    // Store session in Redis (or fallback to memory)
    await sessionStore.set(sessionId, session);
    this.moveStartTimes.set(sessionId, Date.now());

    const position = await this.getCurrentPosition(sessionId, session);
    const expectedMove = await this.getCurrentExpectedMove(sessionId, session);

    if (!expectedMove) return null;

    // Calculate total moves for this player
    // In one-side mode, only count moves for player's color
    // White plays even indices (0, 2, 4...) = ceil(n/2) moves
    // Black plays odd indices (1, 3, 5...) = floor(n/2) moves
    const totalMoves = mode === 'one-side' && playerColor
      ? (playerColor === 'white' ? Math.ceil(game.moves.length / 2) : Math.floor(game.moves.length / 2))
      : game.moves.length;

    return {
      sessionId,
      game,
      position,
      currentMoveIndex: startingMoveIndex,
      currentSide: startingMoveIndex % 2 === 0 ? 'white' : 'black',
      expectedMove,
      totalMoves,
      mode,
      playerColor,
    };
  }

  async getSession(sessionId: string): Promise<PracticeSession | undefined> {
    return sessionStore.get(sessionId);
  }

  async getCurrentPosition(sessionId: string, cachedSession?: PracticeSession): Promise<string> {
    const session = cachedSession || await sessionStore.get(sessionId);
    if (!session) {
      return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }

    // Check cache first
    const cacheKey = `${sessionId}:${session.currentMoveIndex}`;
    const cached = this.positionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate and cache
    const fen = this.pgnService.getFenAtMove(
      session.historicalGame.moves,
      session.currentMoveIndex
    );
    this.positionCache.set(cacheKey, fen);

    // Evict oldest entries if cache exceeds max size
    if (this.positionCache.size > PracticeService.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.positionCache.keys()).slice(0, 100);
      keysToDelete.forEach(key => this.positionCache.delete(key));
    }

    return fen;
  }

  async getCurrentExpectedMove(sessionId: string, cachedSession?: PracticeSession): Promise<MoveDetails | null> {
    const session = cachedSession || await sessionStore.get(sessionId);
    if (
      !session ||
      session.currentMoveIndex >= session.historicalGame.moves.length
    ) {
      return null;
    }

    const currentFen = await this.getCurrentPosition(sessionId, session);
    const expectedMoveSan =
      session.historicalGame.moves[session.currentMoveIndex];
    return this.pgnService.getMoveDetails(currentFen, expectedMoveSan);
  }

  async getCurrentSide(sessionId: string): Promise<'white' | 'black'> {
    const session = await sessionStore.get(sessionId);
    if (!session) return 'white';
    return session.currentMoveIndex % 2 === 0 ? 'white' : 'black';
  }

  async processMove(sessionId: string, submittedMove: string): Promise<PracticeMoveResult | null> {
    const session = await sessionStore.get(sessionId);
    if (!session || session.status !== 'playing') return null;

    const moveStartTime = this.moveStartTimes.get(sessionId) || Date.now();
    const timeSpent = Date.now() - moveStartTime;

    const expectedMove = session.historicalGame.moves[session.currentMoveIndex];
    const currentFen = await this.getCurrentPosition(sessionId, session);
    const validation = this.pgnService.validateMove(
      submittedMove,
      expectedMove,
      currentFen
    );

    const currentSide = session.currentMoveIndex % 2 === 0 ? 'white' : 'black';

    const result: PracticeMoveResult = {
      moveIndex: session.currentMoveIndex,
      expectedMove,
      submittedMove: validation.normalizedMove,
      isCorrect: validation.matchesExpected,
      timeSpent,
      side: currentSide,
    };

    session.moveResults.push(result);

    // In one-side mode, skip opponent's move (increment by 2)
    // In both-sides mode, just go to next move (increment by 1)
    if (session.mode === 'one-side') {
      session.currentMoveIndex += 2;
    } else {
      session.currentMoveIndex++;
    }

    // Save updated session to Redis
    await sessionStore.set(sessionId, session);

    // Reset timer for next move
    this.moveStartTimes.set(sessionId, Date.now());

    return result;
  }

  async isSessionComplete(sessionId: string): Promise<boolean> {
    const session = await sessionStore.get(sessionId);
    if (!session) return false;
    // Session is complete when currentMoveIndex is beyond the last move
    return session.currentMoveIndex >= session.historicalGame.moves.length;
  }

  async completeSession(sessionId: string): Promise<PracticeCompletedData | null> {
    const session = await sessionStore.get(sessionId);
    if (!session) return null;

    session.status = 'completed';
    const totalTimeMs = Date.now() - session.startedAt;
    const correctMoves = session.moveResults.filter((r) => r.isCorrect).length;

    // Update session status in Redis
    await sessionStore.set(sessionId, session);

    // Clean up timer tracking
    this.moveStartTimes.delete(sessionId);

    return {
      sessionId,
      game: session.historicalGame,
      totalMoves: session.moveResults.length,
      correctMoves,
      accuracy:
        session.moveResults.length > 0
          ? correctMoves / session.moveResults.length
          : 0,
      totalTimeMs,
      averageTimePerMove:
        session.moveResults.length > 0
          ? totalTimeMs / session.moveResults.length
          : 0,
      moveResults: session.moveResults,
      trivia: session.historicalGame.trivia,
    };
  }

  async abandonSession(sessionId: string): Promise<void> {
    const session = await sessionStore.get(sessionId);
    if (session) {
      session.status = 'abandoned';
      await sessionStore.set(sessionId, session);
      this.moveStartTimes.delete(sessionId);
    }
  }

  async removeSession(sessionId: string): Promise<void> {
    await sessionStore.delete(sessionId);
    this.moveStartTimes.delete(sessionId);
    // Clear caches for this session
    for (const key of this.positionCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.positionCache.delete(key);
      }
    }
    for (const key of this.legalMovesCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.legalMovesCache.delete(key);
      }
    }
  }

  async removeSessionBySocketId(socketId: string): Promise<void> {
    const sessionId = await sessionStore.getSessionIdBySocketId(socketId);
    if (sessionId) {
      await this.removeSession(sessionId);
    }
  }

  /**
   * Remove only inactive sessions (completed/abandoned) for a socket.
   * Keeps active 'playing' sessions alive for potential reconnection.
   */
  async removeInactiveSessionsBySocketId(socketId: string): Promise<void> {
    const sessionId = await sessionStore.getSessionIdBySocketId(socketId);
    if (sessionId) {
      const session = await sessionStore.get(sessionId);
      if (session && session.status !== 'playing') {
        await this.removeSession(sessionId);
      }
    }
  }

  /**
   * Update the socket ID for an existing session (for reconnection)
   */
  async updateSessionSocketId(sessionId: string, newSocketId: string): Promise<boolean> {
    const session = await sessionStore.get(sessionId);
    if (session) {
      const oldSocketId = session.socketId;
      return sessionStore.updateSocketId(sessionId, oldSocketId, newSocketId);
    }
    return false;
  }

  async getLegalMoves(sessionId: string): Promise<string[]> {
    const session = await sessionStore.get(sessionId);
    if (!session) return [];

    // Check cache first
    const cacheKey = `${sessionId}:${session.currentMoveIndex}`;
    const cached = this.legalMovesCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate and cache
    const currentFen = await this.getCurrentPosition(sessionId, session);
    const moves = this.pgnService.getLegalMoves(currentFen);
    this.legalMovesCache.set(cacheKey, moves);

    // Evict oldest entries if cache exceeds max size
    if (this.legalMovesCache.size > PracticeService.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.legalMovesCache.keys()).slice(0, 100);
      keysToDelete.forEach(key => this.legalMovesCache.delete(key));
    }

    return moves;
  }

  async getNextMoveData(sessionId: string): Promise<{
    position: string;
    currentMoveIndex: number;
    currentSide: 'white' | 'black';
    expectedMove: MoveDetails;
    opponentMove?: MoveDetails;
  } | null> {
    const session = await sessionStore.get(sessionId);
    if (!session) return null;

    const isComplete = session.currentMoveIndex >= session.historicalGame.moves.length;
    if (isComplete) return null;

    const position = await this.getCurrentPosition(sessionId, session);
    const expectedMove = await this.getCurrentExpectedMove(sessionId, session);

    if (!expectedMove) return null;

    const currentSide = session.currentMoveIndex % 2 === 0 ? 'white' : 'black';

    const result: {
      position: string;
      currentMoveIndex: number;
      currentSide: 'white' | 'black';
      expectedMove: MoveDetails;
      opponentMove?: MoveDetails;
    } = {
      position,
      currentMoveIndex: session.currentMoveIndex,
      currentSide,
      expectedMove,
    };

    // In one-side mode, include the opponent's move that was auto-played
    // The opponent's move is the move just before the current position
    if (session.mode === 'one-side' && session.currentMoveIndex > 0) {
      const opponentMoveIndex = session.currentMoveIndex - 1;
      const opponentMoveSan = session.historicalGame.moves[opponentMoveIndex];
      if (opponentMoveSan) {
        // Get the FEN before the opponent's move
        const fenBeforeOpponentMove = this.pgnService.getFenAtMove(
          session.historicalGame.moves,
          opponentMoveIndex
        );
        const opponentMoveDetails = this.pgnService.getMoveDetails(fenBeforeOpponentMove, opponentMoveSan);
        if (opponentMoveDetails) {
          result.opponentMove = opponentMoveDetails;
        }
      }
    }

    return result;
  }

  /**
   * Get session data for resumption after page refresh.
   * Returns null if session doesn't exist or is not in 'playing' status.
   */
  async getSessionResumeData(sessionId: string): Promise<SessionResumedData | null> {
    const session = await sessionStore.get(sessionId);
    if (!session || session.status !== 'playing') {
      return null;
    }

    const position = await this.getCurrentPosition(sessionId, session);
    const expectedMove = await this.getCurrentExpectedMove(sessionId, session);

    if (!expectedMove) return null;

    // Calculate total moves (same logic as createSession)
    const game = session.historicalGame;
    const totalMoves = session.mode === 'one-side' && session.playerColor
      ? (session.playerColor === 'white'
          ? Math.ceil(game.moves.length / 2)
          : Math.floor(game.moves.length / 2))
      : game.moves.length;

    return {
      sessionId: session.id,
      game: session.historicalGame,
      position,
      currentMoveIndex: session.currentMoveIndex,
      currentSide: session.currentMoveIndex % 2 === 0 ? 'white' : 'black',
      expectedMove,
      totalMoves,
      mode: session.mode,
      playerColor: session.playerColor,
      moveResults: session.moveResults,
    };
  }
}
