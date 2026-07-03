import { getRedisClient, isRedisAvailable } from "../lib/redis.js";

// Daily per-user cost guards for the LLM opponent. Counters live in Redis
// keyed by uid + UTC date; the in-memory fallback resets on process restart,
// which is acceptable for a single-instance deployment (matches the session
// stores' fallback semantics).
const ENV_PREFIX = process.env.NODE_ENV === "production" ? "prod:" : "dev:";
const COUNTER_TTL = 26 * 60 * 60; // seconds; outlives the UTC day it tracks

export const DAILY_GAME_LIMIT = 10;
export const DAILY_LLM_TURN_LIMIT = 400;

type CounterKind = "games" | "turns";

function counterKey(kind: CounterKind, uid: string): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${ENV_PREFIX}ai:limit:${kind}:${uid}:${day}`;
}

export class AiUsageLimiter {
  private memoryCounters: Map<string, number> = new Map();

  private async increment(kind: CounterKind, uid: string): Promise<number> {
    const key = counterKey(kind, uid);
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, COUNTER_TTL);
        }
        return count;
      } catch (error) {
        console.error("[AiUsageLimiter] Error incrementing counter:", error);
        return 0; // fail open — a broken limiter shouldn't block play
      }
    }

    const count = (this.memoryCounters.get(key) || 0) + 1;
    this.memoryCounters.set(key, count);
    return count;
  }

  private async getCount(kind: CounterKind, uid: string): Promise<number> {
    const key = counterKey(kind, uid);
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const value = await redis.get(key);
        return value ? parseInt(value, 10) : 0;
      } catch (error) {
        console.error("[AiUsageLimiter] Error reading counter:", error);
        return 0;
      }
    }

    return this.memoryCounters.get(key) || 0;
  }

  /** Returns true if the user may start another game today (and counts it). */
  async tryConsumeGame(uid: string): Promise<boolean> {
    if ((await this.getCount("games", uid)) >= DAILY_GAME_LIMIT) return false;
    return (await this.increment("games", uid)) <= DAILY_GAME_LIMIT;
  }

  /** Returns true if the user may spend another LLM call today (and counts it). */
  async tryConsumeLlmTurn(uid: string): Promise<boolean> {
    if ((await this.getCount("turns", uid)) >= DAILY_LLM_TURN_LIMIT) {
      return false;
    }
    return (await this.increment("turns", uid)) <= DAILY_LLM_TURN_LIMIT;
  }
}

export const aiUsageLimiter = new AiUsageLimiter();
