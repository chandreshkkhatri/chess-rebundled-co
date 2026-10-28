const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource } = require('./helpers.cjs');

const { buildReplayPlies } = loadSource('src/components/PracticeReplay.tsx', {
  react: {}, 'react/jsx-runtime': {}, 'chess.js': { Chess }, './ChessBoard': {},
});

test('replay precomputes each position and the squares of every move', () => {
  const { startFen, plies } = buildReplayPlies(['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal(startFen, new Chess().fen());
  assert.deepEqual(JSON.parse(JSON.stringify(plies.map(ply => [ply.san, ply.from, ply.to]))), [
    ['e4', 'e2', 'e4'], ['e5', 'e7', 'e5'], ['Nf3', 'g1', 'f3'], ['Nc6', 'b8', 'c6'],
  ]);
  const expected = new Chess();
  for (const move of ['e4', 'e5', 'Nf3', 'Nc6']) expected.move(move);
  assert.equal(plies[3].fenAfter, expected.fen());
});

test('replay keeps the valid prefix when a stored move cannot be applied', () => {
  const { plies } = buildReplayPlies(['e4', 'e5', 'Ke3', 'Nf3']);
  assert.deepEqual([...plies.map(ply => ply.san)], ['e4', 'e5']);
});
