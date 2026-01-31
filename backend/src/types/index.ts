// Gamification Types
export interface UserGamification {
  // XP & Levels
  totalXp: number;
  level: number;
  xpToNextLevel: number;

  // Streaks
  streaks: {
    currentStreak: number;
    longestStreak: number;
    lastPlayedDate: string; // YYYY-MM-DD in user's timezone
    streakFreezes: number;
    timezone: string;
  };

  // Achievements
  achievements: {
    unlocked: string[]; // Achievement IDs
    progress: Record<string, number>; // Progressive achievement tracking
  };

  // Tracking for bonuses
  gamesCompleted: string[]; // Game IDs for "first completion" bonus
  dailyXpDate: string | null; // For daily first session bonus (YYYY-MM-DD)
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'accuracy' | 'volume' | 'streak' | 'mastery' | 'milestone';
  icon: string;
  xpReward: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  isHidden: boolean;
  criteria: {
    type: string;
    threshold?: number;
    gameId?: string;
    gameTitle?: string;
  };
}

export interface XPCalculationResult {
  baseXp: number;
  bonuses: {
    perfectSession: number;
    highAccuracy: number;
    firstGameCompletion: number;
    dailyFirst: number;
    streakMultiplier: number;
  };
  totalXp: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface GamificationResult {
  xp: XPCalculationResult;
  newAchievements: Achievement[];
  streakUpdated: boolean;
  newStreak: number;
}

export type LevelTier = 'Pawn' | 'Knight' | 'Bishop' | 'Rook' | 'Queen' | 'Grandmaster';

// Game Types
export interface HistoricalGame {
  id: string;
  title: string;
  event: string;
  year: number;
  white: {
    name: string;
    shortName: string;
  };
  black: {
    name: string;
    shortName: string;
  };
  result: '1-0' | '0-1' | '1/2-1/2';
  pgn: string;
  moves: string[]; // SAN notation
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  trivia: string[];
}

// Move details for board display
export interface MoveDetails {
  san: string;
  from: string;
  to: string;
}

// Practice Mode Types
export type PracticeMode = 'both-sides' | 'one-side';

export interface PracticeSession {
  id: string;
  socketId: string;
  uid?: string; // Firebase user ID (for session persistence)
  playerName: string;
  historicalGame: HistoricalGame;
  currentMoveIndex: number;
  moveResults: PracticeMoveResult[];
  startedAt: number;
  status: 'playing' | 'completed' | 'abandoned';
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null; // null for both-sides mode
}

export interface PracticeMoveResult {
  moveIndex: number;
  expectedMove: string;
  submittedMove: string;
  isCorrect: boolean;
  timeSpent: number;
  side: 'white' | 'black';
}

export interface PracticeStartedData {
  sessionId: string;
  game: HistoricalGame;
  position: string;
  currentMoveIndex: number;
  currentSide: 'white' | 'black';
  expectedMove: MoveDetails;
  totalMoves: number;
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null;
}

export interface PracticeCompletedData {
  sessionId: string;
  game: HistoricalGame;
  totalMoves: number;
  correctMoves: number;
  accuracy: number;
  totalTimeMs: number;
  averageTimePerMove: number;
  moveResults: PracticeMoveResult[];
  trivia: string[];
}

// AI Move Parsing Types
export interface AIParsedMoveResult {
  transcript: string;
  parsedMove: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
  transcription?: string; // What the AI heard (for Gemini audio mode)
}

// Combined response for move submission (reduces socket round-trips)
export interface PracticeNextMoveData {
  position: string;
  currentMoveIndex: number;
  currentSide: 'white' | 'black';
  expectedMove: MoveDetails;
  opponentMove?: MoveDetails;
}

export interface PracticeMoveResponseData {
  result: PracticeMoveResult;
  nextMove?: PracticeNextMoveData;
  completed?: PracticeCompletedData;
  gamification?: GamificationResult;
}

// Socket Event Types
export interface ServerToClientEvents {
  // Practice mode events
  'practice-games-list': (games: HistoricalGame[]) => void;
  'practice-started': (data: PracticeStartedData) => void;
  'practice-move-result': (result: PracticeMoveResult) => void;
  'practice-next-move': (data: PracticeNextMoveData) => void;
  'practice-completed': (data: PracticeCompletedData) => void;
  'practice-move-response': (data: PracticeMoveResponseData) => void; // Combined event
  'practice-error': (data: { message: string }) => void;
  // AI move parsing events (Web Speech + Haiku)
  'move-parsed': (data: AIParsedMoveResult) => void;
  'parse-error': (data: { message: string }) => void;
  // Gemini audio parsing events
  'audio-move-parsed': (data: AIParsedMoveResult) => void;
  'audio-parse-error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  // Practice mode events
  'get-practice-games': () => void;
  'start-practice': (data: { gameId?: string; playerName: string; mode?: PracticeMode; playerColor?: 'white' | 'black' }) => void;
  'start-practice-random': (data: { playerName: string; mode?: PracticeMode; playerColor?: 'white' | 'black' }) => void;
  'submit-practice-move': (data: { sessionId: string; move: string }) => void;
  'abandon-practice': (data: { sessionId: string }) => void;
  // AI move parsing events (Web Speech + Haiku)
  'parse-move-with-ai': (data: { sessionId: string; transcript: string }) => void;
  // Gemini audio parsing events
  'parse-audio-move-with-gemini': (data: { sessionId: string; audioBase64: string; mimeType: string }) => void;
}
