import { Chess } from 'chess.js';
import type { PracticeMoveResult } from '@/types';

export async function evaluatePracticeMove(
  moves: string[],
  result: PracticeMoveResult,
  evaluate: (fen: string, depth: number, signal?: AbortSignal) => Promise<number>,
  signal?: AbortSignal,
): Promise<string> {
  // The displayed board has advanced. Rebuild the position at submission.
  const before = new Chess();
  for (const move of moves.slice(0, result.moveIndex)) before.move(move);
  const expected = new Chess(before.fen());
  expected.move(result.expectedMove);
  const submitted = new Chess(before.fen());
  try { submitted.move(result.submittedMove); }
  catch { return 'Illegal move'; }

  const expectedScore = await evaluate(expected.fen(), 10, signal);
  if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
  const submittedScore = await evaluate(submitted.fen(), 10, signal);
  const loss = before.turn() === 'w' ? expectedScore - submittedScore : submittedScore - expectedScore;
  if (loss >= 150) return `Blunder (-${(loss / 100).toFixed(2)})`;
  if (loss >= 50) return `Mistake (-${(loss / 100).toFixed(2)})`;
  if (loss >= 20) return `Inaccuracy (-${(loss / 100).toFixed(2)})`;
  return 'Playable alternative';
}
