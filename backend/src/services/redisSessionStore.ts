import { PracticeSession } from '../types/index.js';
import { getRedisClient, isRedisAvailable } from '../lib/redis.js';

// Session TTL: 2 hours (in seconds)
const SESSION_TTL_SECONDS = 2 * 60 * 60;

// Environment-aware Redis key prefixes (prevents dev/prod collision on same Redis instance)
const ENV_PREFIX = process.env.NODE_ENV === 'production' ? 'prod:' : 'dev:';
const SESSION_KEY_PREFIX = `${ENV_PREFIX}practice:session:`;
const SOCKET_TO_SESSION_KEY_PREFIX = `${ENV_PREFIX}practice:socket:`;

/**
 * Session store that uses Redis for persistence with in-memory fallback.
 * Provides TTL-based automatic expiration of stale sessions.
 *
 * Note: Redis is the primary store. In-memory is only used when Redis
 * is not configured (REDIS_URL not set). If Redis fails mid-operation,
 * we return errors rather than falling back to avoid split-brain state.
 */
export class RedisSessionStore {
  // In-memory fallback when Redis is unavailable
  private memoryStore: Map<string, PracticeSession> = new Map();
  private socketToSession: Map<string, string> = new Map();

  /**
   * Check if Redis is configured and should be used.
   */
  private useRedis(): boolean {
    return getRedisClient() !== null && isRedisAvailable();
  }

  /**
   * Deep clone a session to ensure consistent mutation behavior.
   */
  private cloneSession(session: PracticeSession): PracticeSession {
    return JSON.parse(JSON.stringify(session));
  }

  /**
   * Store a session with TTL expiration.
   */
  async set(sessionId: string, session: PracticeSession): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = SESSION_KEY_PREFIX + sessionId;
        const data = JSON.stringify(session);
        await redis.setex(key, SESSION_TTL_SECONDS, data);

