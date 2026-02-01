'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserGamification } from '@/types';
import { getLevelTier, getTierIcon, getStreakEmoji, getStreakColor } from '@/lib/gamificationUtils';

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
