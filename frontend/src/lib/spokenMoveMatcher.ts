// Matches speech-recognizer text against the legal moves of a position by sound.
//
// Every legal move is expanded into the ways a player might say it ("knight f3",
// "knight to foxtrot three", "e takes d5", "castle kingside"); the transcript is
// folded into the same sound tokens and scored against each form with a token
// edit distance whose substitution cost is the sound similarity of the tokens.
// With only a few dozen candidates this is instant, needs no network, and gives
// a confidence based on how far the best move is ahead of the runner-up.

export interface SpokenMatch {
  move: string; // legal SAN, or '' when nothing matched well enough
  confidence: number; // 0..1
  alternatives: string[]; // other plausible legal moves, best first
  transcript: string; // the recognizer guess the best move came from
  // True when another legal move extends the matched move's spoken form, so an
  // interim result that stops here may still be the start of a longer move.
  extendable: boolean;
}

// A transcript this confident is committed locally; below it, the server is asked.
export const CONFIDENT_MATCH = 0.9;

const FILE_SOUNDS: Record<string, string> = { a: 'ay', b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'ef', g: 'jee', h: 'aych' };
const RANK_SOUNDS: Record<string, string> = { 1: 'wun', 2: 'too', 3: 'three', 4: 'for', 5: 'five', 6: 'siks', 7: 'seven', 8: 'ayt' };
const PIECE_SOUNDS: Record<string, string> = { K: 'king', Q: 'kween', R: 'rook', B: 'bishup', N: 'nite' };

// Spoken words, as recognizers tend to transcribe them, folded to one sound token.
const WORD_SOUNDS: Record<string, string> = {
  a: 'ay', ay: 'ay', aye: 'ay', eh: 'ay', alpha: 'ay', alfa: 'ay', apple: 'ay', adam: 'ay', able: 'ay',
  b: 'bee', be: 'bee', bee: 'bee', bea: 'bee', bravo: 'bee', boy: 'bee', baker: 'bee',
  c: 'see', see: 'see', sea: 'see', cee: 'see', si: 'see', charlie: 'see', cat: 'see',
  d: 'dee', de: 'dee', dee: 'dee', the: 'dee', delta: 'dee', david: 'dee', dog: 'dee',
  e: 'ee', ee: 'ee', ea: 'ee', echo: 'ee', edward: 'ee', easy: 'ee',
  f: 'ef', ef: 'ef', eff: 'ef', if: 'ef', of: 'ef', off: 'ef', half: 'ef', foxtrot: 'ef', fox: 'ef', frank: 'ef',
  g: 'jee', gee: 'jee', jee: 'jee', ji: 'jee', golf: 'jee', george: 'jee',
  h: 'aych', aych: 'aych', each: 'aych', age: 'aych', ache: 'aych', itch: 'aych', hotel: 'aych', henry: 'aych', harry: 'aych',
  one: 'wun', won: 'wun', wan: 'wun',
  two: 'too', to: 'too', too: 'too', tu: 'too',
  three: 'three', tree: 'three', free: 'three',
  four: 'for', for: 'for', fore: 'for', fourth: 'for',
  five: 'five', fife: 'five',
  six: 'siks', sicks: 'siks', sex: 'siks',
  seven: 'seven',
  eight: 'ayt', ate: 'ayt', hate: 'ayt', aid: 'ayt',
  king: 'king',
  queen: 'kween', clean: 'kween', green: 'kween',
  rook: 'rook', rock: 'rook', brook: 'rook', brooke: 'rook', ruck: 'rook',
  bishop: 'bishup', bishops: 'bishup',
  knight: 'nite', night: 'nite', nite: 'nite', knights: 'nite', nights: 'nite', horse: 'nite',
  pawn: 'pawn', pawns: 'pawn', pond: 'pawn', upon: 'pawn', pon: 'pawn',
  takes: 'takes', take: 'takes', took: 'takes', taxes: 'takes', captures: 'takes', capture: 'takes', x: 'takes', by: 'takes', times: 'takes',
  castle: 'castle', castles: 'castle', castling: 'castle', cassel: 'castle',
  short: 'short', long: 'long', side: 'side',
};

