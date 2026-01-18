import { Server } from 'socket.io';

interface ActiveTimer {
  roomId: string;
  startTime: number;
  timeLimit: number;
  intervalId: NodeJS.Timeout;
  timeoutId: NodeJS.Timeout;
}

export class TimerService {
  private activeTimers: Map<string, ActiveTimer> = new Map();
  private readonly SYNC_INTERVAL = 1000; // Sync every second
  private readonly LATENCY_GRACE = 200; // 200ms grace period for latency

  constructor(
    private io: Server,
    private onTimeExpired: (roomId: string) => void
  ) {}

  /**
   * Start a new turn timer
   */
  startTimer(roomId: string, timeLimit: number = 10000): void {
    // Clear any existing timer
    this.clearTimer(roomId);

    const startTime = Date.now();

    // Set up periodic sync broadcasts
    const intervalId = setInterval(() => {
      this.broadcastTimeSync(roomId, startTime, timeLimit);
    }, this.SYNC_INTERVAL);

    // Set up expiration timeout
    const timeoutId = setTimeout(() => {
      this.handleTimerExpired(roomId);
    }, timeLimit + this.LATENCY_GRACE);

    this.activeTimers.set(roomId, {
      roomId,
      startTime,
      timeLimit,
      intervalId,
      timeoutId,
    });

    // Immediate first sync
    this.broadcastTimeSync(roomId, startTime, timeLimit);
  }

  /**
   * Stop timer and return remaining time
   */
  stopTimer(roomId: string): number {
    const timer = this.activeTimers.get(roomId);
    if (!timer) {
      return 0;
    }

    const elapsed = Date.now() - timer.startTime;
    const remaining = Math.max(0, timer.timeLimit - elapsed);

    this.clearTimer(roomId);

    return remaining;
  }

  /**
   * Clear all timer resources for a room
   */
  clearTimer(roomId: string): void {
    const timer = this.activeTimers.get(roomId);
    if (timer) {
      clearInterval(timer.intervalId);
      clearTimeout(timer.timeoutId);
      this.activeTimers.delete(roomId);
    }
  }

  /**
   * Get remaining time for a room
   */
  getRemainingTime(roomId: string): number {
    const timer = this.activeTimers.get(roomId);
    if (!timer) {
      return 0;
    }

    const elapsed = Date.now() - timer.startTime;
    return Math.max(0, timer.timeLimit - elapsed);
  }

  /**
   * Broadcast time synchronization to all players in room
   */
  private broadcastTimeSync(
    roomId: string,
    startTime: number,
    timeLimit: number
  ): void {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, timeLimit - elapsed);

    this.io.to(roomId).emit('timer-sync', {
      remaining,
    });
  }

  /**
   * Handle timer expiration
   */
  private handleTimerExpired(roomId: string): void {
    this.clearTimer(roomId);
    this.onTimeExpired(roomId);
  }
}
