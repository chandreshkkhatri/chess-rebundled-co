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
  category: "accuracy" | "volume" | "streak" | "mastery" | "milestone";
  icon: string;
  xpReward: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
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

export type LevelTier =
  | "Pawn"
  | "Knight"
  | "Bishop"
  | "Rook"
  | "Queen"
  | "Grandmaster";

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
  result: "1-0" | "0-1" | "1/2-1/2";
  pgn: string;
  moves: string[]; // SAN notation
  difficulty: "beginner" | "intermediate" | "advanced";
  trivia: string[];
}

// Player info for player selection feature
export interface PlayerInfo {
  name: string;
  shortName: string;
  role: "white" | "black";
  gameCount: number;
  notableGames: string[]; // up to 3 game titles
  yearRange: { from: number; to: number };
}

// Move details for board display
export interface MoveDetails {
  san: string;
  from: string;
  to: string;
}

// Practice Mode Types
export type PracticeMode = "both-sides" | "one-side";

export interface PracticeSession {
  id: string;
  socketId: string;
  uid?: string; // Firebase user ID (for session persistence)
  playerName: string;
  historicalGame: HistoricalGame;
  currentMoveIndex: number;
  moveResults: PracticeMoveResult[];
  startedAt: number;
  status: "playing" | "completed" | "abandoned";
  mode: PracticeMode;
  playerColor: "white" | "black" | null; // null for both-sides mode
}

export interface PracticeMoveResult {
  moveIndex: number;
  expectedMove: string;
  submittedMove: string;
  isCorrect: boolean;
  timeSpent: number;
  side: "white" | "black";
}

export interface PracticeStartedData {
  sessionId: string;
  game: HistoricalGame;
  position: string;
  currentMoveIndex: number;
  currentSide: "white" | "black";
  expectedMove: MoveDetails;
  totalMoves: number;
  mode: PracticeMode;
  playerColor: "white" | "black" | null;
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
  currentSide: "white" | "black";
  expectedMove: MoveDetails;
  opponentMove?: MoveDetails;
}

export interface PracticeMoveResponseData {
  result: PracticeMoveResult;
  nextMove?: PracticeNextMoveData;
  completed?: PracticeCompletedData;
  gamification?: GamificationResult;
}

// Session resume data (for restoring session after page refresh)
export interface SessionResumedData {
  sessionId: string;
  game: HistoricalGame;
  position: string;
  currentMoveIndex: number;
  currentSide: "white" | "black";
  expectedMove: MoveDetails;
  totalMoves: number;
  mode: PracticeMode;
  playerColor: "white" | "black" | null;
  moveResults: PracticeMoveResult[];
}

// Multiplayer types re-export
export type {
  TimeControl,
  MultiplayerGameStatus,
  GameEndReason,
  MultiplayerPlayer,
  MultiplayerGameState,
  MultiplayerGameStartedData,
  MultiplayerMoveMadeData,
  MultiplayerGameOverData,
  MultiplayerGameResumedData,
  QueueEntry,
} from "./multiplayer.js";

import type {
  TimeControl,
  MultiplayerGameStartedData,
  MultiplayerMoveMadeData,
  MultiplayerGameOverData,
  MultiplayerGameResumedData,
} from "./multiplayer.js";

// AI opponent types re-export
export type {
  AiGameStatus,
  AiGameEndReason,
  AiMoveSource,
  AiChatMessage,
  AiTurnRecord,
  AiGameState,
  AiPersonaPublic,
  AiGameStartedData,
  AiMoveMadeData,
  AiGameOverData,
  AiGameResumedData,
  AiReviewTurn,
  AiReviewData,
  AiErrorCode,
  AiErrorData,
} from "./aiGame.js";

import type {
  AiChatMessage,
  AiGameStartedData,
  AiMoveMadeData,
  AiGameOverData,
  AiGameResumedData,
  AiReviewData,
  AiErrorData,
} from "./aiGame.js";

// Socket Event Types
export interface ServerToClientEvents {
  // Practice mode events
  "practice-games-list": (games: HistoricalGame[]) => void;
  "practice-started": (data: PracticeStartedData) => void;
  "practice-move-result": (result: PracticeMoveResult) => void;
  "practice-next-move": (data: PracticeNextMoveData) => void;
  "practice-completed": (data: PracticeCompletedData) => void;
  "practice-move-response": (data: PracticeMoveResponseData) => void; // Combined event
  "practice-error": (data: { message: string }) => void;
  "practice-game-details": (game: HistoricalGame) => void;
  // Session resume events
  "session-resumed": (data: SessionResumedData) => void;
  "session-not-found": (data: { sessionId: string; reason: string }) => void;
  // Player list event
  "player-list": (data: {
    asWhite: PlayerInfo[];
    asBlack: PlayerInfo[];
  }) => void;
  // AI move parsing events (Web Speech + Haiku)
  "move-parsed": (data: AIParsedMoveResult) => void;
  "parse-error": (data: { message: string }) => void;
  // Gemini audio parsing events
  "audio-move-parsed": (data: AIParsedMoveResult) => void;
  "audio-parse-error": (data: { message: string }) => void;

