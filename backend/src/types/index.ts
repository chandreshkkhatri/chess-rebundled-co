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
  status: 'waiting' | 'selecting' | 'ready' | 'countdown' | 'playing' | 'finished';
  currentMoveIndex: number;
  currentTurn: 'white' | 'black';
  timerStartedAt: number | null;
  timeLimit: number; // milliseconds - total time per player (3 minutes = 180000)
  whiteTimeRemaining: number; // milliseconds remaining for white
  blackTimeRemaining: number; // milliseconds remaining for black
  readyPlayers: Set<string>; // player IDs who are ready
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

// Data sent when a challenge is accepted (goes to ready screen)
export interface ChallengeAcceptedData {
  roomId: string;
  game: HistoricalGame;
  players: Player[];
  position: string;
  timeLimit: number;
}

// Data sent when rejoining a room
export interface RejoinData {
  roomId: string;
  players: Player[];
  selectedGame: HistoricalGame;
  status: 'waiting' | 'selecting' | 'ready' | 'countdown' | 'playing' | 'finished';
  currentPosition: string;
  currentTurn: 'white' | 'black';
  moveIndex: number;
  timeLimit: number;
  whiteTime: number;
  blackTime: number;
  expectedMove: MoveDetails | null;
  myPlayerId: string;
  myColor: 'white' | 'black';
  readyPlayers: string[]; // IDs of ready players
}

// Practice Mode Types
export type PracticeMode = 'both-sides' | 'one-side';

export interface PracticeSession {
  id: string;
  socketId: string;
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
}

// Socket Event Types
export interface ServerToClientEvents {
  // Room events (legacy)
  'room-joined': (data: { roomId: string; players: Player[]; availableGames: HistoricalGame[] }) => void;
  'player-joined': (player: Player) => void;
  'player-left': (playerId: string) => void;
  'game-selected': (game: HistoricalGame) => void;
  'game-start': (data: { position: string; turn: 'white' | 'black'; timeLimit: number; whiteTime: number; blackTime: number; players: Player[]; expectedMove: MoveDetails | null }) => void;
  'timer-sync': (data: { whiteTime: number; blackTime: number; turn: 'white' | 'black'; position: string; moveIndex: number; players: Player[] }) => void;
  'move-result': (result: MoveResult) => void;
  'turn-change': (data: { turn: 'white' | 'black'; position: string; moveIndex: number; whiteTime: number; blackTime: number; expectedMove: MoveDetails | null }) => void;
  'game-end': (data: { winner: string | null; players: Player[]; trivia: string[]; reason?: 'completed' | 'timeout' }) => void;
  'error': (data: { message: string }) => void;
  // Lobby events
  'challenges-list': (challenges: Challenge[]) => void;
  'challenge-created': (challenge: Challenge) => void;
  'challenge-removed': (challengeId: string) => void;
  'challenge-accepted': (data: ChallengeAcceptedData) => void;
  // Ready/countdown events
  'player-ready': (playerId: string) => void;
  'countdown-start': (seconds: number) => void;
  'countdown-tick': (seconds: number) => void;
  // Rejoin events
  'room-rejoined': (data: RejoinData) => void;
  'rejoin-failed': (data: { message: string }) => void;
  // Practice mode events
  'practice-games-list': (games: HistoricalGame[]) => void;
  'practice-started': (data: PracticeStartedData) => void;
  'practice-move-result': (result: PracticeMoveResult) => void;
  'practice-next-move': (data: { position: string; currentMoveIndex: number; currentSide: 'white' | 'black'; expectedMove: MoveDetails; opponentMove?: MoveDetails }) => void;
  'practice-completed': (data: PracticeCompletedData) => void;
  'practice-error': (data: { message: string }) => void;
  // AI move parsing events
  'move-parsed': (data: AIParsedMoveResult) => void;
  'parse-error': (data: { message: string }) => void;
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
  // Ready event
  'player-ready': (data: { roomId: string }) => void;
  // Rejoin events
  'rejoin-room': (data: { roomId: string; playerId: string }) => void;
  // Practice mode events
  'get-practice-games': () => void;
  'start-practice': (data: { gameId?: string; playerName: string; mode?: PracticeMode; playerColor?: 'white' | 'black' }) => void;
  'start-practice-random': (data: { playerName: string; mode?: PracticeMode; playerColor?: 'white' | 'black' }) => void;
  'submit-practice-move': (data: { sessionId: string; move: string }) => void;
  'abandon-practice': (data: { sessionId: string }) => void;
  // AI move parsing events
  'parse-move-with-ai': (data: { sessionId: string; transcript: string }) => void;
}
