const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource, hookHarness, jsx, find } = require('./helpers.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));

function botFixture(color = 'white') {
  const runtime = hookHarness();
  const input = () => {}, board = () => {};
  const searches = [];
  const findBestMove = (fen, difficulty, signal) => new Promise((resolve, reject) => {
    searches.push({ fen, difficulty, resolve, signal });
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  });
  const deps = {
    react: runtime.react, 'react/jsx-runtime': jsx, 'chess.js': { Chess },
    'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams(`color=${color}&difficulty=easy`) },
    '@/hooks/useStockfish': { useStockfish: () => ({ isReady: true, findBestMove }), DIFFICULTY_MAP: { easy: {} } },
    '@/components/UniversalInputPanel': { UniversalInputPanel: input },
    '@/components/ChessBoard': { ChessBoard: board },
    '@/components/PageLayout': { PageLayout: () => {} },
  };
  const component = loadSource('src/app/bot/page.tsx', deps, {}, source => `${source}\nexport { BotPlayContent };`).BotPlayContent;
  return { runtime, input, board, searches, render: () => runtime.render(component) };
}

test('bot replies after every human move and repeated renders do not duplicate searches', async () => {
  const fixture = botFixture();
  try {
    let tree = fixture.render();
    assert.equal(find(tree, fixture.input).props.onMoveSubmit('e4'), true);
    tree = fixture.render();
    assert.equal(fixture.searches.length, 1);
    assert.equal(find(tree, fixture.input).props.isSubmitting, true);
    fixture.render();
    assert.equal(fixture.searches.length, 1);
    fixture.searches[0].resolve('e7e5');
    await settle();
    tree = fixture.render();
    assert.equal(find(tree, fixture.input).props.isSubmitting, false);
    assert.equal(new Chess(find(tree, fixture.input).props.fen).turn(), 'w');
    assert.equal(find(tree, fixture.input).props.onMoveSubmit('Nf3'), true);
    fixture.render();
    assert.equal(fixture.searches.length, 2);
  } finally { fixture.runtime.unmount(); await settle(); }
});

test('playing black starts with a bot move, and unmount cancels that search', async () => {
  const fixture = botFixture('black');
  fixture.render();
  assert.equal(fixture.searches.length, 1);
  fixture.runtime.unmount();
  assert.equal(fixture.searches[0].signal.aborted, true);
  await settle();
});

test('ordinary piece drops do not append a promotion suffix', async () => {
  const fixture = botFixture();
  try {
    const tree = fixture.render();
    assert.equal(find(tree, fixture.board).props.onPieceDrop('e2', 'e4', 'wP'), true);
    fixture.render();
    assert.equal(new Chess(fixture.searches[0].fen).get('e4').type, 'p');
  } finally { fixture.runtime.unmount(); await settle(); }
});

test('signed-out profile redirects after auth resolves without waiting for a profile fetch', () => {
  const runtime = hookHarness();
  const redirects = [];
  const router = { replace: path => redirects.push(path) };
  const auth = { user: null, isLoading: true, getIdToken: async () => { throw Error('Unexpected profile fetch'); } };
  const deps = {
    react: runtime.react, 'react/jsx-runtime': jsx, 'next/link': {}, 'next/image': {},
    'next/navigation': { useRouter: () => router },
    '@/contexts/AuthContext': { useAuth: () => auth }, '@/lib/firebase': {},
  };
  for (const name of ['PageLayout']) {
    deps[`@/components/${name}`] = { [name]: () => {} };
  }
  const profile = loadSource('src/app/profile/page.tsx', deps).default;
  runtime.render(profile);
  assert.deepEqual(redirects, []);
  auth.isLoading = false;
  runtime.render(profile);
  assert.deepEqual(redirects, ['/login?redirect=%2Fprofile']);
  runtime.unmount();
});

const { evaluatePracticeMove } = loadSource('src/lib/practiceEvaluation.ts', { 'chess.js': { Chess } });

for (const side of ['white', 'black']) {
  test(`practice grading reconstructs the original position for ${side}, including one-side mode`, async () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6'];
    const moveIndex = side === 'white' ? 2 : 3;
    const result = { moveIndex, expectedMove: moves[moveIndex], submittedMove: side === 'white' ? 'Bc4' : 'd6' };
    const positions = [];
    const evaluation = await evaluatePracticeMove(moves, result, async fen => {
      positions.push(fen);
      return positions.length === 1 ? 0 : side === 'white' ? -200 : 200;
    });
    assert.equal(evaluation, 'Blunder (-2.00)');
    const before = new Chess();
    moves.slice(0, moveIndex).forEach(move => before.move(move));
    const expected = new Chess(before.fen()); expected.move(result.expectedMove);
    const submitted = new Chess(before.fen()); submitted.move(result.submittedMove);
    assert.deepEqual(positions, [expected.fen(), submitted.fen()]);
    assert.notEqual(positions[0], positions[1]);
  });
}

