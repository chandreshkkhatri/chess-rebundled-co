import { PracticeCompletedData, XPCalculationResult, UserGamification, LevelTier } from '../types/index.js';

// XP constants
const XP_BASE_SESSION_COMPLETE = 50;
const XP_PER_CORRECT_MOVE = 5;
const XP_BONUS_PERFECT_SESSION = 100;
const XP_BONUS_HIGH_ACCURACY = 50;
const XP_BONUS_FIRST_GAME_COMPLETION = 25;
const XP_BONUS_DAILY_FIRST = 30;

// Level thresholds
const LEVEL_THRESHOLDS = [
  0,      // Level 1
  100,    // Level 2
  200,    // Level 3
  300,    // Level 4
  400,    // Level 5
  500,    // Level 6
  650,    // Level 7
  800,    // Level 8
  1000,   // Level 9
  1200,   // Level 10
  1500,   // Level 11
  1800,   // Level 12
  2100,   // Level 13
  2500,   // Level 14
  2900,   // Level 15
  3400,   // Level 16
  3900,   // Level 17
  4500,   // Level 18
  5100,   // Level 19
  5800,   // Level 20
  6500,   // Level 21
  7300,   // Level 22
  8100,   // Level 23
  9000,   // Level 24
  10000,  // Level 25
  11100,  // Level 26
  12200,  // Level 27
  13400,  // Level 28
  14700,  // Level 29
  16000,  // Level 30
  17400,  // Level 31
  18900,  // Level 32
  20500,  // Level 33
  22200,  // Level 34
  24000,  // Level 35
  25900,  // Level 36
  27900,  // Level 37
  30000,  // Level 38
  32200,  // Level 39
  34500,  // Level 40
  37000,  // Level 41
  39600,  // Level 42
  42300,  // Level 43
  45100,  // Level 44
  48000,  // Level 45
  51000,  // Level 46
  54200,  // Level 47
  57500,  // Level 48
  61000,  // Level 49
  65000,  // Level 50
];

// Streak multipliers
const STREAK_MULTIPLIERS: Record<number, number> = {
  3: 1.1,
  7: 1.25,
  14: 1.5,
  30: 1.75,
  60: 2.0,
};

/**
 * Calculate XP earned from a completed session
 */
export function calculateSessionXP(
  completedData: PracticeCompletedData,
  gamification: UserGamification,
  todayDate: string
): XPCalculationResult {
  const { accuracy, correctMoves, totalMoves } = completedData;
  const gameId = completedData.game.id;

  // Base XP
  const baseXp = XP_BASE_SESSION_COMPLETE + (correctMoves * XP_PER_CORRECT_MOVE);

  // Bonuses
  const perfectSession = accuracy >= 1.0 ? XP_BONUS_PERFECT_SESSION : 0;
  const highAccuracy = accuracy >= 0.9 && accuracy < 1.0 ? XP_BONUS_HIGH_ACCURACY : 0;
  const firstGameCompletion = !gamification.gamesCompleted.includes(gameId) ? XP_BONUS_FIRST_GAME_COMPLETION : 0;
  const dailyFirst = gamification.dailyXpDate !== todayDate ? XP_BONUS_DAILY_FIRST : 0;

  // Streak multiplier
  const streakDays = gamification.streaks.currentStreak;
  let streakMultiplierValue = 1.0;
  for (const [days, multiplier] of Object.entries(STREAK_MULTIPLIERS).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    if (streakDays >= Number(days)) {
      streakMultiplierValue = multiplier;
      break;
    }
  }

  // Calculate total before multiplier
  const totalBeforeMultiplier = baseXp + perfectSession + highAccuracy + firstGameCompletion + dailyFirst;

  // Apply streak multiplier bonus (only the bonus portion, not full multiplication)
  const streakBonusXp = Math.round(totalBeforeMultiplier * (streakMultiplierValue - 1));
  const totalXp = totalBeforeMultiplier + streakBonusXp;

  // Calculate new total XP and level
  const newTotalXp = gamification.totalXp + totalXp;
  const previousLevel = gamification.level;
  const newLevel = calculateLevel(newTotalXp);

  return {
    baseXp,
    bonuses: {
      perfectSession,
      highAccuracy,
      firstGameCompletion,
      dailyFirst,
      streakMultiplier: streakBonusXp,
    },
    totalXp,
    newTotalXp,
    previousLevel,
    newLevel,
    leveledUp: newLevel > previousLevel,
  };
}

/**
 * Calculate level from total XP
 */
export function calculateLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Calculate XP needed for next level
 */
export function calculateXpToNextLevel(totalXp: number, level: number): number {
  if (level >= LEVEL_THRESHOLDS.length) {
    // Max level - calculate based on pattern
    const lastThreshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const increment = 4000; // ~4000 XP per level after 50
    const nextThreshold = lastThreshold + (level - LEVEL_THRESHOLDS.length + 1) * increment;
    return nextThreshold - totalXp;
  }
  return LEVEL_THRESHOLDS[level] - totalXp;
}

/**
 * Get the tier name for a level
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
 * Get XP threshold for a specific level
 */
export function getXpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[level - 1];
  }
  // Calculate for levels beyond 50
  const lastThreshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const increment = 4000;
  return lastThreshold + (level - LEVEL_THRESHOLDS.length) * increment;
}

/**
 * Create default gamification data for new users
 */
export function createDefaultGamification(timezone: string = 'UTC'): UserGamification {
  return {
    totalXp: 0,
    level: 1,
    xpToNextLevel: LEVEL_THRESHOLDS[1],
    streaks: {
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: '',
      streakFreezes: 0,
      timezone,
    },
    achievements: {
      unlocked: [],
      progress: {},
    },
    gamesCompleted: [],
    dailyXpDate: null,
  };
}

/**
 * Format XP for display (e.g., 1000 -> "1,000")
 */
export function formatXp(xp: number): string {
  return xp.toLocaleString();
}