        // Also store socket-to-session mapping
        const socketKey = SOCKET_TO_SESSION_KEY_PREFIX + session.socketId;
        await redis.setex(socketKey, SESSION_TTL_SECONDS, sessionId);
        return;
      } catch (error) {
        console.error('[RedisSessionStore] Error setting session:', error);
        // Don't fall through to memory - Redis is the source of truth when configured
        // Return without saving to avoid split-brain state
        return;
      }
    }

    // In-memory fallback (only when Redis is not configured)
    this.memoryStore.set(sessionId, this.cloneSession(session));
    this.socketToSession.set(session.socketId, sessionId);
  }

  /**
   * Get a session by ID.
   * Returns a copy to ensure consistent mutation behavior.
   */
  async get(sessionId: string): Promise<PracticeSession | undefined> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = SESSION_KEY_PREFIX + sessionId;
        const data = await redis.get(key);
        if (data) {
          // Refresh TTL on access (sliding window expiration)
          await redis.expire(key, SESSION_TTL_SECONDS);
          return JSON.parse(data) as PracticeSession;
        }
        return undefined;
      } catch (error) {
        console.error('[RedisSessionStore] Error getting session:', error);
        // Don't fall through to memory - return undefined on error
        return undefined;
      }
    }

    // In-memory fallback - return a copy to match Redis behavior
    const session = this.memoryStore.get(sessionId);
    return session ? this.cloneSession(session) : undefined;
  }

  /**
   * Delete a session.
   */
  async delete(sessionId: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        // Get session to find socket ID for cleanup
        const session = await this.get(sessionId);

        const key = SESSION_KEY_PREFIX + sessionId;
        await redis.del(key);

        // Also delete socket mapping
        if (session) {
          const socketKey = SOCKET_TO_SESSION_KEY_PREFIX + session.socketId;
          await redis.del(socketKey);
        }
        return;
      } catch (error) {
        console.error('[RedisSessionStore] Error deleting session:', error);
        // Don't fall through - Redis is source of truth
        return;
      }
    }

    // In-memory fallback cleanup
    const session = this.memoryStore.get(sessionId);
    if (session) {
      this.socketToSession.delete(session.socketId);
    }
    this.memoryStore.delete(sessionId);
  }

  /**
   * Check if a session exists.
   */
  async has(sessionId: string): Promise<boolean> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = SESSION_KEY_PREFIX + sessionId;
        const exists = await redis.exists(key);
        return exists === 1;
      } catch (error) {
        console.error('[RedisSessionStore] Error checking session exists:', error);
        // Return false on error - don't fall through
        return false;
      }
    }

    return this.memoryStore.has(sessionId);
  }

  /**
   * Get session ID by socket ID.
   */
  async getSessionIdBySocketId(socketId: string): Promise<string | undefined> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = SOCKET_TO_SESSION_KEY_PREFIX + socketId;
        const sessionId = await redis.get(key);
        return sessionId || undefined;
      } catch (error) {
        console.error('[RedisSessionStore] Error getting session by socket:', error);
        // Return undefined on error - don't fall through
        return undefined;
      }
    }

    return this.socketToSession.get(socketId);
  }

  /**
   * Update socket ID mapping for session reconnection.
   */
  async updateSocketId(sessionId: string, oldSocketId: string, newSocketId: string): Promise<boolean> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        // Delete old socket mapping
        const oldSocketKey = SOCKET_TO_SESSION_KEY_PREFIX + oldSocketId;
        await redis.del(oldSocketKey);

        // Create new socket mapping
        const newSocketKey = SOCKET_TO_SESSION_KEY_PREFIX + newSocketId;
        await redis.setex(newSocketKey, SESSION_TTL_SECONDS, sessionId);

        // Update session's socket ID
        const session = await this.get(sessionId);
        if (session) {
          session.socketId = newSocketId;
          await this.set(sessionId, session);
          return true;
        }
        return false;
      } catch (error) {
        console.error('[RedisSessionStore] Error updating socket ID:', error);
        // Return false on error - don't fall through to memory
        return false;
      }
    }

    // In-memory fallback
    this.socketToSession.delete(oldSocketId);
    this.socketToSession.set(newSocketId, sessionId);
    const session = this.memoryStore.get(sessionId);
    if (session) {
      session.socketId = newSocketId;
      return true;
    }
    return false;
  }

  /**
   * Delete socket mapping only (for disconnect without session removal).
   */
  async deleteSocketMapping(socketId: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = SOCKET_TO_SESSION_KEY_PREFIX + socketId;
        await redis.del(key);
        return;
      } catch (error) {
        console.error('[RedisSessionStore] Error deleting socket mapping:', error);
        // Don't fall through - just return
        return;
      }
    }

    this.socketToSession.delete(socketId);
  }

  /**
   * Refresh session TTL (call periodically for active sessions).
   */
  async refreshTTL(sessionId: string): Promise<void> {
    const redis = getRedisClient();

    if (redis && isRedisAvailable()) {
      try {
        const key = SESSION_KEY_PREFIX + sessionId;
        await redis.expire(key, SESSION_TTL_SECONDS);

        // Also refresh socket mapping
        const session = await this.get(sessionId);
        if (session) {
          const socketKey = SOCKET_TO_SESSION_KEY_PREFIX + session.socketId;
          await redis.expire(socketKey, SESSION_TTL_SECONDS);
        }
      } catch (error) {
        console.error('[RedisSessionStore] Error refreshing TTL:', error);
      }
    }
    // No-op for in-memory store (no TTL support)
  }

  /**
   * Get statistics about the store (for monitoring).
   */
  async getStats(): Promise<{ sessionCount: number; isRedisConnected: boolean }> {
    const redis = getRedisClient();
    const redisConnected = redis !== null && isRedisAvailable();

    if (redisConnected && redis) {
      try {
        // Count sessions using SCAN to avoid blocking
        let cursor = '0';
        let count = 0;
        do {
          const [newCursor, keys] = await redis.scan(
            cursor,
            'MATCH',
            SESSION_KEY_PREFIX + '*',
            'COUNT',
            100
          );
          cursor = newCursor;
          count += keys.length;
        } while (cursor !== '0');

        return { sessionCount: count, isRedisConnected: true };
      } catch (error) {
        console.error('[RedisSessionStore] Error getting stats:', error);
      }
    }

    return {
      sessionCount: this.memoryStore.size,
      isRedisConnected: false
    };
  }
}

// Singleton instance
export const sessionStore = new RedisSessionStore();
