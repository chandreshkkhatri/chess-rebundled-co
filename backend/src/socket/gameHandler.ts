import { Server, Socket } from 'socket.io';
import { GameService } from '../services/gameService.js';
import { TimerService } from '../services/timerService.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class GameHandler {
  private gameService: GameService;
  private timerService: TimerService;

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService();
    this.timerService = new TimerService(io as Server, (roomId) =>
      this.handleTimeout(roomId)
    );
  }

  register(socket: GameSocket): void {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
    socket.on('select-game', (data) => this.handleSelectGame(socket, data));
    socket.on('start-game', (data) => this.handleStartGame(socket, data));
    socket.on('submit-move', (data) => this.handleSubmitMove(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private handleJoinRoom(
    socket: GameSocket,
    data: { roomId: string; playerName: string }
  ): void {
    const { roomId, playerName } = data;

    // Get or create room
    let room = this.gameService.getRoom(roomId);
    if (!room) {
      room = this.gameService.createRoom(roomId);
    }

    // Check if room is full
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    // Add player to room
    const player = this.gameService.addPlayer(roomId, socket.id, playerName);
    if (!player) {
      socket.emit('error', { message: 'Could not join room' });
      return;
    }

    // Join socket.io room
    socket.join(roomId);

    // Get available games
    const availableGames = this.gameService.getAvailableGames();

    // Notify the joining player
    socket.emit('room-joined', {
      roomId,
      players: room.players,
      availableGames,
    });

    // Notify other players in the room
    socket.to(roomId).emit('player-joined', player);

    console.log(`Player ${playerName} joined room ${roomId} as ${player.color}`);
  }

  private handleSelectGame(
    socket: GameSocket,
    data: { roomId: string; gameId: string }
  ): void {
    const { roomId, gameId } = data;

    const game = this.gameService.selectGame(roomId, gameId);
    if (!game) {
      socket.emit('error', { message: 'Could not select game' });
      return;
    }

    // Notify all players
    this.io.to(roomId).emit('game-selected', game);

    console.log(`Game selected in room ${roomId}: ${game.title}`);
  }

  private handleStartGame(
    socket: GameSocket,
    data: { roomId: string }
  ): void {
    const { roomId } = data;

    const room = this.gameService.getRoom(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const startResult = this.gameService.startGame(roomId);
    if (!startResult) {
      socket.emit('error', { message: 'Could not start game' });
      return;
    }

    // Notify all players that game is starting
    this.io.to(roomId).emit('game-start', {
      position: startResult.position,
      turn: startResult.turn,
      timeLimit: room.timeLimit,
      players: room.players,
    });

    // Start the timer for the first move
    this.timerService.startTimer(roomId, room.timeLimit);

    console.log(`Game started in room ${roomId}`);
  }

  private handleSubmitMove(
    socket: GameSocket,
    data: { roomId: string; move: string; confidence: number }
  ): void {
    const { roomId, move } = data;

    const room = this.gameService.getRoom(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Verify it's this player's turn
    const player = this.gameService.getPlayerBySocketId(roomId, socket.id);
    if (!player || player.color !== room.currentTurn) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Stop timer and get remaining time
    const timeRemaining = this.timerService.stopTimer(roomId);

    // Process the move
    const result = this.gameService.processMove(roomId, socket.id, move, timeRemaining);
    if (!result) {
      socket.emit('error', { message: 'Could not process move' });
      return;
    }

    // Send result to all players
    this.io.to(roomId).emit('move-result', result);

    console.log(
      `Move in room ${roomId}: ${move} -> ${result.isCorrect ? 'CORRECT' : 'WRONG'} (expected: ${result.expectedMove})`
    );

    // Check if game is over
    if (this.gameService.isGameOver(roomId)) {
      this.endGame(roomId);
    } else {
      // Notify turn change
      const newPosition = this.gameService.getCurrentPosition(roomId);
      const updatedRoom = this.gameService.getRoom(roomId)!;

      this.io.to(roomId).emit('turn-change', {
        turn: updatedRoom.currentTurn,
        position: newPosition,
        moveIndex: updatedRoom.currentMoveIndex,
      });

      // Start timer for next move
      this.timerService.startTimer(roomId, room.timeLimit);
    }
  }

  private handleTimeout(roomId: string): void {
    const room = this.gameService.getRoom(roomId);
    if (!room || room.status !== 'playing') return;

    console.log(`Timeout in room ${roomId} for ${room.currentTurn}`);

    // Record timeout as missed move
    const result = this.gameService.handleTimeout(roomId);
    if (result) {
      this.io.to(roomId).emit('move-result', result);
    }

    // Check if game is over
    if (this.gameService.isGameOver(roomId)) {
      this.endGame(roomId);
    } else {
      // Notify turn change
      const newPosition = this.gameService.getCurrentPosition(roomId);
      const updatedRoom = this.gameService.getRoom(roomId)!;

      this.io.to(roomId).emit('turn-change', {
        turn: updatedRoom.currentTurn,
        position: newPosition,
        moveIndex: updatedRoom.currentMoveIndex,
      });

      // Start timer for next move
      this.timerService.startTimer(roomId, room.timeLimit);
    }
  }

  private endGame(roomId: string): void {
    this.timerService.clearTimer(roomId);

    const endResult = this.gameService.endGame(roomId);
    if (!endResult) return;

    this.io.to(roomId).emit('game-end', {
      winner: endResult.winner?.id || null,
      players: endResult.players,
      trivia: endResult.trivia,
    });

    console.log(
      `Game ended in room ${roomId}. Winner: ${endResult.winner?.name || 'TIE'}`
    );
  }

  private handleDisconnect(socket: GameSocket): void {
    console.log(`Client disconnected: ${socket.id}`);

    // Find and clean up any rooms this player was in
    // For simplicity in POC, we don't track which room the socket was in
    // In production, you'd maintain a socket -> room mapping
  }
}
