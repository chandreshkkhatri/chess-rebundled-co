import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { guestTokenHash } from '../src/lib/practiceOwnership.js';
import { sessionStore } from '../src/services/redisSessionStore.js';
import { HISTORICAL_GAMES } from '../src/data/historicalGames.js';
import type { PracticeSession } from '../src/types/index.js';

// Initialize SDK objects without credentials; these tests never call cloud services.
delete process.env.REDIS_URL;
process.env.GOOGLE_API_KEY = 'test-placeholder';
initializeApp({ projectId: 'repo-tests' });
const { GameHandler } = await import('../src/socket/gameHandler.js');
const { PracticeService } = await import('../src/services/practiceService.js');
const { saveCompletedSession } = await import('../src/services/firestoreService.js');

function socket(uid?: string, guestToken?: string, id = randomUUID()) {
  const listeners = new Map<string, (data: any) => unknown>();
  const emitted: { event: string; data: any }[] = [];
  const fake = {
    id, data: { uid }, handshake: { auth: { guestToken }, query: {} },
    on: (event: string, listener: (data: any) => unknown) => listeners.set(event, listener),
    emit: (event: string, data: any) => emitted.push({ event, data }),
  };
  new GameHandler({} as any).register(fake as any);
  return { fake, emitted, dispatch: async (event: string, data: unknown) => listeners.get(event)!(data) };
}

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return JSON.parse(JSON.stringify({
    id: randomUUID(), socketId: 'original-socket', uid: 'owner', playerName: 'Owner',
    historicalGame: HISTORICAL_GAMES[0], currentMoveIndex: 0, moveResults: [],
    startedAt: Date.now(), status: 'playing', mode: 'both-sides', playerColor: null,
    ...overrides,
  }));
}

for (const uid of [undefined, 'other-user']) {
  for (const event of ['submit-practice-move', 'resume-session', 'abandon-practice',
    'parse-move-with-ai', 'parse-audio-move-with-gemini']) {
    test(`${event} denies ${uid ?? 'anonymous'} access without exposing or mutating the session`, async () => {
      const stored = session();
      await sessionStore.set(stored.id, stored);
      // Even the original socket ID cannot bypass ownership of a signed-in session.
      const client = socket(uid, undefined, stored.socketId);
      await client.dispatch(event, { sessionId: stored.id, move: 'e4', transcript: 'e4',
        audioBase64: 'unused', mimeType: 'audio/webm' });
      assert.deepEqual(await sessionStore.get(stored.id), stored);
      assert.equal(client.emitted.length, 1);
      assert.match(JSON.stringify(client.emitted[0].data), /access denied/);
      assert.equal(client.emitted[0].data.game, undefined);
      await sessionStore.delete(stored.id);
    });
  }
}

test('the authenticated owner can resume from a new connection', async () => {
  const stored = session();
  await sessionStore.set(stored.id, stored);
  const client = socket('owner');
  await client.dispatch('resume-session', { sessionId: stored.id });
  assert.equal(client.emitted[0].event, 'session-resumed');
  assert.equal((await sessionStore.get(stored.id))?.socketId, client.fake.id);
  await sessionStore.delete(stored.id);
});

test('guest sessions require their credential and can resume after a refresh', async () => {
  const token = randomBytes(32).toString('hex');
  const stored = session({ uid: undefined, guestTokenHash: guestTokenHash(token) });
  await sessionStore.set(stored.id, stored);
  const stranger = socket(undefined, randomUUID(), stored.socketId);
  await stranger.dispatch('resume-session', { sessionId: stored.id });
  assert.equal(stranger.emitted[0].event, 'session-not-found');
  assert.deepEqual(await sessionStore.get(stored.id), stored);
  const owner = socket(undefined, token);
  await owner.dispatch('resume-session', { sessionId: stored.id });
  assert.equal(owner.emitted[0].event, 'session-resumed');
  assert.equal(owner.emitted[0].data.guestTokenHash, undefined);
  await owner.dispatch('submit-practice-move', { sessionId: stored.id, move: 'e4' });
  assert.equal((await sessionStore.get(stored.id))?.currentMoveIndex, 1);
  await owner.dispatch('abandon-practice', { sessionId: stored.id });
  assert.equal((await sessionStore.get(stored.id))?.status, 'abandoned');
  await sessionStore.delete(stored.id);
});

test('legacy guest sessions only allow their original connection', async () => {
  const stored = session({ uid: undefined });
  await sessionStore.set(stored.id, stored);
  const stranger = socket();
  await stranger.dispatch('resume-session', { sessionId: stored.id });
  assert.equal(stranger.emitted[0].event, 'session-not-found');
  const original = socket(undefined, undefined, stored.socketId);
  await original.dispatch('resume-session', { sessionId: stored.id });
  assert.equal(original.emitted[0].event, 'session-resumed');
  await sessionStore.delete(stored.id);
});

