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
    warningThreshold: 30000, // 30 seconds warning for 3-min timer
  });

  const getMyColorClasses = () => {
    if (!isMyTurn) return 'bg-slate-600 text-slate-300';
    if (isCritical) return 'bg-red-500 text-white';
    if (isWarning) return 'bg-yellow-500 text-black';
    return 'bg-green-500 text-white';
  };

  const getOpponentColorClasses = () => {
    if (isMyTurn) return 'bg-slate-600 text-slate-300';
    return 'bg-blue-500 text-white';
  };

  const getMyBarColorClasses = () => {
    if (!isMyTurn) return 'bg-slate-500';
    if (isCritical) return 'bg-red-600';
    if (isWarning) return 'bg-yellow-600';
    return 'bg-green-600';
  };

  const getOpponentBarColorClasses = () => {
    if (isMyTurn) return 'bg-slate-500';
    return 'bg-blue-600';
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 text-center">
        Time
      </h3>

      {/* Opponent timer (top) */}
      <div className={`rounded-lg p-3 mb-2 ${getOpponentColorClasses()}`}>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide">
            Opponent {myColor === 'white' ? '(Black)' : '(White)'}
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              !isMyTurn ? 'animate-pulse' : ''
            }`}
          >
            {opponentTimeFormatted}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-black/20 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${getOpponentBarColorClasses()}`}
            style={{ width: `${opponentPercentage}%` }}
          />
        </div>
      </div>

      {/* My timer (bottom) */}
      <div className={`rounded-lg p-3 ${getMyColorClasses()}`}>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide">
            You {myColor === 'white' ? '(White)' : '(Black)'}
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              isCritical && isMyTurn ? 'animate-pulse-fast' : ''
            }`}
          >
            {myTimeFormatted}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-black/20 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${getMyBarColorClasses()}`}
            style={{ width: `${myPercentage}%` }}
          />
        </div>
      </div>

      {/* Turn indicator */}
      <div className="mt-3 text-center">
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            isMyTurn
              ? 'bg-green-500/20 text-green-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}
        >
          {isMyTurn ? "Your turn" : "Opponent's turn"}
        </span>
      </div>
    </div>
  );
}
