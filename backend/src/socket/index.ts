import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { GameHandler } from './gameHandler.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';

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

  const gameHandler = new GameHandler(io);

  io.on('connection', (socket) => {
    gameHandler.register(socket);
  });

  console.log('Socket.io server initialized');

  return io;
}
