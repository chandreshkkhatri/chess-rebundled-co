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

// Socket Event Types
export interface ServerToClientEvents {
  'room-joined': (data: { roomId: string; players: Player[]; availableGames: HistoricalGame[] }) => void;
  'player-joined': (player: Player) => void;
  'player-left': (playerId: string) => void;
  'game-selected': (game: HistoricalGame) => void;
  'game-start': (data: { position: string; turn: 'white' | 'black'; timeLimit: number; players: Player[] }) => void;
  'timer-sync': (data: { remaining: number }) => void;
  'move-result': (result: MoveResult) => void;
  'turn-change': (data: { turn: 'white' | 'black'; position: string; moveIndex: number }) => void;
  'game-end': (data: { winner: string | null; players: Player[]; trivia: string[] }) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join-room': (data: { roomId: string; playerName: string }) => void;
  'select-game': (data: { roomId: string; gameId: string }) => void;
  'submit-move': (data: { roomId: string; move: string; confidence: number }) => void;
  'start-game': (data: { roomId: string }) => void;
}
