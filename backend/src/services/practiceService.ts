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
    this.moveStartTimes.set(sessionId, Date.now());

    const position = this.getCurrentPosition(sessionId);
    const expectedMove = this.getCurrentExpectedMove(sessionId);

    if (!expectedMove) return null;

    // Calculate total moves for this player
    // In one-side mode, only count moves for player's color
    const totalMoves = mode === 'one-side' && playerColor
      ? Math.ceil(game.moves.length / 2)
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
    return this.pgnService.getFenAtMove(
      session.historicalGame.moves,
      session.currentMoveIndex
    );
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
    this.sessions.delete(sessionId);
    this.moveStartTimes.delete(sessionId);
  }

  removeSessionBySocketId(socketId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.socketId === socketId) {
        this.sessions.delete(id);
        this.moveStartTimes.delete(id);
      }
    }
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
