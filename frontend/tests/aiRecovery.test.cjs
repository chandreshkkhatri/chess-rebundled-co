const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('zustand/vanilla');
const { Chess } = require('chess.js');
const { loadSource, hookHarness, jsx, find } = require('./helpers.cjs');

function fixture() {
  const useStore = loadSource('src/stores/aiGameStore.ts', {
    zustand: { create: () => initializer => { const store = createStore(initializer); return Object.assign(() => store.getState(), store); } },
    'zustand/middleware': { persist: initializer => initializer },
  }).useAiGameStore;
  const listeners = new Map(), navigations = [];
  const socket = { connected: true, on: (name, fn) => listeners.set(name, fn), off: name => listeners.delete(name), emit() {} };
  const hookRuntime = hookHarness();
  const hook = loadSource('src/hooks/useAiGameSocket.ts', {
    react: hookRuntime.react, '@/lib/socket': { getSocket: () => socket, connectSocket() {}, setAuthToken() {} },
    '@/stores/aiGameStore': { useAiGameStore: useStore },
    '@/lib/firebase': { subscribeToAuthState: () => () => {}, getIdToken: async () => null },
  }).useAiGameSocket;
  hookRuntime.render(hook);
  const router = { push: path => navigations.push(path) };
  const common = {
    'react/jsx-runtime': jsx, 'chess.js': { Chess },
    'next/navigation': { useRouter: () => router, useParams: () => ({ gameId: 'expired' }) },
    '@/hooks/useAiGameSocket': { useAiGameSocket: () => ({ reconnect() {}, startGame() {} }) },
    '@/hooks/useAiMoveInput': { useAiMoveInput: () => ({}) },
    '@/stores/practiceStore': { usePracticeStore: () => ({ inputMode: 'tap-only', voiceParsingMode: 'gemini-audio' }) },
    '@/stores/aiGameStore': { useAiGameStore: useStore },
    '@/components/ChessBoard': {}, '@/components/MoveHistory': {}, '@/components/AiChatPanel': {},
    '@/components/PageLayout': {}, '@/components/UniversalInputPanel': {},
  };
  return { useStore, common, listeners, navigations, hookRuntime };
}

test('missing active AI game clears persisted identity before setup without losing connection or persona preference', () => {
  const f = fixture();
  f.useStore.getState().setPreferredPersonaId('professor-petrova');
  f.useStore.getState().startGame({ gameId: 'expired', playerColor: 'white', fen: new Chess().fen(), persona: { id: 'rook', name: 'Rook' } });
  f.listeners.get('ai-game-not-found')({ gameId: 'expired', reason: 'Game not found or expired' });
  const gameRuntime = hookHarness(), setupRuntime = hookHarness();
  try {
    const game = loadSource('src/app/play-ai/[gameId]/page.tsx', { ...f.common, react: gameRuntime.react }).default;
    gameRuntime.render(game);
    const setup = loadSource('src/app/play-ai/page.tsx', {
      ...f.common, react: setupRuntime.react,
      '@/contexts/AuthContext': { useAuth: () => ({ user: { uid: 'owner' } }) },
      '@/contexts/LoginModalContext': { useLoginModal: () => ({ openLoginModal() {} }) },
      '@/types/aiGame': { AI_PERSONAS: [{ id: 'professor-petrova', name: 'Professor' }] },
    }).default;
    setupRuntime.render(setup);
    assert.deepEqual(f.navigations, ['/play-ai']);
    assert.equal(f.useStore.getState().gameId, null);
    assert.equal(f.useStore.getState().status, 'idle');
    assert.equal(f.useStore.getState().isConnected, true);
    assert.equal(f.useStore.getState().preferredPersonaId, 'professor-petrova');
  } finally { f.hookRuntime.unmount(); gameRuntime.unmount(); setupRuntime.unmount(); }
});

test('review retries on reconnect and route changes without refetching on state updates', () => {
  const f = fixture(), runtime = hookHarness();
  let gameId = 'first';
  const requests = [], getReview = id => requests.push(id);
  const review = loadSource('src/app/play-ai/[gameId]/review/page.tsx', {
    ...f.common, react: runtime.react,
    'next/navigation': { useParams: () => ({ gameId }), useRouter: () => ({ push() {} }) },
    '@/hooks/useAiGameSocket': { useAiGameSocket: () => ({ getReview }) },
  }).default;
  try {
    runtime.render(review); runtime.render(review);
    assert.deepEqual(requests, ['first']);
    f.useStore.setState({ isConnected: false }); runtime.render(review);
    f.useStore.setState({ isConnected: true }); runtime.render(review);
    assert.deepEqual(requests, ['first', 'first']);
    gameId = 'second'; runtime.render(review);
    assert.deepEqual(requests, ['first', 'first', 'second']);
  } finally { runtime.unmount(); f.hookRuntime.unmount(); }
});

test('AI game uses the shared notation/speech input and only submits on the connected player turn', () => {
  const f = fixture(), runtime = hookHarness();
  const panel = () => {}, requests = [];
  f.useStore.getState().startGame({ gameId: 'expired', playerColor: 'white', fen: new Chess().fen(), persona: { id: 'rook', name: 'Rook' } });
  const page = loadSource('src/app/play-ai/[gameId]/page.tsx', {
    ...f.common, react: runtime.react,
    '@/hooks/useAiGameSocket': { useAiGameSocket: () => ({ reconnect() {}, submitMove: (...args) => requests.push(args) }) },
    '@/components/UniversalInputPanel': { UniversalInputPanel: panel },
  }).default;
  try {
    let tree = runtime.render(page);
    assert.equal(find(tree, panel).props.isActive, true);
    find(tree, panel).props.onMoveSubmit('e4');
    assert.deepEqual(requests, [['expired', 'e4']]);
    f.useStore.setState({ isConnected: false }); tree = runtime.render(page);
    assert.equal(find(tree, panel).props.isActive, false);
    find(tree, panel).props.onMoveSubmit('d4');
    assert.equal(requests.length, 1);
  } finally { runtime.unmount(); f.hookRuntime.unmount(); }
});
