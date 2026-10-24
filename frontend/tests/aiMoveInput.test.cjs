const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, hookHarness } = require('./helpers.cjs');

function fixture() {
  const runtime = hookHarness(), listeners = new Map(), emitted = [], timers = new Map();
  let nextId = 0, timerId = 0;
  const socket = {
    connected: true,
    on: (name, fn) => { const handlers = listeners.get(name) ?? new Set(); handlers.add(fn); listeners.set(name, handlers); },
    off: (name, fn) => listeners.get(name)?.delete(fn), emit: (name, data) => emitted.push({ name, data }),
  };
  const { useAiMoveInput } = loadSource('src/hooks/useAiMoveInput.ts', {
    react: runtime.react, '@/lib/socket': { getSocket: () => socket },
  }, {
    crypto: { randomUUID: () => `request-${++nextId}` },
    setTimeout: fn => { const id = ++timerId; timers.set(id, () => { timers.delete(id); fn(); }); return id; }, clearTimeout: id => timers.delete(id),
  });
  const state = { gameId: 'game', fen: 'position-one', active: true };
  return {
    runtime, emitted, socket, timers, state,
    render: () => runtime.render(() => useAiMoveInput(state.gameId, state.fen, state.active)),
    receive(name, data) { listeners.get(name)?.forEach(fn => fn(data)); },
  };
}

test('speech requests share the AI game position, accept correlated results and block duplicate parsing', () => {
  const f = fixture();
  try {
    let input = f.render();
    input.parseText('knight f3', 'night f three');
    input.parseText('e4');
    assert.equal(f.emitted.length, 1);
    const request = f.emitted[0];
    assert.equal(request.name, 'ai-parse-move');
    assert.equal(request.data.fen, 'position-one');
    assert.equal(request.data.rawTranscript, 'night f three');
    assert.equal(f.render().isAIParsing, true);
    f.receive('ai-move-parsed', { ...request.data, parsedMove: 'Nf3', confidence: 0.95 });
    input = f.render();
    assert.equal(input.aiParseResult.parsedMove, 'Nf3');
    assert.equal(input.isAIParsing, false);
    assert.equal(f.timers.size, 0);
  } finally { f.runtime.unmount(); }
});

test('position changes, disconnects, errors and timeouts release speech input without accepting stale results', () => {
  const f = fixture();
  try {
    f.render().parseAudio('encoded', 'audio/mp4');
    const old = f.emitted[0];
    assert.equal(old.name, 'ai-parse-audio');
    f.state.fen = 'position-two'; f.render();
    f.receive('ai-move-parsed', { ...old.data, parsedMove: 'e4' });
    assert.equal(f.render().aiParseResult, null);
    f.render().parseText('e5');
    const current = f.emitted[1];
    f.receive('ai-parse-error', { requestId: old.data.requestId, message: 'old error' });
    assert.equal(f.render().isAIParsing, true);
    f.receive('ai-parse-error', { requestId: current.data.requestId, message: 'Daily limit reached' });
    assert.equal(f.render().aiParseError, 'Daily limit reached');
    f.render().parseText('d5');
    [...f.timers.values()][0]();
    assert.equal(f.render().isAIParsing, false);
    assert.match(f.render().aiParseError, /timed out/);
    f.render().parseText('c5'); f.receive('disconnect');
    assert.equal(f.render().isAIParsing, false);
    assert.equal(f.timers.size, 0);
    f.state.active = false; f.render().parseText('e4');
    assert.equal(f.emitted.length, 4);
  } finally { f.runtime.unmount(); }
});
