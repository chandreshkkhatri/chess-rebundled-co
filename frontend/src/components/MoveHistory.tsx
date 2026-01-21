'use client';

import { useGameStore } from '@/stores/gameStore';

export function MoveHistory() {
  const { selectedGame, moveIndex, lastMoveResult } = useGameStore();

  if (!selectedGame) return null;

  // Show moves up to current index
  const playedMoves = selectedGame.moves.slice(0, moveIndex);

  // Group moves into pairs (white, black)
  const movePairs: { number: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < playedMoves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: playedMoves[i],
      black: playedMoves[i + 1],
    });
  }

  return (
    <div className="bg-slate-800 rounded-lg p-2">
      <div className="text-xs text-slate-500 text-center mb-1 font-medium">MOVES</div>

      <div className="h-24 overflow-y-auto">
        {movePairs.length === 0 ? (
          <div className="text-slate-600 text-xs italic text-center py-2">No moves yet</div>
        ) : (
          <div className="font-mono text-xs text-slate-300 space-y-0.5">
            {movePairs.map((pair) => (
              <div key={pair.number} className="flex gap-1">
                <span className="text-slate-500 w-4">{pair.number}.</span>
                <span className="w-10">{pair.white || '...'}</span>
                <span className="w-10 text-slate-400">{pair.black || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last move result - compact */}
      {lastMoveResult && (
        <div
          className={`mt-1 pt-1 border-t border-slate-700 text-xs ${
            lastMoveResult.isCorrect ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {lastMoveResult.isCorrect ? (
            <span>✓ {lastMoveResult.expectedMove}</span>
          ) : (
            <span>
              ✗ {lastMoveResult.submittedMove || '?'} → {lastMoveResult.expectedMove}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
