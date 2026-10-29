import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Chess } from 'chess.js';
import { initializeApp } from 'firebase-admin/app';

process.env.GOOGLE_API_KEY = 'test-placeholder';
initializeApp({ projectId: 'gemini-audio-health-tests' });
const { geminiAudioStatus, recordGeminiAudioResult, resetGeminiAudioHealth, GEMINI_AUDIO_PAUSE_MS } =
  await import('../src/services/geminiAudioHealth.js');
const { parseChessMoveFromAudio } = await import('../src/services/geminiAudioParser.js');
const { configRoutes } = await import('../src/routes/configRoutes.js');
const { genai } = await import('../src/lib/genaiClient.js');

test('three provider failures in a row pause Gemini audio, and it is offered again later', () => {
  resetGeminiAudioHealth();
  const now = 1_000_000;
  assert.deepEqual(geminiAudioStatus(now), { available: true, reason: null });
  recordGeminiAudioResult(false, now);
  recordGeminiAudioResult(false, now);
  assert.equal(geminiAudioStatus(now).available, true, 'two failures may be transient');
  recordGeminiAudioResult(false, now);
  assert.deepEqual(geminiAudioStatus(now), { available: false, reason: 'Gemini audio is failing right now.' });
  assert.equal(geminiAudioStatus(now + GEMINI_AUDIO_PAUSE_MS).available, true, 'requests may probe it again');
  recordGeminiAudioResult(false, now + GEMINI_AUDIO_PAUSE_MS);
  assert.equal(geminiAudioStatus(now + GEMINI_AUDIO_PAUSE_MS).available, false, 'a failed probe pauses it again');
  recordGeminiAudioResult(true, now + GEMINI_AUDIO_PAUSE_MS);
  assert.equal(geminiAudioStatus(now + GEMINI_AUDIO_PAUSE_MS).available, true, 'a success clears the pause');
  assert.deepEqual(geminiAudioStatus(now, false), { available: false, reason: 'Gemini audio is not set up on this server.' });
});

test('the audio parser records provider failures but not replies that heard no move', async () => {
  resetGeminiAudioHealth();
  const chess = new Chess();
  const parse = () => parseChessMoveFromAudio('ZW5jb2RlZA==', 'audio/webm', chess.fen(), chess.moves());
  const noMove = mock.method(genai.models, 'generateContent', async () =>
    ({ text: '{"move": "", "confidence": 0, "alternatives": [], "transcription": ""}' }) as any);
  try {
    for (let i = 0; i < 4; i++) assert.equal((await parse()).move, '');
    assert.equal(geminiAudioStatus().available, true, 'a working service that heard nothing stays available');
  } finally { noMove.mock.restore(); }

  const log = mock.method(console, 'error', () => {});
  const failing = mock.method(genai.models, 'generateContent', async () => { throw new Error('403 PERMISSION_DENIED'); });
  try {
    for (let i = 0; i < 3; i++) {
      const result = await parse();
      assert.equal(result.move, '');
      assert.match(result.reasoning ?? '', /Audio parsing failed: 403 PERMISSION_DENIED/);
    }
    assert.equal(geminiAudioStatus().available, false);
  } finally { failing.mock.restore(); }

  const garbled = mock.method(genai.models, 'generateContent', async () => ({ text: 'Sorry, I cannot help.' }) as any);
  try {
    resetGeminiAudioHealth();
    for (let i = 0; i < 3; i++) await parse();
    assert.equal(geminiAudioStatus().available, false, 'replies without JSON count as failures');
  } finally { garbled.mock.restore(); log.mock.restore(); resetGeminiAudioHealth(); }
});

test('the speech status endpoint is public, uncached, and hides provider error details', async () => {
  resetGeminiAudioHealth();
  const app = Fastify();
  try {
    await app.register(configRoutes);
    let response = await app.inject({ url: '/api/speech' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.json(), { geminiAudio: { available: true, reason: null } });
    for (let i = 0; i < 3; i++) recordGeminiAudioResult(false);
    response = await app.inject({ url: '/api/speech' });
    assert.deepEqual(response.json(), { geminiAudio: { available: false, reason: 'Gemini audio is failing right now.' } });
  } finally { await app.close(); resetGeminiAudioHealth(); }
});
