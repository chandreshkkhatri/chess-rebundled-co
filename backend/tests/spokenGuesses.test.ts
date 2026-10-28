import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

process.env.GOOGLE_API_KEY = 'test-placeholder';
const { validTextParse, spokenGuesses } = await import('../src/lib/socketRequest.js');
const { parseChessMoveWithAI, transcriptCacheText } = await import('../src/services/aiMoveParser.js');
const { genai } = await import('../src/lib/genaiClient.js');

test('text parse payloads may carry up to five recognizer guesses', () => {
  const base = { sessionId: 's', transcript: 'e4' };
  assert.equal(validTextParse(base), true);
  assert.equal(validTextParse({ ...base, transcripts: ['e for', 'e4'] }), true);
  assert.equal(validTextParse({ ...base, transcripts: [] }), true);
  assert.equal(validTextParse({ ...base, transcripts: ['a', 'b', 'c', 'd', 'e', 'f'] }), false, 'too many guesses');
  assert.equal(validTextParse({ ...base, transcripts: ['ok', 42] }), false, 'non-string guess');
  assert.equal(validTextParse({ ...base, transcripts: ['ok', '   '] }), false, 'blank guess');
  assert.equal(validTextParse({ ...base, transcripts: 'e4' }), false, 'not an array');
  assert.equal(validTextParse({ ...base, transcripts: ['x'.repeat(2001)] }), false, 'oversized guess');
});

test('spoken guesses put the words heard first and drop duplicates', () => {
  assert.deepEqual(spokenGuesses({ transcript: 'Nf3', rawTranscript: 'night of three', transcripts: ['night of three', 'knight f3', ' knight f3 ', 'nite f 3'] }),
    { transcript: 'night of three', alternatives: ['knight f3', 'nite f 3'] });
  assert.deepEqual(spokenGuesses({ transcript: 'e4' }), { transcript: 'e4', alternatives: [] });
  assert.equal(transcriptCacheText('night of three', ['knight f3']), 'night of three | knight f3');
  assert.equal(transcriptCacheText('e4'), 'e4');
});

test('the model is told every guess and can only answer with a legal move or nothing', async () => {
  const chess = new Chess();
  const legalMoves = chess.moves();
  const calls = mock.method(genai.models, 'generateContent', async () => ({
    text: '{"move": "unclear", "confidence": 0.2, "alternatives": ["e4", "Qh5"], "reasoning": "unclear"}',
  }) as any);
  try {
    const parsed = await parseChessMoveWithAI('bee four', chess.fen(), legalMoves, {
      alternativeTranscripts: ['d4', 'be for'], allowGuessOnUnclear: false,
    });
    assert.equal(calls.mock.callCount(), 1);
    const request = calls.mock.calls[0].arguments[0] as any;
    assert.match(request.contents, /"bee four"/);
    assert.match(request.contents, /- "d4"\n- "be for"/);
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.deepEqual(request.config.responseSchema.properties.move.enum, [...legalMoves, 'unclear']);
    assert.deepEqual(request.config.responseSchema.properties.alternatives.items.enum, legalMoves);
    assert.equal(parsed.move, '', '"unclear" from the model is reported as no move');
    assert.equal(parsed.confidence, 0.2);
    assert.deepEqual(parsed.alternatives, ['e4'], 'illegal alternatives are dropped');
  } finally { calls.mock.restore(); }
});
