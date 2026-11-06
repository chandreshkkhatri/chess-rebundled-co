import { Chess } from 'chess.js';

export type TrainingEngine = 'browser' | 'gemini';
export interface TrainingExercise {
  id: string;
  category: string;
  categoryLabel: string;
  fen: string;
  move: string;
  target: string;
  phrases: string[];
}
export interface TrainingAttempt {
  id: string;
  exerciseId: string;
  runId: string;
  engine: TrainingEngine;
  phase: 'diagnostic' | 'practice';
  heard: string;
  parsedMove: string;
  confidence: number;
  latencyMs: number;
  timestamp: number;
}
const position = (...moves: string[]) => {
  const chess = new Chess();
  moves.forEach(move => chess.move(move));
  return chess.fen();
};
const castle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
export const TRAINING_EXERCISES: TrainingExercise[] = [
  { id: 'pawn-d4', category: 'coordinates', categoryLabel: 'Pawns & coordinates', fen: position(), move: 'd4', target: 'd4', phrases: ['d four', 'delta four'] },
  { id: 'pawn-e4', category: 'coordinates', categoryLabel: 'Pawns & coordinates', fen: position(), move: 'e4', target: 'e4', phrases: ['e two to e four', 'echo four'] },
  ...(['b', 'c', 'g', 'h'] as const).map((file, index) => ({
    id: `pawn-${file}4`, category: 'coordinates', categoryLabel: 'Pawns & coordinates', fen: position(),
    move: `${file}4`, target: `${file}4`, phrases: [`${file} four`, `${['bravo', 'charlie', 'golf', 'hotel'][index]} four`],
  })),
  { id: 'knight-f3', category: 'pieces', categoryLabel: 'Piece moves', fen: position(), move: 'Nf3', target: 'knight f3', phrases: ['knight f three', 'knight foxtrot three'] },
  { id: 'bishop-c4', category: 'pieces', categoryLabel: 'Piece moves', fen: position('e4', 'e5'), move: 'Bc4', target: 'bishop c4', phrases: ['bishop c four', 'bishop charlie four'] },
  { id: 'rook-a3', category: 'pieces', categoryLabel: 'Piece moves', fen: '4k3/8/8/8/8/8/8/R5K1 w - - 0 1', move: 'Ra3', target: 'rook a3', phrases: ['rook a three', 'rook alpha three'] },
  { id: 'queen-c2', category: 'pieces', categoryLabel: 'Piece moves', fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', move: 'Qc2', target: 'queen c2', phrases: ['queen c two', 'queen charlie two'] },
  { id: 'king-g2', category: 'pieces', categoryLabel: 'Piece moves', fen: '4k3/8/8/8/8/8/8/5K2 w - - 0 1', move: 'Kg2', target: 'king g2', phrases: ['king g two', 'king golf two'] },
  { id: 'pawn-capture', category: 'captures', categoryLabel: 'Captures', fen: position('e4', 'd5'), move: 'exd5', target: 'e takes d5', phrases: ['e takes d five', 'echo takes delta five'] },
  { id: 'knight-capture', category: 'captures', categoryLabel: 'Captures', fen: '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', move: 'Nxe5', target: 'knight takes e5', phrases: ['knight takes e five', 'knight takes echo five'] },
  { id: 'en-passant', category: 'captures', categoryLabel: 'Captures', fen: position('e4', 'a6', 'e5', 'd5'), move: 'exd6', target: 'e takes d6', phrases: ['e takes d six', 'echo takes delta six'] },
  { id: 'castle-short', category: 'castling', categoryLabel: 'Castling', fen: castle, move: 'O-O', target: 'castle kingside', phrases: ['castle king side', 'short castle'] },
  { id: 'castle-long', category: 'castling', categoryLabel: 'Castling', fen: castle, move: 'O-O-O', target: 'castle queenside', phrases: ['castle queen side', 'long castle'] },
  { id: 'rook-origin', category: 'disambiguation', categoryLabel: 'Which piece?', fen: '4k3/8/8/8/8/8/8/R4RK1 w - - 0 1', move: 'Rae1+', target: 'rook a e1', phrases: ['rook a to e one', 'rook alpha to echo one'] },
  { id: 'knight-origin', category: 'disambiguation', categoryLabel: 'Which piece?', fen: '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', move: 'Nbd2', target: 'knight b d2', phrases: ['knight b to d two', 'knight bravo to delta two'] },
  { id: 'promotion-queen', category: 'promotions', categoryLabel: 'Promotions', fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', move: 'a8=Q+', target: 'a8 promotes to queen', phrases: ['a eight promotes to queen', 'alpha eight equals queen'] },
  { id: 'promotion-knight', category: 'promotions', categoryLabel: 'Promotions', fen: '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1', move: 'axb8=N', target: 'a takes b8 promotes to knight', phrases: ['a takes b eight promotes to knight', 'alpha takes bravo eight equals knight'] },
  { id: 'queen-check', category: 'check', categoryLabel: 'Check & mate', fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', move: 'Qh5+', target: 'queen h5 check', phrases: ['queen h five check', 'queen hotel five'] },
  { id: 'queen-mate', category: 'check', categoryLabel: 'Check & mate', fen: position('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'), move: 'Qxf7#', target: 'queen takes f7 checkmate', phrases: ['queen takes f seven checkmate', 'queen takes foxtrot seven'] },
];
export const cleanMove = (move: string) => move.replace(/[+#]/g, '');

/** Validate client observations; expected moves always come from our catalog. */
export function validateTrainingAttempts(value: unknown): TrainingAttempt[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 100) return null;
  const ids = new Set<string>();
  const result: TrainingAttempt[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const attempt = item as TrainingAttempt;
    const exercise = TRAINING_EXERCISES.find(ex => ex.id === attempt.exerciseId);
    if (!exercise || typeof attempt.id !== 'string' || !/^[\w-]{1,80}$/.test(attempt.id) || ids.has(attempt.id) ||
      typeof attempt.runId !== 'string' || !/^[\w-]{1,80}$/.test(attempt.runId) ||
      !['browser', 'gemini'].includes(attempt.engine) || !['diagnostic', 'practice'].includes(attempt.phase) ||
      typeof attempt.heard !== 'string' || attempt.heard.length > 500 ||
      typeof attempt.parsedMove !== 'string' || attempt.parsedMove.length > 20 ||
      !Number.isFinite(attempt.confidence) || attempt.confidence < 0 || attempt.confidence > 1 ||
      !Number.isFinite(attempt.latencyMs) || attempt.latencyMs < 0 || attempt.latencyMs > 120_000 ||
      !Number.isFinite(attempt.timestamp) || attempt.timestamp < 0 || attempt.timestamp > Date.now() + 300_000) return null;
    if (attempt.parsedMove && !new Chess(exercise.fen).moves().some(move => cleanMove(move) === cleanMove(attempt.parsedMove))) return null;
    ids.add(attempt.id);
    result.push({ id: attempt.id, runId: attempt.runId, exerciseId: exercise.id, engine: attempt.engine, phase: attempt.phase,
      heard: attempt.heard.trim(), parsedMove: attempt.parsedMove, confidence: attempt.confidence,
      latencyMs: Math.round(attempt.latencyMs), timestamp: attempt.timestamp });
  }
  return result;
}

const normalized = (text: string) => text.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();

/** Only repeated, user-confirmed mistakes within one engine become hints. */
export function learnTrainingPatterns(attempts: TrainingAttempt[], engine: TrainingEngine, previous: Record<string, string[]> = {}): Record<string, string[]> {
  const counts = new Map<string, { target: string; heard: string; count: number }>();
  const targetsBySound = new Map<string, Set<string>>();
  for (const attempt of attempts.filter(item => item.engine === engine)) {
    const ex = TRAINING_EXERCISES.find(item => item.id === attempt.exerciseId);
    const heard = normalized(attempt.heard);
    if (!ex || !heard) continue;
    const targets = targetsBySound.get(heard) ?? new Set<string>();
    targets.add(ex.target); targetsBySound.set(heard, targets);
    if (cleanMove(attempt.parsedMove) === cleanMove(ex.move) || heard === normalized(ex.target)) continue;
    const key = JSON.stringify([ex.target, heard]);
    const item = counts.get(key) ?? { target: ex.target, heard, count: 0 };
    item.count++; counts.set(key, item);
  }
  const map: Record<string, string[]> = {};
  for (const [target, values] of Object.entries(previous)) {
    const retained = values.filter(value => {
      const targets = targetsBySound.get(normalized(value));
      return !targets || (targets.size === 1 && targets.has(target));
    });
    if (retained.length) map[target] = retained.slice(0, 10);
  }
  for (const { target, heard, count } of counts.values()) {
    if (count < 2 || targetsBySound.get(heard)?.size !== 1) continue;
    map[target] = [...new Set([...(map[target] ?? []), heard])].slice(0, 10);
  }
  return map;
}
