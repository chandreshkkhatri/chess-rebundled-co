import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
initializeApp({ projectId: 'ai-speech-tests' });
const { AiGameHandler } = await import('../src/socket/aiGameHandler.js');
const { AiGameService } = await import('../src/services/aiGameService.js');
const { aiGameStore } = await import('../src/services/aiGameSessionStore.js');
const { aiUsageLimiter } = await import('../src/services/aiUsageLimiter.js');
const { genai } = await import('../src/lib/genaiClient.js');

function client(uid?: string) {
  const listeners = new Map<string, (data: any) => unknown>(), emitted: any[] = [];
  new AiGameHandler({} as any).register({
    data: { uid }, on: (name: string, fn: (data: any) => unknown) => listeners.set(name, fn),
    emit: (name: string, data: unknown) => emitted.push({ name, data }),
  } as any);
  return { emitted, dispatch: async (name: string, data: unknown) => listeners.get(name)!(data) };
}

async function fixture() {
  const service = new AiGameService();
  const created = await service.createGame(randomUUID(), 'Owner', 'rook-rodriguez', 'white');
  assert.ok(created.ok);
  return { service, state: created.state, async close() {
    await aiGameStore.deleteGame(created.state.id);
    await aiGameStore.deleteUidMapping(created.state.uid);
  } };
}

for (const audio of [false, true]) {
  test(`${audio ? 'audio' : 'text'} AI speech parsing validates ownership, turn, position and quota before cloud calls`, async () => {
    const f = await fixture();
    const event = audio ? 'ai-parse-audio' : 'ai-parse-move';
    const data = { gameId: f.state.id, requestId: 'request-one', fen: f.state.fen,
      ...(audio ? { audioBase64: 'encoded', mimeType: 'audio/mp4' } : { transcript: 'night f three' }) };
    const calls = mock.method(genai.models, 'generateContent', async () => { throw new Error('Unexpected cloud call'); });
    const quota = mock.method(aiUsageLimiter, 'tryConsumeParse', async () => false);
    try {
      for (const uid of [undefined, 'stranger', f.state.uid]) {
        const socket = client(uid);
        await socket.dispatch(event, data);
        assert.equal(socket.emitted[0].name, 'ai-parse-error');
        assert.equal(socket.emitted[0].data.requestId, 'request-one');
      }
      assert.equal(quota.mock.callCount(), 1, 'unauthorized requests never consume owner quota');
      assert.equal(quota.mock.calls[0].arguments[0], `user:${f.state.uid}`);
      await client(f.state.uid).dispatch(event, { ...data, fen: 'old-position' });
      await f.service.applyPlayerMove(f.state.id, f.state.uid, 'e4');
      await client(f.state.uid).dispatch(event, data);
      assert.equal(quota.mock.callCount(), 1, 'stale positions and opponent turns do not consume quota');
      await client(f.state.uid).dispatch(event, { ...data, ...(audio ? { mimeType: 'image/png' } : { transcript: 12 }) });
      assert.equal(calls.mock.callCount(), 0);
    } finally { calls.mock.restore(); quota.mock.restore(); await f.close(); }
  });
}

for (const audio of [false, true]) {
  test(`${audio ? 'audio' : 'text'} AI parsing uses calibration and returns a correlated result without making a move`, async () => {
    const f = await fixture();
    const calibration = { confusionMap: { knight: ['night'] } };
    const collection = mock.method(getFirestore(), 'collection', () => ({ doc: () => ({
      get: async () => ({ exists: true, data: () => ({ voiceCalibration: calibration }) }),
    }) }) as any);
    const calls = mock.method(genai.models, 'generateContent', async () => ({
      text: JSON.stringify({ move: 'Nf3', confidence: 0.95, alternatives: [], transcription: 'knight f3' }),
    }) as any);
    try {
      const socket = client(f.state.uid);
      await socket.dispatch(audio ? 'ai-parse-audio' : 'ai-parse-move', {
        gameId: f.state.id, requestId: 'request-one', fen: f.state.fen,
        ...(audio ? { audioBase64: 'encoded', mimeType: 'audio/mp4' } : { transcript: 'night f three' }),
      });
      const result = socket.emitted[0];
      assert.equal(result.name, 'ai-move-parsed');
      assert.equal(result.data.gameId, f.state.id);
      assert.equal(result.data.requestId, 'request-one');
      assert.equal(result.data.fen, f.state.fen);
      assert.equal(result.data.parsedMove, 'Nf3');
      assert.match(JSON.stringify(calls.mock.calls[0].arguments), /night/);
      assert.deepEqual((await aiGameStore.getGame(f.state.id))?.moves, []);
    } finally { calls.mock.restore(); collection.mock.restore(); await f.close(); }
  });
}

test('a parse that finishes after the player moved is discarded', async () => {
  const f = await fixture();
  let resolve!: (value: any) => void, started!: () => void;
  const gate = new Promise<any>(done => { resolve = done; });
  const entered = new Promise<void>(done => { started = done; });
  const collection = mock.method(getFirestore(), 'collection', () => ({ doc: () => ({
    get: async () => ({ exists: false }),
  }) }) as any);
  const calls = mock.method(genai.models, 'generateContent', async () => { started(); return gate; });
  try {
    const socket = client(f.state.uid);
    const parsing = socket.dispatch('ai-parse-move', {
      gameId: f.state.id, requestId: 'request-one', fen: f.state.fen, transcript: 'e4',
    });
    await entered;
    await f.service.applyPlayerMove(f.state.id, f.state.uid, 'd4');
    resolve({ text: JSON.stringify({ move: 'e4', confidence: 0.99, alternatives: [] }) });
    await parsing;
    assert.equal(socket.emitted[0].name, 'ai-parse-error');
    assert.match(socket.emitted[0].data.message, /position changed/i);
    assert.deepEqual((await aiGameStore.getGame(f.state.id))?.moves, ['d4']);
  } finally { calls.mock.restore(); collection.mock.restore(); await f.close(); }
});
