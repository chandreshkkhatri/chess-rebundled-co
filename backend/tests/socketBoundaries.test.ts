import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
admin.initializeApp({ projectId: 'socket-boundary-tests' });
const { MultiplayerHandler } = await import('../src/socket/multiplayerHandler.js');
const { GameHandler } = await import('../src/socket/gameHandler.js');
const { MultiplayerService } = await import('../src/services/multiplayerService.js');
const { sessionStore } = await import('../src/services/redisSessionStore.js');
const { HISTORICAL_GAMES } = await import('../src/data/historicalGames.js');
const { genai } = await import('../src/lib/genaiClient.js');
const { aiUsageLimiter, AiUsageLimiter, DAILY_PARSE_LIMIT } = await import('../src/services/aiUsageLimiter.js');

function client(handler: GameHandler | MultiplayerHandler, uid?: string) {
  const listeners = new Map<string, (data: any) => Promise<void>>();
  const emitted: { event: string; data: any }[] = [];
  handler.register({ id: 'socket', data: { uid }, handshake: { address: '127.0.0.1', auth: {}, query: {} },
    on: (event: string, listener: any) => listeners.set(event, listener),
    emit: (event: string, data: any) => emitted.push({ event, data }),
  } as any);
  return { emitted, dispatch: (event: string, payload?: unknown) => listeners.get(event)!(payload) };
}

test('practice and multiplayer reject malformed payloads on their respective error channels', async () => {
  const practice = client(new GameHandler({} as any));
  const multiplayer = client(new MultiplayerHandler({} as any), 'owner');
  for (const [event, payload, expected] of [
    ['resume-session', null, 'practice-error'],
    ['abandon-practice', undefined, 'practice-error'],
    ['submit-practice-move', { sessionId: 'one', move: {} }, 'practice-error'],
    ['parse-move-with-ai', { sessionId: 'one', transcript: 123 }, 'parse-error'],
    ['parse-audio-move-with-gemini', { sessionId: 'one', audioBase64: 'x', mimeType: 'text/html' }, 'audio-parse-error'],
    ['start-practice-random', { playerName: 'P', mode: 'invalid' }, 'practice-error'],
    ['start-practice-random', { playerName: 'P', mode: 'one-side' }, 'practice-error'],
  ] as const) {
    await practice.dispatch(event, payload);
    assert.equal(practice.emitted.at(-1)?.event, expected);
    assert.match(practice.emitted.at(-1)?.data.message, /Invalid request/);
  }
  for (const [event, payload] of [
    ['mp-find-game', null], ['mp-find-game', { timeControl: { initialTimeMs: -1, incrementMs: 0 } }],
    ['mp-create-invite', { timeControl: 'any' }], ['mp-respond-draw', { gameId: 'one', accept: 'yes' }],
    ['mp-submit-move', { gameId: 'one', move: 'x'.repeat(101) }], ['mp-reconnect', []],
  ] as const) {
    await multiplayer.dispatch(event, payload);
    assert.equal(multiplayer.emitted.at(-1)?.event, 'mp-error');
    assert.match(multiplayer.emitted.at(-1)?.data.message, /Invalid request/);
  }
});

test('async practice and multiplayer failures emit errors instead of rejecting listeners', async () => {
  const practiceHandler = new GameHandler({} as any);
  const mpHandler = new MultiplayerHandler({} as any);
  const practice = client(practiceHandler, 'owner');
  const multiplayer = client(mpHandler, 'owner');
  const practiceRead = mock.method((practiceHandler as any).practiceService, 'getSession', async () => { throw Error('database failed'); });
  const mpRead = mock.method((mpHandler as any).multiplayerService, 'handlePlayerReconnect', async () => { throw Error('database failed'); });
  const log = mock.method(console, 'error', () => {});
  try {
    await practice.dispatch('resume-session', { sessionId: 'one' });
    await multiplayer.dispatch('mp-reconnect', { gameId: 'one' });
    assert.match(practice.emitted.at(-1)?.data.message, /Please try again/);
    assert.match(multiplayer.emitted.at(-1)?.data.message, /Please try again/);
  } finally { practiceRead.mock.restore(); mpRead.mock.restore(); log.mock.restore(); }
});

