import { Chess } from 'chess.js';
import { Server } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';
import {
  TimeControl,
  MultiplayerGameState,
  MultiplayerGameOverData,
  MultiplayerGameResumedData,
  GameEndReason,
} from '../types/multiplayer.js';
import { multiplayerStore } from './multiplayerSessionStore.js';
import { PgnService } from './pgnService.js';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DISCONNECT_GRACE_PERIOD_MS = 60_000; // 60 seconds before auto-forfeit

export class MultiplayerService {
  private pgnService: PgnService;
  private clockIntervals: Map<string, NodeJS.Timeout> = new Map();
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.pgnService = new PgnService();
  }

  async createGame(
    creatorUid: string,
    creatorName: string,
    creatorSocketId: string,
    timeControl: TimeControl | null,
    inviteCode: string | null = null
  ): Promise<MultiplayerGameState> {
    const gameId = `mp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const initialTime = timeControl?.initialTimeMs ?? 0;

    const game: MultiplayerGameState = {
      id: gameId,
      status: 'waiting',
      fen: STARTING_FEN,
      moves: [],
      turn: 'white',
      moveCount: 0,
      lastMove: null,
      white: {
        uid: creatorUid,
        displayName: creatorName,
        socketId: creatorSocketId,
        color: 'white',
        connected: true,
        timeRemainingMs: initialTime,
      },
      black: {
        uid: '',
        displayName: '',
        socketId: null,
        color: 'black',
        connected: false,
        timeRemainingMs: initialTime,
      },
      timeControl,
      lastTickAt: 0,
      result: null,
      endReason: null,
      winner: null,
      drawOfferedBy: null,
      inviteCode,
      createdAt: Date.now(),
      startedAt: null,
    };

    await multiplayerStore.setGame(gameId, game);
    await multiplayerStore.setUidMapping(creatorUid, gameId);

    if (inviteCode) {
      await multiplayerStore.setInviteMapping(inviteCode, gameId);
    }

    return game;
  }

  async joinGame(
    gameId: string,
    joinerUid: string,
    joinerName: string,
    joinerSocketId: string
  ): Promise<{ game: MultiplayerGameState; creatorColor: 'white' | 'black' } | null> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status !== 'waiting') return null;

    // Don't join your own game
    if (game.white.uid === joinerUid) return null;

    // Randomly assign colors
    const creatorPlaysWhite = Math.random() < 0.5;

    if (creatorPlaysWhite) {
      game.black = {
        uid: joinerUid,
        displayName: joinerName,
        socketId: joinerSocketId,
        color: 'black',
        connected: true,
        timeRemainingMs: game.timeControl?.initialTimeMs ?? 0,
      };
    } else {
      // Swap: creator becomes black, joiner becomes white
      const creator = { ...game.white };
      game.white = {
        uid: joinerUid,
        displayName: joinerName,
        socketId: joinerSocketId,
        color: 'white',
        connected: true,
        timeRemainingMs: game.timeControl?.initialTimeMs ?? 0,
      };
      game.black = {
        ...creator,
        color: 'black',
        timeRemainingMs: game.timeControl?.initialTimeMs ?? 0,
      };
    }

    game.status = 'active';
    game.startedAt = Date.now();
    game.lastTickAt = Date.now();

    await multiplayerStore.setGame(gameId, game);
    await multiplayerStore.setUidMapping(joinerUid, gameId);

    if (game.inviteCode) {
      await multiplayerStore.deleteInviteMapping(game.inviteCode);
    }

    // Start the clock if time control is set
    if (game.timeControl) {
      this.startClock(gameId);
    }

    return { game, creatorColor: creatorPlaysWhite ? 'white' : 'black' };
  }

  async processMove(
    gameId: string,
    uid: string,
    moveSan: string
  ): Promise<{
    success: boolean;
    move?: { san: string; from: string; to: string };
    fen?: string;
    turn?: 'white' | 'black';
    moveCount?: number;
    isCheck?: boolean;
    gameOver?: { result: '1-0' | '0-1' | '1/2-1/2'; reason: GameEndReason; winner: 'white' | 'black' | null };
    whiteTimeMs?: number;
    blackTimeMs?: number;
    error?: string;
  }> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status !== 'active') {
      return { success: false, error: 'Game not active' };
    }

    // Verify it's this player's turn
    const playerColor = this.getPlayerColor(game, uid);
    if (!playerColor) {
      return { success: false, error: 'Not a player in this game' };
    }
    if (game.turn !== playerColor) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate and apply the move
    const chess = new Chess(game.fen);
    let moveResult;
    try {
      moveResult = chess.move(moveSan);
      if (!moveResult) {
        // Try sloppy parsing
        moveResult = chess.move(moveSan, { strict: false });
      }
    } catch {
      try {
        moveResult = chess.move(moveSan, { strict: false });
      } catch {
        return { success: false, error: 'Illegal move' };
      }
    }

    if (!moveResult) {
      return { success: false, error: 'Illegal move' };
    }

    // Update game state
    game.fen = chess.fen();
    game.moves.push(moveResult.san);
    game.turn = game.turn === 'white' ? 'black' : 'white';
    game.moveCount++;
    game.lastMove = { from: moveResult.from, to: moveResult.to, san: moveResult.san };
    game.drawOfferedBy = null; // Clear any draw offer on a new move

    // Apply time increment to the player who just moved
    if (game.timeControl) {
      const now = Date.now();
      const elapsed = now - game.lastTickAt;
      const mover = playerColor === 'white' ? game.white : game.black;
      mover.timeRemainingMs = Math.max(0, mover.timeRemainingMs - elapsed + game.timeControl.incrementMs);
      game.lastTickAt = now;
    }

    // Check for game-ending conditions
    let gameOver: { result: '1-0' | '0-1' | '1/2-1/2'; reason: GameEndReason; winner: 'white' | 'black' | null } | undefined;

    if (chess.isCheckmate()) {
      gameOver = {
        result: playerColor === 'white' ? '1-0' : '0-1',
        reason: 'checkmate',
        winner: playerColor,
      };
    } else if (chess.isStalemate()) {
      gameOver = { result: '1/2-1/2', reason: 'stalemate', winner: null };
    } else if (chess.isInsufficientMaterial()) {
      gameOver = { result: '1/2-1/2', reason: 'insufficient_material', winner: null };
    } else if (chess.isThreefoldRepetition()) {
      gameOver = { result: '1/2-1/2', reason: 'threefold_repetition', winner: null };
    } else if (chess.isDraw()) {
      gameOver = { result: '1/2-1/2', reason: 'fifty_move_rule', winner: null };
    }

    if (gameOver) {
      game.status = 'completed';
      game.result = gameOver.result;
      game.endReason = gameOver.reason;
      game.winner = gameOver.winner;
      this.stopClock(gameId);
    }

    await multiplayerStore.setGame(gameId, game);

    return {
      success: true,
      move: { san: moveResult.san, from: moveResult.from, to: moveResult.to },
      fen: game.fen,
      turn: game.turn,
      moveCount: game.moveCount,
      isCheck: chess.isCheck(),
      gameOver,
      whiteTimeMs: game.white.timeRemainingMs,
      blackTimeMs: game.black.timeRemainingMs,
    };
  }

  async resign(gameId: string, uid: string): Promise<MultiplayerGameOverData | null> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status !== 'active') return null;

    const playerColor = this.getPlayerColor(game, uid);
    if (!playerColor) return null;

    const winner = playerColor === 'white' ? 'black' : 'white';
    game.status = 'completed';
    game.result = winner === 'white' ? '1-0' : '0-1';
    game.endReason = 'resignation';
    game.winner = winner;

    this.stopClock(gameId);
    await multiplayerStore.setGame(gameId, game);

    return this.buildGameOverData(game);
  }

  async offerDraw(gameId: string, uid: string): Promise<'white' | 'black' | null> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status !== 'active') return null;

    const playerColor = this.getPlayerColor(game, uid);
    if (!playerColor) return null;

    game.drawOfferedBy = playerColor;
    await multiplayerStore.setGame(gameId, game);
    return playerColor;
  }

  async respondToDraw(gameId: string, uid: string, accept: boolean): Promise<MultiplayerGameOverData | null> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status !== 'active' || !game.drawOfferedBy) return null;

    const playerColor = this.getPlayerColor(game, uid);
    if (!playerColor || playerColor === game.drawOfferedBy) return null; // Can't accept own draw offer

    if (!accept) {
      game.drawOfferedBy = null;
      await multiplayerStore.setGame(gameId, game);
      return null; // Draw declined, return null
    }

    // Draw accepted
    game.status = 'completed';
    game.result = '1/2-1/2';
    game.endReason = 'draw_agreement';
    game.winner = null;

    this.stopClock(gameId);
    await multiplayerStore.setGame(gameId, game);

    return this.buildGameOverData(game);
  }

  async handlePlayerDisconnect(gameId: string, uid: string): Promise<void> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status === 'completed') return;

    const player = game.white.uid === uid ? game.white : game.black;
    player.connected = false;
    player.socketId = null;

    if (game.status === 'active') {
      game.status = 'paused';
      await multiplayerStore.setGame(gameId, game);

      // Start abandonment timer
      const timer = setTimeout(async () => {
        this.disconnectTimers.delete(gameId);
        await this.handleAbandonment(gameId, uid);
      }, DISCONNECT_GRACE_PERIOD_MS);
      this.disconnectTimers.set(gameId, timer);
    } else if (game.status === 'waiting') {
      // Waiting game - just clean up
      await this.cleanupGame(gameId);
    } else {
      await multiplayerStore.setGame(gameId, game);
    }
  }

  async handlePlayerReconnect(
    gameId: string,
    uid: string,
    newSocketId: string
  ): Promise<MultiplayerGameResumedData | null> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game) return null;
    if (game.status === 'completed') return null;

    const playerColor = this.getPlayerColor(game, uid);
    if (!playerColor) return null;

    const player = playerColor === 'white' ? game.white : game.black;
    player.connected = true;
    player.socketId = newSocketId;

    // Clear abandonment timer
    const timer = this.disconnectTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(gameId);
    }

    // Resume if both players are connected
    if (game.white.connected && game.black.connected && game.status === 'paused') {
      game.status = 'active';
      game.lastTickAt = Date.now();
      if (game.timeControl) {
        this.startClock(gameId);
      }
    }

    await multiplayerStore.setGame(gameId, game);

    const opponent = playerColor === 'white' ? game.black : game.white;

    return {
      gameId: game.id,
      playerColor,
      opponent: { uid: opponent.uid, displayName: opponent.displayName, connected: opponent.connected },
      fen: game.fen,
      moves: game.moves,
      turn: game.turn,
      moveCount: game.moveCount,
      lastMove: game.lastMove,
      whiteTimeMs: game.white.timeRemainingMs,
      blackTimeMs: game.black.timeRemainingMs,
      timeControl: game.timeControl,
      drawOfferedBy: game.drawOfferedBy,
    };
  }

  async getGame(gameId: string): Promise<MultiplayerGameState | undefined> {
    return multiplayerStore.getGame(gameId);
  }

  getPlayerColor(game: MultiplayerGameState, uid: string): 'white' | 'black' | null {
    if (game.white.uid === uid) return 'white';
    if (game.black.uid === uid) return 'black';
    return null;
  }

  getLegalMoves(fen: string): string[] {
    return this.pgnService.getLegalMoves(fen);
  }

  async cleanupGame(gameId: string): Promise<void> {
    const game = await multiplayerStore.getGame(gameId);
    if (game) {
      await multiplayerStore.deleteUidMapping(game.white.uid);
      if (game.black.uid) {
        await multiplayerStore.deleteUidMapping(game.black.uid);
      }
      if (game.inviteCode) {
        await multiplayerStore.deleteInviteMapping(game.inviteCode);
      }
    }
    this.stopClock(gameId);
    const timer = this.disconnectTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(gameId);
    }
    await multiplayerStore.deleteGame(gameId);
  }

  // --- Clock management ---

  private startClock(gameId: string): void {
    this.stopClock(gameId); // Clear any existing interval

    const interval = setInterval(async () => {
      await this.tickClock(gameId);
    }, 1000);

    this.clockIntervals.set(gameId, interval);
  }

  private stopClock(gameId: string): void {
    const interval = this.clockIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.clockIntervals.delete(gameId);
    }
  }

  private async tickClock(gameId: string): Promise<void> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status !== 'active') {
      this.stopClock(gameId);
      return;
    }

    const now = Date.now();
    const elapsed = now - game.lastTickAt;
    game.lastTickAt = now;

    // Decrement the active player's time
    const activePlayer = game.turn === 'white' ? game.white : game.black;
    activePlayer.timeRemainingMs = Math.max(0, activePlayer.timeRemainingMs - elapsed);

    // Check for timeout
    if (activePlayer.timeRemainingMs <= 0) {
      const winner = game.turn === 'white' ? 'black' : 'white';
      game.status = 'completed';
      game.result = winner === 'white' ? '1-0' : '0-1';
      game.endReason = 'timeout';
      game.winner = winner;

      this.stopClock(gameId);
      await multiplayerStore.setGame(gameId, game);

      // Broadcast game over
      const gameOverData = this.buildGameOverData(game);
      this.io.to(`mp:${gameId}`).emit('mp-game-over', gameOverData);
      return;
    }

    await multiplayerStore.setGame(gameId, game);

    // Broadcast clock update
    this.io.to(`mp:${gameId}`).emit('mp-clock-update', {
      white: game.white.timeRemainingMs,
      black: game.black.timeRemainingMs,
    });
  }

  private async handleAbandonment(gameId: string, disconnectedUid: string): Promise<void> {
    const game = await multiplayerStore.getGame(gameId);
    if (!game || game.status === 'completed') return;

    const playerColor = this.getPlayerColor(game, disconnectedUid);
    if (!playerColor) return;

    const winner = playerColor === 'white' ? 'black' : 'white';
    game.status = 'completed';
    game.result = winner === 'white' ? '1-0' : '0-1';
    game.endReason = 'abandonment';
    game.winner = winner;

    this.stopClock(gameId);
    await multiplayerStore.setGame(gameId, game);

    const gameOverData = this.buildGameOverData(game);
    this.io.to(`mp:${gameId}`).emit('mp-game-over', gameOverData);
  }

  private buildGameOverData(game: MultiplayerGameState): MultiplayerGameOverData {
    // Build PGN from moves
    const chess = new Chess();
    for (const move of game.moves) {
      try { chess.move(move); } catch { break; }
    }

    return {
      gameId: game.id,
      result: game.result!,
      endReason: game.endReason!,
      winner: game.winner,
      fen: game.fen,
      pgn: chess.pgn(),
      moves: game.moves,
      whiteTimeMs: game.white.timeRemainingMs,
      blackTimeMs: game.black.timeRemainingMs,
    };
  }
}
