const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function loadSource(path, dependencies, globals = {}) {
  const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, process: { env: {} }, ...globals,
    require: (id) => {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return exports;
}

test('AI page rejoins and resyncs after a drop while a game is active or thinking', () => {
  let isConnected = false;
  let status = 'idle';
  let gameId = 'game-one';
  const requests = [];
  const reconnect = (id) => requests.push(id);
  const stableAction = () => {};
  let hookIndex = 0;
  let effects = [];
  const slots = [];
  const memo = (make, deps) => {
    const index = hookIndex++;
    const previous = slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      slots[index] = { deps, value: make() };
    }
    return slots[index].value;
  };
  const react = {
    useState: (initial) => [memo(() => initial, []), stableAction],
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => memo(() => { effects.push(effect); }, deps),
  };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'next/navigation': { useParams: () => ({ gameId }), useRouter: () => ({ push: stableAction }) },
    'chess.js': require('chess.js'),
    '@/hooks/useAiGameSocket': { useAiGameSocket: () => ({ reconnect }) },
    '@/hooks/useAiMoveInput': { useAiMoveInput: () => ({}) },
    '@/stores/practiceStore': { usePracticeStore: () => ({ inputMode: 'tap-only', voiceParsingMode: 'gemini-audio' }) },
    '@/stores/aiGameStore': { useAiGameStore: () => ({ isConnected, status,
      fen: '', moves: [], setError: stableAction, setNotFound: stableAction }) },
  };
  for (const name of ['ChessBoard', 'MoveHistory', 'AiChatPanel', 'PageLayout', 'UniversalInputPanel']) {
    dependencies[`@/components/${name}`] = { [name]: () => null };
  }
  const page = loadSource('src/app/play-ai/[gameId]/page.tsx', dependencies).default;
  function render() {
    hookIndex = 0;
    effects = [];
    page();
    effects.forEach((effect) => effect());
  }
  render();
  assert.deepEqual(requests, []);
  isConnected = true;
  render();
  assert.deepEqual(requests, ['game-one']);
  status = 'active';
  render();
  assert.equal(requests.length, 1, 'server state updates should not cause a resume loop');
  for (const nextStatus of ['active', 'bot-thinking']) {
    status = nextStatus;
    isConnected = false;
    render();
    isConnected = true;
    render();
  }
  assert.deepEqual(requests, ['game-one', 'game-one', 'game-one']);
  gameId = 'game-two';
  render();
  assert.equal(requests.at(-1), 'game-two');
});

for (const storageAvailable of [true, false]) {
  test(`guest credential survives reconnect, auth changes, and refresh (storage=${storageAvailable})`, () => {
    const stored = new Map();
    const sessionStorage = {
      getItem: (key) => { if (!storageAvailable) throw Error('Unavailable'); return stored.get(key); },
      setItem: (key, value) => { if (!storageAvailable) throw Error('Unavailable'); stored.set(key, value); },
    };
    const sockets = [];
    const io = (_url, options) => {
      const socket = { ...options, connected: true, disconnect() {}, connect() {} };
      sockets.push(socket);
      return socket;
    };
    const load = () => loadSource('src/lib/socket.ts', { 'socket.io-client': { io } }, {
      sessionStorage, crypto: { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) },
    });
    const module = load();
    const socket = module.getSocket();
    const token = socket.auth.guestToken;
    assert.match(token, /^[a-f0-9]{64}$/);
    module.setAuthToken('firebase-token');
    assert.equal(socket.auth.guestToken, token);
    assert.equal(socket.auth.token, 'firebase-token');
    module.setAuthToken(null);
    module.connectSocket();
    assert.equal(socket.auth.guestToken, token);
    assert.equal(sockets.length, 1);
    const refreshedToken = load().getSocket().auth.guestToken;
    if (storageAvailable) assert.equal(refreshedToken, token);
    else assert.notEqual(refreshedToken, token);
  });
}
