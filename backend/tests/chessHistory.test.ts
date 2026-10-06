import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { chessFromHistory } from '../src/lib/chessHistory.js';
import { MultiplayerService } from '../src/services/multiplayerService.js';
import { multiplayerStore } from '../src/services/multiplayerSessionStore.js';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
const { AiGameService } = await import('../src/services/aiGameService.js');
const { aiGameStore } = await import('../src/services/aiGameSessionStore.js');
const { genai } = await import('../src/lib/genaiClient.js');
const repeatedMoves = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];

test('history retains threefold repetition, while two occurrences remain playable', () => {
  assert.equal(chessFromHistory(repeatedMoves.slice(0, 4)).isThreefoldRepetition(), false);
  assert.equal(chessFromHistory(repeatedMoves).isThreefoldRepetition(), true);
});

test('multiplayer ends in a draw when the third occurrence is reached', async () => {
  const service = new MultiplayerService({} as any);
  const created = await service.createGame('one', 'One', 'socket-one', null);
  const joined = await service.joinGame(created.id, 'two', 'Two', 'socket-two');
  assert.ok(joined);
  let result;
  for (const [index, move] of repeatedMoves.entries()) {
    const uid = index % 2 === 0 ? joined.game.white.uid : joined.game.black.uid;
    result = await service.processMove(created.id, uid, move);
    assert.equal(result.success, true);
    if (index < 7) assert.equal(result.gameOver, undefined);
  }
  assert.equal(result?.gameOver?.reason, 'threefold_repetition');
  assert.equal((await multiplayerStore.getGame(created.id))?.status, 'completed');
  await multiplayerStore.deleteGame(created.id);
});

for (const lastMover of ['player', 'bot'] as const) {
  test(`AI game detects repetition on a ${lastMover} move`, async () => {
    const service = new AiGameService();
    const created = await service.createGame(`owner-${lastMover}`, 'Owner', 'rook-rodriguez',
      lastMover === 'player' ? 'black' : 'white');
    assert.equal(created.ok, true);
    if (!created.ok) return;
    created.state.moves = repeatedMoves.slice(0, -1);
    created.state.fen = chessFromHistory(created.state.moves).fen();
    await aiGameStore.setGame(created.state.id, created.state);
    // Isolate the end-of-game cloud writes and farewell generation.
    const finish = mock.method(service as any, 'finishGame', async (_state: unknown, reason: string) => ({
      data: { endReason: reason }, farewell: null,
    }));
    const stream = mock.method(genai.models, 'generateContentStream', async () =>
      (async function* () { yield { text: 'MOVE: Ng8\n' }; })());
    try {
      if (lastMover === 'player') {
        const result = await service.applyPlayerMove(created.state.id, created.state.uid, 'Ng8');
        assert.ok(result.ok);
        assert.equal(result.gameOver?.data.endReason, 'threefold_repetition');
      } else {
        const result = await service.runBotTurn(created.state.id, {
          enqueue: () => { throw new Error('Unexpected chat'); },
          messages: () => [], whenDrained: async () => {}, flushNow: () => {},
        });
        assert.equal(result?.gameOver?.data.endReason, 'threefold_repetition');
      }
      assert.equal(finish.mock.callCount(), 1);
    } finally {
      finish.mock.restore(); stream.mock.restore();
      await aiGameStore.deleteGame(created.state.id);
      await aiGameStore.deleteUidMapping(created.state.uid);
    }
  });
}