  // Multiplayer events
  "mp-searching": () => void;
  "mp-search-cancelled": () => void;
  "mp-invite-created": (data: { inviteCode: string; gameId: string }) => void;
  "mp-game-found": (data: MultiplayerGameStartedData) => void;
  "mp-move-made": (data: MultiplayerMoveMadeData) => void;
  "mp-game-over": (data: MultiplayerGameOverData) => void;
  "mp-clock-update": (data: { white: number; black: number }) => void;
  "mp-draw-offered": (data: { by: "white" | "black" }) => void;
  "mp-draw-declined": () => void;
  "mp-illegal-move": (data: { move: string; reason: string }) => void;
  "mp-opponent-connected": (data: { displayName: string }) => void;
  "mp-opponent-disconnected": () => void;
  "mp-game-resumed": (data: MultiplayerGameResumedData) => void;
  "mp-game-not-found": (data: { gameId: string; reason: string }) => void;
  "mp-move-parsed": (data: AIParsedMoveResult) => void;
  "mp-parse-error": (data: { message: string }) => void;
  "mp-audio-move-parsed": (data: AIParsedMoveResult) => void;
  "mp-audio-parse-error": (data: { message: string }) => void;
  "mp-error": (data: { message: string }) => void;
  "mp-lobby-stats": (data: {
    onlineCount: number;
    waitingPlayers: {
      uid: string;
      displayName: string;
      timeControl: string;
      waitingSince: number;
    }[];
  }) => void;

  // AI opponent events
  "ai-game-started": (data: AiGameStartedData) => void;
  "ai-move-made": (data: AiMoveMadeData) => void;
  "ai-typing": (data: { gameId: string; typing: boolean }) => void;
  "ai-chat-message": (data: {
    gameId: string;
    message: AiChatMessage;
  }) => void;
  "ai-bot-turn-started": (data: { gameId: string }) => void;
  "ai-bot-turn-ended": (data: { gameId: string }) => void;
  "ai-game-over": (data: AiGameOverData) => void;
  "ai-game-resumed": (data: AiGameResumedData) => void;
  "ai-review-data": (data: AiReviewData) => void;
  "ai-illegal-move": (data: {
    gameId: string;
    move: string;
    reason: string;
  }) => void;
  "ai-game-not-found": (data: { gameId: string; reason: string }) => void;
  "ai-error": (data: AiErrorData) => void;
}

export interface ClientToServerEvents {
  // Practice mode events
  "get-practice-games": () => void;
  "start-practice": (data: {
    gameId?: string;
    playerName: string;
    mode?: PracticeMode;
    playerColor?: "white" | "black";
  }) => void;
  "start-practice-random": (data: {
    playerName: string;
    mode?: PracticeMode;
    playerColor?: "white" | "black";
  }) => void;
  "start-practice-by-player": (data: {
    playerName: string;
    historicalPlayerName: string;
    role: "white" | "black";
    mode?: PracticeMode;
    playerColor?: "white" | "black";
  }) => void;
  "get-random-practice-game": () => void;
  "get-player-practice-game": (data: {
    historicalPlayerName: string;
    role: "white" | "black";
  }) => void;
  "get-player-list": () => void;
  "submit-practice-move": (data: { sessionId: string; move: string }) => void;
  "abandon-practice": (data: { sessionId: string }) => void;
  // Session resume
  "resume-session": (data: { sessionId: string }) => void;
  // AI move parsing events (Web Speech + Haiku)
  "parse-move-with-ai": (data: {
    sessionId: string;
    transcript: string;
    rawTranscript?: string;
  }) => void;
  // Gemini audio parsing events
  "parse-audio-move-with-gemini": (data: {
    sessionId: string;
    audioBase64: string;
    mimeType: string;
  }) => void;

  // Multiplayer events
  "mp-find-game": (data: { timeControl: TimeControl | null | "any" }) => void;
  "mp-cancel-find": () => void;
  "mp-create-invite": (data: { timeControl: TimeControl | null }) => void;
  "mp-join-invite": (data: { inviteCode: string }) => void;
  "mp-submit-move": (data: { gameId: string; move: string }) => void;
  "mp-resign": (data: { gameId: string }) => void;
  "mp-offer-draw": (data: { gameId: string }) => void;
  "mp-respond-draw": (data: { gameId: string; accept: boolean }) => void;
  "mp-reconnect": (data: { gameId: string }) => void;
  "mp-parse-move-with-ai": (data: {
    gameId: string;
    transcript: string;
    rawTranscript?: string;
  }) => void;
  "mp-parse-audio-move-with-gemini": (data: {
    gameId: string;
    audioBase64: string;
    mimeType: string;
  }) => void;

  // AI opponent events
  "ai-start": (data: {
    personaId: string;
    playerColor: "white" | "black" | "random";
  }) => void;
  "ai-submit-move": (data: { gameId: string; move: string }) => void;
  "ai-send-chat": (data: { gameId: string; text: string }) => void;
  "ai-resign": (data: { gameId: string }) => void;
  "ai-reconnect": (data: { gameId: string }) => void;
  "ai-get-review": (data: { gameId: string }) => void;
}
