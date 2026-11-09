import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { validateParsedMove } from '../src/lib/validateParsedMove.js';
import { ThinkingLevel } from '@google/genai';

process.env.GOOGLE_API_KEY = 'test-placeholder';
const { genai, GEMINI_MODEL, GEMINI_TRANSCRIPTION_MODEL, thinkingConfigFor } = await import('../src/lib/genaiClient.js');
const { parseChessMoveWithAI } = await import('../src/services/aiMoveParser.js');
const { parseChessMoveFromAudio } = await import('../src/services/geminiAudioParser.js');

test('model validation rejects illegal, malformed and contradictory moves and canonicalizes SAN', () => {
  const legal = ['d4', 'Nf3', 'Qh7+'];
  for (const value of [null, [], { move: 42 }, { move: 'e5', confidence: 1 }, { move: 'Nf3', confidence: 1, transcription: 'd4' }]) {
    const parsed = validateParsedMove(value, legal);
    assert.equal(parsed.move, '');
    assert.equal(parsed.confidence, 0);
  }
  assert.equal(validateParsedMove({ move: 'Nf3', confidence: 1 }, legal, 'd4.').move, '');
  assert.deepEqual(validateParsedMove({ move: 'Qh7', confidence: 4, alternatives: ['d4', 'd4', 42, 'e5', 'Qh7'] }, legal), {
    move: 'Qh7+', confidence: 0.7, alternatives: ['d4'],
  });
  assert.equal(validateParsedMove({ move: 'd4', confidence: '0.99' }, legal).confidence, 0);
});

for (const audio of [false, true]) {
  test(`${audio ? 'audio' : 'text'} inference defaults to abstention and rejects d4 becoming Nf3`, async () => {
    const call = mock.method(genai.models, 'generateContent', async () => ({
      text: JSON.stringify({ move: 'Nf3', confidence: 0.99, alternatives: [], transcription: 'd4' }),
    }) as any);
    try {
      const result = audio
        ? await parseChessMoveFromAudio('encoded', 'audio/webm', 'fen', ['d4', 'Nf3'])
        : await parseChessMoveWithAI('d4', 'fen', ['d4', 'Nf3']);
      assert.equal(result.move, '');
      const request = call.mock.calls[0].arguments[0] as any;
      assert.match(JSON.stringify(request.contents), /instead of guessing/);
      assert.equal(request.config.responseMimeType, 'application/json');
    } finally { call.mock.restore(); }
  });
}

test('audio transcription receives no board or candidate moves, and silence never reaches move inference', async () => {
  const call = mock.method(genai.models, 'generateContent', async () => ({
    text: JSON.stringify({ speechDetected: false, transcription: '' }),
  }) as any);
  try {
    const result = await parseChessMoveFromAudio('encoded', 'audio/webm', 'secret-position', ['d4', 'Nf3']);
    assert.equal(result.move, '');
    assert.equal(call.mock.callCount(), 1);
    const prompt = JSON.stringify(call.mock.calls[0].arguments[0]);
    assert.doesNotMatch(prompt, /secret-position|Nf3|d4|e4/);
    assert.equal(call.mock.calls[0].arguments[0].model, GEMINI_TRANSCRIPTION_MODEL);
  } finally { call.mock.restore(); }
});

test('only detected audio words reach calibrated interpretation, and contradictory results are rejected', async () => {
  // The calibration says "d4" is often how this speaker's Nf3 is heard, so the
  // literal transcription still goes to interpretation.
  let stage = 0;
  const call = mock.method(genai.models, 'generateContent', async () => ({
    text: JSON.stringify(++stage === 1
      ? { speechDetected: true, transcription: 'd4' }
      : { move: 'Nf3', confidence: 0.99, alternatives: [] }),
  }) as any);
  try {
    const result = await parseChessMoveFromAudio('encoded', 'audio/webm', 'fen', ['d4', 'Nf3'], {
      confusionMap: { d4: ['the floor'], Nf3: ['d four'] },
    });
    assert.equal(result.move, '');
    assert.equal(result.transcription, 'd4');
    assert.equal(call.mock.callCount(), 2);
    assert.doesNotMatch(JSON.stringify(call.mock.calls[0].arguments), /the floor/);
    assert.match(JSON.stringify(call.mock.calls[1].arguments), /the floor/);
    assert.equal(call.mock.calls[1].arguments[0].model, GEMINI_MODEL);
  } finally { call.mock.restore(); }
});

