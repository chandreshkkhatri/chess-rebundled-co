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

export interface Player {
  id: string;
  socketId: string;
  name: string;
  color: 'white' | 'black';
  score: number;
  moveScores: number[];
}

export interface GameRoom {
  id: string;
  players: Player[];
  historicalGame: HistoricalGame | null;
  status: 'waiting' | 'selecting' | 'playing' | 'finished';
  currentMoveIndex: number;
  currentTurn: 'white' | 'black';
  timerStartedAt: number | null;
  timeLimit: number; // milliseconds
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

// Data sent when a challenge is accepted and game starts
export interface ChallengeAcceptedData {
  roomId: string;
  game: HistoricalGame;
  players: Player[];
  position: string;
  turn: 'white' | 'black';
  timeLimit: number;
  expectedMove: MoveDetails | null;
}

// Socket Event Types
export interface ServerToClientEvents {
  // Room events (legacy)
  'room-joined': (data: { roomId: string; players: Player[]; availableGames: HistoricalGame[] }) => void;
  'player-joined': (player: Player) => void;
  'player-left': (playerId: string) => void;
  'game-selected': (game: HistoricalGame) => void;
  'game-start': (data: { position: string; turn: 'white' | 'black'; timeLimit: number; players: Player[]; expectedMove: MoveDetails | null }) => void;
  'timer-sync': (data: { remaining: number }) => void;
  'move-result': (result: MoveResult) => void;
  'turn-change': (data: { turn: 'white' | 'black'; position: string; moveIndex: number; expectedMove: MoveDetails | null }) => void;
  'game-end': (data: { winner: string | null; players: Player[]; trivia: string[] }) => void;
  'error': (data: { message: string }) => void;
  // Lobby events
  'challenges-list': (challenges: Challenge[]) => void;
  'challenge-created': (challenge: Challenge) => void;
  'challenge-removed': (challengeId: string) => void;
  'challenge-accepted': (data: ChallengeAcceptedData) => void;
}

export interface ClientToServerEvents {
  // Room events (legacy)
  'join-room': (data: { roomId: string; playerName: string }) => void;
  'select-game': (data: { roomId: string; gameId: string }) => void;
  'submit-move': (data: { roomId: string; move: string; confidence: number }) => void;
  'start-game': (data: { roomId: string }) => void;
  // Lobby events
  'create-challenge': (data: { playerName: string }) => void;
  'cancel-challenge': () => void;
  'get-challenges': () => void;
  'accept-challenge': (data: { challengeId: string; playerName: string }) => void;
}
