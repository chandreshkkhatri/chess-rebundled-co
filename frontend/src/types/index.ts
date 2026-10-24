// Player info for player selection feature
export interface PlayerInfo {
  name: string;
  shortName: string;
  role: 'white' | 'black';
  gameCount: number;
  notableGames: string[]; // up to 3 game titles
  yearRange: { from: number; to: number };
}

// Shared types between frontend and backend
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
  moves: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  trivia: string[];
}

// Move details for board display
export interface MoveDetails {
  san: string;
  from: string;
  to: string;
}

// Practice mode types
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

export interface PracticeNextMoveData {
  position: string;
  currentMoveIndex: number;
  currentSide: 'white' | 'black';
  expectedMove: MoveDetails;
  opponentMove?: MoveDetails;
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

export type PracticeStatus = 'idle' | 'selecting' | 'playing' | 'completed';
export type PracticeMode = 'both-sides' | 'one-side';

// Combined move response (reduces socket round-trips)
export interface PracticeMoveResponseData {
  result: PracticeMoveResult;
  nextMove?: PracticeNextMoveData;
  completed?: PracticeCompletedData;
}

// Session resume data (for restoring session after page refresh)
export interface SessionResumedData {
  sessionId: string;
  game: HistoricalGame;
  position: string;
  currentMoveIndex: number;
  currentSide: 'white' | 'black';
  expectedMove: MoveDetails;
  totalMoves: number;
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null;
  moveResults: PracticeMoveResult[];
}

// AI Move Parsing Types
export interface AIParsedMoveResult {
  transcript: string;
  parsedMove: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
}
