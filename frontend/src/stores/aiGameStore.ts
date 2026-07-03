import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AiChatMessage,
  AiGameEndReason,
  AiGameOverData,
  AiGameResumedData,
  AiGameStartedData,
  AiGameStatus,
  AiMoveMadeData,
  AiPersonaPublic,
  AiReviewData,
} from "@/types/aiGame";

interface AiGameStoreState {
  // Connection
  isConnected: boolean;

  // Game state
  gameId: string | null;
  status: "idle" | AiGameStatus;
  playerColor: "white" | "black" | null;
  persona: AiPersonaPublic | null;
  fen: string;
  moves: string[];
  turn: "white" | "black";
  lastMove: { from: string; to: string; san: string } | null;
  isCheck: boolean;

  // Chat
  chat: AiChatMessage[];
  botTyping: boolean;
  botTurnInProgress: boolean;

  // Game end
  result: "1-0" | "0-1" | "1/2-1/2" | null;
  endReason: AiGameEndReason | null;
  winner: "player" | "bot" | null;
  finalBotMessage: string | null;

  // Review
  reviewData: AiReviewData | null;

  // Input / errors
  isSubmitting: boolean;
  error: string | null;
  notFound: boolean;

  // Settings (persisted)
  preferredPersonaId: string;

  // Actions
  setConnected: (connected: boolean) => void;
  startGame: (data: AiGameStartedData) => void;
  applyMove: (data: AiMoveMadeData) => void;
  appendChat: (message: AiChatMessage) => void;
  setTyping: (typing: boolean) => void;
  setBotTurnInProgress: (inProgress: boolean) => void;
  setGameOver: (data: AiGameOverData) => void;
  resumeGame: (data: AiGameResumedData) => void;
  setReviewData: (data: AiReviewData | null) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setError: (error: string | null) => void;
  setNotFound: (notFound: boolean) => void;
  setPreferredPersonaId: (id: string) => void;
  reset: () => void;
}

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const initialState = {
  isConnected: false,
  gameId: null as string | null,
  status: "idle" as "idle" | AiGameStatus,
  playerColor: null as "white" | "black" | null,
  persona: null as AiPersonaPublic | null,
  fen: STARTING_FEN,
  moves: [] as string[],
  turn: "white" as "white" | "black",
  lastMove: null as { from: string; to: string; san: string } | null,
  isCheck: false,
  chat: [] as AiChatMessage[],
  botTyping: false,
  botTurnInProgress: false,
  result: null as "1-0" | "0-1" | "1/2-1/2" | null,
  endReason: null as AiGameEndReason | null,
  winner: null as "player" | "bot" | null,
  finalBotMessage: null as string | null,
  reviewData: null as AiReviewData | null,
  isSubmitting: false,
  error: null as string | null,
  notFound: false,
  preferredPersonaId: "rook-rodriguez",
};

export const useAiGameStore = create<AiGameStoreState>()(
  persist(
    (set) => ({
      ...initialState,

      setConnected: (connected) => set({ isConnected: connected }),

      startGame: (data) =>
        set({
          gameId: data.gameId,
          status: "active",
          playerColor: data.playerColor,
          persona: data.persona,
          fen: data.fen,
          moves: [],
          turn: "white",
          lastMove: null,
          isCheck: false,
          chat: [],
          botTyping: false,
          botTurnInProgress: false,
          result: null,
          endReason: null,
          winner: null,
          finalBotMessage: null,
          reviewData: null,
          isSubmitting: false,
          error: null,
          notFound: false,
        }),

      applyMove: (data) =>
        set((state) => ({
          fen: data.fen,
          moves: [...state.moves, data.move.san],
          turn: data.turn,
          lastMove: data.move,
          isCheck: data.isCheck,
          isSubmitting: false,
          error: null,
        })),

      appendChat: (message) =>
        set((state) =>
          state.chat.some((m) => m.id === message.id)
            ? state
            : { chat: [...state.chat, message] },
        ),

      setTyping: (typing) => set({ botTyping: typing }),

      setBotTurnInProgress: (inProgress) =>
        set((state) => ({
          botTurnInProgress: inProgress,
          status:
            state.status === "completed" || state.status === "idle"
              ? state.status
              : inProgress
                ? "bot-thinking"
                : "active",
          ...(inProgress ? {} : { botTyping: false }),
        })),

      setGameOver: (data) =>
        set({
          status: "completed",
          result: data.result,
          endReason: data.endReason,
          winner: data.winner,
          fen: data.fen,
          finalBotMessage: data.finalBotMessage,
          botTyping: false,
          botTurnInProgress: false,
          isSubmitting: false,
        }),

      resumeGame: (data) =>
        set({
          gameId: data.gameId,
          status: data.status,
          playerColor: data.playerColor,
          persona: data.persona,
          fen: data.fen,
          moves: data.moves,
          turn: data.turn,
          lastMove: null,
          isCheck: false,
          chat: data.chat,
          botTyping: false,
          botTurnInProgress: data.botTurnInProgress,
          result: data.result,
          endReason: data.endReason,
          winner: data.winner,
          isSubmitting: false,
          error: null,
          notFound: false,
        }),

      setReviewData: (data) => set({ reviewData: data }),

      setSubmitting: (isSubmitting) => set({ isSubmitting }),

      setError: (error) => set({ error, isSubmitting: false }),

      setNotFound: (notFound) => set({ notFound }),

      setPreferredPersonaId: (id) => set({ preferredPersonaId: id }),

      reset: () => set(initialState),
    }),
    {
      name: "ai-game-store",
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null;
          try {
            const prefsStr = localStorage.getItem(`${name}-prefs`);
            const sessionStr = sessionStorage.getItem(`${name}-session`);
            const prefs = prefsStr ? JSON.parse(prefsStr) : {};
            const session = sessionStr ? JSON.parse(sessionStr) : {};
            if (prefsStr || sessionStr) {
              return {
                state: { ...prefs.state, ...session.state },
                version: prefs.version || session.version || 0,
              };
            }
            return null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return;
          try {
            const { state, version } = value as {
              state: Record<string, unknown>;
              version: number;
            };
            localStorage.setItem(
              `${name}-prefs`,
              JSON.stringify({
                state: { preferredPersonaId: state.preferredPersonaId },
                version,
              }),
            );
            sessionStorage.setItem(
              `${name}-session`,
              JSON.stringify({ state: { gameId: state.gameId }, version }),
            );
          } catch {
            // Silently fail
          }
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return;
          try {
            localStorage.removeItem(`${name}-prefs`);
            sessionStorage.removeItem(`${name}-session`);
          } catch {
            // Silently fail
          }
        },
      },
      partialize: (state) =>
        ({
          preferredPersonaId: state.preferredPersonaId,
          gameId: state.gameId,
        }) as unknown as AiGameStoreState,
    },
  ),
);
