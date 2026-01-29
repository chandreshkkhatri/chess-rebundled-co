'use client';

import { useEffect, useState } from 'react';
import { Achievement } from '@/types';

interface AchievementToastProps {
  achievement: Achievement;
  onClose: () => void;
  autoHideDuration?: number;
}

function getTierStyles(tier: Achievement['tier']): { bg: string; border: string; glow: string } {
  switch (tier) {
    case 'bronze':
      return {
        bg: 'from-amber-700 to-amber-800',
        border: 'border-amber-500',
        glow: 'shadow-amber-500/30',
      };
    case 'silver':
      return {
        bg: 'from-slate-400 to-slate-500',
        border: 'border-slate-300',
        glow: 'shadow-slate-300/30',
      };
    case 'gold':
      return {
        bg: 'from-yellow-500 to-yellow-600',
        border: 'border-yellow-300',
        glow: 'shadow-yellow-300/50',
      };
    case 'platinum':
      return {
        bg: 'from-purple-500 to-indigo-600',
        border: 'border-purple-300',
        glow: 'shadow-purple-400/50',
      };
  }
}

export function AchievementToast({ achievement, onClose, autoHideDuration = 5000 }: AchievementToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const styles = getTierStyles(achievement.tier);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Auto-hide after duration
    const hideTimer = setTimeout(() => {
      setIsLeaving(true);
    }, autoHideDuration);

    return () => clearTimeout(hideTimer);
  }, [autoHideDuration]);

  useEffect(() => {
    if (isLeaving) {
      const closeTimer = setTimeout(onClose, 300);
      return () => clearTimeout(closeTimer);
    }
  }, [isLeaving, onClose]);

  return (
    <div
      className={`
        fixed top-4 right-4 z-50 max-w-sm w-full
        transform transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div
        className={`
          bg-gradient-to-r ${styles.bg}
          border-2 ${styles.border}
          rounded-xl p-4 shadow-lg ${styles.glow}
          cursor-pointer
        `}
        onClick={() => setIsLeaving(true)}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl">
            {achievement.tier === 'platinum' ? '\uD83C\uDFC6' :
             achievement.tier === 'gold' ? '\uD83E\uDD47' :
             achievement.tier === 'silver' ? '\uD83E\uDD48' : '\uD83E\uDD49'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white/80 text-xs font-medium uppercase tracking-wider">
                Achievement Unlocked
              </span>
            </div>
            <h3 className="text-white font-bold text-lg">{achievement.name}</h3>
            <p className="text-white/80 text-sm">{achievement.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                +{achievement.xpReward} XP
              </span>
              <span className="text-white/60 text-xs capitalize">{achievement.tier}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AchievementToastContainerProps {
  achievements: Achievement[];
  onDismiss: (id: string) => void;
}

export function AchievementToastContainer({ achievements, onDismiss }: AchievementToastContainerProps) {
  if (achievements.length === 0) return null;

  // Only show the first achievement at a time
  const currentAchievement = achievements[0];

  return (
    <AchievementToast
      key={currentAchievement.id}
      achievement={currentAchievement}
      onClose={() => onDismiss(currentAchievement.id)}
    />
  );
}
