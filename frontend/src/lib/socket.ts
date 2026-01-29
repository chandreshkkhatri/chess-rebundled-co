import { io, Socket } from 'socket.io-client';

// When NEXT_PUBLIC_SOCKET_URL is empty or '/', socket.io connects to same origin
// This works with Next.js rewrites that proxy /socket.io/* to backend
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

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
      // Extra headers to bypass ngrok browser warning for API requests
      extraHeaders: {
        'ngrok-skip-browser-warning': '1',
      },
      // Ensure credentials are sent with requests
      withCredentials: true,
    });
  }
  return socket;
}

export function setAuthToken(token: string | null): void {
  const oldToken = currentAuthToken;
  currentAuthToken = token;
  // If socket exists and is connected, reconnect to apply new token
  if (socket && socket.connected && token !== oldToken) {
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
