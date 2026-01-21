'use client';

import { useTimer } from '@/hooks/useTimer';
import { useGameStore } from '@/stores/gameStore';

interface TimerDisplayProps {
  onTimeUp?: () => void;
}

export function TimerDisplay({ onTimeUp }: TimerDisplayProps) {
  const { myColor } = useGameStore();
  const {
    myTimeFormatted,
    opponentTimeFormatted,
    myPercentage,
    opponentPercentage,
    isMyTurn,
    isWarning,
    isCritical,
  } = useTimer({
    onTimeUp,
    warningThreshold: 30000,
  });

  const getMyColorClasses = () => {
    if (!isMyTurn) return 'bg-slate-700 text-slate-400';
    if (isCritical) return 'bg-red-500 text-white';
    if (isWarning) return 'bg-yellow-500 text-black';
    return 'bg-green-600 text-white';
  };

  const getOpponentColorClasses = () => {
    if (isMyTurn) return 'bg-slate-700 text-slate-400';
    return 'bg-blue-600 text-white';
  };

  return (
    <div className="bg-slate-800 rounded-lg p-2 h-full">
      <div className="text-xs text-slate-500 text-center mb-1 font-medium">TIME</div>

      {/* Opponent timer */}
      <div className={`rounded px-2 py-1.5 mb-1 ${getOpponentColorClasses()}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs">{myColor === 'white' ? 'B' : 'W'}</span>
          <span className={`text-lg font-mono font-bold ${!isMyTurn ? 'animate-pulse' : ''}`}>
            {opponentTimeFormatted}
          </span>
        </div>
        <div className="h-1 bg-black/20 rounded-full mt-1">
          <div
            className="h-full bg-white/30 rounded-full transition-all"
            style={{ width: `${opponentPercentage}%` }}
          />
        </div>
      </div>

      {/* My timer */}
      <div className={`rounded px-2 py-1.5 ${getMyColorClasses()}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs">{myColor === 'white' ? 'W' : 'B'}</span>
          <span className={`text-lg font-mono font-bold ${isCritical && isMyTurn ? 'animate-pulse' : ''}`}>
            {myTimeFormatted}
          </span>
        </div>
        <div className="h-1 bg-black/20 rounded-full mt-1">
          <div
            className="h-full bg-white/30 rounded-full transition-all"
            style={{ width: `${myPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
