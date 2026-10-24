import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'profile-tests' });
const auth = getAuth();
const firestore = getFirestore();
const { userRoutes } = await import('../src/routes/userRoutes.js');
const { createDefaultGamification } = await import('../src/services/gamificationService.js');

for (const state of ['existing', 'legacy', 'new'] as const) {
  test(`profile API includes usable gamification for ${state} users`, async () => {
    const gamification = { ...createDefaultGamification(), totalXp: 1200 };
    gamification.streaks.currentStreak = 7;
    gamification.achievements.unlocked = ['first-session'];
    const profile = {
      displayName: 'Player', stats: { totalSessions: 2, totalMoves: 20, correctMoves: 15, overallAccuracy: 0.75 },
      preferences: { voiceParsingMode: 'gemini-audio', defaultPracticeMode: 'both-sides' },
      ...(state === 'existing' ? { gamification } : {}),
    };
    const token = mock.method(auth, 'verifyIdToken', async () => ({ uid: 'player' }) as any);
    const collection = mock.method(firestore, 'collection', () => ({
      doc: () => ({ get: async () => ({ exists: state !== 'new', data: () => profile }) }),
    }) as any);
    const app = Fastify();
    try {
      await app.register(userRoutes);
      const response = await app.inject({ url: '/api/user/profile', headers: { authorization: 'Bearer local-token' } });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().gamification, state === 'existing' ? gamification : createDefaultGamification());
      const unauthenticated = await app.inject({ url: '/api/user/profile' });
      assert.equal(unauthenticated.statusCode, 401);
    } finally { await app.close(); token.mock.restore(); collection.mock.restore(); }
  });
}
