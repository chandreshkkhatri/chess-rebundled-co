import { Server } from 'socket.io';
import { Player } from '../types/index.js';

interface ActiveTimer {
  roomId: string;
  currentTurn: 'white' | 'black';
  turnStartTime: number;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  intervalId: NodeJS.Timeout;
}

interface GameState {
  turn: 'white' | 'black';
  position: string;
  moveIndex: number;
  players: Player[];
}

const TOTAL_TIME_PER_PLAYER = 180000; // 3 minutes in milliseconds

export class TimerService {
  private activeTimers: Map<string, ActiveTimer> = new Map();
  private readonly SYNC_INTERVAL = 1000; // Sync every second

  constructor(
    private io: Server,
    private onTimeExpired: (roomId: string, loser: 'white' | 'black') => void,
    private getGameState?: (roomId: string) => GameState | null
  ) {}

  /**
   * Start the game timer for a room
   */
  startGameTimer(roomId: string, initialTurn: 'white' | 'black' = 'white'): { whiteTime: number; blackTime: number } {
    console.log(`[TimerService] startGameTimer called for room ${roomId}, initialTurn: ${initialTurn}`);

    // Clear any existing timer
    this.clearTimer(roomId);

    const timer: ActiveTimer = {
      roomId,
      currentTurn: initialTurn,
      turnStartTime: Date.now(),
      whiteTimeRemaining: TOTAL_TIME_PER_PLAYER,
      blackTimeRemaining: TOTAL_TIME_PER_PLAYER,
      intervalId: setInterval(() => this.tick(roomId), this.SYNC_INTERVAL),
    };

    this.activeTimers.set(roomId, timer);
    console.log(`[TimerService] Timer started for room ${roomId}. Active timers count: ${this.activeTimers.size}`);

    return { whiteTime: timer.whiteTimeRemaining, blackTime: timer.blackTimeRemaining };
  }

  /**
   * Switch turn - stops current player's clock and starts opponent's
   */
  switchTurn(roomId: string): { whiteTime: number; blackTime: number } | null {
    console.log(`[TimerService] switchTurn called for room ${roomId}. Active timers: ${Array.from(this.activeTimers.keys()).join(', ') || '(none)'}`);

    const timer = this.activeTimers.get(roomId);
    if (!timer) {
      console.error(`[TimerService] Timer not found for room ${roomId}. Total active timers: ${this.activeTimers.size}`);
      return null;
    }

    console.log(`[TimerService] Found timer for room ${roomId}. Current turn: ${timer.currentTurn}`);

    // Calculate elapsed time for current player
    const elapsed = Date.now() - timer.turnStartTime;
    console.log(`[TimerService] Elapsed time for ${timer.currentTurn}: ${elapsed}ms`);

    // Deduct time from current player
    if (timer.currentTurn === 'white') {
      timer.whiteTimeRemaining = Math.max(0, timer.whiteTimeRemaining - elapsed);
    } else {
      timer.blackTimeRemaining = Math.max(0, timer.blackTimeRemaining - elapsed);
    }

    // Switch turn
    const oldTurn = timer.currentTurn;
    timer.currentTurn = timer.currentTurn === 'white' ? 'black' : 'white';
    timer.turnStartTime = Date.now();

    console.log(`[TimerService] Turn switched from ${oldTurn} to ${timer.currentTurn}. Times: white=${timer.whiteTimeRemaining}ms, black=${timer.blackTimeRemaining}ms`);

    return { whiteTime: timer.whiteTimeRemaining, blackTime: timer.blackTimeRemaining };
  }

  /**
   * Get current times for both players (accounting for elapsed time on current turn)
   */
  getCurrentTimes(roomId: string): { whiteTime: number; blackTime: number } | null {
    const timer = this.activeTimers.get(roomId);
    if (!timer) return null;

    const elapsed = Date.now() - timer.turnStartTime;

    let whiteTime = timer.whiteTimeRemaining;
    let blackTime = timer.blackTimeRemaining;

    // Deduct elapsed time from current player
    if (timer.currentTurn === 'white') {
      whiteTime = Math.max(0, whiteTime - elapsed);
    } else {
      blackTime = Math.max(0, blackTime - elapsed);
    }

    return { whiteTime, blackTime };
  }

  /**
   * Clear all timer resources for a room
   */
  clearTimer(roomId: string): void {
    const timer = this.activeTimers.get(roomId);
    if (timer) {
      clearInterval(timer.intervalId);
      this.activeTimers.delete(roomId);
    }
  }

  /**
   * Periodic tick - check for timeout and broadcast sync
   */
  private tick(roomId: string): void {
    const times = this.getCurrentTimes(roomId);
    if (!times) return;

    const timer = this.activeTimers.get(roomId);
    if (!timer) return;

    // Check for timeout
    if (timer.currentTurn === 'white' && times.whiteTime <= 0) {
      this.clearTimer(roomId);
      this.onTimeExpired(roomId, 'white');
      return;
    }
    if (timer.currentTurn === 'black' && times.blackTime <= 0) {
      this.clearTimer(roomId);
      this.onTimeExpired(roomId, 'black');
      return;
    }

    // Get game state if available
    const gameState = this.getGameState?.(roomId);

    // Broadcast time sync to all players with full state for reconciliation
    this.io.to(roomId).emit('timer-sync', {
      whiteTime: times.whiteTime,
      blackTime: times.blackTime,
      turn: gameState?.turn ?? timer.currentTurn,
      position: gameState?.position ?? '',
      moveIndex: gameState?.moveIndex ?? 0,
      players: gameState?.players ?? [],
    });
  }

  /**
   * Get the total time limit per player
   */
  getTimeLimit(): number {
    return TOTAL_TIME_PER_PLAYER;
  }
}
