import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
const { AiGameHandler } = await import('../src/socket/aiGameHandler.js');
const { aiGameService } = await import('../src/services/aiGameService.js');

function client(handler = new AiGameHandler({} as any)) {
  const listeners = new Map<string, (data: unknown) => void>();
  const emitted: any[] = [];
  handler.register({ data: { uid: 'owner' }, join() {},
    on: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener),
    emit: (event: string, data: unknown) => emitted.push({ event, data }),
  } as any);
  return { emitted, dispatch: (event: string, data: unknown) => listeners.get(event)!(data) };
}

for (const [event, payload] of [
  ['ai-send-chat', { gameId: 'game', text: 123 }],
  ['ai-send-chat', null], ['ai-send-chat', undefined],
  ['ai-start', { personaId: 'rook-rodriguez', playerColor: 'invalid' }],
  ['ai-submit-move', { gameId: 'game', move: {} }],
  ['ai-resign', {}], ['ai-reconnect', { gameId: 42 }], ['ai-get-review', []],
] as const) {
  test(`${event} rejects malformed payload ${JSON.stringify(payload)}`, () => {
    const socket = client();
    socket.dispatch(event, payload);
    assert.deepEqual(socket.emitted, [{ event: 'ai-error', data: { message: 'Invalid AI request' } }]);
  });
}

test('valid chat still reaches the service with whitespace trimmed', async () => {
  const calls = mock.method(aiGameService, 'addPlayerChat', async () => null);
  try {
    const socket = client();
    socket.dispatch('ai-send-chat', { gameId: 'game', text: ' hello ' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls.mock.calls[0].arguments, ['game', 'owner', 'hello']);
    assert.equal(socket.emitted[0].event, 'ai-game-not-found');
  } finally { calls.mock.restore(); }
});

test('service failures are handled and reported instead of becoming unhandled rejections', async () => {
  const calls = mock.method(aiGameService, 'getGameForUser', async () => { throw new Error('test failure'); });
  const log = mock.method(console, 'error', () => {});
  try {
    const socket = client();
    socket.dispatch('ai-reconnect', { gameId: 'game' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(socket.emitted[0].event, 'ai-error');
    assert.match(socket.emitted[0].data.message, /Please try again/);
  } finally { calls.mock.restore(); log.mock.restore(); }
});


test('simultaneous AI starts for one account create one game and resume it in the other tab', async () => {
  const { aiGameStore } = await import('../src/services/aiGameSessionStore.js');
  const first = client(), second = client();
  try {
    first.dispatch('ai-start', { personaId: 'rook-rodriguez', playerColor: 'white' });
    second.dispatch('ai-start', { personaId: 'professor-petrova', playerColor: 'white' });
    await new Promise(resolve => setImmediate(resolve));
    const responses = [...first.emitted, ...second.emitted];
    assert.equal(responses.filter(entry => entry.event === 'ai-game-started').length, 1);
    assert.equal(responses.filter(entry => entry.event === 'ai-game-resumed').length, 1);
    assert.equal(responses[0].data.gameId, responses[1].data.gameId);
  } finally {
    const id = await aiGameService.getActiveGameId('owner');
    if (id) await aiGameStore.deleteGame(id);
    await aiGameStore.deleteUidMapping('owner');
  }
});