test('new guest sessions store only the credential hash, and return no credential', async () => {
  const token = randomBytes(32).toString('hex');
  const service = new PracticeService();
  const started = await (service as any).createSession('guest', 'Guest', HISTORICAL_GAMES[0],
    'both-sides', null, undefined, token);
  const stored = await sessionStore.get(started.sessionId);
  assert.equal(stored?.guestTokenHash, guestTokenHash(token));
  assert.equal(JSON.stringify(started).includes(token), false);
  assert.equal(started.guestTokenHash, undefined);
  await sessionStore.delete(started.sessionId);
});


test('concurrent completion and repeated saves count practice once and preserve legacy profile data', async () => {
  const stored = session({ historicalGame: { ...HISTORICAL_GAMES[0], moves: ['e4'], pgn: '1. e4 *' } });
  await sessionStore.set(stored.id, stored);
  const profile = {
    stats: { totalSessions: 2, totalMoves: 20, correctMoves: 15, overallAccuracy: 0.75 },
    gamification: { totalXp: 1200, achievements: { unlocked: ['first-session'] } },
    voiceCalibration: { entries: [{ target: 'e4', heard: 'e four', timestamp: 1 }] },
    preferences: { voiceParsingMode: 'gemini-audio' },
  };
  const original = structuredClone(profile);
  let saved: any;
  let savedId: string | undefined;
  let writes = 0;
  let updates: Record<string, unknown> = {};
  const sessionRef = {};
  const userRef = {
    collection: (name: string) => {
      assert.equal(name, 'sessions');
      return { doc: (id: string) => { savedId = id; return sessionRef; } };
    },
  };
  const firestore = getFirestore();
  const collection = mock.method(firestore, 'collection', (name: string) => {
    assert.equal(name, 'users');
    return { doc: (uid: string) => { assert.equal(uid, 'owner'); return userRef; } } as any;
  });
  const transaction = mock.method(firestore, 'runTransaction', async (work: any) => work({
    get: async (ref: unknown) => ref === sessionRef
      ? { exists: !!saved } : { exists: true, data: () => profile },
    set: (ref: unknown, data: unknown) => { assert.equal(ref, sessionRef); saved = data; writes++; },
    update: (ref: unknown, fields: Record<string, unknown>) => { assert.equal(ref, userRef); updates = fields; },
  }));
  try {
    const client = socket('owner', undefined, stored.socketId);
    await Promise.all([
      client.dispatch('submit-practice-move', { sessionId: stored.id, move: 'e4', moveIndex: 0 }),
      client.dispatch('submit-practice-move', { sessionId: stored.id, move: 'e4', moveIndex: 0 }),
    ]);
    assert.equal(client.emitted.filter(entry => entry.event === 'practice-move-response').length, 1);
    const response = client.emitted.find(entry => entry.event === 'practice-move-response')?.data;
    assert.equal(response?.completed?.accuracy, 1);
    assert.equal(response.completed.correctMoves, 1);
    assert.equal('gamification' in response, false);
    await saveCompletedSession('owner', stored, response.completed);
    assert.equal(writes, 1, 'retries do not rewrite history or increment totals twice');
    assert.equal(savedId, stored.id);
    assert.equal(saved.status, 'completed');
    assert.equal(saved.moves.length, 1, 'the final submitted move is included in saved history');
    assert.equal(saved.moves[0].submittedMove, 'e4');
    assert.equal(saved.moves[0].isCorrect, true);
    assert.equal(saved.summary.accuracy, 1);
    assert.equal(updates['stats.totalSessions'], 3);
    assert.equal(updates['stats.totalMoves'], 21);
    assert.equal(updates['stats.correctMoves'], 16);
    assert.equal(updates['stats.overallAccuracy'], 16 / 21);
    assert.ok(Object.keys(updates).every(key => key.startsWith('stats.')));
    assert.deepEqual(profile, original, 'legacy rewards, calibration, and preferences are preserved');
  } finally {
    collection.mock.restore();
    transaction.mock.restore();
    await sessionStore.delete(stored.id);
  }
});


test('stale practice move indexes cannot advance the following turn', async () => {
  const stored = session({ uid: undefined, historicalGame: { ...HISTORICAL_GAMES[0], moves: ['e4', 'e5'] } });
  await sessionStore.set(stored.id, stored);
  const client = socket(undefined, undefined, stored.socketId);
  try {
    await Promise.all([
      client.dispatch('submit-practice-move', { sessionId: stored.id, move: 'e4', moveIndex: 0 }),
      client.dispatch('submit-practice-move', { sessionId: stored.id, move: 'd4', moveIndex: 0 }),
    ]);
    const current = await sessionStore.get(stored.id);
    assert.equal(current?.currentMoveIndex, 1);
    assert.equal(current?.moveResults.length, 1);
    assert.equal(client.emitted.filter(entry => entry.event === 'practice-error').length, 1);
  } finally { await sessionStore.delete(stored.id); }
});
