import { Achievement, UserGamification, PracticeCompletedData } from '../types/index.js';
import { ACHIEVEMENTS, getAchievementById } from '../data/achievements.js';
import { FirestoreUser } from './firestoreService.js';

interface AchievementCheckContext {
  gamification: UserGamification;
  userStats: FirestoreUser['stats'];
  completedData: PracticeCompletedData;
  newLevel: number;
  newStreak: number;
}

/**
 * Check all achievements and return newly unlocked ones
 */
export function checkAchievements(context: AchievementCheckContext): Achievement[] {
  const { gamification, userStats, completedData, newLevel, newStreak } = context;
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    // Skip if already unlocked
    if (gamification.achievements.unlocked.includes(achievement.id)) {
      continue;
    }

    const isUnlocked = checkSingleAchievement(achievement, context);
    if (isUnlocked) {
      newlyUnlocked.push(achievement);
    }
  }

  return newlyUnlocked;
}

/**
 * Check if a single achievement should be unlocked
 */
function checkSingleAchievement(achievement: Achievement, context: AchievementCheckContext): boolean {
  const { gamification, userStats, completedData, newLevel, newStreak } = context;
  const { criteria } = achievement;

  switch (criteria.type) {
    case 'sessions_completed': {
      // Total sessions including this one
      const totalSessions = userStats.totalSessions + 1;
      return totalSessions >= (criteria.threshold || 0);
    }

    case 'session_accuracy': {
      // Check accuracy of current session
      return completedData.accuracy >= (criteria.threshold || 0);
    }

    case 'correct_moves': {
      // Total correct moves including this session
      const totalCorrectMoves = userStats.correctMoves + completedData.correctMoves;
      return totalCorrectMoves >= (criteria.threshold || 0);
    }

    case 'streak_days': {
      return newStreak >= (criteria.threshold || 0);
    }

    case 'game_completed': {
      // Check if the just-completed game matches
      const gameTitle = completedData.game.title;
      return gameTitle === criteria.gameTitle;
    }

    case 'unique_games_completed': {
      // Count unique games including this one
      const gameId = completedData.game.id;
      const uniqueGames = new Set([...gamification.gamesCompleted, gameId]);
      return uniqueGames.size >= (criteria.threshold || 0);
    }

    case 'level_reached': {
      return newLevel >= (criteria.threshold || 0);
    }

    default:
      return false;
  }
}

/**
 * Calculate total XP reward from achievements
 */
export function calculateAchievementXpReward(achievements: Achievement[]): number {
  return achievements.reduce((total, achievement) => total + achievement.xpReward, 0);
}

/**
 * Get achievement progress for progressive achievements
 */
export function getAchievementProgress(
  achievementId: string,
  context: Omit<AchievementCheckContext, 'newLevel' | 'newStreak'> & { newLevel?: number; newStreak?: number }
): { current: number; target: number } | null {
  const achievement = getAchievementById(achievementId);
  if (!achievement) return null;

  const { gamification, userStats, completedData } = context;
  const { criteria } = achievement;

  switch (criteria.type) {
    case 'sessions_completed':
      return {
        current: userStats.totalSessions + 1,
        target: criteria.threshold || 0,
      };

    case 'correct_moves':
      return {
        current: userStats.correctMoves + (completedData?.correctMoves || 0),
        target: criteria.threshold || 0,
      };

    case 'streak_days':
      return {
        current: context.newStreak || gamification.streaks.currentStreak,
        target: criteria.threshold || 0,
      };

    case 'unique_games_completed':
      return {
        current: new Set([...gamification.gamesCompleted, completedData?.game.id]).size,
        target: criteria.threshold || 0,
      };

    case 'level_reached':
      return {
        current: context.newLevel || gamification.level,
        target: criteria.threshold || 0,
      };

    default:
      return null;
  }
}

/**
 * Get all achievement progress for a user
 */
export function getAllAchievementProgress(
  gamification: UserGamification,
  userStats: FirestoreUser['stats']
): Record<string, { current: number; target: number; unlocked: boolean }> {
  const progress: Record<string, { current: number; target: number; unlocked: boolean }> = {};

  for (const achievement of ACHIEVEMENTS) {
    const unlocked = gamification.achievements.unlocked.includes(achievement.id);
    const { criteria } = achievement;

    let current = 0;
    const target = criteria.threshold || 0;

    switch (criteria.type) {
      case 'sessions_completed':
        current = userStats.totalSessions;
        break;
      case 'correct_moves':
        current = userStats.correctMoves;
        break;
      case 'streak_days':
        current = gamification.streaks.currentStreak;
        break;
      case 'unique_games_completed':
        current = gamification.gamesCompleted.length;
        break;
      case 'level_reached':
        current = gamification.level;
        break;
      case 'session_accuracy':
      case 'game_completed':
        // These are event-based, not progressive
        current = unlocked ? 1 : 0;
        break;
    }

    progress[achievement.id] = { current, target, unlocked };
  }

  return progress;
}
