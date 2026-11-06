const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource, hookHarness, jsx } = require('./helpers.cjs');
const training = loadSource('src/lib/voiceTraining.ts');
const exercises = [
  { id: 'd4', category: 'coordinates', categoryLabel: 'Coordinates', fen: new Chess().fen(), move: 'd4', target: 'd4', phrases: ['d four', 'delta four'] },
  { id: 'nf3', category: 'pieces', categoryLabel: 'Pieces', fen: new Chess().fen(), move: 'Nf3', target: 'knight f3', phrases: ['knight f three', 'knight foxtrot three'] },
];
const attempt = (fields = {}) => ({ id: 'a', runId: 'run', exerciseId: 'd4', engine: 'browser', phase: 'diagnostic', heard: 'd four', parsedMove: 'd4', confidence: .95, latencyMs: 1000, timestamp: 1, ...fields });

test('diagnostic scores use the first attempt and keep engines and practice separate', () => {
  const rows = [attempt({ parsedMove: 'Nf3' }), attempt({ id: 'retry' }), attempt({ id: 'gemini', engine: 'gemini' }), attempt({ id: 'practice', phase: 'practice' })];
  const summary = training.trainingSummary(rows, exercises, 'browser');
  assert.equal(summary[0].correct, 0);
  assert.equal(summary[0].wrong, 1);
  assert.equal(summary[0].retries, 1);
  assert.equal(summary[0].practiceCorrect, 1);
  assert.equal(summary[0].weak, true);
  assert.equal(training.trainingSummary(rows, exercises, 'gemini')[0].correct, 1);
  const latest = training.trainingSummary([...rows, attempt({ id: 'new', runId: 'new-diagnostic' })], exercises, 'browser');
  assert.equal(latest[0].correct, 1);
  assert.equal(latest[0].retries, 0);
  assert.equal(latest[1].total, 0, 'unattempted categories remain untested');
});

test('targeted practice selects weak or untested categories and uses alternate phrasing', () => {
  const plan = training.trainingPlan([exercises[0], exercises[1]], [attempt()], 'browser', 'practice');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].exercise.id, 'nf3');
  assert.equal(plan[0].phrase, 'knight foxtrot three');
  assert.equal(training.trainingOutcome({ parsedMove: 'Qh7' }, { move: 'Qh7#' }), 'correct');
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function captureFixture({ deferredToken = false } = {}) {
  const runtime = hookHarness(), requests = [], timers = new Map();
  let browserOptions, audioOptions, resolveToken, resolveResponse, timerId = 0;
  const noop = () => {};
  const base = { isSupported: true, error: null, isListening: false, startListening: noop, stopListening: noop };
  const state = { engine: 'browser', fen: new Chess().fen() };
  const token = deferredToken ? () => new Promise(resolve => { resolveToken = resolve; }) : async () => 'token';
  const { useVoiceTrainingCapture } = loadSource('src/hooks/useVoiceTrainingCapture.ts', {
    react: runtime.react, 'chess.js': { Chess }, '@/lib/spokenMoveMatcher': { CONFIDENT_MATCH: .9 },
    './useVoiceRecognition': { useVoiceRecognition: options => { browserOptions = options; return base; } },
    './useGeminiVoice': { useGeminiVoice: options => { audioOptions = options; return base; } },
  }, {
    fetch: (url, options) => { requests.push({ url, ...options }); return new Promise(resolve => { resolveResponse = resolve; }); },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  return { state, runtime, requests, timers,
    render: () => runtime.render(() => useVoiceTrainingCapture(state.engine, state.fen, token)),
    browser: (...args) => browserOptions.onResult(...args), audio: (...args) => audioOptions.onAudioReady(...args),
    token: value => resolveToken(value), respond: parsed => resolveResponse({ ok: true, json: async () => parsed }),
  };
}

test('a final clear browser result stays local, while uncertain speech sends no exercise or answer', async () => {
  const f = captureFixture();
  try {
    f.render().start(); f.browser('Nf3', .95, 'knight f three', ['knight f three'], false);
    assert.equal(f.render().result.move, 'Nf3');
    assert.equal(f.requests.length, 0);
    f.render().start(); f.browser('d4', .7, 'the floor', ['the floor', 'd four'], true);
    f.browser('e4', .99, 'e four', ['e four'], false);
    await settle();
    assert.equal(f.requests.length, 1, 'one recording cannot start two parses');
    const payload = JSON.parse(f.requests[0].body);
    assert.deepEqual(Object.keys(payload).sort(), ['engine', 'fen', 'rawTranscript', 'transcript', 'transcripts']);
    assert.equal(payload.rawTranscript, 'the floor');
    f.respond({ move: 'd4', confidence: .9, transcription: 'the floor', alternatives: [] }); await settle();
    assert.equal(f.render().result.move, 'd4');
  } finally { f.runtime.unmount(); }
});

test('changing the engine/position or unmounting cancels reads and rejects late recognition', async () => {
  const f = captureFixture({ deferredToken: true });
  f.render().start(); f.browser('d4', .7, 'the floor', ['the floor'], true);
  f.state.engine = 'gemini'; f.render();
  f.token('token'); await settle();
  assert.equal(f.requests.length, 0, 'late auth cannot upload after cancellation');
  f.render().start(); f.audio('encoded', 'audio/webm');
  f.token('token'); await settle();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(f.requests[0].body)).sort(), ['audioBase64', 'engine', 'fen', 'mimeType']);
  f.runtime.unmount();
  assert.equal(f.requests[0].signal.aborted, true);
  f.respond({ move: 'd4', confidence: .99, transcription: 'd4', alternatives: [] }); await settle();
  assert.equal(f.timers.size, 0);
});

