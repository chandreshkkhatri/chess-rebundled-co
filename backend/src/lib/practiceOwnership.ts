import crypto from 'node:crypto';
import type { PracticeSession } from '../types/index.js';

export function guestTokenHash(token: unknown): string | undefined {
  if (typeof token !== 'string' ||
    !/^(?:[a-f0-9]{64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(token)) {
    return undefined;
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function ownsPracticeSession(
  session: PracticeSession,
  socketId: string,
  uid: string | undefined,
  guestToken: unknown,
): boolean {
  if (session.uid) return session.uid === uid;
  if (session.guestTokenHash) {
    return session.guestTokenHash === guestTokenHash(guestToken);
  }
  // Legacy guest sessions can only be used by their original connection.
  return session.socketId === socketId;
}
