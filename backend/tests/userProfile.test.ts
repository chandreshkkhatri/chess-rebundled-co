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

for (const state of ['existing', 'legacy', 'new'] as const) {
  test(`profile API returns practice statistics for ${state} users`, async () => {
    const gamification = { totalXp: 1200, streaks: { currentStreak: 7 }, achievements: { unlocked: ['first-session'] } };
    const profile = {
      displayName: 'Player', stats: { totalSessions: 2, totalMoves: 20, correctMoves: 15, overallAccuracy: 0.75 },
      preferences: { voiceParsingMode: 'gemini-audio', defaultPracticeMode: 'both-sides' },
      ...(state === 'existing' ? { gamification } : {}),
    };
    const originalProfile = structuredClone(profile);
    const token = mock.method(auth, 'verifyIdToken', async () => ({ uid: 'player' }) as any);
    const collection = mock.method(firestore, 'collection', () => ({
      doc: () => ({ get: async () => ({ exists: state !== 'new', data: () => profile }) }),
    }) as any);
    const app = Fastify();
    try {
      await app.register(userRoutes);
      const response = await app.inject({ url: '/api/user/profile', headers: { authorization: 'Bearer local-token' } });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.deepEqual(body.stats, state === 'new'
        ? { totalSessions: 0, totalMoves: 0, correctMoves: 0, overallAccuracy: 0, lastPlayedAt: null }
        : { ...profile.stats, lastPlayedAt: null });
      assert.deepEqual(body.preferences, profile.preferences);
      assert.equal('gamification' in body, false);
      assert.deepEqual(profile, originalProfile, 'reading a profile leaves legacy stored fields intact');
      const unauthenticated = await app.inject({ url: '/api/user/profile' });
      assert.equal(unauthenticated.statusCode, 401);
    } finally { await app.close(); token.mock.restore(); collection.mock.restore(); }
  });
}
