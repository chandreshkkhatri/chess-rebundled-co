import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  TimeControl,
  MultiplayerStatus,
  GameEndReason,
  MultiplayerGameStartedData,
  MultiplayerMoveMadeData,
  MultiplayerGameOverData,
  MultiplayerGameResumedData,
} from '@/types/multiplayer';
import { AIParsedMoveResult } from '@/types';

interface MultiplayerState {
  // Connection
  isConnected: boolean;

  // Matchmaking
  isSearching: boolean;
  inviteCode: string | null;

  // Game state
  gameId: string | null;
  status: MultiplayerStatus;
  playerColor: 'white' | 'black' | null;
  fen: string;
  moves: string[];
  turn: 'white' | 'black';
  moveCount: number;
  lastMove: { from: string; to: string; san: string } | null;
  isCheck: boolean;

  // Players
  opponent: { uid: string; displayName: string; connected: boolean } | null;

  // Clock
  timeControl: TimeControl | null;
  whiteTimeMs: number;
  blackTimeMs: number;

  // Game end
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  endReason: GameEndReason | null;
  winner: 'white' | 'black' | null;

  // Draw
  drawOfferedBy: 'white' | 'black' | null;

  // Input
  isSubmitting: boolean;
  aiParseResult: AIParsedMoveResult | null;
  aiParseError: string | null;
  isAIParsing: boolean;

  // Error
  error: string | null;

  // Settings (persisted)
  preferredTimeControl: TimeControl | null;
  voiceParsingMode: 'webspeech-haiku' | 'gemini-audio';
  autoSubmitEnabled: boolean;
  inputMode: 'voice-tap' | 'tap-only';

