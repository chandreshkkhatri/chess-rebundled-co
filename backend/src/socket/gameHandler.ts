import { Server, Socket } from 'socket.io';
import { GameService } from '../services/gameService.js';
import { ChallengeService } from '../services/challengeService.js';
import { TimerService } from '../services/timerService.js';
import { PracticeService } from '../services/practiceService.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class GameHandler {
  private gameService: GameService;
  private challengeService: ChallengeService;
  private timerService: TimerService;
  private practiceService: PracticeService;
  private socketToRoom: Map<string, string> = new Map();

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService();
    this.challengeService = new ChallengeService();
    this.timerService = new TimerService(
      io as Server,
      (roomId, loser) => this.handleTimeoutLoss(roomId, loser),
      (roomId) => this.getGameStateForSync(roomId)
    );
    this.practiceService = new PracticeService();
  }

  private getGameStateForSync(roomId: string) {
    const room = this.gameService.getRoom(roomId);
    if (!room || room.status !== 'playing') return null;

    const position = this.gameService.getCurrentPosition(roomId);
    return {
      turn: room.currentTurn,
      position,
      moveIndex: room.currentMoveIndex,
      players: room.players,
    };
  }

  register(socket: GameSocket): void {
    console.log(`[DEBUG] Registering handlers for socket: ${socket.id}`);

    // Legacy room events
    socket.on('join-room', (data) => {
         console.log(`[DEBUG] Socket ${socket.id} received join-room`);
         this.handleJoinRoom(socket, data)
    });
    socket.on('select-game', (data) => this.handleSelectGame(socket, data));
    socket.on('start-game', (data) => this.handleStartGame(socket, data));
    
    // Explicit debug for submit-move
    socket.on('submit-move', (data) => {
        console.log(`[DEBUG] Socket ${socket.id} received submit-move raw event:`, data);
        try {
            this.handleSubmitMove(socket, data);
        } catch (e) {
            console.error(`[DEBUG] Error in handleSubmitMove:`, e);
        }
    });

    // Ready event
    socket.on('player-ready', (data) => this.handlePlayerReady(socket, data));

    // Lobby events
    socket.on('create-challenge', (data) => this.handleCreateChallenge(socket, data));
    socket.on('cancel-challenge', () => this.handleCancelChallenge(socket));
    socket.on('get-challenges', () => this.handleGetChallenges(socket));
    socket.on('accept-challenge', (data) => this.handleAcceptChallenge(socket, data));

    // Rejoin events
    socket.on('rejoin-room', (data) => this.handleRejoinRoom(socket, data));

    // Practice mode events
    socket.on('get-practice-games', () => this.handleGetPracticeGames(socket));
    socket.on('start-practice', (data) => this.handleStartPractice(socket, data));
    socket.on('start-practice-random', (data) => this.handleStartPracticeRandom(socket, data));
    socket.on('submit-practice-move', (data) => this.handleSubmitPracticeMove(socket, data));
    socket.on('abandon-practice', (data) => this.handleAbandonPractice(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
    
    // Catch-all listener for debugging
    socket.onAny((eventName, ...args) => {
        console.log(`[DEBUG] Socket ${socket.id} received event: ${eventName}`);
    });
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

    // Start the game timer (3 minutes per player)
    const times = this.timerService.startGameTimer(roomId, startResult.turn);

    // Notify all players that game is starting
    this.io.to(roomId).emit('game-start', {
      position: startResult.position,
      turn: startResult.turn,
      timeLimit: room.timeLimit,
      whiteTime: times.whiteTime,
      blackTime: times.blackTime,
      players: room.players,
      expectedMove,
    });

    console.log(`Game started in room ${roomId}`);
  }

  private handleSubmitMove(
    socket: GameSocket,
    data: { roomId: string; move: string; confidence: number }
  ): void {
    const { roomId, move } = data;
    console.log(`handleSubmitMove called: roomId=${roomId}, move=${move}, socketId=${socket.id}`);

    const room = this.gameService.getRoom(roomId);
    if (!room) {
      console.error(`handleSubmitMove: Room ${roomId} not found`);
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    console.log(`Room ${roomId} found, status=${room.status}, currentTurn=${room.currentTurn}`);

    // Verify it's this player's turn
    const player = this.gameService.getPlayerBySocketId(roomId, socket.id);
    if (!player || player.color !== room.currentTurn) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Get current times before switching
    const currentTimes = this.timerService.getCurrentTimes(roomId);
    const timeRemaining = currentTimes
      ? (player.color === 'white' ? currentTimes.whiteTime : currentTimes.blackTime)
      : 0;

    // Process the move
    const result = this.gameService.processMove(roomId, socket.id, move, timeRemaining);
    if (!result) {
      socket.emit('error', { message: 'Could not process move' });
      return;
    }

    // Send result to all players - emit to submitter + broadcast to others
    // Using socket.emit + socket.to() instead of io.to() to ensure delivery
    const socketsInRoom = this.io.sockets.adapter.rooms.get(roomId);
    console.log(`[DEBUG] Before move-result emit. Socket ${socket.id} in room ${roomId}: ${socket.rooms.has(roomId)}`);
    console.log(`[DEBUG] Sockets in room ${roomId}: ${socketsInRoom ? Array.from(socketsInRoom).join(', ') : 'NONE'}`);

    socket.emit('move-result', result);  // To submitter
    socket.to(roomId).emit('move-result', result);  // To others in room

    console.log(
      `Move in room ${roomId}: ${move} -> ${result.isCorrect ? 'CORRECT' : 'WRONG'} (expected: ${result.expectedMove})`
    );

    // Check if game is over
    if (this.gameService.isGameOver(roomId)) {
      this.endGame(roomId);
    } else {
      // Get updated room state for turn change
      const newPosition = this.gameService.getCurrentPosition(roomId);
      const updatedRoom = this.gameService.getRoom(roomId)!;
      const expectedMove = this.gameService.getCurrentExpectedMove(roomId);

      // Switch turn and get updated times
      console.log(`Attempting to switch turn for room ${roomId}. Current turn before switch: ${updatedRoom.currentTurn}`);
      const times = this.timerService.switchTurn(roomId);
      if (!times) {
        console.error(`Failed to switch turn - timer not found for room ${roomId}`);
        console.error(`Room whiteTime: ${updatedRoom.whiteTimeRemaining}, blackTime: ${updatedRoom.blackTimeRemaining}`);
        // Still emit turn change with room's stored times to prevent hang
        const turnChangeData = {
          turn: updatedRoom.currentTurn,
          position: newPosition,
          moveIndex: updatedRoom.currentMoveIndex,
          whiteTime: updatedRoom.whiteTimeRemaining,
          blackTime: updatedRoom.blackTimeRemaining,
          expectedMove,
        };
        console.log(`Emitting turn-change (no timer) to room ${roomId}:`, JSON.stringify(turnChangeData, null, 2));
        socket.emit('turn-change', turnChangeData);  // To submitter
        socket.to(roomId).emit('turn-change', turnChangeData);  // To others in room
        return;
      }

      // Notify turn change with timer values
      const turnChangeData = {
        turn: updatedRoom.currentTurn,
        position: newPosition,
        moveIndex: updatedRoom.currentMoveIndex,
        whiteTime: times.whiteTime,
        blackTime: times.blackTime,
        expectedMove,
      };
      console.log(`Emitting turn-change (with timer) to room ${roomId}:`, JSON.stringify(turnChangeData, null, 2));
      socket.emit('turn-change', turnChangeData);  // To submitter
      socket.to(roomId).emit('turn-change', turnChangeData);  // To others in room
    }
  }

  private handleTimeoutLoss(roomId: string, loser: 'white' | 'black'): void {
    const room = this.gameService.getRoom(roomId);
    if (!room || room.status !== 'playing') return;

    console.log(`Time expired in room ${roomId} for ${loser} - game over`);

    // End the game - the player who ran out of time loses
    this.timerService.clearTimer(roomId);
    room.status = 'finished';

    // Find winner (opponent of loser)
    const winner = room.players.find(p => p.color !== loser);

    this.io.to(roomId).emit('game-end', {
      winner: winner?.id || null,
      players: room.players,
      trivia: room.historicalGame?.trivia || [],
      reason: 'timeout',
    });

    console.log(`Game ended in room ${roomId}. Winner: ${winner?.name || 'NONE'} (opponent timed out)`);
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

    // Join both sockets to the room
    console.log(`Joining sockets to room ${room.id}:`);
    console.log(`  Creator socket: ${challenge.creatorSocketId}`);
    console.log(`  Acceptor socket: ${socket.id}`);

    const creatorSocket = this.io.sockets.sockets.get(challenge.creatorSocketId);
    if (creatorSocket) {
      creatorSocket.leave('lobby');
      creatorSocket.join(room.id);
      this.socketToRoom.set(challenge.creatorSocketId, room.id);
      console.log(`  Creator joined room. Socket rooms: ${Array.from(creatorSocket.rooms).join(', ')}`);
    } else {
      console.log(`  WARNING: Creator socket not found!`);
    }
    socket.leave('lobby');
    socket.join(room.id);
    this.socketToRoom.set(socket.id, room.id);
    console.log(`  Acceptor joined room. Socket rooms: ${Array.from(socket.rooms).join(', ')}`);

    // Set room to ready status (waiting for players to click ready)
    this.gameService.setReadyStatus(room.id);

    // Verify room status
    const verifyRoom = this.gameService.getRoom(room.id);
    console.log(`Room ${room.id} status after setReadyStatus: ${verifyRoom?.status}`);
    console.log(`Room players: ${verifyRoom?.players.map(p => `${p.name}(${p.socketId})`).join(', ')}`);

    // Notify both players to show ready screen
    const matchData = {
      roomId: room.id,
      game,
      players: room.players,
      position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      timeLimit: room.timeLimit,
    };

    this.io.to(room.id).emit('challenge-accepted', matchData);

    console.log(`Challenge accepted. Room ${room.id} created. Waiting for ready. Game: ${game.title}`);
  }

  private handlePlayerReady(
    socket: GameSocket,
    data: { roomId: string }
  ): void {
    const { roomId } = data;

    console.log(`Player ready request: roomId=${roomId}, socketId=${socket.id}`);
    console.log(`All rooms: ${this.gameService.getAllRoomIds().join(', ') || '(none)'}`);
    console.log(`socketToRoom: ${socket.id} -> ${this.socketToRoom.get(socket.id) || '(not mapped)'}`);
    // Check if socket is in the expected socket.io room
    console.log(`Socket rooms: ${Array.from(socket.rooms).join(', ')}`)

    const room = this.gameService.getRoom(roomId);
    if (!room) {
      console.log(`Room not found: ${roomId}`);
      socket.emit('error', { message: `Room not found: ${roomId}` });
      return;
    }

    console.log(`Room found: ${room.id}, status: ${room.status}, players: ${room.players.map(p => p.name + '/' + p.socketId).join(', ')}`);

    if (room.status !== 'ready') {
      console.log(`Room status is '${room.status}', expected 'ready'. Room ID: ${roomId}`);
      socket.emit('error', { message: `Room status is '${room.status}', expected 'ready'` });
      return;
    }

    const player = this.gameService.getPlayerBySocketId(roomId, socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }

    // Mark player as ready
    const wasMarked = this.gameService.markPlayerReady(roomId, player.id);
    if (!wasMarked) {
      return;
    }

    // Notify all players that this player is ready
    this.io.to(roomId).emit('player-ready', player.id);

    console.log(`Player ${player.name} is ready in room ${roomId}`);

    // Check if all players are ready
    if (this.gameService.areAllPlayersReady(roomId)) {
      this.startCountdown(roomId);
    }
  }

  private startCountdown(roomId: string): void {
    this.gameService.setCountdownStatus(roomId);

    let countdown = 5;
    this.io.to(roomId).emit('countdown-start', countdown);

    const countdownInterval = setInterval(() => {
      countdown--;

      if (countdown > 0) {
        this.io.to(roomId).emit('countdown-tick', countdown);
      } else {
        clearInterval(countdownInterval);
        this.actuallyStartGame(roomId);
      }
    }, 1000);
  }

  private actuallyStartGame(roomId: string): void {
    console.log(`actuallyStartGame called for room ${roomId}`);

    const room = this.gameService.getRoom(roomId);
    if (!room) {
      console.error(`actuallyStartGame: Room ${roomId} not found`);
      return;
    }

    const startResult = this.gameService.startGame(roomId);
    if (!startResult) {
      console.error(`actuallyStartGame: Failed to start game in room ${roomId}`);
      return;
    }

    // Get the first expected move
    const expectedMove = this.gameService.getCurrentExpectedMove(roomId);

    // Start the game timer (3 minutes per player)
    const times = this.timerService.startGameTimer(roomId, startResult.turn);
    console.log(`Timer started for room ${roomId}: whiteTime=${times.whiteTime}, blackTime=${times.blackTime}`);

    // Check which sockets are in this room
    const socketsInRoom = this.io.sockets.adapter.rooms.get(roomId);
    console.log(`Sockets in room ${roomId}: ${socketsInRoom ? Array.from(socketsInRoom).join(', ') : '(none)'}`);

    // Notify all players that game is starting
    const gameStartData = {
      position: startResult.position,
      turn: startResult.turn,
      timeLimit: room.timeLimit,
      whiteTime: times.whiteTime,
      blackTime: times.blackTime,
      players: room.players,
      expectedMove,
    };
    console.log(`Emitting game-start to room ${roomId}:`, JSON.stringify(gameStartData, null, 2));

    this.io.to(roomId).emit('game-start', gameStartData);

    console.log(`Game started in room ${roomId}`);
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

    // Room must be in an active state to rejoin (ready, countdown, or playing)
    const rejoinableStatuses = ['ready', 'countdown', 'playing'];
    if (!rejoinableStatuses.includes(room.status)) {
      socket.emit('rejoin-failed', { message: 'Room is not active' });
      return;
    }

    // Update the player's socket ID
    this.gameService.updatePlayerSocketId(roomId, playerId, socket.id);

    // Join the socket.io room
    socket.join(roomId);
    this.socketToRoom.set(socket.id, roomId);

    // Get current times from timer (only available if game is playing)
    const times = this.timerService.getCurrentTimes(roomId);

    // Send rejoin data to the player
    socket.emit('room-rejoined', {
      roomId,
      players: room.players,
      selectedGame: room.historicalGame!,
      status: room.status,
      currentPosition,
      currentTurn: room.currentTurn,
      moveIndex: room.currentMoveIndex,
      timeLimit: room.timeLimit,
      whiteTime: times?.whiteTime ?? room.timeLimit,
      blackTime: times?.blackTime ?? room.timeLimit,
      expectedMove,
      myPlayerId: player.id,
      myColor: player.color,
      readyPlayers: Array.from(room.readyPlayers),
    });

    console.log(`Player ${player.name} rejoined room ${roomId} (status: ${room.status})`);
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
      const room = this.gameService.getRoom(roomId);
      // Don't remove players during an active game - allow rejoin
      if (!room || room.status !== 'playing') {
        this.gameService.removePlayer(roomId, socket.id);
      }
      this.socketToRoom.delete(socket.id);
    }

    // Clean up any practice sessions
    this.practiceService.removeSessionBySocketId(socket.id);
  }

  // Practice mode handlers
  private handleGetPracticeGames(socket: GameSocket): void {
    // This is now deprecated but kept for backward compatibility
    socket.emit('practice-games-list', []);
    console.log(`[DEPRECATED] get-practice-games called by socket ${socket.id}`);
  }

  private async handleStartPractice(
    socket: GameSocket,
    data: { gameId?: string; playerName: string; mode?: 'both-sides' | 'one-side'; playerColor?: 'white' | 'black' }
  ): Promise<void> {
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
  }

  private async handleStartPracticeRandom(
    socket: GameSocket,
    data: { playerName: string; mode?: 'both-sides' | 'one-side'; playerColor?: 'white' | 'black' }
  ): Promise<void> {
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
  }

  private handleSubmitPracticeMove(
    socket: GameSocket,
    data: { sessionId: string; move: string }
  ): void {
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
  }

  private handleAbandonPractice(
    socket: GameSocket,
    data: { sessionId: string }
  ): void {
    this.practiceService.abandonSession(data.sessionId);
    console.log(`Practice session abandoned: ${data.sessionId}`);
  }
}
