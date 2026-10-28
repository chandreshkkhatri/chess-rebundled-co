const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource, hookHarness } = require('./helpers.cjs');

// Drives the real hook with a fake SpeechRecognition, so recognizer events
// (interim and final, with alternatives) reach the real matching logic.
function fixture(legalMoves) {
  const runtime = hookHarness();
  let time = 1000;
  const timers = [], results = [], instances = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart?.(); }
    stop() { this.onend?.(); }
    abort() {}
  }
  const voiceParser = loadSource('src/lib/voiceParser.ts');
  const matcher = loadSource('src/lib/spokenMoveMatcher.ts');
  const { useVoiceRecognition } = loadSource('src/hooks/useVoiceRecognition.ts', {
    react: runtime.react, '@/lib/voiceParser': voiceParser, '@/lib/spokenMoveMatcher': matcher,
  }, {
    window: { SpeechRecognition: Recognition },
    Date: { now: () => time },
    setTimeout: (callback, delay) => { timers.push({ callback, at: time + delay }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
  });
  const options = { continuous: true, legalMoves, onResult: (...args) => results.push(args) };
  const render = () => runtime.render(() => useVoiceRecognition(options));
  render();
  const recognition = instances[0];
  const hear = (transcripts, isFinal) => {
    const list = transcripts.map(transcript => ({ transcript }));
    list.isFinal = isFinal;
    recognition.onresult({ resultIndex: 0, results: [list] });
    render();
  };
  const advance = ms => {
    time += ms;
    for (const timer of timers) {
      if (!timer.cancelled && !timer.fired && timer.at <= time) { timer.fired = true; timer.callback(); }
    }
    render();
  };
  return { results, hear, advance, render };
}

const START = new Chess().moves();

test('a final result delivers the best legal match and every recognizer guess', () => {
  const f = fixture(START);
  f.hear(['night of three', 'knight f3', 'nite f 3'], true);
  assert.equal(f.results.length, 1);
  const [move, confidence, raw, transcripts] = f.results[0];
  assert.equal(move, 'Nf3');
  assert.ok(confidence >= 0.9);
  assert.equal(raw, 'night of three');
  assert.deepEqual([...transcripts], ['night of three', 'knight f3', 'nite f 3']);
  assert.equal(f.render().parsedPreview, 'Nf3');
});

test('a later guess decides the move when the first guess does not name one', () => {
  const f = fixture(START);
  f.hear(['nine of three', 'knight f3'], true);
  assert.equal(f.results[0][0], 'Nf3');
  assert.ok(f.results[0][1] >= 0.9);
});

test('a steady, clear interim result commits early and the final result does not repeat it', () => {
  const f = fixture(START);
  f.hear(['e4'], false);
  assert.equal(f.results.length, 0);
  f.advance(300);
  assert.equal(f.results.length, 1, 'stability timer committed the interim result');
  assert.equal(f.results[0][0], 'e4');
  f.hear(['e4'], true);
  assert.equal(f.results.length, 1, 'final result after an early commit is not delivered again');
});

test('interim words that may be the start of a longer move never commit early', () => {
  const castling = fixture(['O-O', 'O-O-O', 'Kf1']);
  castling.hear(['castle'], false);
  castling.advance(300);
  castling.hear(['castle'], false);
  castling.advance(300);
  assert.equal(castling.results.length, 0, '"castle" alone is ambiguous between both castling moves');
  castling.hear(['castle queen side'], true);
  assert.deepEqual(castling.results.map(([move]) => move), ['O-O-O']);

  const ambiguous = fixture(START);
  ambiguous.hear(['bee four'], false);
  ambiguous.advance(300);
  ambiguous.hear(['bee four'], false);
  ambiguous.advance(300);
  assert.equal(ambiguous.results.length, 0, 'a b/d sound-alike waits for the final result');
  ambiguous.hear(['bee four'], true);
  assert.equal(ambiguous.results[0][0], 'b4');
  assert.equal(ambiguous.results[0][1], 0.75);
});

test('without a position the word parser still produces a preview', () => {
  const f = fixture([]);
  f.hear(['knight f3'], true);
  assert.equal(f.results[0][0], 'Nf3');
});