  // Actions
  setConnected: (connected: boolean) => void;
  setSearching: (searching: boolean) => void;
  setInviteCode: (code: string | null) => void;
  startGame: (data: MultiplayerGameStartedData) => void;
  applyMove: (data: MultiplayerMoveMadeData) => void;
  setGameOver: (data: MultiplayerGameOverData) => void;
  updateClock: (white: number, black: number) => void;
  setDrawOffer: (by: 'white' | 'black' | null) => void;
  setOpponentDisconnected: () => void;
  setOpponentConnected: (name: string) => void;
  resumeGame: (data: MultiplayerGameResumedData) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setIllegalMove: (move: string, reason: string) => void;
  setAIParseResult: (result: AIParsedMoveResult | null) => void;
  setAIParseError: (error: string | null) => void;
  setAIParsing: (isParsing: boolean) => void;
  clearAIParseState: () => void;
  setError: (error: string | null) => void;
  setPreferredTimeControl: (tc: TimeControl | null) => void;
  setVoiceParsingMode: (mode: 'webspeech-haiku' | 'gemini-audio') => void;
  setAutoSubmitEnabled: (enabled: boolean) => void;
  setInputMode: (mode: 'voice-tap' | 'tap-only') => void;
  reset: () => void;
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const initialState = {
  isConnected: false,
  isSearching: false,
  inviteCode: null as string | null,
  gameId: null as string | null,
  status: 'idle' as MultiplayerStatus,
  playerColor: null as 'white' | 'black' | null,
  fen: STARTING_FEN,
  moves: [] as string[],
  turn: 'white' as const,
  moveCount: 0,
  lastMove: null as { from: string; to: string; san: string } | null,
  isCheck: false,
  opponent: null as { uid: string; displayName: string; connected: boolean } | null,
  timeControl: null as TimeControl | null,
  whiteTimeMs: 0,
  blackTimeMs: 0,
  result: null as '1-0' | '0-1' | '1/2-1/2' | null,
  endReason: null as GameEndReason | null,
  winner: null as 'white' | 'black' | null,
  drawOfferedBy: null as 'white' | 'black' | null,
  isSubmitting: false,
  aiParseResult: null as AIParsedMoveResult | null,
  aiParseError: null as string | null,
  isAIParsing: false,
  error: null as string | null,
  preferredTimeControl: null as TimeControl | null,
  voiceParsingMode: 'webspeech-haiku' as 'webspeech-haiku' | 'gemini-audio',
  autoSubmitEnabled: false,
  inputMode: 'voice-tap' as 'voice-tap' | 'tap-only',
};

export const useMultiplayerStore = create<MultiplayerState>()(
  persist(
    (set) => ({
      ...initialState,

      setConnected: (connected) => set({ isConnected: connected }),

      setSearching: (searching) => set({
        isSearching: searching,
        status: searching ? 'searching' : 'idle',
        error: null,
      }),

      setInviteCode: (code) => set({ inviteCode: code }),

      startGame: (data) => set({
        gameId: data.gameId,
        status: 'playing',
        playerColor: data.playerColor,
        fen: data.fen,
        moves: [],
        turn: 'white',
        moveCount: 0,
        lastMove: null,
        isCheck: false,
        opponent: { uid: data.opponent.uid, displayName: data.opponent.displayName, connected: true },
        timeControl: data.timeControl,
        whiteTimeMs: data.whiteTimeMs,
        blackTimeMs: data.blackTimeMs,
        result: null,
        endReason: null,
        winner: null,
        drawOfferedBy: null,
        isSearching: false,
        inviteCode: null,
        isSubmitting: false,
        error: null,
      }),

      applyMove: (data) => set((state) => ({
        fen: data.fen,
        moves: [...state.moves, data.move.san],
        turn: data.turn,
        moveCount: data.moveCount,
        lastMove: data.move,
        isCheck: data.isCheck,
        whiteTimeMs: data.whiteTimeMs,
        blackTimeMs: data.blackTimeMs,
        isSubmitting: false,
        drawOfferedBy: null, // Clear draw offer on new move
      })),

      setGameOver: (data) => set({
        status: 'completed',
        result: data.result,
        endReason: data.endReason,
        winner: data.winner,
        fen: data.fen,
        whiteTimeMs: data.whiteTimeMs,
        blackTimeMs: data.blackTimeMs,
        isSubmitting: false,
      }),

      updateClock: (white, black) => set({
        whiteTimeMs: white,
        blackTimeMs: black,
      }),

      setDrawOffer: (by) => set({ drawOfferedBy: by }),

      setOpponentDisconnected: () => set((state) => ({
        opponent: state.opponent ? { ...state.opponent, connected: false } : null,
      })),

      setOpponentConnected: (name) => set((state) => ({
        opponent: state.opponent ? { ...state.opponent, connected: true, displayName: name } : null,
      })),

      resumeGame: (data) => set({
        gameId: data.gameId,
        status: 'playing',
        playerColor: data.playerColor,
        fen: data.fen,
        moves: data.moves,
        turn: data.turn,
        moveCount: data.moveCount,
        lastMove: data.lastMove,
        isCheck: false,
        opponent: { uid: data.opponent.uid, displayName: data.opponent.displayName, connected: data.opponent.connected },
        timeControl: data.timeControl,
        whiteTimeMs: data.whiteTimeMs,
        blackTimeMs: data.blackTimeMs,
        drawOfferedBy: data.drawOfferedBy,
        result: null,
        endReason: null,
        winner: null,
        isSearching: false,
        inviteCode: null,
        isSubmitting: false,
        error: null,
      }),

      setSubmitting: (isSubmitting) => set({ isSubmitting }),

      setIllegalMove: (_move, reason) => set({
        isSubmitting: false,
        error: reason,
      }),

      setAIParseResult: (result) => set({ aiParseResult: result, aiParseError: null, isAIParsing: false }),
      setAIParseError: (error) => set({ aiParseError: error, aiParseResult: null, isAIParsing: false }),
      setAIParsing: (isParsing) => set({ isAIParsing: isParsing }),
      clearAIParseState: () => set({ aiParseResult: null, aiParseError: null, isAIParsing: false }),

      setError: (error) => set({ error }),

      setPreferredTimeControl: (tc) => set({ preferredTimeControl: tc }),
      setVoiceParsingMode: (mode) => set({ voiceParsingMode: mode }),
      setAutoSubmitEnabled: (enabled) => set({ autoSubmitEnabled: enabled }),
      setInputMode: (mode) => set({ inputMode: mode }),

      reset: () => set(initialState),
    }),
    {
      name: 'chess-multiplayer-v1',
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
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
          if (typeof window === 'undefined') return;
          try {
            const { state, version } = value as { state: Record<string, unknown>; version: number };
            const prefs = {
              state: {
                preferredTimeControl: state.preferredTimeControl,
                voiceParsingMode: state.voiceParsingMode,
                autoSubmitEnabled: state.autoSubmitEnabled,
                inputMode: state.inputMode,
              },
              version,
            };
            const session = {
              state: {
                gameId: state.gameId,
              },
              version,
            };
            localStorage.setItem(`${name}-prefs`, JSON.stringify(prefs));
            sessionStorage.setItem(`${name}-session`, JSON.stringify(session));
          } catch {
            // Silently fail
          }
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
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
          preferredTimeControl: state.preferredTimeControl,
          voiceParsingMode: state.voiceParsingMode,
          autoSubmitEnabled: state.autoSubmitEnabled,
          inputMode: state.inputMode,
          gameId: state.gameId,
        }) as unknown as MultiplayerState,
    }
  )
);
