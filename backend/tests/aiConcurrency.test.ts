import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
const { AiGameService } = await import('../src/services/aiGameService.js');
const { aiGameStore } = await import('../src/services/aiGameSessionStore.js');
const { genai } = await import('../src/lib/genaiClient.js');

async function fixture() {
  const service = new AiGameService();
  const created = await service.createGame(randomUUID(), 'Owner', 'rook-rodriguez', 'white');
  assert.ok(created.ok);
  return { service, state: created.state, async close() {
    await aiGameStore.deleteGame(created.state.id);
    await aiGameStore.deleteUidMapping(created.state.uid);
  } };
}

test('concurrent AI player moves accept only one move for the current turn', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([
      f.service.applyPlayerMove(f.state.id, f.state.uid, 'e4'),
      f.service.applyPlayerMove(f.state.id, f.state.uid, 'd4'),
    ]);
    assert.equal(results.filter(result => result.ok).length, 1);
    const saved = await aiGameStore.getGame(f.state.id);
    assert.deepEqual(saved?.moves, ['e4']);
    assert.equal(saved?.fen.split(' ')[1], 'b');
  } finally { await f.close(); }
});

test('concurrent AI chat and a move preserve both changes', async () => {
  const f = await fixture();
  try {
    await Promise.all([
      f.service.applyPlayerMove(f.state.id, f.state.uid, 'e4'),
      f.service.addPlayerChat(f.state.id, f.state.uid, 'hello'),
      f.service.addPlayerChat(f.state.id, f.state.uid, 'good luck'),
    ]);
    const saved = await aiGameStore.getGame(f.state.id);
    assert.deepEqual(saved?.moves, ['e4']);
    assert.deepEqual(saved?.chat.map(message => message.text), ['hello', 'good luck']);
    assert.deepEqual(saved?.pendingPlayerChat, ['hello', 'good luck']);
  } finally { await f.close(); }
});

test('resignation during generation wins over a late bot result and chat is not blocked by generation', async () => {
  const f = await fixture();
  await f.service.applyPlayerMove(f.state.id, f.state.uid, 'e4');
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const stream = mock.method(genai.models, 'generateContent', async () => {
    started(); await gate; return { text: JSON.stringify({ move: 'e5', summary: 'Occupy the center.', alternatives: [], threat: 'No immediate threat.', plan: 'Develop the pieces.' }) };
  });
  const finish = mock.method(f.service as any, 'finishGame', async (state: any) => {
    state.status = 'completed';
    await aiGameStore.setGame(state.id, state);
    return { data: { gameId: state.id, endReason: 'resignation' }, farewell: null };
  });
  let bot;
  try {
    bot = f.service.runBotTurn(f.state.id);
    await entered;
    assert.ok(await f.service.addPlayerChat(f.state.id, f.state.uid, 'I resign'));
    assert.ok(await f.service.resign(f.state.id, f.state.uid));
    release();
    assert.equal(await bot, null);
    const saved = await aiGameStore.getGame(f.state.id);
    assert.equal(saved?.status, 'completed');
    assert.deepEqual(saved?.moves, ['e4']);
    assert.equal(saved?.chat[0].text, 'I resign');
    assert.equal(finish.mock.callCount(), 1);
  } finally { release(); await bot; finish.mock.restore(); stream.mock.restore(); await f.close(); }
});
