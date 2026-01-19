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

// Data sent when a challenge is accepted and game starts
export interface ChallengeAcceptedData {
  roomId: string;
  game: HistoricalGame;
  players: Player[];
  position: string;
  turn: 'white' | 'black';
  timeLimit: number;
}

export type GameStatus = 'idle' | 'in-lobby' | 'waiting-for-match' | 'joining' | 'waiting' | 'selecting' | 'playing' | 'finished';
