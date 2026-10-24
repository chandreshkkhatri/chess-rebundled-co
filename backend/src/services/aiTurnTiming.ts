import type { Chess } from "chess.js";

/** A small reading pause; real model latency counts toward this minimum. */
export function minimumAiTurnMs(chess: Chess, ply: number, jitter = Math.random()): number {
  const legal = chess.moves({ verbose: true });
  const variation = Math.max(0, Math.min(1, jitter));
  if (legal.length <= 1) return 600 + variation * 300;
  if (chess.isCheck()) return 2000 + variation * 1200;
  if (ply < 8) return 1200 + variation * 600;
  const tactical = legal.filter(move => move.captured || move.san.includes("+")).length;
  return 1800 + Math.min(tactical, 6) * 150 + variation * 800;
}
