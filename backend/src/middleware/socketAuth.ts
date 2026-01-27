import { Socket } from 'socket.io';
import { verifyIdToken } from '../lib/firebase-admin.js';

// Extend socket.io's SocketData interface to include auth info
declare module 'socket.io' {
  interface SocketData {
    uid?: string;
    isAnonymous?: boolean;
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
        socket.data.isAnonymous = decodedToken.firebase?.sign_in_provider === 'anonymous';
        socket.data.email = decodedToken.email || null;

        console.log(`Socket authenticated: uid=${decodedToken.uid}, anonymous=${socket.data.isAnonymous}`);
      } else {
        // Invalid token - allow connection but without auth
        console.warn('Invalid Firebase token provided, allowing unauthenticated connection');
      }
    }

    // Always allow connection (for backward compatibility with existing flow)
    next();
  } catch (error) {
    console.error('Socket auth middleware error:', error);
    // Don't block connection on auth errors
    next();
  }
}
