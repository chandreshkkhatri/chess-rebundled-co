import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { ThinkingLevel, Type } from '@google/genai';

process.env.GOOGLE_API_KEY = 'test-placeholder';
const { parseChessMoveFromAudio, audioThinkingConfig } = await import('../src/services/geminiAudioParser.js');
const { genai, GEMINI_AUDIO_MODEL } = await import('../src/lib/genaiClient.js');
const { resetGeminiAudioHealth } = await import('../src/services/geminiAudioHealth.js');

function replyWith(body: unknown) {
  const requests: any[] = [];
  const call = mock.method(genai.models, 'generateContent', async (request: any) => {
    requests.push(request);
    return { text: JSON.stringify(body), usageMetadata: { promptTokenCount: 120, thoughtsTokenCount: 0, candidatesTokenCount: 20 } } as any;
  });
  return { requests, restore: () => call.mock.restore() };
}

test('the audio request asks for a legal move by schema, minimal thinking and no retries', async () => {
  const chess = new Chess();
  const legal = chess.moves();
  const reply = replyWith({ transcription: 'echo four', move: 'e4', confidence: 0.92, alternatives: ['e3'] });
  const log = mock.method(console, 'info', () => {});
  try {
    const result = await parseChessMoveFromAudio('ZW5jb2RlZA==', 'audio/wav', chess.fen(), legal);
    assert.deepEqual(result, { move: 'e4', confidence: 0.92, alternatives: ['e3'], transcription: 'echo four', reasoning: undefined });
    const { model, contents, config } = reply.requests[0];
    assert.equal(model, GEMINI_AUDIO_MODEL);
    assert.deepEqual(contents[0], { inlineData: { data: 'ZW5jb2RlZA==', mimeType: 'audio/wav' } });
    assert.equal(config.responseMimeType, 'application/json');
    assert.equal(config.responseSchema.type, Type.OBJECT);
    assert.deepEqual(config.responseSchema.properties.move.enum, [...legal, 'unclear']);
    assert.deepEqual(config.responseSchema.propertyOrdering, ['transcription', 'move', 'confidence', 'alternatives']);
    assert.equal(config.responseSchema.properties.reasoning, undefined, 'no free-text reasoning to generate');
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: ThinkingLevel.MINIMAL });
    assert.equal(config.httpOptions.retryOptions.attempts, 1);
    assert.ok(config.abortSignal instanceof AbortSignal);
    const timing = JSON.parse(String(log.mock.calls[0].arguments[1]));
    assert.equal(timing.model, GEMINI_AUDIO_MODEL);
    assert.equal(timing.thoughtTokens, 0);
    assert.equal(timing.outputTokens, 20);
    assert.equal(typeof timing.ms, 'number');
  } finally { reply.restore(); log.mock.restore(); resetGeminiAudioHealth(); }
});

test('replies are normalised to legal moves', async () => {
  const chess = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const legal = chess.moves();
  assert.ok(legal.includes('Ra8#'));
  const log = mock.method(console, 'info', () => {});
  const cases: [unknown, Record<string, unknown>][] = [
    [{ transcription: 'rook a8', move: 'Ra8', confidence: 1.4, alternatives: ['Ra8#', 'Ra7', 'unclear', 'Zz9', 'Ra7'] },
      { move: 'Ra8#', confidence: 1, alternatives: ['Ra7'] }],
    [{ transcription: 'hello', move: 'unclear', confidence: 0.6, alternatives: [] },
      { move: '', confidence: 0.3, alternatives: [], reasoning: 'No legal move matched what was heard.' }],
    [{ transcription: '', move: 'unclear', confidence: 'high', alternatives: 'Ra7' },
      { move: '', confidence: 0, alternatives: [], reasoning: 'No move was heard.' }],
  ];
  try {
    for (const [body, expected] of cases) {
      const reply = replyWith(body);
      try {
        const result = await parseChessMoveFromAudio('ZW5jb2RlZA==', 'audio/wav', chess.fen(), legal);
        for (const [key, value] of Object.entries(expected)) assert.deepEqual((result as any)[key], value, `${JSON.stringify(body)} → ${key}`);
      } finally { reply.restore(); }
    }
  } finally { log.mock.restore(); resetGeminiAudioHealth(); }
});

test('the thinking level can be set per deployment', () => {
  assert.deepEqual(audioThinkingConfig(undefined), { thinkingLevel: ThinkingLevel.MINIMAL });
  assert.deepEqual(audioThinkingConfig(' Low '), { thinkingLevel: ThinkingLevel.LOW });
  assert.deepEqual(audioThinkingConfig('bogus'), { thinkingLevel: ThinkingLevel.MINIMAL });
  assert.equal(audioThinkingConfig('default'), undefined, 'models without thinking levels keep their own setting');
});
