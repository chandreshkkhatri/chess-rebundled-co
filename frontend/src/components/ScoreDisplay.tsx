'use client';

import { useGameStore } from '@/stores/gameStore';

export function ScoreDisplay() {
  const { players, myPlayerId, lastMoveResult } = useGameStore();

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const opponent = players.find((p) => p.id !== myPlayerId);

  if (!myPlayer || !opponent) return null;

  const formatScore = (score: number) => {
    return (score * 100).toFixed(1);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Score
      </h3>

      <div className="space-y-3">
        {/* My score */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                myPlayer.color === 'white' ? 'bg-white border border-gray-400' : 'bg-gray-800'
              }`}
            />
            <span className="font-medium">{myPlayer.name}</span>
            <span className="text-xs text-gray-500">(You)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600">
              {formatScore(myPlayer.score)}%
            </span>
            {lastMoveResult?.playerId === myPlayer.id && lastMoveResult.score > 0 && (
              <span className="text-green-500 text-sm font-medium animate-bounce">
                +{(lastMoveResult.score * 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200" />

        {/* Opponent score */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                opponent.color === 'white' ? 'bg-white border border-gray-400' : 'bg-gray-800'
              }`}
            />
            <span className="font-medium">{opponent.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-600">
              {formatScore(opponent.score)}%
            </span>
            {lastMoveResult?.playerId === opponent.id && lastMoveResult.score > 0 && (
              <span className="text-green-500 text-sm font-medium animate-bounce">
                +{(lastMoveResult.score * 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Move count */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          Moves completed: {myPlayer.moveScores.length + opponent.moveScores.length}
        </div>
      </div>
    </div>
  );
}
