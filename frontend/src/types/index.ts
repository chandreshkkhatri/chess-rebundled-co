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

export interface Player {
  id: string;
  socketId: string;
  name: string;
  color: 'white' | 'black';
  score: number;
  moveScores: number[];
}

export interface MoveResult {
  playerId: string;
  submittedMove: string;
  expectedMove: string;
  isCorrect: boolean;
  timeRemaining: number;
  timeTotal: number;
  score: number;
}

// Challenge type for lobby system
export interface Challenge {
  id: string;
  creatorSocketId: string;
  creatorName: string;
  createdAt: number;
}

// Move details for board display
export interface MoveDetails {
  san: string;
  from: string;
  to: string;
}

// Data sent when a challenge is accepted (goes to ready screen, game not started yet)
export interface ChallengeAcceptedData {
  roomId: string;
  game: HistoricalGame;
  players: Player[];
  position: string;
  timeLimit: number;
}

export type GameStatus = 'idle' | 'in-lobby' | 'waiting-for-match' | 'joining' | 'waiting' | 'selecting' | 'ready' | 'countdown' | 'playing' | 'finished';

// Data sent when rejoining a room
export interface RejoinData {
  roomId: string;
  players: Player[];
  selectedGame: HistoricalGame;
  status: GameStatus;
  currentPosition: string;
  currentTurn: 'white' | 'black';
  moveIndex: number;
  timeLimit: number;
  whiteTime: number;
  blackTime: number;
  expectedMove: MoveDetails | null;
  myPlayerId: string;
  myColor: 'white' | 'black';
  readyPlayers: string[];
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

// AI Move Parsing Types
export interface AIParsedMoveResult {
  transcript: string;
  parsedMove: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
}
