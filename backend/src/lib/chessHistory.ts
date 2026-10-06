import { Chess } from 'chess.js';

/** Rebuild from SAN so repetition detection retains every prior position. */
export function chessFromHistory(moves: readonly string[]): Chess {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return chess;
}
