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
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Move History
      </h3>

      <div className="max-h-48 overflow-y-auto">
        {movePairs.length === 0 ? (
          <div className="text-gray-400 text-sm italic">No moves yet</div>
        ) : (
          <div className="space-y-1 font-mono text-sm">
            {movePairs.map((pair) => (
              <div key={pair.number} className="flex gap-2">
                <span className="text-gray-400 w-6">{pair.number}.</span>
                <span className="w-12">{pair.white || '...'}</span>
                <span className="w-12">{pair.black || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last move result */}
      {lastMoveResult && (
        <div
          className={`mt-3 pt-3 border-t border-gray-200 text-sm ${
            lastMoveResult.isCorrect ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {lastMoveResult.isCorrect ? (
            <span>Correct! Expected: {lastMoveResult.expectedMove}</span>
          ) : (
            <span>
              Wrong! Got "{lastMoveResult.submittedMove || 'timeout'}", expected:{' '}
              {lastMoveResult.expectedMove}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
