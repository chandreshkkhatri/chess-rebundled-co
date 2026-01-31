import Redis from 'ioredis';

// Redis client singleton
let redis: Redis | null = null;

// Track if we've logged the missing URL warning (to avoid log spam)
let loggedMissingUrl = false;

/**
 * Get or create Redis client connection.
 * Falls back gracefully if Redis is unavailable - returns null.
 */
export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    if (!loggedMissingUrl) {
      console.log('[Redis] REDIS_URL not configured, using in-memory fallback');
      loggedMissingUrl = true;
    }
    return null;
  }

  if (redis) {
    return redis;
  }

  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('[Redis] Max retries reached, giving up');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 2000);
        return delay;
      },
      lazyConnect: true, // Don't connect immediately
    });

    redis.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redis.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    return redis;
  } catch (error) {
    console.error('[Redis] Failed to create client:', error);
    return null;
  }
}

/**
 * Connect to Redis (call during app initialization).
 */
export async function connectRedis(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.connect();
    // Test the connection
    await client.ping();
    return true;
  } catch (error) {
    console.error('[Redis] Failed to connect:', error);
    return false;
  }
}

/**
 * Disconnect from Redis (call during app shutdown).
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
      redis = null;
    } catch (error) {
      console.error('[Redis] Error disconnecting:', error);
    }
  }
}

/**
 * Check if Redis is connected and available.
 */
export function isRedisAvailable(): boolean {
  return redis !== null && redis.status === 'ready';
}
