import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyIdToken } from '../lib/firebase-admin.js';
import { getUserProfile, getUserSessions, getSession, updateUserDisplayName } from '../services/firestoreService.js';

// Auth middleware for Fastify
async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ uid: string } | null> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized - Missing or invalid token' });
    return null;
  }

  const token = authHeader.substring(7);
  const decodedToken = await verifyIdToken(token);

  if (!decodedToken) {
    reply.code(401).send({ error: 'Unauthorized - Invalid token' });
    return null;
  }

  return { uid: decodedToken.uid };
}

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Get user profile and stats
  fastify.get('/api/user/profile', async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;

    const profile = await getUserProfile(auth.uid);

    if (!profile) {
      // Return empty profile for users without Firestore data yet
      return {
        stats: {
          totalSessions: 0,
          totalMoves: 0,
          correctMoves: 0,
          overallAccuracy: 0,
          lastPlayedAt: null,
        },
        preferences: {
          voiceParsingMode: 'gemini-audio',
          defaultPracticeMode: 'both-sides',
        },
      };
    }

    return {
      displayName: profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
      createdAt: profile.createdAt?.toDate?.() || null,
      stats: {
        totalSessions: profile.stats.totalSessions,
        totalMoves: profile.stats.totalMoves,
        correctMoves: profile.stats.correctMoves,
        overallAccuracy: profile.stats.overallAccuracy,
        lastPlayedAt: profile.stats.lastPlayedAt?.toDate?.() || null,
      },
      preferences: profile.preferences,
    };
  });

  // Update user profile (display name)
  fastify.put<{ Body: { displayName?: string } }>(
    '/api/user/profile',
    async (request, reply) => {
      const auth = await authenticateRequest(request, reply);
      if (!auth) return;

      const { displayName } = request.body || {};

      if (!displayName || typeof displayName !== 'string') {
        reply.code(400).send({ error: 'displayName is required' });
        return;
      }

      const sanitizedName = displayName.trim().slice(0, 20);
      if (!sanitizedName) {
        reply.code(400).send({ error: 'displayName cannot be empty' });
        return;
      }

      // Validate characters: allow alphanumeric, spaces, hyphens, underscores, periods
      const validNamePattern = /^[\w\s.\-]+$/;
      if (!validNamePattern.test(sanitizedName)) {
        reply.code(400).send({ error: 'displayName contains invalid characters' });
        return;
      }

      await updateUserDisplayName(auth.uid, sanitizedName);
      return { success: true, displayName: sanitizedName };
    }
  );

  // Get user's practice history
  fastify.get<{ Querystring: { limit?: string } }>(
    '/api/user/sessions',
    async (request, reply) => {
      const auth = await authenticateRequest(request, reply);
      if (!auth) return;

      const limit = parseInt(request.query.limit || '20', 10);
      const sessions = await getUserSessions(auth.uid, Math.min(limit, 100));

      return sessions.map((session) => ({
        id: session.id,
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        mode: session.mode,
        playerColor: session.playerColor,
        status: session.status,
        startedAt: session.startedAt?.toDate?.() || null,
        completedAt: session.completedAt?.toDate?.() || null,
        summary: session.summary,
      }));
    }
  );

  // Get a specific session with full move history
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/user/sessions/:sessionId',
    async (request, reply) => {
      const auth = await authenticateRequest(request, reply);
      if (!auth) return;

      const session = await getSession(auth.uid, request.params.sessionId);

      if (!session) {
        reply.code(404).send({ error: 'Session not found' });
        return;
      }

      return {
        id: session.id,
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        mode: session.mode,
        playerColor: session.playerColor,
        status: session.status,
        startedAt: session.startedAt?.toDate?.() || null,
        completedAt: session.completedAt?.toDate?.() || null,
        moves: session.moves,
        summary: session.summary,
      };
    }
  );
}