// Words that carry no move information and are dropped from the transcript.
const FILLER = new Set([
  'move', 'moves', 'go', 'goes', 'on', 'at', 'and', 'um', 'uh', 'please', 'piece', 'from', 'up', 'ok', 'okay',
  'check', 'checkmate', 'mate', 'promote', 'promotes', 'promoting', 'promotion', 'equals', 'equal', 'into', 'with', 'my',
]);

// Words that say a file letter unambiguously, so a sound-alike runner-up is not a concern.
const EXPLICIT_FILE_WORDS = new Set([
  'alpha', 'alfa', 'apple', 'adam', 'able', 'bravo', 'boy', 'baker', 'charlie', 'cat', 'delta', 'david', 'dog',
  'echo', 'edward', 'easy', 'foxtrot', 'fox', 'frank', 'golf', 'george', 'hotel', 'henry', 'harry',
]);

interface Token {
  sound: string;
  explicit: boolean;
}

// Crude phonetic fold for words not in the table, so "nite"-like spellings still score.
function fold(word: string): string {
  return word
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/gh/g, '')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's')
    .replace(/(.)\1+/g, '$1').replace(/e$/, '');
}

/** Folds recognizer text into sound tokens. */
export function tokenizeTranscript(transcript: string): Token[] {
  const tokens: Token[] = [];
  const words = transcript.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  for (const word of words) {
    const square = word.match(/^([a-h])([1-8])$/);
    if (square) {
      tokens.push({ sound: FILE_SOUNDS[square[1]], explicit: false }, { sound: RANK_SOUNDS[square[2]], explicit: false });
      continue;
    }
    const pieceSquare = word.match(/^([kqrbn])([a-h])([1-8])$/);
    if (pieceSquare) {
      tokens.push(
        { sound: PIECE_SOUNDS[pieceSquare[1].toUpperCase()], explicit: false },
        { sound: FILE_SOUNDS[pieceSquare[2]], explicit: false },
        { sound: RANK_SOUNDS[pieceSquare[3]], explicit: false },
      );
      continue;
    }
    if (word === 'kingside' || word === 'queenside') {
      tokens.push({ sound: word === 'kingside' ? 'king' : 'kween', explicit: false }, { sound: 'side', explicit: false });
      continue;
    }
    if (word === 'oo' || word === 'o0') { tokens.push({ sound: 'castle', explicit: false }); continue; }
    if (FILLER.has(word)) continue;
    if (RANK_SOUNDS[word]) { tokens.push({ sound: RANK_SOUNDS[word], explicit: false }); continue; }
    const known = WORD_SOUNDS[word];
    tokens.push({ sound: known ?? fold(word), explicit: EXPLICIT_FILE_WORDS.has(word) });
  }
  return tokens;
}

interface ParsedSan {
  piece: string; // '' for pawn
  fromFile: string;
  fromRank: string;
  capture: boolean;
  file: string;
  rank: string;
  promotion: string;
}

