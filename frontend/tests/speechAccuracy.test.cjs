const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource, hookHarness, jsx } = require('./helpers.cjs');
const parser = loadSource('src/lib/voiceParser.ts');

const cases = [
  ['d4', 'd4'], ['delta four', 'd4'], ['bee four', 'b4'], ['see four', 'c4'],
  ['e4.', 'e4'], ['Nf3', 'Nf3'], ['night f three', 'Nf3'],
  ['knight to f3', 'Nf3'], ['e two to e four', 'e4'], ['knight g one to f three', 'Nf3'],
];
for (const [spoken, expected] of cases) {
  test(`opening speech: ${spoken} -> ${expected}`, () => {
    const parsed = parser.parseVoiceInput(spoken, new Chess().moves());
    assert.equal(parsed.notation, expected);
    assert.ok(parsed.confidence >= 0.85);
    assert.equal(parsed.hasAmbiguity, false);
  });
}

test('castling, captures, promotions and ambiguous pieces retain their meaning', () => {
  for (const phrase of ['short castle', 'king side castle', 'castle kingside']) {
    assert.equal(parser.parseVoiceInput(phrase, ['O-O', 'O-O-O']).notation, 'O-O');
  }
  assert.equal(parser.parseVoiceInput('e eight promotes to queen', ['e8=Q+']).notation, 'e8=Q+');
  assert.equal(parser.parseVoiceInput('e takes d five', ['exd5']).notation, 'exd5');
  const ambiguous = parser.parseVoiceInput('knight d two', ['Nbd2', 'Nfd2']);
  assert.equal(ambiguous.hasAmbiguity, true);
  assert.ok(ambiguous.confidence < 0.85);
  assert.equal(parser.parseVoiceInput('knight b d two', ['Nbd2', 'Nfd2']).notation, 'Nbd2');
  assert.equal(parser.parseVoiceInput('please bring me tea four', new Chess().moves()).notation, '');
  assert.ok(parser.parseVoiceInput('d four', ['b4', 'Nf3']).confidence < 0.85, 'never replace d4 with another opening');
});

function fixture() {
  const runtime = hookHarness(), results = [], instances = [], timers = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart(); }
    abort() { this.onend(); }
  }
  const { useVoiceRecognition } = loadSource('src/hooks/useVoiceRecognition.ts', {
    react: runtime.react, '@/lib/voiceParser': parser,
    '@/lib/spokenMoveMatcher': loadSource('src/lib/spokenMoveMatcher.ts'),
  }, { window: { SpeechRecognition: Recognition }, setTimeout: fn => timers.push(fn) });
  const options = { continuous: true, legalMoves: new Chess().moves(), onResult: (...args) => results.push(args) };
  const render = () => runtime.render(() => useVoiceRecognition(options));
  render().startListening();
  const result = (phrases, final) => Object.assign(phrases.map(transcript => ({ transcript, confidence: 0.9 })), { isFinal: final });
  return { runtime, results, render, timers, result, recognition: instances[0],
    send: (values, resultIndex = 0) => instances[0].onresult({ results: values, resultIndex }) };
}

test('interim moves never submit, final corrections submit once, stop discards late results', () => {
  const f = fixture();
  try {
    f.send([f.result(['Nf3'], false)]);
    f.timers.forEach(fn => fn());
    assert.equal(f.results.length, 0);
    assert.equal(f.render().parsedPreview, 'Nf3');
    f.send([f.result(['d4'], true)]);
    f.send([f.result(['d4'], true)]);
    assert.equal(f.results.length, 1);
    assert.equal(f.results[0][0], 'd4');
    const stop = f.render().stopListening;
    assert.equal(stop, f.render().stopListening, 'stable callbacks avoid clearing selection on listening changes');
    stop();
    f.recognition.onerror({ error: 'aborted' });
    assert.equal(f.render().error, null, 'intentional cancellation is not a microphone error');
    f.send([f.result(['d4'], true), f.result(['e4'], true)], 1);
    assert.equal(f.results.length, 1);
  } finally { f.runtime.unmount(); }
});

test('final alternatives recover a unique legal move without treating competing moves as certainty', () => {
  const f = fixture();
  try {
    f.send([f.result(['the floor', 'd four'], true)]);
    assert.equal(f.results[0][0], 'd4');
    f.send([f.result(['the floor', 'd four'], true), f.result(['d4', 'Nf3'], true)], 1);
    assert.equal(f.results.length, 2);
    assert.ok(f.results[1][1] < 0.85);
  } finally { f.runtime.unmount(); }
});

test('the panel has one submission path and never auto-submits conflicting speech', () => {
  const runtime = hookHarness(), timers = new Map(), submitted = [], requested = [];
  let voiceOptions, nextTimer = 0;
  const noop = () => {};
  const voice = { isSupported: true, isListening: false, startListening: noop, stopListening: noop };
  const distractors = loadSource('src/lib/distractorGenerator.ts');
  const stages = loadSource('src/lib/moveStageParser.ts', { './distractorGenerator': distractors });
  const { UniversalInputPanel } = loadSource('src/components/UniversalInputPanel.tsx', {
    react: runtime.react, 'react/jsx-runtime': jsx, 'chess.js': { Chess },
    '@/hooks/useVoiceRecognition': { useVoiceRecognition: options => { voiceOptions = options; return voice; } },
    '@/hooks/useGeminiVoice': { useGeminiVoice: () => voice },
    '@/lib/spokenMoveMatcher': loadSource('src/lib/spokenMoveMatcher.ts'),
    '@/lib/speechAvailability': { useGeminiAudioStatus: () => ({ available: true, reason: null }), refreshGeminiAudioStatus: async () => {} },
    '@/lib/moveStageParser': stages, './VoiceDebugOverlay': {}, './AudioWaveform': {},
  }, {
    window: { SpeechRecognition: function () {} }, navigator: {},
    setTimeout: fn => {
      const id = ++nextTimer;
      timers.set(id, () => { timers.delete(id); fn(); });
      return id;
    }, clearTimeout: id => timers.delete(id),
  });
  const props = {
    fen: new Chess().fen(), isActive: true, isSubmitting: false, inputMode: 'voice-tap',
    voiceParsingMode: 'webspeech-haiku', autoSubmitEnabled: true,
    aiParseResult: null, aiParseError: null, isAIParsing: false,
    onMoveSubmit: (...args) => submitted.push(args),
    onParseMoveWithText: (...args) => requested.push(args), onParseMoveWithAudio: noop,
    clearAIParseState: noop, clearLastMoveResult: noop,
  };
  const render = () => runtime.render(() => UniversalInputPanel(props));
  try {
    render();
    voiceOptions.onResult('d4', 0.95, 'd4');
    render();
    assert.equal(requested.length, 0, 'a clear final match uses only the local path');
    assert.equal(timers.size, 1);
    for (const fn of [...timers.values()]) fn();
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0][0], 'd4');
    props.aiParseResult = { parsedMove: 'Nf3', confidence: 0.95, alternatives: ['d4'], transcript: 'Nf3' };
    render();
    assert.equal(timers.size, 0, 'model alternatives require manual choice');
    props.aiParseResult = null; render();
    voiceOptions.onResult('Nf3', 0.7, 'night f three', ['night f three'], true); render();
    props.aiParseResult = { parsedMove: 'Nf3', confidence: 0.99, alternatives: [], transcript: 'night f three' };
    render();
    assert.equal(timers.size, 0, 'model confidence cannot erase browser ambiguity');
  } finally { runtime.unmount(); }
});
