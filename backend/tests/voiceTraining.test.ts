import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import Fastify from 'fastify';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { TRAINING_EXERCISES, learnTrainingPatterns, validateTrainingAttempts, type TrainingAttempt } from '../src/services/voiceTraining.js';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
initializeApp({ projectId: 'voice-training-tests' });
const { userRoutes } = await import('../src/routes/userRoutes.js');
const { aiUsageLimiter } = await import('../src/services/aiUsageLimiter.js');
const { genai } = await import('../src/lib/genaiClient.js');
const { saveVoiceTraining, getVoiceCalibration, voiceConfusionMap } = await import('../src/services/firestoreService.js');
const authHeader = { authorization: 'Bearer test-token' };
const attempt = (fields: Partial<TrainingAttempt> = {}): TrainingAttempt => ({
  id: randomUUID(), runId: 'diagnostic-1', exerciseId: 'knight-f3', engine: 'browser', phase: 'diagnostic',
  heard: 'night of three', parsedMove: '', confidence: 0, latencyMs: 1200, timestamp: Date.now(), ...fields,
});

test('the complete curriculum uses legal moves, seven categories and nontrivial positions', () => {
  assert.equal(new Set(TRAINING_EXERCISES.map(ex => ex.category)).size, 7);
  assert.equal(new Set(TRAINING_EXERCISES.map(ex => ex.id)).size, TRAINING_EXERCISES.length);
  for (const exercise of TRAINING_EXERCISES) {
    const chess = new Chess(exercise.fen);
    assert.ok(chess.moves().includes(exercise.move), `${exercise.id}: ${exercise.move}`);
    assert.ok(chess.moves().length > 1, 'the position must not reveal the only possible answer');
    assert.equal(exercise.phrases.length, 2);
  }
});

test('learning requires repeated errors within one engine and rejects conflicting target hints', () => {
  const a = attempt();
  assert.deepEqual(learnTrainingPatterns([a], 'browser'), {});
  assert.deepEqual(learnTrainingPatterns([a, attempt({ engine: 'gemini' })], 'browser'), {});
  assert.deepEqual(learnTrainingPatterns([a, attempt()], 'browser'), { 'knight f3': ['night of three'] });
  assert.deepEqual(learnTrainingPatterns([a, attempt(), attempt({ exerciseId: 'pawn-d4' })], 'browser'), {});
  assert.deepEqual(learnTrainingPatterns([attempt({ heard: '' }), attempt({ heard: '' })], 'browser'), {});
  assert.deepEqual(learnTrainingPatterns([attempt({ parsedMove: 'Nf3' }), attempt({ parsedMove: 'Nf3' })], 'browser'), {});
  const previous = { 'knight f3': ['night of three'] };
  assert.deepEqual(learnTrainingPatterns([], 'browser', previous), previous, 'retention limits do not erase established hints');
  assert.deepEqual(learnTrainingPatterns([attempt({ exerciseId: 'pawn-d4' })], 'browser', previous), {}, 'conflicting observations invalidate old hints');
});

test('observations reject unknown exercises, duplicate IDs, invalid moves and unbounded data', () => {
  const valid = attempt();
  assert.ok(validateTrainingAttempts([valid]));
  for (const data of [[], [valid, valid], [attempt({ exerciseId: 'invented' })], [attempt({ parsedMove: 'Qh8' })],
    [attempt({ confidence: Number.NaN })], [attempt({ engine: 'other' as any })], [attempt({ heard: 'x'.repeat(501) })]]) {
    assert.equal(validateTrainingAttempts(data), null);
  }
});

test('saving merges both engines, deduplicates retries of the save request, and preserves legacy calibration', async () => {
  const uid = randomUUID();
  let stored: any = { entries: [{ target: 'e4', heard: 'e for', timestamp: 1 }], confusionMap: { rook: ['rock'] }, calibratedAt: 1 };
  const collection = mock.method(getFirestore(), 'collection', () => ({ doc: () => ({
    get: async () => ({ exists: true, data: () => ({ voiceCalibration: stored }) }),
    update: async (fields: any) => { stored = fields.voiceCalibration; },
  }) }) as any);
  try {
    const first = attempt();
    await Promise.all([saveVoiceTraining(uid, [first]), saveVoiceTraining(uid, [attempt({ engine: 'gemini' })])]);
    await saveVoiceTraining(uid, [first, attempt()]);
    const calibration = (await getVoiceCalibration(uid))!;
    assert.equal(calibration.trainingAttempts!.length, 3);
    assert.deepEqual(calibration.confusionMap, { rook: ['rock'] });
    assert.equal(calibration.entries.length, 1);
    assert.deepEqual(voiceConfusionMap(calibration, 'browser'), { rook: ['rock'], 'knight f3': ['night of three'] });
    assert.deepEqual(voiceConfusionMap(calibration, 'gemini'), { rook: ['rock'] });
  } finally { collection.mock.restore(); }
});

