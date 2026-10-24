const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, hookHarness } = require('./helpers.cjs');

function fixture({ formats = ['audio/webm;codecs=opus'], deferredPermission = false } = {}) {
  const runtime = hookHarness();
  let time = 1000, volume = 255, nextFrame = 0, stopped = 0, resolvePermission;
  const frames = new Map(), recorders = [], results = [], readers = [];
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  class Recorder {
    static isTypeSupported(type) { return formats.includes(type); }
    constructor(_stream, options) { this.state = 'inactive'; this.mimeType = options.mimeType; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  class Context {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { frequencyBinCount: 8, getByteFrequencyData(array) { array.fill(volume); } }; }
    async close() {}
  }
  class Reader {
    constructor() { readers.push(this); }
    readAsDataURL() { this.result = 'data:audio/webm;base64,encoded'; }
  }
  const getUserMedia = deferredPermission
    ? () => new Promise(resolve => { resolvePermission = resolve; }) : async () => stream;
  const { useGeminiVoice } = loadSource('src/hooks/useGeminiVoice.ts', { react: runtime.react }, {
    navigator: { mediaDevices: { getUserMedia } }, window: { MediaRecorder: Recorder, AudioContext: Context },
    MediaRecorder: Recorder, AudioContext: Context, Blob, FileReader: Reader, Date: { now: () => time },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const options = { onAudioReady: (...args) => results.push(args) };
  return {
    runtime, frames, recorders, results, readers,
    render: () => runtime.render(() => useGeminiVoice(options)),
    resolvePermission: () => resolvePermission(stream),
    get stopped() { return stopped; },
    frame(at, level) {
      time = at; volume = level;
      assert.equal(frames.size, 1, 'exactly one volume monitor is scheduled');
      const [id, callback] = frames.entries().next().value;
      frames.delete(id); callback();
    },
  };
}

test('discarded audio resumes volume monitoring and the next utterance is delivered', async () => {
  const f = fixture();
  await f.render().startListening();
  try {
    f.frame(1000, 255);
    f.recorders[0].ondataavailable({ data: new Blob(['noise']) });
    f.frame(1100, 0); f.frame(1600, 0);
    assert.equal(f.results.length, 0);
    assert.equal(f.render().isListening, true);
    f.frame(1800, 255);
    assert.equal(f.recorders[0].state, 'recording');
    f.recorders[0].ondataavailable({ data: new Blob(['x'.repeat(4000)]) });
    f.frame(2400, 0); f.frame(2900, 0);
    f.readers[0].onloadend();
    assert.deepEqual(f.results, [['encoded', 'audio/webm']]);
    assert.equal(f.frames.size, 1);
  } finally { f.runtime.unmount(); }
});

test('maximum-duration recording resumes monitoring and cancellation discards late reads', async () => {
  const f = fixture();
  await f.render().startListening();
  f.frame(1000, 255);
  f.recorders[0].ondataavailable({ data: new Blob(['x'.repeat(4000)]) });
  f.frame(9100, 255);
  assert.equal(f.frames.size, 1);
  f.render().stopListening();
  f.readers[0].onloadend();
  assert.equal(f.results.length, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.stopped, 1);
  f.runtime.unmount();
});

for (const cancel of ['stop', 'unmount']) {
  test(`microphone permission resolving after ${cancel} releases tracks without starting a recorder`, async () => {
    const f = fixture({ deferredPermission: true });
    const voice = f.render();
    const start = voice.startListening();
    if (cancel === 'stop') voice.stopListening(); else f.runtime.unmount();
    f.resolvePermission(); await start;
    assert.equal(f.stopped, 1);
    assert.equal(f.recorders.length, 0);
    assert.equal(f.frames.size, 0);
    if (cancel === 'stop') f.runtime.unmount();
  });
}

test('MP4-only browsers use their supported recorder format', async () => {
  const f = fixture({ formats: ['audio/mp4'] });
  await f.render().startListening();
  assert.equal(f.recorders[0].mimeType, 'audio/mp4');
  assert.equal(f.render().isListening, true);
  f.runtime.unmount();
});