test('multiplayer parsing requires membership, including cached text responses', async () => {
  const service = new MultiplayerService({} as any);
  const created = await service.createGame('owner', 'Owner', 'owner-socket', null);
  const joined = await service.joinGame(created.id, 'opponent', 'Opponent', 'opponent-socket');
  assert.ok(joined);
  const handler = new MultiplayerHandler({} as any);
  const calls = mock.method(genai.models, 'generateContent', async () => ({ text: '{"move":"e4","confidence":1,"alternatives":[]}' }) as any);
  const calibration = mock.method(handler as any, 'getUserConfusionMap', async () => undefined);
  try {
    const owner = client(handler, 'owner');
    await owner.dispatch('mp-parse-move-with-ai', { gameId: created.id, transcript: 'echo four' });
    assert.equal(owner.emitted.at(-1)?.event, 'mp-move-parsed');
    assert.equal(calls.mock.callCount(), 1);
    const quota = mock.method(aiUsageLimiter, 'tryConsumeParse', async () => false);
    try {
      await owner.dispatch('mp-parse-move-with-ai', { gameId: created.id, transcript: 'echo four' });
      assert.equal(owner.emitted.at(-1)?.event, 'mp-move-parsed');
      assert.equal(quota.mock.callCount(), 0, 'cached text does not spend quota');
    } finally { quota.mock.restore(); }
    for (const uid of [undefined, 'stranger']) {
      const stranger = client(handler, uid);
      await stranger.dispatch('mp-parse-move-with-ai', { gameId: created.id, transcript: 'echo four' });
      await stranger.dispatch('mp-parse-audio-move-with-gemini', { gameId: created.id, audioBase64: 'dGVzdA==', mimeType: 'audio/webm' });
      assert.deepEqual(stranger.emitted.map(event => event.event), ['mp-parse-error', 'mp-audio-parse-error']);
      assert.ok(stranger.emitted.every(event => /access denied/.test(event.data.message)));
    }
    assert.equal(calls.mock.callCount(), 1);
  } finally { calls.mock.restore(); calibration.mock.restore(); await service.cleanupGame(created.id); }
});

test('exhausted parsing quota blocks cloud calls in both modes', async () => {
  const uid = randomUUID();
  const sessionId = randomUUID();
  await sessionStore.set(sessionId, { id: sessionId, uid, socketId: 'socket', playerName: 'P',
    historicalGame: HISTORICAL_GAMES[0], currentMoveIndex: 0, moveResults: [], startedAt: Date.now(),
    status: 'playing', mode: 'both-sides', playerColor: null });
  const service = new MultiplayerService({} as any);
  const game = await service.createGame(uid, 'P', 'socket', null);
  await service.joinGame(game.id, 'opponent', 'O', 'other');
  const calls = mock.method(genai.models, 'generateContent', async () => { throw Error('unexpected cloud call'); });
  const quota = mock.method(aiUsageLimiter, 'tryConsumeParse', async () => false);
  try {
    const practice = client(new GameHandler({} as any), uid);
    const multiplayer = client(new MultiplayerHandler({} as any), uid);
    for (const [target, prefix, id] of [[practice, '', { sessionId }], [multiplayer, 'mp-', { gameId: game.id }]] as const) {
      await target.dispatch(`${prefix}parse-move-with-ai`, { ...id, transcript: 'echo four' });
      await target.dispatch(`${prefix}parse-audio-move-with-gemini`, { ...id, audioBase64: 'dGVzdA==', mimeType: 'audio/webm' });
      assert.ok(target.emitted.every(event => /limit reached/.test(event.data.message)));
    }
    assert.equal(calls.mock.callCount(), 0);
    assert.ok(quota.mock.calls.every(call => call.arguments[0] === `user:${uid}`));
  } finally { quota.mock.restore(); calls.mock.restore(); await sessionStore.delete(sessionId); await service.cleanupGame(game.id); }
});

test('guest parsing quotas use the peer address rather than a replaceable reconnect credential', async () => {
  const sessionId = randomUUID();
  await sessionStore.set(sessionId, { id: sessionId, socketId: 'socket', playerName: 'Guest',
    historicalGame: HISTORICAL_GAMES[0], currentMoveIndex: 0, moveResults: [], startedAt: Date.now(),
    status: 'playing', mode: 'both-sides', playerColor: null });
  const quota = mock.method(aiUsageLimiter, 'tryConsumeParse', async () => false);
  try {
    const guest = client(new GameHandler({} as any));
    await guest.dispatch('parse-move-with-ai', { sessionId, transcript: 'echo four' });
    assert.match(guest.emitted.at(-1)?.data.message, /limit reached/);
    assert.match(quota.mock.calls[0].arguments[0], /^guest-ip:[a-f0-9]{64}$/);
  } finally { quota.mock.restore(); await sessionStore.delete(sessionId); }
});

test('parallel quota requests cannot exceed the daily allowance and identities are isolated', async () => {
  const limiter = new AiUsageLimiter();
  const results = await Promise.all(Array.from({ length: DAILY_PARSE_LIMIT + 3 }, () => limiter.tryConsumeParse('user:a')));
  assert.equal(results.filter(Boolean).length, DAILY_PARSE_LIMIT);
  assert.equal(await limiter.tryConsumeParse('user:b'), true);
});
