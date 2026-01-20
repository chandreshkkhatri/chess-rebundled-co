import { Server, Socket } from 'socket.io';
import { GameService } from '../services/gameService.js';
import { ChallengeService } from '../services/challengeService.js';
import { TimerService } from '../services/timerService.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class GameHandler {
  private gameService: GameService;
  private challengeService: ChallengeService;
  private timerService: TimerService;
  private socketToRoom: Map<string, string> = new Map();

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService();
    this.challengeService = new ChallengeService();
    this.timerService = new TimerService(io as Server, (roomId) =>
      this.handleTimeout(roomId)
    );
  }

  register(socket: GameSocket): void {
    console.log(`Client connected: ${socket.id}`);

    // Legacy room events
    socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
    socket.on('select-game', (data) => this.handleSelectGame(socket, data));
    socket.on('start-game', (data) => this.handleStartGame(socket, data));
    socket.on('submit-move', (data) => this.handleSubmitMove(socket, data));

    // Lobby events
    socket.on('create-challenge', (data) => this.handleCreateChallenge(socket, data));
    socket.on('cancel-challenge', () => this.handleCancelChallenge(socket));
    socket.on('get-challenges', () => this.handleGetChallenges(socket));
    socket.on('accept-challenge', (data) => this.handleAcceptChallenge(socket, data));

    // Rejoin events
    socket.on('rejoin-room', (data) => this.handleRejoinRoom(socket, data));

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

    // Get the first expected move
    const expectedMove = this.gameService.getCurrentExpectedMove(roomId);

    // Notify all players that game is starting
    this.io.to(roomId).emit('game-start', {
      position: startResult.position,
      turn: startResult.turn,
      timeLimit: room.timeLimit,
      players: room.players,
      expectedMove,
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
      const expectedMove = this.gameService.getCurrentExpectedMove(roomId);

      this.io.to(roomId).emit('turn-change', {
        turn: updatedRoom.currentTurn,
        position: newPosition,
        moveIndex: updatedRoom.currentMoveIndex,
        expectedMove,
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
      const expectedMove = this.gameService.getCurrentExpectedMove(roomId);

      this.io.to(roomId).emit('turn-change', {
        turn: updatedRoom.currentTurn,
        position: newPosition,
        moveIndex: updatedRoom.currentMoveIndex,
        expectedMove,
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

  // Lobby event handlers
  private handleCreateChallenge(
    socket: GameSocket,
    data: { playerName: string }
  ): void {
    const challenge = this.challengeService.createChallenge(socket.id, data.playerName);

    // Join lobby room for broadcasts
    socket.join('lobby');

    // Notify all in lobby about new challenge
    this.io.to('lobby').emit('challenge-created', challenge);

    console.log(`Challenge created by ${data.playerName}: ${challenge.id}`);
  }

  private handleCancelChallenge(socket: GameSocket): void {
    const challengeId = this.challengeService.removeChallengeBySocketId(socket.id);
    if (challengeId) {
      socket.leave('lobby');
      this.io.to('lobby').emit('challenge-removed', challengeId);
      console.log(`Challenge cancelled: ${challengeId}`);
    }
  }

  private handleGetChallenges(socket: GameSocket): void {
    const challenges = this.challengeService.getAllChallenges();
    socket.emit('challenges-list', challenges);

    // Join lobby to receive updates
    socket.join('lobby');
  }

  private handleAcceptChallenge(
    socket: GameSocket,
    data: { challengeId: string; playerName: string }
  ): void {
    const challenge = this.challengeService.getChallenge(data.challengeId);

    if (!challenge) {
      socket.emit('error', { message: 'Challenge no longer available' });
      return;
    }

    // Prevent self-acceptance
    if (challenge.creatorSocketId === socket.id) {
      socket.emit('error', { message: 'Cannot accept your own challenge' });
      return;
    }

    // Remove challenge from lobby
    this.challengeService.removeChallenge(data.challengeId);
    this.io.to('lobby').emit('challenge-removed', data.challengeId);

    // Create matched room with random game
    const { room, game } = this.gameService.createMatchedRoom(
      challenge.creatorSocketId,
      challenge.creatorName,
      socket.id,
      data.playerName
    );

    // Start the game
    const startResult = this.gameService.startGame(room.id);
    if (!startResult) {
      socket.emit('error', { message: 'Could not start game' });
      return;
    }

    // Join both sockets to the room
    const creatorSocket = this.io.sockets.sockets.get(challenge.creatorSocketId);
    if (creatorSocket) {
      creatorSocket.leave('lobby');
      creatorSocket.join(room.id);
      this.socketToRoom.set(challenge.creatorSocketId, room.id);
    }
    socket.leave('lobby');
    socket.join(room.id);
    this.socketToRoom.set(socket.id, room.id);

    // Get the first expected move
    const expectedMove = this.gameService.getCurrentExpectedMove(room.id);

    // Notify both players
    const matchData = {
      roomId: room.id,
      game,
      players: room.players,
      position: startResult.position,
      turn: startResult.turn,
      timeLimit: room.timeLimit,
      expectedMove,
    };

    this.io.to(room.id).emit('challenge-accepted', matchData);

    // Start the timer
    this.timerService.startTimer(room.id, room.timeLimit);

    console.log(`Challenge accepted. Room ${room.id} created. Game: ${game.title}`);
  }

  private handleRejoinRoom(
    socket: GameSocket,
    data: { roomId: string; playerId: string }
  ): void {
    const { roomId, playerId } = data;

    // Get room data for rejoin
    const rejoinData = this.gameService.getRoomDataForRejoin(roomId, playerId);

    if (!rejoinData) {
      socket.emit('rejoin-failed', { message: 'Room or player not found' });
      return;
    }

    const { room, player, currentPosition, expectedMove } = rejoinData;

    // Game must be in progress to rejoin
    if (room.status !== 'playing') {
      socket.emit('rejoin-failed', { message: 'Game is not in progress' });
      return;
    }

    // Update the player's socket ID
    this.gameService.updatePlayerSocketId(roomId, playerId, socket.id);

    // Join the socket.io room
    socket.join(roomId);
    this.socketToRoom.set(socket.id, roomId);

    // Get remaining time from timer
    const timeRemaining = this.timerService.getRemainingTime(roomId);

    // Send rejoin data to the player
    socket.emit('room-rejoined', {
      roomId,
      players: room.players,
      selectedGame: room.historicalGame!,
      status: room.status,
      currentPosition,
      currentTurn: room.currentTurn,
      moveIndex: room.currentMoveIndex,
      timeRemaining,
      timeLimit: room.timeLimit,
      expectedMove,
      myPlayerId: player.id,
      myColor: player.color,
    });

    console.log(`Player ${player.name} rejoined room ${roomId}`);
  }

  private handleDisconnect(socket: GameSocket): void {
    console.log(`Client disconnected: ${socket.id}`);

    // Clean up any challenge this socket created
    const removedChallengeId = this.challengeService.removeChallengeBySocketId(socket.id);
    if (removedChallengeId) {
      this.io.to('lobby').emit('challenge-removed', removedChallengeId);
    }

    // Clean up room mapping
    const roomId = this.socketToRoom.get(socket.id);
    if (roomId) {
      this.gameService.removePlayer(roomId, socket.id);
      this.socketToRoom.delete(socket.id);
    }
  }
}
