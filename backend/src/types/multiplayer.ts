// Multiplayer Game Types

export interface TimeControl {
  initialTimeMs: number;    // e.g., 600000 (10 min)
  incrementMs: number;      // e.g., 0 or 5000 (5s Fischer increment)
}

export type MultiplayerGameStatus =
  | 'waiting'      // Created, waiting for opponent
  | 'active'       // Both players connected, game in progress
  | 'paused'       // One player disconnected, waiting for reconnection
  | 'completed';   // Game over

export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'timeout'
  | 'resignation'
  | 'draw_agreement'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'abandonment';

export interface MultiplayerPlayer {
  uid: string;
  displayName: string;
  socketId: string | null;
  color: 'white' | 'black';
  connected: boolean;
  timeRemainingMs: number;
}

export interface MultiplayerGameState {
  id: string;
  status: MultiplayerGameStatus;
  fen: string;
  moves: string[];            // SAN notation
  turn: 'white' | 'black';
  moveCount: number;
  lastMove: { from: string; to: string; san: string } | null;

  white: MultiplayerPlayer;
  black: MultiplayerPlayer;

  timeControl: TimeControl | null;
  lastTickAt: number;

  result: '1-0' | '0-1' | '1/2-1/2' | null;
  endReason: GameEndReason | null;
  winner: 'white' | 'black' | null;

  drawOfferedBy: 'white' | 'black' | null;

  inviteCode: string | null;
  createdAt: number;
  startedAt: number | null;
}

// Socket event data interfaces

export interface MultiplayerGameStartedData {
  gameId: string;
  playerColor: 'white' | 'black';
  opponent: { uid: string; displayName: string };
  fen: string;
  timeControl: TimeControl | null;
  whiteTimeMs: number;
  blackTimeMs: number;
}

export interface MultiplayerMoveMadeData {
  gameId: string;
  move: { san: string; from: string; to: string };
  fen: string;
  turn: 'white' | 'black';
  moveCount: number;
  whiteTimeMs: number;
  blackTimeMs: number;
  isCheck: boolean;
}

export interface MultiplayerGameOverData {
  gameId: string;
  result: '1-0' | '0-1' | '1/2-1/2';
  endReason: GameEndReason;
  winner: 'white' | 'black' | null;
  fen: string;
  pgn: string;
  moves: string[];
  whiteTimeMs: number;
  blackTimeMs: number;
}

export interface MultiplayerGameResumedData {
  gameId: string;
  playerColor: 'white' | 'black';
  opponent: { uid: string; displayName: string; connected: boolean };
  fen: string;
  moves: string[];
  turn: 'white' | 'black';
  moveCount: number;
  lastMove: { from: string; to: string; san: string } | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  timeControl: TimeControl | null;
  drawOfferedBy: 'white' | 'black' | null;
}

export interface QueueEntry {
  uid: string;
  displayName: string;
  socketId: string;
  joinedAt: number;
}
