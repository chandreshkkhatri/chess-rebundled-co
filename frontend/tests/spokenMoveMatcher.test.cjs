const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource } = require('./helpers.cjs');

const { matchSpokenMove, spokenFormsOf, CONFIDENT_MATCH } = loadSource('src/lib/spokenMoveMatcher.ts');

const START = new Chess().fen();
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
// White can castle both ways, capture on e5 with the d-pawn or the knight, and push b5 or d5.
const MIDDLEGAME = '1k1r3r/ppp2ppp/8/4p3/1P1P4/5N2/P1P2PPP/R3K2R w KQ - 0 1';
const PROMOTION = '8/P7/8/8/8/8/8/k6K w - - 0 1';
const TWO_KNIGHTS = '4k3/8/8/8/8/8/1N3N2/4K3 w - - 0 1';
const FOOLS_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';

const legal = fen => new Chess(fen).moves();
const match = (transcripts, fen) => matchSpokenMove([transcripts].flat(), legal(fen));

// Offline corpus: what recognizers produce for spoken moves, and the move meant.
const CONFIDENT = [
  ['e4', START, 'e4'], ['E4', START, 'e4'], ['e 4', START, 'e4'], ['e for', START, 'e4'], ['echo four', START, 'e4'],
  ['knight f3', START, 'Nf3'], ['Nf3', START, 'Nf3'], ['knight f 3', START, 'Nf3'], ['knight to f three', START, 'Nf3'],
  ['night of three', START, 'Nf3'], ['night if 3', START, 'Nf3'],
  ['bravo four', START, 'b4'], ['see four', START, 'c4'], ['g3', START, 'g3'], ['gee three', START, 'g3'],
  ['age 4', START, 'h4'], ['a4', START, 'a4'],
  ['castle kingside', MIDDLEGAME, 'O-O'], ['castles short', MIDDLEGAME, 'O-O'], ['long castle', MIDDLEGAME, 'O-O-O'],
  ['queen side castle', MIDDLEGAME, 'O-O-O'], ['d takes e5', MIDDLEGAME, 'dxe5'], ['pawn takes e5', MIDDLEGAME, 'dxe5'],
  ['knight takes e5', MIDDLEGAME, 'Nxe5'], ['night takes e5', MIDDLEGAME, 'Nxe5'], ['rook to delta one', MIDDLEGAME, 'Rd1'],
  ['a8 queen', PROMOTION, 'a8=Q+'], ['a8 promotes to queen', PROMOTION, 'a8=Q+'], ['a8 equals knight', PROMOTION, 'a8=N'],
  ['knight b d3', TWO_KNIGHTS, 'Nbd3'], ['knight bravo delta three', TWO_KNIGHTS, 'Nbd3'], ['knight f d1', TWO_KNIGHTS, 'Nfd1'],
  ['queen h4 mate', FOOLS_MATE, 'Qh4#'], ['king e2', AFTER_E4_E5, 'Ke2'], ['bishop c4', AFTER_E4_E5, 'Bc4'],
  ['bishop see four', AFTER_E4_E5, 'Bc4'],
];

test('common ways of saying a move match the legal move confidently', () => {
  for (const [transcript, fen, expected] of CONFIDENT) {
    const result = match(transcript, fen);
    assert.equal(result.move, expected, `"${transcript}" → ${result.move}`);
    assert.ok(result.confidence >= CONFIDENT_MATCH, `"${transcript}" confidence ${result.confidence}`);
    assert.equal(result.extendable, false);
  }
});

test('a later recognizer guess rescues a transcript whose first guess parses badly', () => {
  const single = match('nine of three', START);
  const rescued = match(['nine of three', 'knight f3'], START);
  assert.equal(rescued.move, 'Nf3');
  assert.equal(rescued.transcript, 'knight f3');
  assert.ok(rescued.confidence > single.confidence);
});

test('b and d stay ambiguous unless the letter was said explicitly', () => {
  for (const [transcript, fen, expected, other] of [
    ['bee four', START, 'b4', 'd4'], ['the four', START, 'd4', 'b4'], ['d4', START, 'd4', 'b4'],
    ['b5', MIDDLEGAME, 'b5', 'd5'], ['rook d1', MIDDLEGAME, 'Rd1', 'Rb1'],
  ]) {
    const result = match(transcript, fen);
    assert.equal(result.move, expected, transcript);
    assert.equal(result.confidence, 0.75, transcript);
    assert.equal(result.alternatives[0], other, transcript);
  }
  // No sound-alike runner-up: d4 is confident when b4 is not legal.
  const noB4 = new Chess(START); noB4.remove('b2');
  assert.ok(matchSpokenMove(['d4'], noB4.moves()).confidence >= CONFIDENT_MATCH);
});

test('incomplete or unclear speech is never confident', () => {
  for (const [transcript, fen] of [
    ['castle', MIDDLEGAME], ['a8', PROMOTION], ['knight d3', TWO_KNIGHTS], ['knight', START], ['e', START], ['eat 4', START],
  ]) {
    const result = match(transcript, fen);
    assert.ok(result.confidence < CONFIDENT_MATCH, `"${transcript}" confidence ${result.confidence}`);
  }
  for (const transcript of ['hello world', 'umm', '', '   ']) {
    assert.deepEqual(JSON.parse(JSON.stringify({ ...match(transcript, START), transcript: '' })), { move: '', confidence: 0, alternatives: [], transcript: '', extendable: false });
  }
  assert.equal(matchSpokenMove(['e4'], []).move, '');
});

test('a spoken form that begins another legal move is flagged as extendable', () => {
  // "castle" alone is also how the longer "castle queen side" starts.
  const forms = spokenFormsOf('O-O');
  assert.equal(forms[0].join(' '), 'castle king side');
  assert.ok(forms.some(form => form.join(' ') === 'castle'));
  const result = matchSpokenMove(['castle king'], ['O-O', 'O-O-O', 'Kf1']);
  assert.equal(result.move, 'O-O');
  assert.ok(result.confidence < CONFIDENT_MATCH);
});

test('spoken forms cover piece, capture, disambiguation, promotion and castling notation', () => {
  const first = san => spokenFormsOf(san)[0]?.join(' ');
  assert.equal(first('Nbd2'), 'nite bee dee too');
  assert.equal(first('exd5'), 'ee takes dee five');
  assert.equal(first('e8=Q+'), 'ee ayt kween');
  assert.equal(first('R1a3'), 'rook wun ay three');
  assert.equal(first('O-O-O'), 'castle kween side');
  assert.equal(spokenFormsOf('not a move').length, 0);
});
