import { AiGameState } from "../types/aiGame.js";
import { getRedisClient, isRedisAvailable } from "../lib/redis.js";

// TTLs in seconds
const ACTIVE_GAME_TTL = 3 * 60 * 60; // 3 hours for active games
const COMPLETED_GAME_TTL = 24 * 60 * 60; // 24 hours — the review screen reads it

const ENV_PREFIX = process.env.NODE_ENV === "production" ? "prod:" : "dev:";
const GAME_KEY_PREFIX = `${ENV_PREFIX}ai:game:`;
const UID_KEY_PREFIX = `${ENV_PREFIX}ai:uid:`;

export class AiGameSessionStore {
  private memoryStore: Map<string, AiGameState> = new Map();
  private uidToGame: Map<string, string> = new Map();

  private getTTL(status: AiGameState["status"]): number {
    return status === "completed" ? COMPLETED_GAME_TTL : ACTIVE_GAME_TTL;
  }

  async setGame(gameId: string, state: AiGameState): Promise<void> {
    const redis = getRedisClient();
    const ttl = this.getTTL(state.status);

    if (redis && isRedisAvailable()) {
      try {
        await redis.setex(GAME_KEY_PREFIX + gameId, ttl, JSON.stringify(state));
        return;
      } catch (error) {
        console.error("[AiGameSessionStore] Error setting game:", error);
        return;
      }
    }

    this.memoryStore.set(gameId, JSON.parse(JSON.stringify(state)));
  }

  async getGame(gameId: string): Promise<AiGameState | undefined> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const data = await redis.get(GAME_KEY_PREFIX + gameId);
        return data ? (JSON.parse(data) as AiGameState) : undefined;
      } catch (error) {
        console.error("[AiGameSessionStore] Error getting game:", error);
        return undefined;
      }
    }

    const game = this.memoryStore.get(gameId);
    return game ? JSON.parse(JSON.stringify(game)) : undefined;
  }

  async deleteGame(gameId: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        await redis.del(GAME_KEY_PREFIX + gameId);
        return;
      } catch (error) {
        console.error("[AiGameSessionStore] Error deleting game:", error);
        return;
      }
    }

    this.memoryStore.delete(gameId);
  }

  async setUidMapping(uid: string, gameId: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        await redis.setex(UID_KEY_PREFIX + uid, ACTIVE_GAME_TTL, gameId);
        return;
      } catch (error) {
        console.error("[AiGameSessionStore] Error setting uid mapping:", error);
        return;
      }
    }

    this.uidToGame.set(uid, gameId);
  }

  async getGameIdByUid(uid: string): Promise<string | undefined> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const gameId = await redis.get(UID_KEY_PREFIX + uid);
        return gameId || undefined;
      } catch (error) {
        console.error("[AiGameSessionStore] Error getting game by uid:", error);
        return undefined;
      }
    }

    return this.uidToGame.get(uid);
  }

  async deleteUidMapping(uid: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        await redis.del(UID_KEY_PREFIX + uid);
        return;
      } catch (error) {
        console.error(
          "[AiGameSessionStore] Error deleting uid mapping:",
          error,
        );
        return;
      }
    }

    this.uidToGame.delete(uid);
  }
}

export const aiGameStore = new AiGameSessionStore();
