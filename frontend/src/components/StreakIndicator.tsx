'use client';

import { getStreakEmoji, getStreakColor, getStreakMultiplier } from '@/lib/gamificationUtils';

interface StreakIndicatorProps {
  currentStreak: number;
  longestStreak: number;
  streakFreezes?: number;
  compact?: boolean;
}

export function StreakIndicator({ currentStreak, longestStreak, streakFreezes = 0, compact = false }: StreakIndicatorProps) {
  const emoji = getStreakEmoji(currentStreak);
  const color = getStreakColor(currentStreak);
  const multiplier = getStreakMultiplier(currentStreak);

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${color}`}>
        <span>{emoji}</span>
        <span className="font-bold">{currentStreak}</span>
        {multiplier > 1 && (
          <span className="text-xs text-green-400">({multiplier}x)</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          <div>
            <p className={`text-2xl font-bold ${color}`}>{currentStreak}</p>
            <p className="text-slate-400 text-sm">Day Streak</p>
          </div>
        </div>
        {multiplier > 1 && (
          <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium">
            {multiplier}x XP
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-slate-400">
          Best: <span className="text-white font-medium">{longestStreak} days</span>
        </div>
        {streakFreezes > 0 && (
          <div className="flex items-center gap-1 text-blue-400">
            <span>\u2744\uFE0F</span>
            <span>{streakFreezes} freeze{streakFreezes !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {currentStreak > 0 && currentStreak < 3 && (
        <p className="text-xs text-slate-500">
          {3 - currentStreak} more day{3 - currentStreak !== 1 ? 's' : ''} until 1.1x XP bonus!
        </p>
      )}
    </div>
  );
}
