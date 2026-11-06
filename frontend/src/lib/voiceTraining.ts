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
  runId: string;
  exerciseId: string;
  engine: TrainingEngine;
  phase: 'diagnostic' | 'practice';
  heard: string;
  parsedMove: string;
  confidence: number;
  latencyMs: number;
  timestamp: number;
}
export interface TrainingParse {
  move: string;
  confidence: number;
  alternatives: string[];
  transcription: string;
  reasoning?: string;
}
export const cleanTrainingMove = (move: string) => move.replace(/[+#]/g, '');
export function trainingOutcome(attempt: Pick<TrainingAttempt, 'parsedMove'>, exercise: TrainingExercise) {
  return !attempt.parsedMove ? 'no-move' : cleanTrainingMove(attempt.parsedMove) === cleanTrainingMove(exercise.move) ? 'correct' : 'wrong';
}

/** A retry cannot inflate a diagnostic's first-pass score. */
export function trainingSummary(attempts: TrainingAttempt[], exercises: TrainingExercise[], engine: TrainingEngine) {
  const selected = attempts.filter(attempt => attempt.engine === engine);
  const lastDiagnostic = selected.filter(attempt => attempt.phase === 'diagnostic').at(-1)?.runId;
  const diagnostic = selected.filter(attempt => attempt.phase === 'diagnostic' && attempt.runId === lastDiagnostic);
  const first = new Map<string, TrainingAttempt>();
  diagnostic.forEach(attempt => { if (!first.has(attempt.exerciseId)) first.set(attempt.exerciseId, attempt); });
  const categories = [...new Map(exercises.map(ex => [ex.category, ex.categoryLabel])).entries()];
  return categories.map(([category, label]) => {
    const catalog = exercises.filter(ex => ex.category === category);
    const rows = [...first.values()].filter(row => catalog.some(ex => ex.id === row.exerciseId));
    const practice = selected.filter(row => row.phase === 'practice' && catalog.some(ex => ex.id === row.exerciseId));
    const correct = rows.filter(row => trainingOutcome(row, catalog.find(ex => ex.id === row.exerciseId)!) === 'correct').length;
    return { category, label, total: rows.length, expected: catalog.length, correct,
      wrong: rows.filter(row => trainingOutcome(row, catalog.find(ex => ex.id === row.exerciseId)!) === 'wrong').length,
      noMove: rows.filter(row => !row.parsedMove).length,
      retries: diagnostic.filter(row => catalog.some(ex => ex.id === row.exerciseId)).length - rows.length,
      averageLatencyMs: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length) : 0,
      practiceTotal: practice.length,
      practiceCorrect: practice.filter(row => trainingOutcome(row, catalog.find(ex => ex.id === row.exerciseId)!) === 'correct').length,
      weak: rows.length < catalog.length || correct / rows.length < 0.8,
    };
  });
}

export function trainingPlan(exercises: TrainingExercise[], attempts: TrainingAttempt[], engine: TrainingEngine, mode: 'diagnostic' | 'practice') {
  const weak = new Set(trainingSummary(attempts, exercises, engine).filter(row => row.weak).map(row => row.category));
  return exercises.filter(ex => mode === 'diagnostic' || weak.has(ex.category)).map(exercise => ({
    exercise, phrase: exercise.phrases[mode === 'practice' ? 1 : 0] ?? exercise.phrases[0],
  }));
}
