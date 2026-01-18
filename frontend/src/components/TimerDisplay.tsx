'use client';

import { useTimer } from '@/hooks/useTimer';

interface TimerDisplayProps {
  onTimeUp?: () => void;
}

export function TimerDisplay({ onTimeUp }: TimerDisplayProps) {
  const { seconds, percentage, isMyTurn, isWarning, isCritical } = useTimer({
    onTimeUp,
    warningThreshold: 3000,
  });

  const getColorClasses = () => {
    if (isCritical) return 'bg-red-500 text-white';
    if (isWarning) return 'bg-yellow-500 text-black';
    return 'bg-green-500 text-white';
  };

  const getBarColorClasses = () => {
    if (isCritical) return 'bg-red-600';
    if (isWarning) return 'bg-yellow-600';
    return 'bg-green-600';
  };

  return (
    <div className={`rounded-lg p-4 ${isMyTurn ? getColorClasses() : 'bg-gray-300 text-gray-600'}`}>
      <div className="text-center">
        <div className="text-xs uppercase tracking-wide mb-1">
          {isMyTurn ? 'Your Turn' : 'Opponent\'s Turn'}
        </div>
        <div
          className={`text-5xl font-bold font-mono ${
            isCritical && isMyTurn ? 'animate-pulse-fast' : ''
          }`}
        >
          {seconds}
        </div>
        <div className="text-xs mt-1">seconds</div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 bg-black/20 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${getBarColorClasses()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
