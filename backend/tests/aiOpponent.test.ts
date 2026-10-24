import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Chess } from 'chess.js';

process.env.GOOGLE_API_KEY = 'test-placeholder';
delete process.env.REDIS_URL;
const { AiGameService } = await import('../src/services/aiGameService.js');
const { aiGameStore } = await import('../src/services/aiGameSessionStore.js');
const { aiUsageLimiter } = await import('../src/services/aiUsageLimiter.js');
const { genai } = await import('../src/lib/genaiClient.js');
const { chooseMoveTurn, parseMoveDecision } = await import('../src/services/aiOpponentLlm.js');
const { minimumAiTurnMs } = await import('../src/services/aiTurnTiming.js');
const { getPersona } = await import('../src/data/aiPersonas.js');

const decision = { summary: 'Contest the center.', alternatives: [{ move: 'c5', reason: 'Creates an asymmetric position.' }], threat: 'White can establish a broad pawn center.', plan: 'Develop the kingside pieces.' };
const answer = (move = 'e5') => ({ text: JSON.stringify({ move, ...decision }) });

async function fixture() {
  const service = new AiGameService();
  const created = await service.createGame(randomUUID(), 'Owner', 'professor-petrova', 'white');
  assert.ok(created.ok);
  await service.applyPlayerMove(created.state.id, created.state.uid, 'e4');
  return { service, state: created.state, async close() {
    await aiGameStore.deleteGame(created.state.id);
    await aiGameStore.deleteUidMapping(created.state.uid);
  } };
}

test('an LLM turn uses model defaults, stores summaries privately, and produces no automatic conversation', async () => {
  const f = await fixture();
  const calls = mock.method(genai.models, 'generateContent', async () => answer());
  try {
    const result = await f.service.runBotTurn(f.state.id);
    assert.equal(result?.moveData.move.san, 'e5');
    assert.equal(result?.moveData.aiNotice, null);
    assert.equal(result?.pendingChat, false);
    assert.equal(JSON.stringify(result).includes(decision.plan), false, 'live events must not contain summaries');
    const request = calls.mock.calls[0].arguments[0] as any;
    assert.equal(request.config.thinkingConfig, undefined, 'do not reintroduce the rejected thinkingBudget setting');
    assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
    assert.ok(request.config.responseSchema.properties.move.enum.includes('e5'));
    assert.equal(request.config.abortSignal.aborted, true, 'request resources are released');
    assert.doesNotMatch(request.contents, /PLAYER MESSAGE|RECENT CONVERSATION/);
    assert.equal(await f.service.getReviewData(f.state.id, f.state.uid), null, 'review is unavailable during play');
    const saved = (await aiGameStore.getGame(f.state.id))!;
    assert.deepEqual(saved.chat, []);
    assert.deepEqual(saved.turns[0].decision, decision);
    assert.ok(saved.turns[0].thinking.includes(decision.summary), 'older frontends can review the captured explanation');
    saved.status = 'completed';
    await aiGameStore.setGame(saved.id, saved);
    assert.equal(await f.service.getReviewData(saved.id, 'stranger'), null);
    const review = await f.service.getReviewData(saved.id, saved.uid);
    assert.deepEqual(review?.turns[0].decision, decision);
  } finally { calls.mock.restore(); await f.close(); }
});

test('invalid move output retries once, counts both requests, and uses only the successful explanation', async () => {
  const f = await fixture();
  let count = 0;
  const calls = mock.method(genai.models, 'generateContent', async () => ++count === 1
    ? { text: JSON.stringify({ ...decision, summary: 'Invalid explanation', move: 'e9' }) } : answer());
  const quota = mock.method(aiUsageLimiter, 'tryConsumeLlmTurn', async () => true);
  try {
    const result = await f.service.runBotTurn(f.state.id);
    assert.equal(result?.moveData.move.san, 'e5');
    assert.equal(calls.mock.callCount(), 2);
    assert.equal(quota.mock.callCount(), 2);
    const turn = (await aiGameStore.getGame(f.state.id))!.turns[0];
    assert.equal(turn.moveSource, 'llm-retry');
    assert.deepEqual(turn.decision, decision);
  } finally { calls.mock.restore(); quota.mock.restore(); await f.close(); }
});

test('provider configuration failures use a legal fallback and status notice without canned chat or fake explanations', async () => {
  const f = await fixture();
  const calls = mock.method(genai.models, 'generateContent', async () => { throw Object.assign(new Error('Rejected'), { status: 400 }); });
  try {
    const result = await f.service.runBotTurn(f.state.id);
    assert.ok(result);
    assert.equal(calls.mock.callCount(), 1, 'invalid provider settings must not be retried');
    const board = new Chess(); board.move('e4');
    assert.ok(board.moves().includes(result.moveData.move.san));
    assert.match(result.moveData.aiNotice!, /fallback/);
    const saved = (await aiGameStore.getGame(f.state.id))!;
    assert.equal(saved.turns[0].moveSource, 'heuristic');
    assert.equal(saved.turns[0].decision, undefined);
    assert.equal(saved.turns[0].thinking, '');
    assert.deepEqual(saved.chat, []);
  } finally { calls.mock.restore(); await f.close(); }
});