test('training endpoints require auth, validate input before quota/cloud calls, and never accept an expected answer', async () => {
  const app = Fastify(); await app.register(userRoutes);
  const uid = randomUUID();
  const token = mock.method(getAuth(), 'verifyIdToken', async () => ({ uid }) as any);
  const collection = mock.method(getFirestore(), 'collection', () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) as any);
  const cloud = mock.method(genai.models, 'generateContent', async () => ({ text: '{"move":"Nf3","confidence":0.9,"alternatives":[]}' }) as any);
  const quota = mock.method(aiUsageLimiter, 'tryConsumeParse', async () => true);
  const payload = { engine: 'browser', fen: new Chess().fen(), transcript: 'night of three' };
  try {
    assert.equal((await app.inject({ url: '/api/user/voice-training' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/user/voice-training', payload: { attempts: [attempt()] } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/user/voice-training/parse', payload })).statusCode, 401);
    const catalog = await app.inject({ url: '/api/user/voice-training', headers: authHeader });
    assert.equal(catalog.statusCode, 200); assert.equal(catalog.json().exercises.length, TRAINING_EXERCISES.length);
    for (const extra of [{ expectedMove: 'Nf3' }, { exerciseId: 'knight-f3' }, { target: 'knight f3' }, { fen: 'bad' }, { transcripts: [42] }]) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/user/voice-training/parse', headers: authHeader, payload: { ...payload, ...extra } })).statusCode, 400);
    }
    assert.equal(quota.mock.callCount(), 0); assert.equal(cloud.mock.callCount(), 0);
    const parsed = await app.inject({ method: 'POST', url: '/api/user/voice-training/parse', headers: authHeader, payload });
    assert.equal(parsed.json().move, 'Nf3'); assert.equal(parsed.json().transcription, 'night of three');
    assert.equal(quota.mock.calls[0].arguments[0], `user:${uid}`);
    quota.mock.restore();
    const blocked = mock.method(aiUsageLimiter, 'tryConsumeParse', async () => false);
    try {
      assert.equal((await app.inject({ method: 'POST', url: '/api/user/voice-training/parse', headers: authHeader, payload })).statusCode, 429);
      assert.equal(cloud.mock.callCount(), 1);
    } finally { blocked.mock.restore(); }
  } finally { await app.close(); token.mock.restore(); collection.mock.restore(); cloud.mock.restore(); quota.mock.restore(); }
});

test('the save endpoint grades against the catalog and updates only the authenticated user profile', async () => {
  const uid = randomUUID();
  let document: any = { displayName: 'Player', stats: { totalMoves: 12 }, voiceCalibration: { entries: [], confusionMap: { rook: ['rock'] }, calibratedAt: 1 } };
  const accessed: string[] = [];
  const token = mock.method(getAuth(), 'verifyIdToken', async () => ({ uid }) as any);
  const collection = mock.method(getFirestore(), 'collection', () => ({ doc: (id: string) => {
    accessed.push(id);
    return { get: async () => ({ exists: true, data: () => document }), update: async (fields: any) => { document = { ...document, ...fields }; } };
  } }) as any);
  const app = Fastify(); await app.register(userRoutes);
  try {
    const payload = { attempts: [attempt(), attempt()] };
    assert.equal((await app.inject({ method: 'POST', url: '/api/user/voice-training', headers: authHeader, payload })).statusCode, 200);
    assert.deepEqual(document.stats, { totalMoves: 12 });
    assert.deepEqual(document.voiceCalibration.engineConfusionMaps.browser, { 'knight f3': ['night of three'] });
    assert.deepEqual(document.voiceCalibration.confusionMap, { rook: ['rock'] });
    assert.ok(accessed.every(id => id === uid));
    // An older calibration client must not delete newer training observations.
    assert.equal((await app.inject({ method: 'PUT', url: '/api/user/voice-calibration', headers: authHeader,
      payload: { entries: [], confusionMap: { bishop: ['b shop'] }, calibratedAt: Date.now() } })).statusCode, 200);
    assert.equal(document.voiceCalibration.trainingAttempts.length, 2);
  } finally { await app.close(); token.mock.restore(); collection.mock.restore(); }
});
