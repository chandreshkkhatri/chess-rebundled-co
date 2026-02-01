'use client';

import { getLevelTier, getTierColor, getTierIcon } from '@/lib/gamificationUtils';

interface XPProgressBarProps {
  totalXp: number;
  level: number;
  xpToNextLevel: number;
  showDetails?: boolean;
}

const LEVEL_THRESHOLDS = [
  0, 100, 200, 300, 400, 500, 650, 800, 1000, 1200,
  1500, 1800, 2100, 2500, 2900, 3400, 3900, 4500, 5100, 5800,
  6500, 7300, 8100, 9000, 10000, 11100, 12200, 13400, 14700, 16000,
  17400, 18900, 20500, 22200, 24000, 25900, 27900, 30000, 32200, 34500,
  37000, 39600, 42300, 45100, 48000, 51000, 54200, 57500, 61000, 65000,
];

function getXpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[level - 1];
  }
  const lastThreshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const increment = 4000;
  return lastThreshold + (level - LEVEL_THRESHOLDS.length) * increment;
}

export function XPProgressBar({ totalXp, level, xpToNextLevel, showDetails = true }: XPProgressBarProps) {
  const tier = getLevelTier(level);
  const tierColor = getTierColor(tier);
  const tierIcon = getTierIcon(tier);

  const currentLevelXp = getXpForLevel(level);
  const nextLevelXp = getXpForLevel(level + 1);
  const xpInCurrentLevel = totalXp - currentLevelXp;
  const xpNeededForLevel = nextLevelXp - currentLevelXp;
  const progressPercent = Math.min((xpInCurrentLevel / xpNeededForLevel) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{tierIcon}</span>
          <div>
            <span className="text-white font-bold">Level {level}</span>
            <span className={`ml-2 text-sm bg-gradient-to-r ${tierColor} bg-clip-text text-transparent font-medium`}>
              {tier}
            </span>
          </div>
        </div>
        {showDetails && (
          <span className="text-slate-400 text-sm">
            {totalXp.toLocaleString()} XP
          </span>
        )}
      </div>

      <div className="relative">
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${tierColor} transition-all duration-500 ease-out`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {showDetails && (
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-500">
              {xpInCurrentLevel.toLocaleString()} / {xpNeededForLevel.toLocaleString()} XP
            </span>
            <span className="text-xs text-slate-500">
              Level {level + 1}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
