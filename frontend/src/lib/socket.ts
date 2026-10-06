import { io, Socket } from 'socket.io-client';

// When NEXT_PUBLIC_SOCKET_URL is empty or '/', socket.io connects to same origin
// This works with Next.js rewrites that proxy /socket.io/* to backend
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

let socket: Socket | null = null;
let currentAuthToken: string | null = null;
let guestToken: string | null = null;

function createGuestToken(): string {
  // getRandomValues also works on local HTTP development origins.
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getGuestToken(): string {
  if (guestToken) return guestToken;
  try {
    guestToken = sessionStorage.getItem('practice-guest-token');
    if (!guestToken) {
      guestToken = createGuestToken();
      sessionStorage.setItem('practice-guest-token', guestToken);
    }
  } catch {
    guestToken = createGuestToken();
  }
  return guestToken;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['polling', 'websocket'],
      auth: { token: currentAuthToken, guestToken: getGuestToken() },
      extraHeaders: {
        'ngrok-skip-browser-warning': '1',
      },
      withCredentials: true,
    });
  }
  return socket;
}

export function setAuthToken(token: string | null): void {
  const oldToken = currentAuthToken;
  currentAuthToken = token;
  if (socket) {
    socket.auth = { token: currentAuthToken, guestToken: getGuestToken() };
  }
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