test('a transcription finishing after the overall deadline cannot start another provider call', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish!: (value: any) => void;
  const call = mock.method(genai.models, 'generateContent', () => new Promise(resolve => { finish = resolve; })) as any;
  const log = mock.method(console, 'error', () => {});
  try {
    const pending = parseChessMoveFromAudio('encoded', 'audio/webm', 'fen', ['d4']);
    t.mock.timers.tick(12001);
    const result = await pending;
    assert.equal(result.move, '');
    assert.match(result.reasoning || '', /timed out/);
    finish({ text: JSON.stringify({ speechDetected: true, transcription: 'd4' }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(call.mock.callCount(), 1);
  } finally { call.mock.restore(); log.mock.restore(); t.mock.timers.reset(); }
});

test('a transcription that is literally a legal move skips interpretation', async () => {
  const replies = [{ speechDetected: true, transcription: 'Nf3.' }];
  const call = mock.method(genai.models, 'generateContent', async () => ({
    text: JSON.stringify(replies.shift() ?? { move: 'd4', confidence: 1, alternatives: [] }),
    usageMetadata: { thoughtsTokenCount: 12, candidatesTokenCount: 9 },
  }) as any);
  const log = mock.method(console, 'info', () => {});
  try {
    const result = await parseChessMoveFromAudio('encoded', 'audio/webm', 'fen', ['d4', 'Nf3'], {
      confusionMap: { e4: ['echo for'] },
    });
    assert.equal(call.mock.callCount(), 1, 'one provider call');
    assert.equal(result.move, 'Nf3');
    assert.equal(result.confidence, 0.95);
    assert.deepEqual(result.alternatives, []);
    assert.equal(result.transcription, 'Nf3.');
    assert.equal(result.timing?.interpretationMs, null);
    assert.equal(result.timing?.transcriptionThoughtTokens, 12);
    const line = log.mock.calls.find(entry => String(entry.arguments[0]).includes('transcription timing'));
    assert.ok(line, 'the transcription call is timed');
    assert.equal(JSON.parse(String(line.arguments[1])).model, GEMINI_TRANSCRIPTION_MODEL);
  } finally { call.mock.restore(); log.mock.restore(); }
});

test('words that are not literal SAN are interpreted, and both stages are timed', async () => {
  let stage = 0;
  const call = mock.method(genai.models, 'generateContent', async () => ({
    text: JSON.stringify(++stage === 1
      ? { speechDetected: true, transcription: 'delta four' }
      : { move: 'd4', confidence: 0.9, alternatives: [], reasoning: 'delta = d' }),
  }) as any);
  const log = mock.method(console, 'info', () => {});
  try {
    const result = await parseChessMoveFromAudio('encoded', 'audio/webm', 'fen', ['d4', 'Nf3']);
    assert.equal(call.mock.callCount(), 2);
    assert.equal(result.move, 'd4');
    assert.equal(typeof result.timing?.interpretationMs, 'number');
    assert.deepEqual(log.mock.calls.map(entry => String(entry.arguments[0])),
      ['[Gemini Audio Parser] transcription timing', '[AI Parser] timing']);
  } finally { call.mock.restore(); log.mock.restore(); }
});

test('thinking levels are configurable and default to the model\'s own setting', async () => {
  assert.equal(thinkingConfigFor(undefined), undefined);
  assert.equal(thinkingConfigFor('default'), undefined);
  assert.equal(thinkingConfigFor('bogus'), undefined);
  assert.deepEqual(thinkingConfigFor(' Minimal '), { thinkingLevel: ThinkingLevel.MINIMAL });
  assert.deepEqual(thinkingConfigFor('high'), { thinkingLevel: ThinkingLevel.HIGH });
  let stage = 0;
  const call = mock.method(genai.models, 'generateContent', async () => ({
    text: JSON.stringify(++stage === 1 ? { speechDetected: true, transcription: 'delta four' } : { move: 'd4', confidence: 0.9, alternatives: [] }),
  }) as any);
  const log = mock.method(console, 'info', () => {});
  try {
    await parseChessMoveFromAudio('encoded', 'audio/webm', 'fen', ['d4']);
    for (const { arguments: [request] } of call.mock.calls as any[]) {
      assert.equal(request.config.thinkingConfig, undefined, 'unset in tests, as in a default deployment');
    }
  } finally { call.mock.restore(); log.mock.restore(); }
});
