import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initializeSocket } from './socket/index.js';
import { connectToDatabase } from './services/database.js';
import { seedGamesIfEmpty, getAllGames } from './services/gameRepository.js';
import { userRoutes } from './routes/userRoutes.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Connect to MongoDB
  await connectToDatabase();

  // Connect to Redis (optional - falls back to in-memory if unavailable)
  const redisConnected = await connectRedis();
  if (redisConnected) {
    console.log('[Server] Redis connected - sessions will be persisted');
  } else {
    console.log('[Server] Redis not available - using in-memory session storage');
  }

  // Seed games if database is empty
  await seedGamesIfEmpty();

  // Create Fastify instance
  const fastify = Fastify({
    logger: true,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Get available games endpoint
  fastify.get('/api/games', async () => {
    return await getAllGames();
  });

  // Register user routes (profile, history)
  await fastify.register(userRoutes);

  // Get HTTP server from Fastify BEFORE ready()
  const httpServer = fastify.server;

  // Initialize Socket.io BEFORE Fastify finalizes routing
  // This ensures socket.io can handle /socket.io requests
  initializeSocket(httpServer);

  // Start the server using fastify.listen()
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`Socket.io ready for connections`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Server] Shutting down gracefully...');
    await disconnectRedis();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
