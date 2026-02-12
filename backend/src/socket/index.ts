import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { GameHandler } from './gameHandler.js';
import { MultiplayerHandler } from './multiplayerHandler.js';
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
  const multiplayerHandler = new MultiplayerHandler(io);

  // Throttled lobby stats broadcast (at most once per 2 seconds)
  let lobbyBroadcastScheduled = false;
  function broadcastLobbyStats() {
    if (lobbyBroadcastScheduled) return;
    lobbyBroadcastScheduled = true;
    setTimeout(() => {
      lobbyBroadcastScheduled = false;
      const onlineCount = io.engine.clientsCount;
      const waitingPlayers = multiplayerHandler.getWaitingPlayers();
      io.emit('mp-lobby-stats', { onlineCount, waitingPlayers });
    }, 2000);
  }

  // Wire lobby change callback
  multiplayerHandler.setOnLobbyChange(broadcastLobbyStats);

  io.on('connection', (socket) => {
    // Log auth status
    if (socket.data.uid) {
      console.log(`Authenticated user connected: ${socket.data.uid}`);
    } else {
      console.log('Unauthenticated user connected');
    }

    gameHandler.register(socket);
    multiplayerHandler.register(socket);

    // Send lobby stats on connect and schedule broadcast for others
    const onlineCount = io.engine.clientsCount;
    const waitingPlayers = multiplayerHandler.getWaitingPlayers();
    socket.emit('mp-lobby-stats', { onlineCount, waitingPlayers });
    broadcastLobbyStats();

    socket.on('disconnect', () => {
      broadcastLobbyStats();
    });
  });

  console.log('Socket.io server initialized');

  return io;
}
