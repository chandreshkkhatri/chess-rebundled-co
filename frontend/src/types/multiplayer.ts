// Multiplayer Game Types

export interface TimeControl {
  initialTimeMs: number;
  incrementMs: number;
}

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

export type MultiplayerStatus = 'idle' | 'searching' | 'playing' | 'completed';

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