function parseSan(san: string): ParsedSan | null {
  const m = san.replace(/[+#]/g, '').match(/^([KQRBN]?)([a-h]?)([1-8]?)(x?)([a-h])([1-8])(?:=([QRBN]))?$/);
  if (!m) return null;
  return { piece: m[1], fromFile: m[2], fromRank: m[3], capture: m[4] === 'x', file: m[5], rank: m[6], promotion: m[7] ?? '' };
}

/** The sound-token sequences a player might use for one legal move; the first is the plainest. */
export function spokenFormsOf(san: string): string[][] {
  const clean = san.replace(/[+#]/g, '');
  if (clean === 'O-O') {
    return [['castle', 'king', 'side'], ['castle', 'short'], ['castle'], ['king', 'side', 'castle'], ['short', 'castle']];
  }
  if (clean === 'O-O-O') {
    return [['castle', 'kween', 'side'], ['castle', 'long'], ['castle'], ['kween', 'side', 'castle'], ['long', 'castle']];
  }
  const parsed = parseSan(clean);
  if (!parsed) return [];
  const piece = parsed.piece ? [PIECE_SOUNDS[parsed.piece]] : [];
  const from = [parsed.fromFile && FILE_SOUNDS[parsed.fromFile], parsed.fromRank && RANK_SOUNDS[parsed.fromRank]].filter(Boolean) as string[];
  const target = [FILE_SOUNDS[parsed.file], RANK_SOUNDS[parsed.rank]];
  const promotion = parsed.promotion ? [PIECE_SOUNDS[parsed.promotion]] : [];
  const capture = parsed.capture ? ['takes'] : [];
  const forms: string[][] = [];
  const push = (form: string[]) => { if (!forms.some(f => f.join(' ') === form.join(' '))) forms.push(form); };
  // Pawn moves are usually just the square; "pawn" is optional, and so is "to".
  const heads = parsed.piece ? [piece] : [[], ['pawn']];
  for (const head of heads) {
    push([...head, ...from, ...capture, ...target, ...promotion]);
    if (!parsed.capture) push([...head, ...from, 'too', ...target, ...promotion]);
    // "a8 promotes to queen": the piece comes after "to".
    if (parsed.promotion) push([...head, ...from, ...capture, ...target, 'too', ...promotion]);
    // "pawn takes e5" without naming the file the pawn comes from.
    if (parsed.capture && !parsed.piece) push(['pawn', 'takes', ...target, ...promotion]);
  }
  return forms;
}

function charDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1, cols = b.length + 1;
  const dist = new Array<number>(rows * cols);
  for (let i = 0; i < rows; i++) dist[i * cols] = i;
  for (let j = 0; j < cols; j++) dist[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i * cols + j] = Math.min(dist[(i - 1) * cols + j] + 1, dist[i * cols + j - 1] + 1, dist[(i - 1) * cols + j - 1] + cost);
    }
  }
  return dist[rows * cols - 1];
}

const KNOWN_SOUNDS = new Set([
  ...Object.values(FILE_SOUNDS), ...Object.values(RANK_SOUNDS), ...Object.values(PIECE_SOUNDS),
  'pawn', 'takes', 'castle', 'short', 'long', 'side',
]);
// Vocabulary pairs a recognizer plausibly swaps; any other two known words are distinct.
const CONFUSABLE: Record<string, number> = {
  'bee|dee': 1 / 3, 'bee|ee': 1 / 3, 'bee|see': 1 / 3, 'bee|jee': 1 / 3, 'dee|ee': 1 / 3, 'dee|see': 1 / 3, 'dee|jee': 1 / 3,
  'ee|see': 1 / 3, 'ee|jee': 1 / 3, 'jee|see': 1 / 3, 'ay|ayt': 0.5, 'ay|aych': 0.5, 'ef|siks': 0.5, 'five|for': 0.5,
};

const soundCache = new Map<string, number>();
// 0 for identical sounds, 1 for completely different ones. Words outside the
// vocabulary are compared by spelling against the sound they might have been.
function soundCost(a: string, b: string): number {
  if (a === b) return 0;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (KNOWN_SOUNDS.has(a) && KNOWN_SOUNDS.has(b)) return CONFUSABLE[key] ?? 1;
  let cost = soundCache.get(key);
  if (cost === undefined) {
    cost = charDistance(a, b) / Math.max(a.length, b.length);
    soundCache.set(key, cost);
  }
  return cost;
}

const EXTRA_WORD_COST = 0.6; // a transcript word the form does not need (noise)
const MISSING_WORD_COST = 1; // a form word the transcript lacks (incomplete move)

// Edit cost between the transcript tokens and one spoken form. An explicit word
// ("delta") only matches its own letter; a sound-alike ("dee") partially matches "bee".
function formCost(spoken: Token[], form: string[]): number {
  const rows = spoken.length + 1, cols = form.length + 1;
  const dist = new Array<number>(rows * cols);
  for (let i = 0; i < rows; i++) dist[i * cols] = i * EXTRA_WORD_COST;
  for (let j = 0; j < cols; j++) dist[j] = j * MISSING_WORD_COST;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const token = spoken[i - 1];
      const substitution = token.explicit && token.sound !== form[j - 1] ? 1 : soundCost(token.sound, form[j - 1]);
      dist[i * cols + j] = Math.min(
        dist[(i - 1) * cols + j] + EXTRA_WORD_COST,
        dist[i * cols + j - 1] + MISSING_WORD_COST,
        dist[(i - 1) * cols + j - 1] + substitution,
      );
    }
  }
  return dist[rows * cols - 1];
}

