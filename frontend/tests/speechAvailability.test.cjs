const { test } = require('node:test');
const assert = require('node:assert/strict');
const zustand = require('zustand');
const { loadSource } = require('./helpers.cjs');

function fixture() {
  let now = 1_000_000;
  const server = { body: { geminiAudio: { available: true, reason: null } }, ok: true, fail: false, requests: [] };
  const mod = loadSource('src/lib/speechAvailability.ts', { zustand }, {
    process: { env: { NEXT_PUBLIC_SOCKET_URL: 'https://api.example' } },
    Date: { now: () => now },
    fetch: async (url, options) => {
      server.requests.push({ url, cache: options?.cache });
      if (server.fail) throw new TypeError('Failed to fetch');
      return { ok: server.ok, json: async () => server.body };
    },
  });
  return { mod, server, state: () => mod.useGeminiAudioStatus.getState(), advance: ms => { now += ms; } };
}

test('the status starts unknown and follows the server', async () => {
  const f = fixture();
  assert.equal(f.state().available, null, 'unknown until the server answers');
  await f.mod.refreshGeminiAudioStatus();
  assert.equal(f.server.requests[0].url, 'https://api.example/api/speech');
  assert.equal(f.server.requests[0].cache, 'no-store');
  assert.equal(f.state().available, true);

  f.server.body = { geminiAudio: { available: false, reason: 'Gemini audio is failing right now.' } };
  await f.mod.refreshGeminiAudioStatus({ force: true });
  assert.equal(f.state().available, false);
  assert.equal(f.state().reason, 'Gemini audio is failing right now.');
});

test('refreshes are throttled unless forced, and concurrent ones share a request', async () => {
  const f = fixture();
  await Promise.all([f.mod.refreshGeminiAudioStatus(), f.mod.refreshGeminiAudioStatus()]);
  assert.equal(f.server.requests.length, 1);
  f.advance(5_000);
  await f.mod.refreshGeminiAudioStatus();
  assert.equal(f.server.requests.length, 1, 'within 15 seconds the last answer is reused');
  await f.mod.refreshGeminiAudioStatus({ force: true });
  assert.equal(f.server.requests.length, 2);
  f.advance(16_000);
  await f.mod.refreshGeminiAudioStatus();
  assert.equal(f.server.requests.length, 3);
});

test('failed or malformed answers keep the last known status', async () => {
  const f = fixture();
  await f.mod.refreshGeminiAudioStatus();
  for (const change of [{ fail: true }, { ok: false }, { body: {} }, { body: { geminiAudio: { available: 'yes' } } }]) {
    Object.assign(f.server, { fail: false, ok: true, body: { geminiAudio: { available: true, reason: null } } }, change);
    await f.mod.refreshGeminiAudioStatus({ force: true });
    assert.equal(f.state().available, true, JSON.stringify(change));
  }
});
