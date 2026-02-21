import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  HistoricalGame,
  MoveDetails,
  PracticeCompletedData,
  PracticeMoveResult,
  PracticeStatus,
  PracticeMode,
  AIParsedMoveResult,
  PracticeStartedData,
  PracticeNextMoveData,
  GamificationResult,
  SessionResumedData,
  Achievement,
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
  gamificationResult: GamificationResult | null;

  // Submission lock
  isSubmitting: boolean;

  // Starting session state (pending server response)
  isStarting: boolean;

  // Opponent delay
  isOpponentThinking: boolean;

  // Error state
  error: string | null;

  // AI parsing state
  aiParseResult: AIParsedMoveResult | null;
  aiParseError: string | null;
  isAIParsing: boolean;

  // Voice parsing mode
  voiceParsingMode: 'webspeech-haiku' | 'gemini-audio';
  geminiTranscription: string | null;

  // Settings
  autoSubmitEnabled: boolean;
  inputMode: 'voice-tap' | 'tap-only';

  // Achievement toasts queue
  pendingAchievements: Achievement[];

  // Actions
  setConnected: (connected: boolean) => void;
  setPlayerName: (name: string) => void;
  setAvailableGames: (games: HistoricalGame[]) => void;
  startSession: (data: PracticeStartedData) => void;
  updatePosition: (data: PracticeNextMoveData) => void;
  setPendingOpponentMove: (move: MoveDetails | null) => void;
  setMoveResult: (result: PracticeMoveResult) => void;
  setCompleted: (data: PracticeCompletedData, gamification?: GamificationResult) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setStarting: (isStarting: boolean) => void;
  setOpponentThinking: (isThinking: boolean) => void;
  setError: (error: string | null) => void;
  setAIParseResult: (result: AIParsedMoveResult | null) => void;
  setAIParseError: (error: string | null) => void;
  setAIParsing: (isParsing: boolean) => void;
  clearAIParseState: () => void;
  clearLastMoveResult: () => void;
  setVoiceParsingMode: (mode: 'webspeech-haiku' | 'gemini-audio') => void;
  setGeminiTranscription: (transcription: string | null) => void;
  setAutoSubmitEnabled: (enabled: boolean) => void;
  setInputMode: (mode: 'voice-tap' | 'tap-only') => void;
  queueAchievements: (achievements: Achievement[]) => void;
  dismissAchievement: (id: string) => void;
  resumeSession: (data: SessionResumedData) => void;
  clearSessionId: () => void;
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
  gamificationResult: null as GamificationResult | null,
  isSubmitting: false,
  isStarting: false,
  isOpponentThinking: false,
  error: null as string | null,
  mode: 'both-sides' as PracticeMode,
  playerColor: null as 'white' | 'black' | null,
  pendingOpponentMove: null as MoveDetails | null,
  aiParseResult: null as AIParsedMoveResult | null,
  aiParseError: null as string | null,
  isAIParsing: false,
  voiceParsingMode: (process.env.NEXT_PUBLIC_VOICE_PARSING_MODE === 'gemini-audio'
    ? 'gemini-audio'
    : 'webspeech-haiku') as 'webspeech-haiku' | 'gemini-audio',
  geminiTranscription: null as string | null,
  autoSubmitEnabled: false,
  inputMode: 'voice-tap' as 'voice-tap' | 'tap-only',
  pendingAchievements: [] as Achievement[],
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
          isStarting: false,
          isOpponentThinking: false,
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

      setCompleted: (data, gamification) =>
        set({
          status: 'completed',
          completedData: data,
          gamificationResult: gamification || null,
          currentExpectedMove: null,
          isSubmitting: false,
        }),

      setSubmitting: (isSubmitting) => set({ isSubmitting }),

      setStarting: (isStarting) => set({ isStarting }),

      setOpponentThinking: (isThinking) => set({ isOpponentThinking: isThinking }),

      setError: (error) => set({ error, isStarting: false }),

      setAIParseResult: (result) => set({ aiParseResult: result, aiParseError: null, isAIParsing: false }),

      setAIParseError: (error) => set({ aiParseError: error, aiParseResult: null, isAIParsing: false }),

      setAIParsing: (isParsing) => set({ isAIParsing: isParsing }),

      clearAIParseState: () => set({ aiParseResult: null, aiParseError: null, isAIParsing: false, geminiTranscription: null }),

      clearLastMoveResult: () => set({ lastMoveResult: null }),

      setVoiceParsingMode: (mode) => set({ voiceParsingMode: mode }),

      setGeminiTranscription: (transcription) => set({ geminiTranscription: transcription }),

      setAutoSubmitEnabled: (enabled) => set({ autoSubmitEnabled: enabled }),

      setInputMode: (mode) => set({ inputMode: mode }),

      queueAchievements: (achievements) =>
        set((state) => ({
          pendingAchievements: [...state.pendingAchievements, ...achievements],
        })),

      dismissAchievement: (id) =>
        set((state) => ({
          pendingAchievements: state.pendingAchievements.filter((a) => a.id !== id),
        })),

      resumeSession: (data) =>
        set({
          sessionId: data.sessionId,
          selectedGame: data.game,
          status: 'playing',
          currentPosition: data.position,
          currentMoveIndex: data.currentMoveIndex,
          currentSide: data.currentSide,
          currentExpectedMove: data.expectedMove,
          totalMoves: data.totalMoves,
          moveResults: data.moveResults,
          lastMoveResult: data.moveResults.length > 0
            ? data.moveResults[data.moveResults.length - 1]
            : null,
          completedData: null,
          gamificationResult: null,
          isSubmitting: false,
          isStarting: false,
          isOpponentThinking: false,
          error: null,
          mode: data.mode,
          playerColor: data.playerColor,
          pendingOpponentMove: null,
        }),

      clearSessionId: () => set({ sessionId: null }),

      reset: () => set(initialState),
    }),
    {
      name: 'chess-practice-v3', // Versioned for hybrid storage migration
      storage: {
        // Hybrid storage: localStorage for preferences, sessionStorage for session state
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          try {
            // Merge preferences from localStorage and session from sessionStorage
            const prefsStr = localStorage.getItem(`${name}-prefs`);
            const sessionStr = sessionStorage.getItem(`${name}-session`);

            const prefs = prefsStr ? JSON.parse(prefsStr) : {};
            const session = sessionStr ? JSON.parse(sessionStr) : {};

            // Return merged state if either exists
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

            // Split into preferences (localStorage) and session (sessionStorage)
            const prefs = {
              state: {
                playerName: state.playerName,
                voiceParsingMode: state.voiceParsingMode,
                autoSubmitEnabled: state.autoSubmitEnabled,
                inputMode: state.inputMode,
              },
              version,
            };

            const session = {
              state: {
                sessionId: state.sessionId,
              },
              version,
            };

            localStorage.setItem(`${name}-prefs`, JSON.stringify(prefs));
            sessionStorage.setItem(`${name}-session`, JSON.stringify(session));
          } catch {
            // Silently fail if storage is full or unavailable
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
      // Persist player name, voice mode, settings, and sessionId for resume functionality
      partialize: (state) =>
        ({
          playerName: state.playerName,
          voiceParsingMode: state.voiceParsingMode,
          autoSubmitEnabled: state.autoSubmitEnabled,
          inputMode: state.inputMode,
          sessionId: state.sessionId,
        }) as unknown as PracticeState,
    }
  )
);
