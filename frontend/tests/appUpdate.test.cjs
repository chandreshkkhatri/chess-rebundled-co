const { test } = require('node:test');
const assert = require('node:assert/strict');
const zustand = require('zustand');
const { loadSource } = require('./helpers.cjs');

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) { [...(this.listeners.get(type) ?? [])].forEach(fn => fn(event)); }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}

// Loads the real module against a fake browser: the running build's ID, a
// server reporting the deployed build, window, document, clock, timers and storage.
function fixture({ runningBuild = 'build-a' } = {}) {
  let now = 1_000_000;
  const intervals = new Map(); let nextTimer = 0;
  const storage = new Map();
  const server = { buildId: runningBuild, status: 200, fail: false, requests: [] };
  const win = Object.assign(new Target(), { reloads: 0, location: { reload() { win.reloads++; } } });
  const doc = Object.assign(new Target(), { visibilityState: 'visible' });
  const mod = loadSource('src/lib/appUpdate.ts', { zustand }, {
    process: { env: { NEXT_PUBLIC_BUILD_ID: runningBuild } },
    window: win, document: doc,
    fetch: async (url, options) => {
      server.requests.push({ url, options });
      if (server.fail) throw new TypeError('Failed to fetch');
      return { ok: server.status === 200, json: async () => ({ version: 'abc1234', buildId: server.buildId }) };
    },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    Date: { now: () => now },
    setInterval: (fn, ms) => { intervals.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearInterval: id => intervals.delete(id),
  });
  return {
    mod, server, win, doc, intervals,
    state: () => mod.useAppUpdateStore.getState(),
    advance(ms) { now += ms; },
    settle: () => new Promise(resolve => setImmediate(resolve)),
  };
}

test('a different deployed build marks an update as ready without reloading', async () => {
  const f = fixture();
  assert.equal(await f.mod.checkForUpdate(), 'current');
  assert.equal(f.state().updateReady, false);
  assert.equal(f.server.requests[0].url, '/version.json');
  assert.equal(f.server.requests[0].options.cache, 'no-store', 'the check is never answered from a cache');

  f.server.buildId = 'build-b';
  f.mod.useAppUpdateStore.setState({ dismissed: true });
  assert.equal(await f.mod.checkForUpdate(), 'found');
  assert.equal(f.state().updateReady, true);
  assert.equal(f.state().dismissed, false, 'a new update shows the banner again');
  assert.equal(f.win.reloads, 0, 'the page is never reloaded automatically');

  const requests = f.server.requests.length;
  assert.equal(await f.mod.checkForUpdate(), 'found', 'an update already found needs no new request');
  assert.equal(f.server.requests.length, requests);
});

test('failed checks report failure and never claim an update', async () => {
  const f = fixture();
  f.server.fail = true;
  assert.equal(await f.mod.checkForUpdate(), 'failed');
  f.server.fail = false;
  f.server.status = 404;
  assert.equal(await f.mod.checkForUpdate(), 'failed');
  f.server.status = 200;
  f.server.buildId = '';
  assert.equal(await f.mod.checkForUpdate(), 'failed', 'a response without a build ID is not an update');
  assert.equal(f.state().updateReady, false);
  assert.equal(f.state().check, 'failed');
});

test('development builds without a build ID never report an update', async () => {
  const f = fixture({ runningBuild: '' });
  f.server.buildId = 'anything';
  assert.equal(await f.mod.checkForUpdate(), 'current');
  assert.equal(f.server.requests.length, 0);
});

test('the app checks every 30 minutes and on returning to the foreground, at most once a minute', async () => {
  const f = fixture();
  const stop = f.mod.watchForUpdates();
  const [interval] = f.intervals.values();
  assert.equal(interval.ms, 30 * 60 * 1000);
  interval.fn();
  await f.settle();
  assert.equal(f.server.requests.length, 1);

  f.advance(30_000);
  f.doc.dispatch('visibilitychange');
  await f.settle();
  assert.equal(f.server.requests.length, 1, 'too soon after the last check');

  f.advance(31_000);
  f.doc.visibilityState = 'hidden';
  f.doc.dispatch('visibilitychange');
  await f.settle();
  assert.equal(f.server.requests.length, 1, 'going to the background does not check');

  f.server.buildId = 'build-b';
  f.doc.visibilityState = 'visible';
  f.doc.dispatch('visibilitychange');
  await f.settle();
  assert.equal(f.server.requests.length, 2);
  assert.equal(f.state().updateReady, true);
  assert.equal(f.state().check, 'idle', 'background checks do not change the Settings status');

  stop();
  assert.equal(f.intervals.size, 0);
  assert.equal(f.doc.count('visibilitychange') + f.win.count('error') + f.win.count('unhandledrejection'), 0);
});

test('a missing code file reloads once, and not again in a loop', () => {
  const f = fixture();
  f.mod.watchForUpdates();
  f.win.dispatch('unhandledrejection', { reason: new Error('some unrelated failure') });
  assert.equal(f.win.reloads, 0);

  const chunkError = Object.assign(new Error('Loading chunk 4521 failed.'), { name: 'ChunkLoadError' });
  f.win.dispatch('unhandledrejection', { reason: chunkError });
  assert.equal(f.win.reloads, 1);
  f.advance(5_000);
  f.win.dispatch('error', { error: chunkError });
  assert.equal(f.win.reloads, 1, 'a second failure right after a reload is not retried');
  f.advance(60_000);
  f.win.dispatch('error', { message: 'Failed to fetch dynamically imported module: /_next/static/chunks/app/x.js' });
  assert.equal(f.win.reloads, 2, 'a later failure may reload again');
});

test('chunk load errors are recognized across browsers', () => {
  const { isChunkLoadError } = fixture().mod;
  for (const reason of [
    Object.assign(new Error('x'), { name: 'ChunkLoadError' }),
    new Error('Loading chunk 123 failed.'),
    new Error('Loading CSS chunk app/layout failed'),
    new TypeError('Failed to fetch dynamically imported module: https://x/_next/a.js'),
    new TypeError('error loading dynamically imported module'),
    new TypeError('Importing a module script failed.'),
  ]) assert.equal(isChunkLoadError(reason), true, String(reason));
  for (const reason of [null, undefined, new Error('Network request failed'), 'TypeError: x is undefined']) {
    assert.equal(isChunkLoadError(reason), false, String(reason));
  }
});
