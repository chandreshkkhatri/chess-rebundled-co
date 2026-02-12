import { QueueEntry, TimeControl } from '../types/multiplayer.js';

export interface MatchResult {
  opponent: QueueEntry;
  matchedTimeControl: TimeControl | null;
}

export interface WaitingPlayer {
  uid: string;
  displayName: string;
  timeControl: string;
  waitingSince: number;
}

export class MatchmakingService {
  private queues: Map<string, QueueEntry[]> = new Map();

  private getQueueKey(timeControl: TimeControl | null): string {
    if (!timeControl) return 'no-clock';
    return `${timeControl.initialTimeMs}-${timeControl.incrementMs}`;
  }

  private parseQueueKey(key: string): TimeControl | null {
    if (key === 'no-clock' || key === 'any') return null;
    const [initialStr, incrementStr] = key.split('-');
    return { initialTimeMs: parseInt(initialStr, 10), incrementMs: parseInt(incrementStr, 10) };
  }

  /**
   * Add a player to the matchmaking queue.
   * Supports 'any' time control that matches across all queues.
   * Returns a matched opponent with the resolved time control, or null if queued.
   */
  addToQueue(entry: QueueEntry, timeControl: TimeControl | null | 'any'): MatchResult | null {
    // Remove from any existing queue first
    this.removeFromQueue(entry.uid);

    if (timeControl === 'any') {
      // Check all specific-TC queues for any waiting opponent
      for (const [key, queue] of this.queues) {
        if (key === 'any') continue;
        if (queue.length > 0 && queue[0].uid !== entry.uid) {
          const opponent = queue.shift()!;
          return { opponent, matchedTimeControl: this.parseQueueKey(key) };
        }
      }
      // No match in any queue; add to the "any" queue
      let anyQueue = this.queues.get('any');
      if (!anyQueue) {
        anyQueue = [];
        this.queues.set('any', anyQueue);
      }
      anyQueue.push(entry);
      return null;
    }

    const key = this.getQueueKey(timeControl);

    // First, check the "any" queue for a cross-match
    const anyQueue = this.queues.get('any');
    if (anyQueue && anyQueue.length > 0) {
      const anyIdx = anyQueue.findIndex(e => e.uid !== entry.uid);
      if (anyIdx !== -1) {
        const opponent = anyQueue.splice(anyIdx, 1)[0];
        return { opponent, matchedTimeControl: timeControl };
      }
    }

    // Then check the specific TC queue
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }

    // Check for a waiting opponent (FIFO)
    if (queue.length > 0) {
      const opponent = queue.shift()!;
      if (opponent.uid === entry.uid) {
        queue.unshift(opponent);
        return null;
      }
      return { opponent, matchedTimeControl: timeControl };
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

  /**
   * Get sizes of all active queues.
   */
  getAllQueueSizes(): Record<string, number> {
    const sizes: Record<string, number> = {};
    for (const [key, queue] of this.queues) {
      if (queue.length > 0) {
        sizes[key] = queue.length;
      }
    }
    return sizes;
  }

  /**
   * Get all waiting players across all queues.
   */
  getWaitingPlayers(): WaitingPlayer[] {
    const players: WaitingPlayer[] = [];
    for (const [key, queue] of this.queues) {
      for (const entry of queue) {
        players.push({
          uid: entry.uid,
          displayName: entry.displayName,
          timeControl: key,
          waitingSince: entry.joinedAt,
        });
      }
    }
    return players;
  }
}
