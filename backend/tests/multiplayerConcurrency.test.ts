import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerService } from '../src/services/multiplayerService.js';
import { multiplayerStore } from '../src/services/multiplayerSessionStore.js';

delete process.env.REDIS_URL;

async function fixture() {
  const events: { event: string; data: any }[] = [];
  const service = new MultiplayerService({ to: () => ({ emit: (event: string, data: any) => events.push({ event, data }) }) } as any);
  const created = await service.createGame('one', 'One', 'socket-one', null);
  const joined = await service.joinGame(created.id, 'two', 'Two', 'socket-two');
  assert.ok(joined);
  return { service, game: joined.game, events };
}

test('simultaneous moves from the same player accept exactly one move', async () => {
  const { service, game } = await fixture();
  try {
    const results = await Promise.all([
      service.processMove(game.id, game.white.uid, 'e4'),
      service.processMove(game.id, game.white.uid, 'd4'),
    ]);
    assert.equal(results.filter(result => result.success).length, 1);
    const stored = await service.getGame(game.id);
    assert.deepEqual(stored?.moves, ['e4']);
    assert.equal(stored?.turn, 'black');
  } finally { await service.cleanupGame(game.id); }
});

test('a clock tick concurrent with a move preserves the move and charges the correct player', async () => {
  const { service, game } = await fixture();
  const now = mock.method(Date, 'now', () => 10_000);
  try {
    game.timeControl = { initialTimeMs: 1000, incrementMs: 1000 };
    game.white.timeRemainingMs = game.black.timeRemainingMs = 1000;
    game.lastTickAt = 9750;
    await multiplayerStore.setGame(game.id, game);
    await Promise.all([
      service.processMove(game.id, game.white.uid, 'e4'),
      (service as any).tickClock(game.id),
    ]);
    const stored = await service.getGame(game.id);
    assert.deepEqual(stored?.moves, ['e4']);
    assert.equal(stored?.white.timeRemainingMs, 1750);
    assert.equal(stored?.black.timeRemainingMs, 1000);
  } finally { now.mock.restore(); await service.cleanupGame(game.id); }
});

test('a fallen flag rejects the move before increment and broadcasts timeout once', async () => {
  const { service, game, events } = await fixture();
  const now = mock.method(Date, 'now', () => 10_000);
  try {
    game.timeControl = { initialTimeMs: 100, incrementMs: 1000 };
    game.white.timeRemainingMs = 100;
    game.lastTickAt = 9500;
    await multiplayerStore.setGame(game.id, game);
    const [move] = await Promise.all([
      service.processMove(game.id, game.white.uid, 'e4'),
      (service as any).tickClock(game.id),
    ]);
    assert.equal(move.success, false);
    const stored = await service.getGame(game.id);
    assert.deepEqual(stored?.moves, []);
    assert.equal(stored?.white.timeRemainingMs, 0);
    assert.equal(stored?.endReason, 'timeout');
    assert.equal(events.filter(event => event.event === 'mp-game-over').length, 1);
  } finally { now.mock.restore(); await service.cleanupGame(game.id); }
});

test('a move racing resignation cannot revive a completed game', async () => {
  const { service, game } = await fixture();
  try {
    const [resigned, move] = await Promise.all([
      service.resign(game.id, game.white.uid),
      service.processMove(game.id, game.white.uid, 'e4'),
    ]);
    assert.equal(resigned?.endReason, 'resignation');
    assert.equal(move.success, false);
    assert.equal((await service.getGame(game.id))?.status, 'completed');
  } finally { await service.cleanupGame(game.id); }
});

test('two invite joiners cannot both claim the remaining seat', async () => {
  const service = new MultiplayerService({} as any);
  const game = await service.createGame('creator', 'Creator', 'socket', null);
  try {
    const results = await Promise.all([
      service.joinGame(game.id, 'joiner-a', 'A', 'a'),
      service.joinGame(game.id, 'joiner-b', 'B', 'b'),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  } finally { await service.cleanupGame(game.id); }
});

test('a failed write releases the game queue for the next request', async () => {
  const { service, game } = await fixture();
  const original = multiplayerStore.setGame.bind(multiplayerStore);
  const save = mock.method(multiplayerStore, 'setGame', async () => { throw new Error('write failed'); });
  try {
    await assert.rejects(service.processMove(game.id, game.white.uid, 'e4'), /write failed/);
    save.mock.restore();
    assert.equal((await service.processMove(game.id, game.white.uid, 'd4')).success, true);
    assert.deepEqual((await service.getGame(game.id))?.moves, ['d4']);
  } finally { save.mock.restore(); await original(game.id, game); await service.cleanupGame(game.id); }
});
