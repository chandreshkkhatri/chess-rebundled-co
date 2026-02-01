/**
 * Gamification Utilities
 *
 * Shared helper functions for level tiers, streak display, and XP calculations.
 */

import { LevelTier } from '@/types';

/**
 * Get the tier name based on player level
 */
export function getLevelTier(level: number): LevelTier {
  if (level <= 5) return 'Pawn';
  if (level <= 10) return 'Knight';
  if (level <= 20) return 'Bishop';
  if (level <= 35) return 'Rook';
  if (level <= 50) return 'Queen';
  return 'Grandmaster';
}

/**
 * Get Tailwind gradient classes for a tier
 */
export function getTierColor(tier: LevelTier): string {
  switch (tier) {
    case 'Pawn': return 'from-slate-400 to-slate-500';
    case 'Knight': return 'from-amber-600 to-amber-700';
    case 'Bishop': return 'from-slate-300 to-slate-400';
    case 'Rook': return 'from-yellow-400 to-yellow-500';
    case 'Queen': return 'from-purple-500 to-purple-600';
    case 'Grandmaster': return 'from-red-500 to-orange-500';
  }
}

/**
 * Get chess piece icon (Unicode) for a tier
 */
export function getTierIcon(tier: LevelTier): string {
  switch (tier) {
    case 'Pawn': return '\u265F';
    case 'Knight': return '\u265E';
    case 'Bishop': return '\u265D';
    case 'Rook': return '\u265C';
    case 'Queen': return '\u265B';
    case 'Grandmaster': return '\u265A';
  }
}

/**
 * Get emoji for streak display based on streak length
 */
export function getStreakEmoji(streak: number): string {
  if (streak >= 60) return '\uD83D\uDD25'; // Fire
  if (streak >= 30) return '\uD83D\uDC51'; // Crown
  if (streak >= 14) return '\u2B50'; // Star
  if (streak >= 7) return '\uD83C\uDF1F'; // Glowing star
  if (streak >= 3) return '\uD83D\uDD25'; // Fire
  return '\u26A1'; // Lightning
}

/**
 * Get Tailwind text color class for streak display
 */
export function getStreakColor(streak: number): string {
  if (streak >= 30) return 'text-yellow-400';
  if (streak >= 14) return 'text-orange-400';
  if (streak >= 7) return 'text-orange-500';
  if (streak >= 3) return 'text-amber-500';
  return 'text-slate-400';
}

/**
 * Get XP multiplier based on streak length
 */
export function getStreakMultiplier(streak: number): number {
  if (streak >= 60) return 2.0;
  if (streak >= 30) return 1.75;
  if (streak >= 14) return 1.5;
  if (streak >= 7) return 1.25;
  if (streak >= 3) return 1.1;
  return 1.0;
}
