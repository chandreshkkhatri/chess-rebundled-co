import {
  PracticeSession,
  PracticeMoveResult,
  PracticeCompletedData,
  PracticeStartedData,
  HistoricalGame,
  MoveDetails,
  PracticeMode,
} from '../types/index.js';
import { PgnService } from './pgnService.js';
import { getRandomGame, getGameById as getGameByIdFromDb } from './gameRepository.js';

export class PracticeService {
  private sessions: Map<string, PracticeSession> = new Map();
  private pgnService: PgnService;
  private moveStartTimes: Map<string, number> = new Map();
  // Performance optimizations
  private positionCache: Map<string, string> = new Map(); // sessionId:moveIndex -> FEN
  private socketToSession: Map<string, string> = new Map(); // socketId -> sessionId
  private static readonly MAX_CACHE_SIZE = 1000;

  constructor() {
    this.pgnService = new PgnService();
  }

  // Start session with a random game from MongoDB
  async startSessionWithRandomGame(
    socketId: string,
    playerName: string,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null
  ): Promise<PracticeStartedData | null> {
    const game = await getRandomGame();
    if (!game) return null;

    return this.createSession(socketId, playerName, game, mode, playerColor);
  }

  // Start session with a specific game (for backward compatibility)
  async startSession(
    socketId: string,
    playerName: string,
    gameId: string,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null
  ): Promise<PracticeStartedData | null> {
    const game = await getGameByIdFromDb(gameId);
    if (!game) return null;

    return this.createSession(socketId, playerName, game, mode, playerColor);
  }

  private createSession(
    socketId: string,
    playerName: string,
    game: HistoricalGame,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null
  ): PracticeStartedData | null {
    const sessionId = `practice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // For one-side mode, if playing as black, start at move index 1 (after white's first move)
    const startingMoveIndex = (mode === 'one-side' && playerColor === 'black') ? 1 : 0;

    const session: PracticeSession = {
      id: sessionId,
      socketId,
      playerName,
      historicalGame: game,
      currentMoveIndex: startingMoveIndex,
      moveResults: [],
      startedAt: Date.now(),
      status: 'playing',
      mode,
      playerColor,
    };

    this.sessions.set(sessionId, session);
    this.socketToSession.set(socketId, sessionId);
    this.moveStartTimes.set(sessionId, Date.now());

    const position = this.getCurrentPosition(sessionId);
    const expectedMove = this.getCurrentExpectedMove(sessionId);

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

  getSession(sessionId: string): PracticeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getCurrentPosition(sessionId: string): string {
    const session = this.sessions.get(sessionId);
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

  getCurrentExpectedMove(sessionId: string): MoveDetails | null {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.currentMoveIndex >= session.historicalGame.moves.length
    ) {
      return null;
    }

    const currentFen = this.getCurrentPosition(sessionId);
    const expectedMoveSan =
      session.historicalGame.moves[session.currentMoveIndex];
    return this.pgnService.getMoveDetails(currentFen, expectedMoveSan);
  }

  getCurrentSide(sessionId: string): 'white' | 'black' {
    const session = this.sessions.get(sessionId);
    if (!session) return 'white';
    return session.currentMoveIndex % 2 === 0 ? 'white' : 'black';
  }

  processMove(sessionId: string, submittedMove: string): PracticeMoveResult | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'playing') return null;

    const moveStartTime = this.moveStartTimes.get(sessionId) || Date.now();
    const timeSpent = Date.now() - moveStartTime;

    const expectedMove = session.historicalGame.moves[session.currentMoveIndex];
    const currentFen = this.getCurrentPosition(sessionId);
    const validation = this.pgnService.validateMove(
      submittedMove,
      expectedMove,
      currentFen
    );

    const result: PracticeMoveResult = {
      moveIndex: session.currentMoveIndex,
      expectedMove,
      submittedMove: validation.normalizedMove,
      isCorrect: validation.matchesExpected,
      timeSpent,
      side: this.getCurrentSide(sessionId),
    };

    session.moveResults.push(result);

    // In one-side mode, skip opponent's move (increment by 2)
    // In both-sides mode, just go to next move (increment by 1)
    if (session.mode === 'one-side') {
      session.currentMoveIndex += 2;
    } else {
      session.currentMoveIndex++;
    }

    // Reset timer for next move
    this.moveStartTimes.set(sessionId, Date.now());

    return result;
  }

  isSessionComplete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    // Session is complete when currentMoveIndex is beyond the last move
    return session.currentMoveIndex >= session.historicalGame.moves.length;
  }

  completeSession(sessionId: string): PracticeCompletedData | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = 'completed';
    const totalTimeMs = Date.now() - session.startedAt;
    const correctMoves = session.moveResults.filter((r) => r.isCorrect).length;

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

  abandonSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'abandoned';
      this.moveStartTimes.delete(sessionId);
    }
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.socketToSession.delete(session.socketId);
    }
    this.sessions.delete(sessionId);
    this.moveStartTimes.delete(sessionId);
    // Clear position cache for this session
    for (const key of this.positionCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.positionCache.delete(key);
      }
    }
  }

  removeSessionBySocketId(socketId: string): void {
    const sessionId = this.socketToSession.get(socketId);
    if (sessionId) {
      this.removeSession(sessionId);
    }
  }

  /**
   * Remove only inactive sessions (completed/abandoned) for a socket.
   * Keeps active 'playing' sessions alive for potential reconnection.
   */
  removeInactiveSessionsBySocketId(socketId: string): void {
    const sessionId = this.socketToSession.get(socketId);
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session && session.status !== 'playing') {
        this.removeSession(sessionId);
      }
    }
  }

  /**
   * Update the socket ID for an existing session (for reconnection)
   */
  updateSessionSocketId(sessionId: string, newSocketId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update socket index
      this.socketToSession.delete(session.socketId);
      this.socketToSession.set(newSocketId, sessionId);
      session.socketId = newSocketId;
      return true;
    }
    return false;
  }

  getLegalMoves(sessionId: string): string[] {
    const currentFen = this.getCurrentPosition(sessionId);
    return this.pgnService.getLegalMoves(currentFen);
  }

  getNextMoveData(sessionId: string): {
    position: string;
    currentMoveIndex: number;
    currentSide: 'white' | 'black';
    expectedMove: MoveDetails;
    opponentMove?: MoveDetails;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionComplete(sessionId)) return null;

    const position = this.getCurrentPosition(sessionId);
    const expectedMove = this.getCurrentExpectedMove(sessionId);

    if (!expectedMove) return null;

    const result: {
      position: string;
      currentMoveIndex: number;
      currentSide: 'white' | 'black';
      expectedMove: MoveDetails;
      opponentMove?: MoveDetails;
    } = {
      position,
      currentMoveIndex: session.currentMoveIndex,
      currentSide: this.getCurrentSide(sessionId),
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
}