test('an illegal submitted move is not graded as a playable alternative', async () => {
  const result = await evaluatePracticeMove(['e4'], { moveIndex: 0, expectedMove: 'e4', submittedMove: 'e5' },
    async () => { throw Error('Illegal moves must not request analysis'); });
  assert.equal(result, 'Illegal move');
});

test('cancelled grading does not enqueue the second evaluation', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(evaluatePracticeMove(['e4'], { moveIndex: 0, expectedMove: 'e4', submittedMove: 'd4' },
    async () => { calls++; controller.abort(); return 0; }, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});


test('online lobby offers human matchmaking and invitations without bot setup', () => {
  const runtime = hookHarness();
  const actions = [];
  const router = { push: path => actions.push(['navigate', path]) };
  const state = {
    isConnected: true, isSearching: false, inviteCode: null, gameId: null, status: 'idle',
    error: null, onlineCount: 1, waitingPlayers: [], searchStartedAt: null, searchTimedOut: false,
    setError: error => actions.push(['error', error]), reset() {},
  };
  const useStore = Object.assign(() => state, { getState: () => state });
  const component = loadSource('src/app/play/page.tsx', {
    react: runtime.react, 'react/jsx-runtime': jsx,
    'next/navigation': { useRouter: () => router },
    '@/hooks/useMultiplayerSocket': { useMultiplayerSocket: () => ({
      findGame: control => actions.push(['find', control]), cancelFind() {},
      createInvite: control => actions.push(['invite', control]),
      joinInvite: code => actions.push(['join', code]),
    }) },
    '@/stores/multiplayerStore': { useMultiplayerStore: useStore },
    '@/hooks/usePracticeSocket': { usePracticeSocket() {} },
    '@/contexts/AuthContext': { useAuth: () => ({ user: { uid: 'player' } }) },
    '@/components/PageLayout': { PageLayout: () => {} },
  }).default;
  const nodes = tree => !tree || typeof tree !== 'object' ? []
    : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props.children === label);
  try {
    let tree = runtime.render(component);
    assert.equal(nodes(tree).some(node => typeof node.props?.children === 'string' && /bot|difficulty/i.test(node.props.children)), false);
    button(tree, 'Find Opponent').props.onClick();
    assert.deepEqual(actions.pop(), ['find', 'any']);
    button(tree, 'Create Invite').props.onClick();
    tree = runtime.render(component);
    button(tree, 'Create Invite Link').props.onClick();
    assert.deepEqual(actions.pop(), ['invite', null]);
    button(tree, 'Join Invite').props.onClick();
    tree = runtime.render(component);
    find(tree, 'input').props.onChange({ target: { value: ' FRIEND ' } });
    tree = runtime.render(component);
    button(tree, 'Join Game').props.onClick();
    assert.deepEqual(actions.pop(), ['join', 'FRIEND']);
  } finally { runtime.unmount(); }
});
