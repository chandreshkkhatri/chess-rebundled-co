'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserGamification, LevelTier } from '@/types';

function getLevelTier(level: number): LevelTier {
  if (level <= 5) return 'Pawn';
  if (level <= 10) return 'Knight';
  if (level <= 20) return 'Bishop';
  if (level <= 35) return 'Rook';
  if (level <= 50) return 'Queen';
  return 'Grandmaster';
}

function getTierIcon(tier: LevelTier): string {
  switch (tier) {
    case 'Pawn': return '\u265F';
    case 'Knight': return '\u265E';
    case 'Bishop': return '\u265D';
    case 'Rook': return '\u265C';
    case 'Queen': return '\u265B';
    case 'Grandmaster': return '\u265A';
  }
}

function getStreakEmoji(streak: number): string {
  if (streak >= 60) return '\uD83D\uDD25';
  if (streak >= 30) return '\uD83D\uDC51';
  if (streak >= 14) return '\u2B50';
  if (streak >= 7) return '\uD83C\uDF1F';
  if (streak >= 3) return '\uD83D\uDD25';
  return '\u26A1';
}

function getStreakColor(streak: number): string {
  if (streak >= 30) return 'text-yellow-400';
  if (streak >= 14) return 'text-orange-400';
  if (streak >= 7) return 'text-orange-500';
  if (streak >= 3) return 'text-amber-500';
  return 'text-slate-400';
}

export function LiveGamificationBadge() {
  const { user, isAnonymous, isLoading: authLoading, getIdToken } = useAuth();
  const [gamification, setGamification] = useState<UserGamification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGamification() {
      if (authLoading || !user || isAnonymous) {
        setLoading(false);
        return;
      }

      try {
        const token = await getIdToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
        const response = await fetch(`${apiUrl}/api/user/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.gamification) {
            setGamification(data.gamification);
          }
        }
      } catch {
        // Silently fail - badge is optional
      } finally {
        setLoading(false);
      }
    }

    fetchGamification();
  }, [user, isAnonymous, authLoading, getIdToken]);

  // Don't render for anonymous users or while loading
  if (loading || !gamification || isAnonymous) {
    return null;
  }

  const tier = getLevelTier(gamification.level);
  const tierIcon = getTierIcon(tier);
  const streakEmoji = getStreakEmoji(gamification.streaks.currentStreak);
  const streakColor = getStreakColor(gamification.streaks.currentStreak);

  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Streak indicator */}
      {gamification.streaks.currentStreak > 0 && (
        <div className={`flex items-center gap-0.5 ${streakColor}`}>
          <span className="text-base">{streakEmoji}</span>
          <span className="font-bold">{gamification.streaks.currentStreak}</span>
        </div>
      )}

      {/* Level indicator */}
      <div className="flex items-center gap-1 text-slate-300">
        <span className="text-base">{tierIcon}</span>
        <span className="font-medium">Lv.{gamification.level}</span>
      </div>
    </div>
  );
}
