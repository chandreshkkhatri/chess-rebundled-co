import { GameRoom, Player, HistoricalGame, MoveResult } from '../types/index.js';
import { PgnService } from './pgnService.js';
import { ScoringService } from './scoringService.js';
import { getGameById, getAllGames } from '../data/historicalGames.js';

export class GameService {
  private rooms: Map<string, GameRoom> = new Map();
  private pgnService: PgnService;
  private scoringService: ScoringService;

  constructor() {
    this.pgnService = new PgnService();
    this.scoringService = new ScoringService();
  }

  /**
   * Create a new game room
   */
  createRoom(roomId: string): GameRoom {
    const room: GameRoom = {
      id: roomId,
      players: [],
      historicalGame: null,
      status: 'waiting',
      currentMoveIndex: 0,
      currentTurn: 'white',
      timerStartedAt: null,
      timeLimit: 10000, // 10 seconds
    };
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Add player to room
   */
  addPlayer(roomId: string, socketId: string, name: string): Player | null {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length >= 2) {
      return null;
    }

    // Assign color based on join order
    const color = room.players.length === 0 ? 'white' : 'black';

    const player: Player = {
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      socketId,
      name,
      color,
      score: 0,
      moveScores: [],
    };

    room.players.push(player);

    // If room is full, move to selecting status
    if (room.players.length === 2) {
      room.status = 'selecting';
    }

    return player;
  }

  /**
   * Remove player from room
   */
  removePlayer(roomId: string, socketId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter(p => p.socketId !== socketId);

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    } else {
      room.status = 'waiting';
    }
  }

  /**
   * Get player by socket ID
   */
  getPlayerBySocketId(roomId: string, socketId: string): Player | undefined {
    const room = this.rooms.get(roomId);
    return room?.players.find(p => p.socketId === socketId);
  }

  /**
   * Select a historical game for the room
   */
  selectGame(roomId: string, gameId: string): HistoricalGame | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const game = getGameById(gameId);
    if (!game) return null;

    room.historicalGame = game;
    return game;
  }

  /**
   * Start the game
   */
  startGame(roomId: string): { position: string; turn: 'white' | 'black' } | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.historicalGame || room.players.length !== 2) {
      return null;
    }

    room.status = 'playing';
    room.currentMoveIndex = 0;
    room.currentTurn = 'white';

    // Reset scores
    room.players.forEach(p => {
      p.score = 0;
      p.moveScores = [];
    });

    const position = this.pgnService.getFenAtMove(room.historicalGame.moves, 0);

    return {
      position,
      turn: 'white',
    };
  }

  /**
   * Process a submitted move
   */
  processMove(
    roomId: string,
    socketId: string,
    submittedMove: string,
    timeRemaining: number
  ): MoveResult | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.historicalGame || room.status !== 'playing') {
      return null;
    }

    const player = room.players.find(p => p.socketId === socketId);
    if (!player || player.color !== room.currentTurn) {
      return null;
    }

    const expectedMove = room.historicalGame.moves[room.currentMoveIndex];
    const currentFen = this.pgnService.getFenAtMove(
      room.historicalGame.moves,
      room.currentMoveIndex
    );

    // Validate the move
    const validation = this.pgnService.validateMove(
      submittedMove,
      expectedMove,
      currentFen
    );

    // Calculate score
    const { moveScore } = this.scoringService.calculateMoveScore(
      timeRemaining,
      room.timeLimit,
      validation.matchesExpected
    );

    // Update player score
    player.moveScores.push(moveScore);
    player.score = this.scoringService.calculateNormalizedScore(player.moveScores);

    const result: MoveResult = {
      playerId: player.id,
      submittedMove: validation.normalizedMove,
      expectedMove,
      isCorrect: validation.matchesExpected,
      timeRemaining,
      timeTotal: room.timeLimit,
      score: moveScore,
    };

    // Advance to next move
    room.currentMoveIndex++;
    room.currentTurn = room.currentTurn === 'white' ? 'black' : 'white';

    return result;
  }

  /**
   * Handle timeout (no move submitted in time)
   */
  handleTimeout(roomId: string): MoveResult | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.historicalGame || room.status !== 'playing') {
      return null;
    }

    const player = room.players.find(p => p.color === room.currentTurn);
    if (!player) return null;

    const expectedMove = room.historicalGame.moves[room.currentMoveIndex];

    // Score 0 for timeout
    player.moveScores.push(0);
    player.score = this.scoringService.calculateNormalizedScore(player.moveScores);

    const result: MoveResult = {
      playerId: player.id,
      submittedMove: '',
      expectedMove,
      isCorrect: false,
      timeRemaining: 0,
      timeTotal: room.timeLimit,
      score: 0,
    };

    // Advance to next move
    room.currentMoveIndex++;
    room.currentTurn = room.currentTurn === 'white' ? 'black' : 'white';

    return result;
  }

  /**
   * Check if game is over
   */
  isGameOver(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.historicalGame) return false;
    return room.currentMoveIndex >= room.historicalGame.moves.length;
  }

  /**
   * Get current position FEN
   */
  getCurrentPosition(roomId: string): string {
    const room = this.rooms.get(roomId);
    if (!room || !room.historicalGame) {
      return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }
    return this.pgnService.getFenAtMove(room.historicalGame.moves, room.currentMoveIndex);
  }

  /**
   * End the game and determine winner
   */
  endGame(roomId: string): {
    winner: Player | null;
    players: Player[];
    trivia: string[];
  } | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.historicalGame) return null;

    room.status = 'finished';

    const [player1, player2] = room.players;
    const result = this.scoringService.determineWinner(player1.score, player2.score);

    let winner: Player | null = null;
    if (result === 'player1') {
      winner = player1;
    } else if (result === 'player2') {
      winner = player2;
    }

    return {
      winner,
      players: room.players,
      trivia: room.historicalGame.trivia,
    };
  }

  /**
   * Get all available games
   */
  getAvailableGames(): HistoricalGame[] {
    return getAllGames();
  }
}
