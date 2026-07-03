// AI Opponent Game Types (mirrors backend/src/types/aiGame.ts)

export type AiGameStatus = "active" | "bot-thinking" | "completed";

export type AiGameEndReason =
  | "checkmate"
  | "stalemate"
  | "resignation"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_move_rule"
  | "move_cap";

export type AiMoveSource = "llm" | "llm-retry" | "heuristic" | "random";

export interface AiChatMessage {
  id: string;
  from: "player" | "bot";
  text: string;
  ts: number;
  turnIndex: number;
}

export interface AiPersonaPublic {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  rating: number;
}

export interface AiGameStartedData {
  gameId: string;
  playerColor: "white" | "black";
  persona: AiPersonaPublic;
  fen: string;
}

export interface AiMoveMadeData {
  gameId: string;
  by: "player" | "bot";
  move: { san: string; from: string; to: string };
  fen: string;
  turn: "white" | "black";
  moveCount: number;
  isCheck: boolean;
}

export interface AiGameOverData {
  gameId: string;
  result: "1-0" | "0-1" | "1/2-1/2";
  endReason: AiGameEndReason;
  winner: "player" | "bot" | null;
  fen: string;
  pgn: string;
  moves: string[];
  finalBotMessage: string | null;
}

export interface AiGameResumedData {
  gameId: string;
  playerColor: "white" | "black";
  persona: AiPersonaPublic;
  fen: string;
  moves: string[];
  turn: "white" | "black";
  chat: AiChatMessage[];
  status: AiGameStatus;
  botTurnInProgress: boolean;
  result: "1-0" | "0-1" | "1/2-1/2" | null;
  endReason: AiGameEndReason | null;
  winner: "player" | "bot" | null;
}

export interface AiReviewTurn {
  turnIndex: number;
  fenBefore: string;
  move: string;
  thinking: string;
  moveSource: AiMoveSource;
}

export interface AiReviewData {
  gameId: string;
  persona: AiPersonaPublic;
  playerColor: "white" | "black";
  moves: string[];
  result: "1-0" | "0-1" | "1/2-1/2" | null;
  endReason: AiGameEndReason | null;
  winner: "player" | "bot" | null;
  pgn: string;
  turns: AiReviewTurn[];
  chat: AiChatMessage[];
}

export type AiErrorCode =
  | "AUTH_REQUIRED"
  | "LIMIT_REACHED"
  | "AI_UNAVAILABLE"
  | "BUSY";

export interface AiErrorData {
  message: string;
  code?: AiErrorCode;
}

// Persona cards shown in the setup screen. Ids must match
// backend/src/data/aiPersonas.ts.
export const AI_PERSONAS: AiPersonaPublic[] = [
  {
    id: "rook-rodriguez",
    name: "Rook Rodriguez",
    emoji: "🃏",
    tagline: "Club-night trash talker. Loves a cheap trick.",
    rating: 900,
  },
  {
    id: "professor-petrova",
    name: "Professor Petrova",
    emoji: "👩‍🏫",
    tagline: "Calm positional teacher. Explains just enough to worry you.",
    rating: 1500,
  },
  {
    id: "blitz-bogdan",
    name: "Blitz Bogdan",
    emoji: "⚡",
    tagline: "Gambit maniac. Attacks first, counts material later.",
    rating: 1300,
  },
];
