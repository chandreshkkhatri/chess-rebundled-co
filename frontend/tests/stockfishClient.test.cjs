const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers.cjs');

function fixture() {
  const timers = new Map(); let nextTimer = 0;
  const { StockfishClient } = loadSource('src/lib/stockfishClient.ts', {}, {
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  });
  const sent = [], readiness = [];
  const worker = { postMessage: message => sent.push(message), terminate() { this.terminated = true; } };
  const client = new StockfishClient(worker, ready => readiness.push(ready));
  const emit = message => worker.onmessage({ data: message });
  emit('uciok'); emit('readyok');
  return { client, worker, sent, emit, readiness, timers };
}

test('overlapping evaluations and bot searches receive their own results in order', async () => {
  const { client, sent, emit } = fixture();
  const first = client.search({ fen: 'position w', depth: 10 });
  const second = client.search({ fen: 'position b', depth: 10 });
  const third = client.search({ fen: 'position w', depth: 5, skillLevel: 0 });
  assert.equal(sent.filter(message => message.startsWith('go ')).length, 1);
  emit('info depth 10 score cp 120'); emit('bestmove e2e4');
  assert.equal((await first).score, 120);
  assert.equal(sent.filter(message => message.startsWith('go ')).length, 2);
  emit('info depth 10 score cp 80'); emit('bestmove e7e5');
  assert.equal((await second).score, -80);
  emit('bestmove d2d4'); assert.equal((await third).move, 'd2d4');
  client.dispose();
});

test('active cancellation drains the old bestmove before starting the next search', async () => {
  const { client, sent, emit } = fixture();
  const controller = new AbortController();
  const cancelled = client.search({ fen: 'old w', depth: 10, signal: controller.signal });
  const next = client.search({ fen: 'new w', depth: 10 });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(sent.at(-1), 'stop');
  assert.equal(sent.filter(message => message.startsWith('go ')).length, 1);
  emit('bestmove e2e4');
  assert.equal(sent.filter(message => message.startsWith('go ')).length, 2);
  emit('bestmove d2d4'); assert.equal((await next).move, 'd2d4');
  client.dispose();
});

test('queued cancellation never sends that position to the worker', async () => {
  const { client, sent, emit } = fixture();
  const first = client.search({ fen: 'first w', depth: 10 });
  const controller = new AbortController();
  const queued = client.search({ fen: 'cancelled w', depth: 10, signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, { name: 'AbortError' });
  emit('bestmove e2e4'); await first;
  assert.equal(sent.includes('position fen cancelled w'), false);
  client.dispose();
});

for (const failure of ['worker error', 'timeout', 'unmount']) {
  test(`${failure} settles active and queued requests and terminates the worker`, async () => {
    const { client, worker, timers, readiness } = fixture();
    const first = client.search({ fen: 'one w', depth: 10 });
    const second = client.search({ fen: 'two w', depth: 10 });
    const settled = Promise.allSettled([first, second]);
    if (failure === 'worker error') worker.onerror(new Error('broken'));
    else if (failure === 'timeout') [...timers.values()].forEach(callback => callback());
    else client.dispose();
    assert.ok((await settled).every(result => result.status === 'rejected'));
    assert.equal(worker.terminated, true);
    assert.equal(readiness.at(-1), false);
    await assert.rejects(client.search({ fen: 'three w', depth: 10 }), /unavailable/);
  });
}
