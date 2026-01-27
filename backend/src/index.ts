import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initializeSocket } from './socket/index.js';
import { connectToDatabase } from './services/database.js';
import { seedGamesIfEmpty, getAllGames } from './services/gameRepository.js';
import { userRoutes } from './routes/userRoutes.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Connect to MongoDB
  await connectToDatabase();

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

  // Initialize Fastify (required for routes to work)
  await fastify.ready();

  // Get HTTP server from Fastify
  const httpServer = fastify.server;

  // Initialize Socket.io
  initializeSocket(httpServer);

  // Start the server
  try {
    // We need to use the raw HTTP server for socket.io
    httpServer.listen(PORT, HOST, () => {
      console.log(`Server running at http://${HOST}:${PORT}`);
      console.log(`Socket.io ready for connections`);
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
