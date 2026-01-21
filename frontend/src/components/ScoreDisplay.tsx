'use client';

import { useGameStore } from '@/stores/gameStore';

export function ScoreDisplay() {
  const { players, myPlayerId, lastMoveResult } = useGameStore();

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const opponent = players.find((p) => p.id !== myPlayerId);

  if (!myPlayer || !opponent) return null;

  const formatScore = (score: number) => {
    return (score * 100).toFixed(0);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-2 h-full">
      <div className="text-xs text-slate-500 text-center mb-1 font-medium">SCORE</div>

      {/* My score */}
      <div className="bg-slate-700 rounded px-2 py-1.5 mb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                myPlayer.color === 'white' ? 'bg-white' : 'bg-slate-400'
              }`}
            />
            <span className="text-xs text-slate-300 truncate max-w-[60px]">{myPlayer.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-green-400 font-mono">
              {formatScore(myPlayer.score)}
            </span>
            {lastMoveResult?.playerId === myPlayer.id && lastMoveResult.score > 0 && (
              <span className="text-green-400 text-xs animate-bounce">
                +{(lastMoveResult.score * 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Opponent score */}
      <div className="bg-slate-700 rounded px-2 py-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                opponent.color === 'white' ? 'bg-white' : 'bg-slate-400'
              }`}
            />
            <span className="text-xs text-slate-400 truncate max-w-[60px]">{opponent.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-slate-300 font-mono">
              {formatScore(opponent.score)}
            </span>
            {lastMoveResult?.playerId === opponent.id && lastMoveResult.score > 0 && (
              <span className="text-green-400 text-xs animate-bounce">
                +{(lastMoveResult.score * 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