test('quota exhaustion makes no provider call and recovery clears the fallback notice', async () => {
  const f = await fixture();
  const calls = mock.method(genai.models, 'generateContent', async () => { throw new Error('Unexpected provider call'); });
  const quota = mock.method(aiUsageLimiter, 'tryConsumeLlmTurn', async () => false);
  try {
    const result = await f.service.runBotTurn(f.state.id);
    assert.match(result?.moveData.aiNotice ?? '', /allowance/);
    assert.equal(calls.mock.callCount(), 0);
    const saved = (await aiGameStore.getGame(f.state.id))!;
    const board = new Chess(saved.fen);
    const playerMove = board.moves()[0];
    board.move(playerMove);
    const botMove = board.moves()[0];
    assert.ok((await f.service.applyPlayerMove(saved.id, saved.uid, playerMove)).ok);
    quota.mock.restore(); calls.mock.restore();
    const recovered = mock.method(genai.models, 'generateContent', async () => answer(botMove));
    try {
      const next = await f.service.runBotTurn(saved.id);
      assert.equal(next?.moveData.aiNotice, null);
      assert.equal((await aiGameStore.getGame(saved.id))!.aiNotice, null);
    } finally { recovered.mock.restore(); }
  } finally { calls.mock.restore(); quota.mock.restore(); await f.close(); }
});

test('conversation arriving during generation is preserved and answered separately after the move', async () => {
  const f = await fixture();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const calls = mock.method(genai.models, 'generateContent', async () => { started(); await gate; return answer(); });
  let turn;
  try {
    turn = f.service.runBotTurn(f.state.id);
    await entered;
    assert.equal(f.service.runBotTurn(f.state.id), null, 'reconnects cannot start duplicate turns');
    await f.service.addPlayerChat(f.state.id, f.state.uid, 'Good luck');
    release();
    const result = await turn;
    assert.equal(result?.pendingChat, true);
    assert.equal((await aiGameStore.getGame(f.state.id))!.chat.length, 1, 'choosing a move did not generate conversation');
    calls.mock.restore();
    const reply = mock.method(genai.models, 'generateContent', async () => ({ text: 'You too!' }));
    try {
      const message = await f.service.tryGeneratePendingChatReply(f.state.id);
      assert.equal(message?.text, 'You too!');
      const saved = (await aiGameStore.getGame(f.state.id))!;
      assert.deepEqual(saved.pendingPlayerChat, []);
      assert.deepEqual(saved.moves, ['e4', 'e5']);
    } finally { reply.mock.restore(); }
  } finally { release(); await turn; calls.mock.restore(); await f.close(); }
});

test('a deadline aborts the provider request rather than leaving background generation running', async () => {
  let signal: AbortSignal | undefined;
  const calls = mock.method(genai.models, 'generateContent', async (request: any) => {
    signal = request.config.abortSignal;
    return new Promise(() => {});
  });
  try {
    const chess = new Chess();
    await assert.rejects(chooseMoveTurn({ persona: getPersona('rook-rodriguez')!, fen: chess.fen(), movesSan: [], botColor: 'white', legalMoves: chess.moves(), recentDecisions: [] }, 20), /timed out/);
    assert.equal(signal?.aborted, true);
    assert.equal((calls.mock.calls[0].arguments[0] as any).config.httpOptions.timeout, 10000);
  } finally { calls.mock.restore(); }
});

test('review alternatives exclude illegal moves, duplicates and the move actually played', () => {
  const parsed = parseMoveDecision(JSON.stringify({ ...decision, move: 'e5', alternatives: [
    { move: 'e9', reason: 'Illegal' }, { move: 'e5', reason: 'Chosen' },
    { move: 'c5', reason: 'Sicilian' }, { move: 'c5', reason: 'Duplicate' },
  ] }), ['e5', 'c5']);
  assert.deepEqual(parsed.decision.alternatives, [{ move: 'c5', reason: 'Sicilian' }]);
  assert.throws(() => parseMoveDecision(JSON.stringify({ ...decision, move: 'e9' }), ['e5']));
  assert.throws(() => parseMoveDecision(JSON.stringify({ ...decision, move: 'e5', summary: '' }), ['e5']));
});

test('reading pauses vary with the position, and never add the former fixed six-second pause', () => {
  assert.equal(minimumAiTurnMs(new Chess(), 0, 0), 1200);
  assert.equal(minimumAiTurnMs(new Chess(), 0, 1), 1800);
  const check = new Chess('4k3/8/8/8/8/8/8/K3R3 b - - 0 1');
  assert.ok(check.isCheck());
  assert.ok(check.moves().length > 1);
  assert.ok(minimumAiTurnMs(check, 40, 0) >= 2000);
  const forced = new Chess('7k/8/5K2/8/8/8/8/7R b - - 0 1');
  assert.equal(forced.moves().length, 1);
  assert.equal(minimumAiTurnMs(forced, 50, 0), 600);
});
