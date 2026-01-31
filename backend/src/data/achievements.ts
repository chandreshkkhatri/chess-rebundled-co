import { Achievement } from '../types/index.js';

export const ACHIEVEMENTS: Achievement[] = [
  // Accuracy Achievements
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Complete your first practice session',
    category: 'accuracy',
    icon: 'footprints',
    xpReward: 50,
    tier: 'bronze',
    isHidden: false,
    criteria: { type: 'sessions_completed', threshold: 1 },
  },
  {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: 'Achieve 80% accuracy in a session',
    category: 'accuracy',
    icon: 'target',
    xpReward: 75,
    tier: 'bronze',
    isHidden: false,
    criteria: { type: 'session_accuracy', threshold: 0.8 },
  },
  {
    id: 'sniper',
    name: 'Sniper',
    description: 'Achieve 90% accuracy in a session',
    category: 'accuracy',
    icon: 'crosshair',
    xpReward: 100,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'session_accuracy', threshold: 0.9 },
  },
  {
    id: 'perfect-memory',
    name: 'Perfect Memory',
    description: 'Achieve 100% accuracy in a session',
    category: 'accuracy',
    icon: 'brain',
    xpReward: 200,
    tier: 'gold',
    isHidden: false,
    criteria: { type: 'session_accuracy', threshold: 1.0 },
  },

  // Volume Achievements
  {
    id: 'getting-started',
    name: 'Getting Started',
    description: 'Complete 5 practice sessions',
    category: 'volume',
    icon: 'play-circle',
    xpReward: 100,
    tier: 'bronze',
    isHidden: false,
    criteria: { type: 'sessions_completed', threshold: 5 },
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    description: 'Complete 25 practice sessions',
    category: 'volume',
    icon: 'award',
    xpReward: 250,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'sessions_completed', threshold: 25 },
  },
  {
    id: 'committed',
    name: 'Committed',
    description: 'Complete 100 practice sessions',
    category: 'volume',
    icon: 'trophy',
    xpReward: 500,
    tier: 'gold',
    isHidden: false,
    criteria: { type: 'sessions_completed', threshold: 100 },
  },
  {
    id: 'moves-master',
    name: 'Moves Master',
    description: 'Submit 500 correct moves',
    category: 'volume',
    icon: 'check-circle',
    xpReward: 150,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'correct_moves', threshold: 500 },
  },
  {
    id: 'thousand-moves',
    name: 'Thousand Moves',
    description: 'Submit 1,000 correct moves',
    category: 'volume',
    icon: 'star',
    xpReward: 300,
    tier: 'gold',
    isHidden: false,
    criteria: { type: 'correct_moves', threshold: 1000 },
  },
  {
    id: 'five-thousand-moves',
    name: 'Move Machine',
    description: 'Submit 5,000 correct moves',
    category: 'volume',
    icon: 'zap',
    xpReward: 750,
    tier: 'platinum',
    isHidden: false,
    criteria: { type: 'correct_moves', threshold: 5000 },
  },

  // Streak Achievements
  {
    id: 'on-fire',
    name: 'On Fire',
    description: 'Maintain a 3-day practice streak',
    category: 'streak',
    icon: 'flame',
    xpReward: 75,
    tier: 'bronze',
    isHidden: false,
    criteria: { type: 'streak_days', threshold: 3 },
  },
  {
    id: 'week-warrior',
    name: 'Week Warrior',
    description: 'Maintain a 7-day practice streak',
    category: 'streak',
    icon: 'calendar',
    xpReward: 150,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'streak_days', threshold: 7 },
  },
  {
    id: 'fortnight-focus',
    name: 'Fortnight Focus',
    description: 'Maintain a 14-day practice streak',
    category: 'streak',
    icon: 'calendar-check',
    xpReward: 300,
    tier: 'gold',
    isHidden: false,
    criteria: { type: 'streak_days', threshold: 14 },
  },
  {
    id: 'month-master',
    name: 'Month Master',
    description: 'Maintain a 30-day practice streak',
    category: 'streak',
    icon: 'crown',
    xpReward: 500,
    tier: 'platinum',
    isHidden: false,
    criteria: { type: 'streak_days', threshold: 30 },
  },

  // Game Mastery Achievements
  {
    id: 'immortal-student',
    name: 'Immortal Student',
    description: 'Complete The Immortal Game',
    category: 'mastery',
    icon: 'infinity',
    xpReward: 100,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'game_completed', gameTitle: 'The Immortal Game' },
  },
  {
    id: 'opera-enthusiast',
    name: 'Opera Enthusiast',
    description: 'Complete The Opera Game',
    category: 'mastery',
    icon: 'music',
    xpReward: 100,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'game_completed', gameTitle: 'The Opera Game' },
  },
  {
    id: 'evergreen-scholar',
    name: 'Evergreen Scholar',
    description: 'Complete The Evergreen Game',
    category: 'mastery',
    icon: 'tree',
    xpReward: 100,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'game_completed', gameTitle: 'The Evergreen Game' },
  },
  {
    id: 'historian',
    name: 'Historian',
    description: 'Complete 5 different historical games',
    category: 'mastery',
    icon: 'book-open',
    xpReward: 200,
    tier: 'gold',
    isHidden: false,
    criteria: { type: 'unique_games_completed', threshold: 5 },
  },

  // Milestone Achievements (Level-based)
  {
    id: 'level-5',
    name: 'Aspiring Knight',
    description: 'Reach level 5',
    category: 'milestone',
    icon: 'chess-knight',
    xpReward: 100,
    tier: 'bronze',
    isHidden: false,
    criteria: { type: 'level_reached', threshold: 5 },
  },
  {
    id: 'level-10',
    name: 'Rising Bishop',
    description: 'Reach level 10',
    category: 'milestone',
    icon: 'chess-bishop',
    xpReward: 200,
    tier: 'silver',
    isHidden: false,
    criteria: { type: 'level_reached', threshold: 10 },
  },
  {
    id: 'level-20',
    name: 'Mighty Rook',
    description: 'Reach level 20',
    category: 'milestone',
    icon: 'chess-rook',
    xpReward: 400,
    tier: 'gold',
    isHidden: false,
    criteria: { type: 'level_reached', threshold: 20 },
  },
  {
    id: 'level-35',
    name: 'Powerful Queen',
    description: 'Reach level 35',
    category: 'milestone',
    icon: 'chess-queen',
    xpReward: 600,
    tier: 'platinum',
    isHidden: false,
    criteria: { type: 'level_reached', threshold: 35 },
  },
];

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

/**
 * Get all achievements in a category
 */
export function getAchievementsByCategory(category: Achievement['category']): Achievement[] {
  return ACHIEVEMENTS.filter(a => a.category === category);
}

/**
 * Get all visible (non-hidden) achievements
 */
export function getVisibleAchievements(): Achievement[] {
  return ACHIEVEMENTS.filter(a => !a.isHidden);
}
