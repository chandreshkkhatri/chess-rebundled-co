import { QueueEntry, TimeControl } from '../types/multiplayer.js';

export class MatchmakingService {
  private queues: Map<string, QueueEntry[]> = new Map();

  private getQueueKey(timeControl: TimeControl | null): string {
    if (!timeControl) return 'no-clock';
    return `${timeControl.initialTimeMs}-${timeControl.incrementMs}`;
  }

  /**
   * Add a player to the matchmaking queue.
   * Returns a matched opponent if one is waiting, or null if queued.
   */
  addToQueue(entry: QueueEntry, timeControl: TimeControl | null): QueueEntry | null {
    const key = this.getQueueKey(timeControl);
    let queue = this.queues.get(key);

    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }

    // Don't allow duplicate entries
    const existing = queue.findIndex(e => e.uid === entry.uid);
    if (existing !== -1) {
      queue.splice(existing, 1);
    }

    // Check for a waiting opponent (FIFO)
    if (queue.length > 0) {
      const opponent = queue.shift()!;
      // Don't match against yourself
      if (opponent.uid === entry.uid) {
        queue.unshift(opponent);
        return null;
      }
      return opponent;
    }

    // No match found, add to queue
    queue.push(entry);
    return null;
  }

  /**
   * Remove a player from all queues.
   */
  removeFromQueue(uid: string): void {
    for (const [, queue] of this.queues) {
      const idx = queue.findIndex(e => e.uid === uid);
      if (idx !== -1) {
        queue.splice(idx, 1);
        return;
      }
    }
  }

  /**
   * Check if a player is in any queue.
   */
  isInQueue(uid: string): boolean {
    for (const [, queue] of this.queues) {
      if (queue.some(e => e.uid === uid)) {
        return true;
      }
    }
    return false;
  }

  getQueueSize(timeControl: TimeControl | null): number {
    const key = this.getQueueKey(timeControl);
    return this.queues.get(key)?.length ?? 0;
  }
}
