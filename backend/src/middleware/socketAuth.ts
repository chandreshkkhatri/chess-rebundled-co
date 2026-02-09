import { Socket } from 'socket.io';
import { verifyIdToken } from '../lib/firebase-admin.js';

// Extend socket.io's SocketData interface to include auth info
declare module 'socket.io' {
  interface SocketData {
    uid?: string;
    email?: string | null;
  }
}

/**
 * Socket.io middleware to verify Firebase authentication tokens.
 * Allows connections without auth (for backward compatibility) but
 * attaches user info when a valid token is provided.
 */
export async function firebaseAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = socket.handshake.auth?.token;

    if (token) {
      const decodedToken = await verifyIdToken(token);

      if (decodedToken) {
        // Attach user info to socket
        socket.data.uid = decodedToken.uid;
        socket.data.email = decodedToken.email || null;

        console.log(`[Auth] Socket ${socket.id} authenticated: uid=${decodedToken.uid}`);
      } else {
        // Invalid token - allow connection but without auth
        console.warn(`[Auth] Socket ${socket.id}: Invalid Firebase token provided, allowing unauthenticated connection`);
      }
    }

    // Always allow connection (for backward compatibility with existing flow)
    next();
  } catch (error) {
    console.error(`[Auth] Socket ${socket.id} auth error:`, error);
    // Don't block connection on auth errors
    next();
  }
}
