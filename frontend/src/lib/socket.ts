import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;
let currentAuthToken: string | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: () => ({
        token: currentAuthToken,
      }),
    });
  }
  return socket;
}

export function setAuthToken(token: string | null): void {
  currentAuthToken = token;
  // If socket exists and is connected, update auth and reconnect to apply new token
  if (socket && socket.connected && token !== currentAuthToken) {
    socket.disconnect();
    socket.connect();
  }
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
