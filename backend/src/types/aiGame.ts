// AI Opponent Game Types ("Play vs AI" mode, event prefix: ai-)

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
  id: string; // crypto.randomUUID()
  from: "player" | "bot";
  text: string;
  ts: number;
  turnIndex: number; // half-move index when sent
}

// One record per bot move — the private thinking log revealed post-game.
export interface AiTurnRecord {
  turnIndex: number; // half-move index of the bot's move
  fenBefore: string;
  thinking: string; // full private THINK text, verbatim
  chatEmitted: string[];
  move: string; // SAN actually played
  moveSource: AiMoveSource;
  llmProposedMove: string | null;
  durationMs: number;
}

export interface AiGameState {
  id: string;
  uid: string;
  playerName: string;
  playerColor: "white" | "black";
  personaId: string;
  status: AiGameStatus;
  fen: string;
  moves: string[]; // SAN
  chat: AiChatMessage[];
  turns: AiTurnRecord[];
  pendingPlayerChat: string[]; // player messages not yet consumed by a bot turn
  chatRepliesUsed: number;
  lastChatReplyAt: number;
  result: "1-0" | "0-1" | "1/2-1/2" | null;
  endReason: AiGameEndReason | null;
  winner: "player" | "bot" | null;
  createdAt: number;
  completedAt: number | null;
}

// Persona summary sent to the client (no prompt directives)
export interface AiPersonaPublic {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  rating: number;
}

// Socket event payloads

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
