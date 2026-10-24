import { getRedisClient, isRedisAvailable } from "../lib/redis.js";

// Daily per-user cost guards for the LLM opponent. Counters live in Redis
// keyed by uid + UTC date; the in-memory fallback resets on process restart,
// which is acceptable for a single-instance deployment (matches the session
// stores' fallback semantics).
const ENV_PREFIX = process.env.NODE_ENV === "production" ? "prod:" : "dev:";
const COUNTER_TTL = 26 * 60 * 60; // seconds; outlives the UTC day it tracks

export const DAILY_GAME_LIMIT = 10;
export const DAILY_LLM_TURN_LIMIT = 400;
export const DAILY_PARSE_LIMIT = 1000;

type CounterKind = "games" | "turns" | "parses";

function counterKey(kind: CounterKind, uid: string): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${ENV_PREFIX}ai:limit:${kind}:${uid}:${day}`;
}

export class AiUsageLimiter {
  private memoryCounters: Map<string, { count: number; expiresAt: number }> = new Map();

  private async increment(kind: CounterKind, uid: string): Promise<number> {
    const key = counterKey(kind, uid);
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        return Number(await redis.eval(
          'local n = redis.call("INCR", KEYS[1]); if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]); end; return n',
          1, key, COUNTER_TTL,
        ));
      } catch (error) {
        console.error("[AiUsageLimiter] Error incrementing counter:", error);
        return Number.POSITIVE_INFINITY;
      }
    }

    const now = Date.now();
    for (const [storedKey, entry] of this.memoryCounters) {
      if (entry.expiresAt <= now) this.memoryCounters.delete(storedKey);
    }
    const previous = this.memoryCounters.get(key);
    const count = (previous?.count || 0) + 1;
    this.memoryCounters.set(key, { count, expiresAt: previous?.expiresAt ?? now + COUNTER_TTL * 1000 });
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

    return this.memoryCounters.get(key)?.count || 0;
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

  /** Shared across practice/multiplayer and reconnects, including guest IPs. */
  async tryConsumeParse(identity: string): Promise<boolean> {
    return (await this.increment('parses', identity)) <= DAILY_PARSE_LIMIT;
  }
}

export const aiUsageLimiter = new AiUsageLimiter();
