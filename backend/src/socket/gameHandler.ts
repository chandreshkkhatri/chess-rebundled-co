import { Server, Socket } from 'socket.io';
import { PracticeService } from '../services/practiceService.js';
import { parseChessMoveWithAI } from '../services/aiMoveParser.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class GameHandler {
  private practiceService: PracticeService;

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.practiceService = new PracticeService();
  }

  register(socket: GameSocket): void {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Practice mode events
    socket.on('get-practice-games', () => this.handleGetPracticeGames(socket));
    socket.on('start-practice', (data) => this.handleStartPractice(socket, data));
    socket.on('start-practice-random', (data) => this.handleStartPracticeRandom(socket, data));
    socket.on('submit-practice-move', (data) => this.handleSubmitPracticeMove(socket, data));
    socket.on('abandon-practice', (data) => this.handleAbandonPractice(socket, data));
    socket.on('parse-move-with-ai', (data) => this.handleParseMoveWithAI(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private handleDisconnect(socket: GameSocket): void {
    console.log(`[Socket] Client disconnected: ${socket.id}`);

    // Don't remove active practice sessions - allow reconnection
    // Only remove sessions that are completed or abandoned
    this.practiceService.removeInactiveSessionsBySocketId(socket.id);
  }

  // Practice mode handlers
  private handleGetPracticeGames(socket: GameSocket): void {
    // This is deprecated but kept for backward compatibility
    socket.emit('practice-games-list', []);
    console.log(`[DEPRECATED] get-practice-games called by socket ${socket.id}`);
  }

  private async handleStartPractice(
    socket: GameSocket,
    data: { gameId?: string; playerName: string; mode?: 'both-sides' | 'one-side'; playerColor?: 'white' | 'black' }
  ): Promise<void> {
    try {
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
        data.playerColor || null
      );

      if (!startData) {
        socket.emit('practice-error', { message: 'Could not start practice session' });
        return;
      }

      socket.emit('practice-started', startData);
      console.log(`Practice session started: ${startData.sessionId} for ${data.playerName}, game: ${startData.game.title}, mode: ${startData.mode}`);
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
      const startData = await this.practiceService.startSessionWithRandomGame(
        socket.id,
        data.playerName,
        data.mode || 'both-sides',
        data.playerColor || null
      );

      if (!startData) {
        socket.emit('practice-error', { message: 'Could not start practice session - no games available' });
        return;
      }

      socket.emit('practice-started', startData);
      console.log(`Practice session started (random): ${startData.sessionId} for ${data.playerName}, game: ${startData.game.title}, mode: ${startData.mode}`);
    } catch (error) {
      console.error('Error starting random practice session:', error);
      socket.emit('practice-error', { message: 'Failed to start practice session due to server error' });
    }
  }

  private handleSubmitPracticeMove(
    socket: GameSocket,
    data: { sessionId: string; move: string }
  ): void {
    try {
      // Update socket ID if reconnected
      const session = this.practiceService.getSession(data.sessionId);
      if (session && session.socketId !== socket.id) {
        this.practiceService.updateSessionSocketId(data.sessionId, socket.id);
        console.log(`[Practice] Updated session ${data.sessionId} socket for reconnection`);
      }

      const result = this.practiceService.processMove(data.sessionId, data.move);

      if (!result) {
        socket.emit('practice-error', { message: 'Could not process move' });
        return;
      }

      socket.emit('practice-move-result', result);
      console.log(`Practice move: ${data.move} -> ${result.isCorrect ? 'CORRECT' : 'WRONG'} (expected: ${result.expectedMove})`);

      // Check if session is complete
      if (this.practiceService.isSessionComplete(data.sessionId)) {
        const completedData = this.practiceService.completeSession(data.sessionId);
        if (completedData) {
          socket.emit('practice-completed', completedData);
          console.log(`Practice completed: ${completedData.correctMoves}/${completedData.totalMoves} correct (${(completedData.accuracy * 100).toFixed(1)}%)`);
        }
      } else {
        // Send next move data
        const nextMoveData = this.practiceService.getNextMoveData(data.sessionId);
        if (nextMoveData) {
          socket.emit('practice-next-move', nextMoveData);
        }
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
    console.log(`Practice session abandoned: ${data.sessionId}`);
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
      console.log(`[AI Parse] Updated session ${data.sessionId} socket: ${session.socketId} -> ${socket.id}`);
    }

    const currentFen = this.practiceService.getCurrentPosition(data.sessionId);
    const legalMoves = this.practiceService.getLegalMoves(data.sessionId);

    try {
      const parsed = await parseChessMoveWithAI(
        data.transcript,
        currentFen,
        legalMoves
      );

      socket.emit('move-parsed', {
        transcript: data.transcript,
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });

      console.log(`[AI Parse] "${data.transcript}" -> "${parsed.move}" (${(parsed.confidence * 100).toFixed(0)}% confident)`);
    } catch (error) {
      console.error('[AI Parse] Error:', error);
      socket.emit('parse-error', {
        message: `AI parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
}
