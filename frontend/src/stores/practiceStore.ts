import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  HistoricalGame,
  MoveDetails,
  PracticeCompletedData,
  PracticeMoveResult,
  PracticeStatus,
  PracticeMode,
} from '@/types';

interface PracticeState {
  // Connection (shared from main app)
  isConnected: boolean;
  playerName: string;

  // Game selection
  availableGames: HistoricalGame[];

  // Session state
  sessionId: string | null;
  selectedGame: HistoricalGame | null;
  status: PracticeStatus;
  currentPosition: string;
  currentMoveIndex: number;
  currentSide: 'white' | 'black';
  currentExpectedMove: MoveDetails | null;
  totalMoves: number;

  // Practice mode settings
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null;
  pendingOpponentMove: MoveDetails | null; // For animating opponent's move in one-side mode

  // Results
  moveResults: PracticeMoveResult[];
  lastMoveResult: PracticeMoveResult | null;
  completedData: PracticeCompletedData | null;

  // Submission lock
  isSubmitting: boolean;

  // Error state
  error: string | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setPlayerName: (name: string) => void;
  setAvailableGames: (games: HistoricalGame[]) => void;
  startSession: (data: {
    sessionId: string;
    game: HistoricalGame;
    position: string;
    currentMoveIndex: number;
    currentSide: 'white' | 'black';
    expectedMove: MoveDetails;
    totalMoves: number;
    mode: PracticeMode;
    playerColor: 'white' | 'black' | null;
  }) => void;
  updatePosition: (data: {
    position: string;
    currentMoveIndex: number;
    currentSide: 'white' | 'black';
    expectedMove: MoveDetails;
    opponentMove?: MoveDetails;
  }) => void;
  setPendingOpponentMove: (move: MoveDetails | null) => void;
  setMoveResult: (result: PracticeMoveResult) => void;
  setCompleted: (data: PracticeCompletedData) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  playerName: '',
  availableGames: [] as HistoricalGame[],
  sessionId: null as string | null,
  selectedGame: null as HistoricalGame | null,
  status: 'idle' as PracticeStatus,
  currentPosition: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  currentMoveIndex: 0,
  currentSide: 'white' as const,
  currentExpectedMove: null as MoveDetails | null,
  totalMoves: 0,
  moveResults: [] as PracticeMoveResult[],
  lastMoveResult: null as PracticeMoveResult | null,
  completedData: null as PracticeCompletedData | null,
  isSubmitting: false,
  error: null as string | null,
  mode: 'both-sides' as PracticeMode,
  playerColor: null as 'white' | 'black' | null,
  pendingOpponentMove: null as MoveDetails | null,
};

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set) => ({
      ...initialState,

      setConnected: (connected) => set({ isConnected: connected }),

      setPlayerName: (name) => set({ playerName: name }),

      setAvailableGames: (games) =>
        set({ availableGames: games, status: 'selecting' }),

      startSession: (data) =>
        set({
          sessionId: data.sessionId,
          selectedGame: data.game,
          status: 'playing',
          currentPosition: data.position,
          currentMoveIndex: data.currentMoveIndex,
          currentSide: data.currentSide,
          currentExpectedMove: data.expectedMove,
          totalMoves: data.totalMoves,
          moveResults: [],
          lastMoveResult: null,
          completedData: null,
          isSubmitting: false,
          error: null,
          mode: data.mode,
          playerColor: data.playerColor,
          pendingOpponentMove: null,
        }),

      updatePosition: (data) =>
        set({
          currentPosition: data.position,
          currentMoveIndex: data.currentMoveIndex,
          currentSide: data.currentSide,
          currentExpectedMove: data.expectedMove,
          isSubmitting: false,
          pendingOpponentMove: data.opponentMove || null,
        }),

      setPendingOpponentMove: (move) => set({ pendingOpponentMove: move }),

      setMoveResult: (result) =>
        set((state) => ({
          moveResults: [...state.moveResults, result],
          lastMoveResult: result,
        })),

      setCompleted: (data) =>
        set({
          status: 'completed',
          completedData: data,
          currentExpectedMove: null,
          isSubmitting: false,
        }),

      setSubmitting: (isSubmitting) => set({ isSubmitting }),

      setError: (error) => set({ error }),

      reset: () => set(initialState),
    }),
    {
      name: 'chess-practice-storage',
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          sessionStorage.removeItem(name);
        },
      },
      partialize: (state) =>
        ({
          sessionId: state.sessionId,
          playerName: state.playerName,
          status: state.status,
          selectedGame: state.selectedGame,
          mode: state.mode,
          playerColor: state.playerColor,
          currentPosition: state.currentPosition,
          currentMoveIndex: state.currentMoveIndex,
          currentSide: state.currentSide,
          currentExpectedMove: state.currentExpectedMove,
          totalMoves: state.totalMoves,
        }) as PracticeState,
    }
  )
);
