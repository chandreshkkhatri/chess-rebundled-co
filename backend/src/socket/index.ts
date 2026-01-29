import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { GameHandler } from './gameHandler.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';
import { firebaseAuthMiddleware } from '../middleware/socketAuth.js';

export function initializeSocket(httpServer: HttpServer): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Add Firebase authentication middleware
  io.use(firebaseAuthMiddleware);

  const gameHandler = new GameHandler(io);

  io.on('connection', (socket) => {
    // Log auth status
    if (socket.data.uid) {
      console.log(`Authenticated user connected: ${socket.data.uid}`);
    } else {
      console.log('Unauthenticated user connected');
    }

    gameHandler.register(socket);
  });

  console.log('Socket.io server initialized');

  return io;
}
