import { UserGamification } from '../types/index.js';

export interface StreakUpdateResult {
  newStreak: number;
  longestStreak: number;
  streakIncreased: boolean;
  streakBroken: boolean;
  freezeUsed: boolean;
  freezesRemaining: number;
  earnedFreeze: boolean;
}

/**
 * Get today's date string in the given timezone
 */
export function getTodayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Get yesterday's date string in the given timezone
 */
export function getYesterdayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
}

/**
 * Calculate the number of days between two date strings (YYYY-MM-DD)
 */
function daysBetween(dateStr1: string, dateStr2: string): number {
  const date1 = new Date(dateStr1 + 'T00:00:00Z');
  const date2 = new Date(dateStr2 + 'T00:00:00Z');
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Update streak based on session completion
 */
export function updateStreak(
  streaks: UserGamification['streaks']
): StreakUpdateResult {
  const timezone = streaks.timezone || 'UTC';
  const today = getTodayInTimezone(timezone);
  const yesterday = getYesterdayInTimezone(timezone);
  const lastPlayed = streaks.lastPlayedDate;

  let newStreak = streaks.currentStreak;
  let longestStreak = streaks.longestStreak;
  let freezesRemaining = streaks.streakFreezes;
  let streakIncreased = false;
  let streakBroken = false;
  let freezeUsed = false;
  let earnedFreeze = false;

  if (lastPlayed === today) {
    // Already played today - no streak change
    return {
      newStreak,
      longestStreak,
      streakIncreased: false,
      streakBroken: false,
      freezeUsed: false,
      freezesRemaining,
      earnedFreeze: false,
    };
  }

  if (lastPlayed === yesterday) {
    // Played yesterday - continue streak
    newStreak = streaks.currentStreak + 1;
    streakIncreased = true;
  } else if (lastPlayed === '') {
    // First time playing
    newStreak = 1;
    streakIncreased = true;
  } else {
    // Missed at least one day
    const daysMissed = daysBetween(lastPlayed, today) - 1;

    if (daysMissed === 1 && streaks.streakFreezes > 0) {
      // Use a streak freeze for missing one day
      freezesRemaining = streaks.streakFreezes - 1;
      freezeUsed = true;
      newStreak = streaks.currentStreak + 1;
      streakIncreased = true;
    } else {
      // Streak is broken
      streakBroken = true;
      newStreak = 1;
      streakIncreased = true; // Starting fresh counts as an increase
    }
  }

  // Update longest streak if current exceeds it
  if (newStreak > longestStreak) {
    longestStreak = newStreak;
  }

  // Award streak freeze every 7 days (max 3)
  const previousStreak = streaks.currentStreak;
  const crossed7DayThreshold = Math.floor(newStreak / 7) > Math.floor(previousStreak / 7);
  if (crossed7DayThreshold && freezesRemaining < 3) {
    freezesRemaining++;
    earnedFreeze = true;
  }

  return {
    newStreak,
    longestStreak,
    streakIncreased,
    streakBroken,
    freezeUsed,
    freezesRemaining,
    earnedFreeze,
  };
}

/**
 * Get streak multiplier for XP calculations
 */
export function getStreakMultiplier(streakDays: number): number {
  if (streakDays >= 60) return 2.0;
  if (streakDays >= 30) return 1.75;
  if (streakDays >= 14) return 1.5;
  if (streakDays >= 7) return 1.25;
  if (streakDays >= 3) return 1.1;
  return 1.0;
}

/**
 * Get streak milestone description if at a milestone
 */
export function getStreakMilestone(streakDays: number): string | null {
  const milestones: Record<number, string> = {
    3: 'On Fire! 3-day streak',
    7: 'Week Warrior! 7-day streak',
    14: 'Fortnight Focus! 14-day streak',
    30: 'Month Master! 30-day streak',
    60: 'Unstoppable! 60-day streak',
    100: 'Century! 100-day streak',
  };

  return milestones[streakDays] || null;
}

/**
 * Detect user's timezone from their browser/request
 */
export function detectTimezone(timezoneHeader?: string): string {
  if (timezoneHeader && isValidTimezone(timezoneHeader)) {
    return timezoneHeader;
  }
  return 'UTC';
}

/**
 * Check if a timezone string is valid
 */
function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