interface Candidate {
  move: string;
  forms: string[][];
  cost: number; // best edit cost over the move's forms and the recognizer's guesses
  score: number; // cost normalized to 0..1 by form length, for ranking
  transcriptIndex: number;
}

// Later recognizer guesses are less likely, so a match through them costs a little more.
const GUESS_PENALTY = [0, 0.1, 0.2, 0.2, 0.2];

// The b/d files are the one pair recognizers confuse so often that a legal twin
// should still be offered unless the player said the letter explicitly ("delta").
function isBdTwin(best: Candidate, other: Candidate, spoken: Token[]): boolean {
  const a = best.forms[0], b = other.forms[0];
  if (a.length !== b.length) return false;
  let index = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (index !== -1) return false;
    index = i;
  }
  if (index === -1 || !['bee', 'dee'].includes(a[index]) || !['bee', 'dee'].includes(b[index])) return false;
  const heard = spoken.find(token => token.sound === a[index]);
  return !heard?.explicit;
}

function isPrefix(prefix: string[], form: string[]): boolean {
  return form.length > prefix.length && prefix.every((token, i) => token === form[i]);
}

/**
 * Picks the legal move that sounds most like what the recognizer heard.
 * `transcripts` are the recognizer's guesses, most likely first.
 */
export function matchSpokenMove(transcripts: string[], legalMoves: string[]): SpokenMatch {
  const empty: SpokenMatch = { move: '', confidence: 0, alternatives: [], transcript: transcripts[0] ?? '', extendable: false };
  const guesses = transcripts.map(t => t.trim()).filter(Boolean).slice(0, GUESS_PENALTY.length);
  if (!guesses.length || !legalMoves.length) return empty;
  const spokenByGuess = guesses.map(tokenizeTranscript);
  if (spokenByGuess.every(tokens => tokens.length === 0)) return empty;

  const candidates: Candidate[] = [];
  for (const move of legalMoves) {
    const forms = spokenFormsOf(move);
    if (!forms.length) continue;
    let cost = Infinity, score = 0, transcriptIndex = 0;
    spokenByGuess.forEach((spoken, g) => {
      if (!spoken.length) return;
      for (const form of forms) {
        const formCostHere = formCost(spoken, form) + GUESS_PENALTY[g];
        const scoreHere = Math.max(0, 1 - formCostHere / form.length);
        if (scoreHere > score) { score = scoreHere; cost = formCostHere; transcriptIndex = g; }
      }
    });
    candidates.push({ move, forms, cost, score, transcriptIndex });
  }
  candidates.sort((a, b) => b.score - a.score);
  const [best, next] = candidates;
  if (!best || best.score < 0.45) return empty;

  // Confidence: how good the match is, scaled by how clearly it beats the runner-up.
  // One sound-alike letter apart (cost 1/3) is enough to be sure; a tie halves it.
  const margin = next ? Math.max(0, next.cost - best.cost) : 1;
  let confidence = best.score * Math.min(1, 0.5 + margin * 1.5);
  const alternatives = candidates.slice(1, 4).filter(c => c.score >= best.score - 0.35 && c.score >= 0.45).map(c => c.move);
  const twin = candidates.slice(1).find(c => c.score >= 0.45 && isBdTwin(best, c, spokenByGuess[best.transcriptIndex]));
  if (twin) {
    confidence = Math.min(confidence, 0.75);
    alternatives.splice(0, alternatives.length, twin.move, ...alternatives.filter(move => move !== twin.move));
  }
  const extendable = candidates.some(c => c !== best && c.forms.some(form => isPrefix(best.forms[0], form)));
  return {
    move: best.move,
    confidence: Math.round(confidence * 100) / 100,
    alternatives,
    transcript: guesses[best.transcriptIndex],
    extendable,
  };
}
