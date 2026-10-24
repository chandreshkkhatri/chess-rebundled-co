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

// Concise final-answer explanation captured with a move, hidden until completion.
export interface AiDecisionSummary {
  summary: string;
  alternatives: { move: string; reason: string }[];
  threat: string;
  plan: string;
}

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
  aiNotice?: string | null;
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
  aiNotice?: string | null;
  result: "1-0" | "0-1" | "1/2-1/2" | null;
  endReason: AiGameEndReason | null;
  winner: "player" | "bot" | null;
}

export interface AiReviewTurn {
  turnIndex: number;
  fenBefore: string;
  move: string;
  decision?: AiDecisionSummary; // optional for games saved before structured summaries
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
    tagline: "Tricky and adventurous. Looks for quick tactical chances.",
    rating: 900,
  },
  {
    id: "professor-petrova",
    name: "Professor Petrova",
    emoji: "👩‍🏫",
    tagline: "Patient and positional. Values structure and piece activity.",
    rating: 1500,
  },
  {
    id: "blitz-bogdan",
    name: "Blitz Bogdan",
    emoji: "⚡",
    tagline: "An attacking risk-taker. Prefers gambits and open lines.",
    rating: 1300,
  },
];

// Parsing requests are tied to both a game and its exact position. They never
// apply a move; the regular move boundary still validates submissions.
export interface AiMoveParseRequest {
  gameId: string;
  requestId: string;
  fen: string;
  transcript?: string;
  rawTranscript?: string;
  audioBase64?: string;
  mimeType?: string;
}

export interface AiMoveParsedData {
  gameId: string;
  requestId: string;
  fen: string;
  transcript: string;
  parsedMove: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
}