test('the recording deadline yields an unrecognized observation and stops input', () => {
  const f = captureFixture();
  try {
    f.render().start();
    [...f.timers.values()][0]();
    const result = f.render().result;
    assert.equal(result.move, ''); assert.equal(result.transcription, '');
    assert.equal(f.render().phase, 'idle'); assert.equal(f.requests.length, 0);
  } finally { f.runtime.unmount(); }
});

test('only confirmed results are kept, double clicks cannot create repeated evidence, and save failure retains observations', async () => {
  const runtime = hookHarness();
  let captureResult = null, seq = 0;
  const noop = () => {};
  const capture = { result: null, phase: 'idle', error: null, supported: true, start: noop, cancel() { captureResult = null; } };
  const saves = [];
  const { VoiceCalibration } = loadSource('src/components/VoiceCalibration.tsx', {
    react: runtime.react, 'react/jsx-runtime': jsx,
    './ChessBoard': { ChessBoard: () => null }, '@/lib/voiceTraining': training,
    '@/hooks/useVoiceTrainingCapture': { useVoiceTrainingCapture: () => ({ ...capture, result: captureResult }) },
    '@/lib/speechAvailability': { useGeminiAudioStatus: () => ({ available: true }), refreshGeminiAudioStatus: async () => {} },
  }, { crypto: { randomUUID: () => `id-${++seq}` }, fetch: async () => ({ ok: true, json: async () => ({ exercises, attempts: [] }) }) });
  const props = { getIdToken: async () => 'token', onCancel: noop, onComplete: async data => saves.push(data), saveError: null };
  const render = () => runtime.render(() => VoiceCalibration(props));
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'object' ? [tree.props?.children].flat(Infinity).map(text).join('') : String(tree);
  const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
  try {
    render(); await settle();
    button(render(), 'Start diagnostic').props.onClick(); render();
    captureResult = { move: 'Nf3', confidence: .95, transcription: 'night f three', alternatives: [], latencyMs: 1000 };
    let tree = render();
    assert.equal(button(tree, 'Keep result & next').props.disabled, true);
    nodes(tree).find(node => node.type === 'input').props.onChange({ target: { checked: true } });
    tree = render();
    const keep = button(tree, 'Keep result & next').props.onClick;
    keep(); keep(); render();
    button(render(), 'Finish & review').props.onClick();
    tree = render();
    const save = nodes(tree).find(node => node.type === 'button' && /^Save 1 new observations/.test(text(node)));
    assert.ok(save, 'one recording creates only one observation');
    save.props.onClick();
    assert.equal(saves[0].attempts.length, 1);
    props.saveError = 'Network unavailable'; tree = render();
    assert.match(text(tree), /Your observations are still here/);
    assert.ok(nodes(tree).some(node => node.type === 'button' && /^Save 1 new observations/.test(text(node))));
  } finally { runtime.unmount(); }
});
