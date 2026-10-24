import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.GOOGLE_API_KEY = 'test-placeholder';
initializeApp({ projectId: 'calibration-tests' });
const { GameHandler } = await import('../src/socket/gameHandler.js');
const { MultiplayerHandler } = await import('../src/socket/multiplayerHandler.js');
const { getVoiceCalibration, saveVoiceCalibration } = await import('../src/services/firestoreService.js');

for (const initial of [null, { entries: [], confusionMap: { rook: ['rock'] }, calibratedAt: 1 }]) {
  test(`saving replaces shared ${initial ? 'existing' : 'empty'} calibration and invalidates parse results`, async () => {
    const uid = randomUUID();
    let calibration = initial;
    const collection = mock.method(getFirestore(), 'collection', () => ({ doc: () => ({
      get: async () => ({ exists: true, data: () => ({ voiceCalibration: calibration }) }),
      update: async (fields: any) => { calibration = fields.voiceCalibration; },
    }) }) as any);
    try {
      const practice = new GameHandler({} as any) as any;
      const multiplayer = new MultiplayerHandler({} as any) as any;
      assert.deepEqual(await practice.getUserConfusionMap(uid), initial?.confusionMap);
      assert.deepEqual(await multiplayer.getUserConfusionMap(uid), initial?.confusionMap);
      const before = practice.getAIParseCacheKey('night f3', 'fen', uid);
      const mpBefore = multiplayer.getAIParseCacheKey('night f3', 'fen', uid);
      const updated = { entries: [], confusionMap: { knight: ['night'] }, calibratedAt: 2 };
      await saveVoiceCalibration(uid, updated);
      assert.deepEqual(await practice.getUserConfusionMap(uid), updated.confusionMap);
      assert.deepEqual(await multiplayer.getUserConfusionMap(uid), updated.confusionMap);
      assert.notEqual(practice.getAIParseCacheKey('night f3', 'fen', uid), before);
      practice.cacheAIParse('night f3', 'fen', { move: 'old' }, uid, 0);
      assert.equal(practice.getCachedAIParse('night f3', 'fen', uid), null,
        'a parse started under the old calibration cannot populate the new cache');
      assert.notEqual(multiplayer.getAIParseCacheKey('night f3', 'fen', uid), mpBefore);
      assert.notEqual(practice.getAIParseCacheKey('night f3', 'fen', uid), practice.getAIParseCacheKey('night f3', 'fen', 'another-user'));
    } finally { collection.mock.restore(); }
  });
}

test('an older in-flight Firestore read cannot overwrite a successful calibration save', async () => {
  let resolve!: (value: any) => void;
  const oldRead = new Promise<any>(done => { resolve = done; });
  const uid = randomUUID();
  const collection = mock.method(getFirestore(), 'collection', () => ({ doc: () => ({
    get: () => oldRead, update: async () => {},
  }) }) as any);
  try {
    const pending = getVoiceCalibration(uid);
    const updated = { entries: [], confusionMap: { bishop: ['b shop'] }, calibratedAt: 2 };
    await saveVoiceCalibration(uid, updated);
    resolve({ exists: true, data: () => ({}) });
    assert.deepEqual(await pending, updated);
    assert.deepEqual(await getVoiceCalibration(uid), updated);
  } finally { collection.mock.restore(); }
});
