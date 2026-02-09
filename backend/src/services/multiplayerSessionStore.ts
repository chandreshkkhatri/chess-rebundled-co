import { MultiplayerGameState } from '../types/multiplayer.js';
import { getRedisClient, isRedisAvailable } from '../lib/redis.js';

// TTLs in seconds
const ACTIVE_GAME_TTL = 2 * 60 * 60;    // 2 hours for active games
const WAITING_GAME_TTL = 10 * 60;        // 10 minutes for waiting/invite games
const COMPLETED_GAME_TTL = 5 * 60;       // 5 minutes for completed games

const ENV_PREFIX = process.env.NODE_ENV === 'production' ? 'prod:' : 'dev:';
const GAME_KEY_PREFIX = `${ENV_PREFIX}mp:game:`;
const UID_KEY_PREFIX = `${ENV_PREFIX}mp:uid:`;
const INVITE_KEY_PREFIX = `${ENV_PREFIX}mp:invite:`;

export class MultiplayerSessionStore {
  private memoryStore: Map<string, MultiplayerGameState> = new Map();
  private uidToGame: Map<string, string> = new Map();
  private inviteToGame: Map<string, string> = new Map();

  private useRedis(): boolean {
    return getRedisClient() !== null && isRedisAvailable();
  }

  private getTTL(status: MultiplayerGameState['status']): number {
    switch (status) {
      case 'waiting': return WAITING_GAME_TTL;
      case 'completed': return COMPLETED_GAME_TTL;
      default: return ACTIVE_GAME_TTL;
    }
  }

  async setGame(gameId: string, state: MultiplayerGameState): Promise<void> {
    const redis = getRedisClient();
    const ttl = this.getTTL(state.status);

    if (redis && isRedisAvailable()) {
      try {
        const key = GAME_KEY_PREFIX + gameId;
        await redis.setex(key, ttl, JSON.stringify(state));
        return;
      } catch (error) {
        console.error('[MultiplayerSessionStore] Error setting game:', error);
        return;
      }
    }

    this.memoryStore.set(gameId, JSON.parse(JSON.stringify(state)));
  }

  async getGame(gameId: string): Promise<MultiplayerGameState | undefined> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = GAME_KEY_PREFIX + gameId;
        const data = await redis.get(key);
        if (data) {
          await redis.expire(key, ACTIVE_GAME_TTL);
          return JSON.parse(data) as MultiplayerGameState;
        }
        return undefined;
      } catch (error) {
        console.error('[MultiplayerSessionStore] Error getting game:', error);
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
        console.error('[MultiplayerSessionStore] Error deleting game:', error);
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
        console.error('[MultiplayerSessionStore] Error setting uid mapping:', error);
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
        console.error('[MultiplayerSessionStore] Error getting game by uid:', error);
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
        console.error('[MultiplayerSessionStore] Error deleting uid mapping:', error);
        return;
      }
    }

    this.uidToGame.delete(uid);
  }

  async setInviteMapping(code: string, gameId: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        await redis.setex(INVITE_KEY_PREFIX + code, WAITING_GAME_TTL, gameId);
        return;
      } catch (error) {
        console.error('[MultiplayerSessionStore] Error setting invite mapping:', error);
        return;
      }
    }

    this.inviteToGame.set(code, gameId);
  }

  async getGameIdByInviteCode(code: string): Promise<string | undefined> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const gameId = await redis.get(INVITE_KEY_PREFIX + code);
        return gameId || undefined;
      } catch (error) {
        console.error('[MultiplayerSessionStore] Error getting game by invite:', error);
        return undefined;
      }
    }

    return this.inviteToGame.get(code);
  }

  async deleteInviteMapping(code: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        await redis.del(INVITE_KEY_PREFIX + code);
        return;
      } catch (error) {
        console.error('[MultiplayerSessionStore] Error deleting invite mapping:', error);
        return;
      }
    }

    this.inviteToGame.delete(code);
  }
}

export const multiplayerStore = new MultiplayerSessionStore();
