'use client';

import { useEffect, useCallback } from 'react';
import { getSocket, connectSocket, setAuthToken } from '@/lib/socket';
import { usePracticeStore } from '@/stores/practiceStore';
import { trackEvent } from '@/lib/analytics';
import { subscribeToAuthState, getIdToken } from '@/lib/firebase';
import {
  PracticeStartedData,
  PracticeMode,
  AIParsedMoveResult,
  PracticeMoveResponseData,
  SessionResumedData,
} from '@/types';

// Track if listeners have been attached (module-level, survives remounts)
// IMPORTANT: Never remove listeners - they stay attached for the app's lifetime
let listenersAttached = false;

// Track submit timeout for safety reset (Bug 3 fix)
let submitTimeoutId: NodeJS.Timeout | null = null;

// Track if auth subscription is set up
let authSubscribed = false;

export function usePracticeSocket() {
  const {
    setConnected,
    setSubmitting,
  } = usePracticeStore();

  // Subscribe to auth state changes and update socket token
  useEffect(() => {
    if (!authSubscribed) {
      authSubscribed = true;

      subscribeToAuthState(async (user) => {
        if (user) {
          const token = await getIdToken();
          setAuthToken(token);
        } else {
          setAuthToken(null);
        }
      });
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    // Only attach listeners ONCE globally - never remove them
    // This prevents race conditions with React Strict Mode's double-mounting
    if (!listenersAttached) {
      listenersAttached = true;

      // Remove any stale listeners first (safety cleanup from previous hot reloads)
      socket.off('practice-started');
      socket.off('practice-move-response');
      socket.off('practice-error');
      socket.off('session-resumed');
      socket.off('session-not-found');
      socket.off('move-parsed');
      socket.off('parse-error');
      socket.off('audio-move-parsed');
      socket.off('audio-parse-error');

      socket.on('connect', () => {
        usePracticeStore.getState().setConnected(true);
      });

      socket.on('disconnect', () => {
        // Bug 1 fix: Reset all submission states on disconnect
        const store = usePracticeStore.getState();
        store.setConnected(false);
        store.setSubmitting(false);
        store.setAIParsing(false);
        store.clearAIParseState();
        // Clear any pending submit timeout
        if (submitTimeoutId) {
          clearTimeout(submitTimeoutId);
          submitTimeoutId = null;
        }
      });

      socket.on('practice-started', (data: PracticeStartedData) => {
        usePracticeStore.getState().startSession({
          sessionId: data.sessionId,
          game: data.game,
          position: data.position,
          currentMoveIndex: data.currentMoveIndex,
          currentSide: data.currentSide,
          expectedMove: data.expectedMove,
          totalMoves: data.totalMoves,
          mode: data.mode,
          playerColor: data.playerColor,
        });

        // Track session started
        trackEvent('practice_session_started', {
          gameId: data.game.id,
          gameTitle: data.game.title,
          whitePlayer: data.game.white.name,
          blackPlayer: data.game.black.name,
          year: data.game.year,
          mode: data.mode,
          playerColor: data.playerColor ?? undefined,
          totalMoves: data.totalMoves,
        });
      });

      // Combined response event (reduces latency by handling result + next move in one emission)
      // Note: We only listen to practice-move-response, not the legacy practice-move-result
      // to avoid duplicate entries in moveResults
      socket.on('practice-move-response', (data: PracticeMoveResponseData) => {
        // Clear submit timeout on successful response
        if (submitTimeoutId) {
          clearTimeout(submitTimeoutId);
          submitTimeoutId = null;
        }

        const store = usePracticeStore.getState();

        // Handle move result
        store.setMoveResult(data.result);

        // Handle next move or completion
        if (data.completed) {
          store.setCompleted(data.completed, data.gamification);
          // Track session completed
          trackEvent('practice_session_completed', {
            gameId: data.completed.game.id,
            gameTitle: data.completed.game.title,
            correctMoves: data.completed.correctMoves,
            incorrectMoves: data.completed.totalMoves - data.completed.correctMoves,
            totalMoves: data.completed.totalMoves,
            accuracy: Math.round(data.completed.accuracy * 100),
            mode: store.mode,
            xpEarned: data.gamification?.xp.totalXp,
            leveledUp: data.gamification?.xp.leveledUp,
            newAchievements: data.gamification?.newAchievements.length,
          });
        } else if (data.nextMove) {
          store.updatePosition({
            position: data.nextMove.position,
            currentMoveIndex: data.nextMove.currentMoveIndex,
            currentSide: data.nextMove.currentSide,
            expectedMove: data.nextMove.expectedMove,
            opponentMove: data.nextMove.opponentMove,
          });
        }
      });

      // Note: We don't listen to legacy practice-next-move and practice-completed
      // events since practice-move-response already handles them

      socket.on('practice-error', (data: { message: string }) => {
        // Bug 3 fix: Clear submit timeout and reset submitting on error
        if (submitTimeoutId) {
          clearTimeout(submitTimeoutId);
          submitTimeoutId = null;
        }
        console.log('[Socket] Received practice-error:', data.message);
        const store = usePracticeStore.getState();
        store.setError(data.message);
        store.setSubmitting(false);
      });

      // Session resume events
      socket.on('session-resumed', (data: SessionResumedData) => {
        console.log('[Socket] Session resumed:', data.sessionId);
        usePracticeStore.getState().resumeSession(data);
      });

      socket.on('session-not-found', (data: { sessionId: string; reason: string }) => {
        console.log('[Socket] Session not found:', data.sessionId, data.reason);
        const store = usePracticeStore.getState();
        store.clearSessionId();
        store.setError(`Session expired: ${data.reason}`);
      });

      // AI parsing events - use store instead of window events
      socket.on('move-parsed', (data: AIParsedMoveResult) => {
        usePracticeStore.getState().setAIParseResult(data);
      });

      socket.on('parse-error', (data: { message: string }) => {
        usePracticeStore.getState().setAIParseError(data.message);
      });

      // Gemini audio parsing events
      socket.on('audio-move-parsed', (data: AIParsedMoveResult & { transcription?: string }) => {
        usePracticeStore.getState().setAIParseResult(data);
        if (data.transcription) {
          usePracticeStore.getState().setGeminiTranscription(data.transcription);
        }
      });

      socket.on('audio-parse-error', (data: { message: string }) => {
        usePracticeStore.getState().setAIParseError(data.message);
      });
    }

    connectSocket();

    // If socket is already connected, set connected state immediately
    if (socket.connected) {
      setConnected(true);
    }

    // NO CLEANUP - listeners stay attached forever to prevent race conditions
  }, [setConnected]);

  const startPractice = useCallback((
    gameId: string,
    playerName: string,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null
  ) => {
    const socket = getSocket();
    socket.emit('start-practice', { gameId, playerName, mode, playerColor });
  }, []);

  const startPracticeRandom = useCallback((
    playerName: string,
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null
  ): boolean => {
    const socket = getSocket();
    console.log('[Socket] startPracticeRandom called. socket.connected:', socket.connected);

    // Validate connection before emit
    if (!socket.connected) {
      console.log('[Socket] Not connected, setting error');
      usePracticeStore.getState().setError('Not connected to server. Please refresh the page.');
      return false;
    }

    console.log('[Socket] Emitting start-practice-random:', { playerName, mode, playerColor });
    usePracticeStore.getState().setStarting(true);
    socket.emit('start-practice-random', { playerName, mode, playerColor });
    return true;
  }, []);

  const startPracticeByPlayer = useCallback((
    playerName: string,
    historicalPlayerName: string,
    role: 'white' | 'black',
    mode: PracticeMode = 'both-sides',
    playerColor: 'white' | 'black' | null = null
  ): boolean => {
    const socket = getSocket();
    if (!socket.connected) {
      usePracticeStore.getState().setError('Not connected to server. Please refresh the page.');
      return false;
    }
    usePracticeStore.getState().setStarting(true);
    socket.emit('start-practice-by-player', { playerName, historicalPlayerName, role, mode, playerColor: playerColor ?? undefined });
    return true;
  }, []);

  const submitPracticeMove = useCallback((sessionId: string, move: string) => {
    const socket = getSocket();
    const state = usePracticeStore.getState();

    // Don't submit if already submitting
    if (state.isSubmitting) {
      return;
    }

    // Bug 3 fix: Clear any existing timeout
    if (submitTimeoutId) {
      clearTimeout(submitTimeoutId);
    }

    setSubmitting(true);
    socket.emit('submit-practice-move', { sessionId, move });

    // Safety timeout - reset isSubmitting after 5s if no response (reduced from 10s for better UX)
    submitTimeoutId = setTimeout(() => {
      submitTimeoutId = null;
      const currentState = usePracticeStore.getState();
      if (currentState.isSubmitting) {
        currentState.setSubmitting(false);
        currentState.setError('Move submission timed out. Please try again.');
      }
    }, 5000);
  }, [setSubmitting]);

  const abandonPractice = useCallback((sessionId: string) => {
    const socket = getSocket();
    socket.emit('abandon-practice', { sessionId });
  }, []);

  const parseMoveWithAI = useCallback((sessionId: string, transcript: string) => {
    const socket = getSocket();
    usePracticeStore.getState().setAIParsing(true);
    socket.emit('parse-move-with-ai', { sessionId, transcript });
  }, []);

  const parseAudioMoveWithGemini = useCallback((
    sessionId: string,
    audioBase64: string,
    mimeType: string
  ) => {
    const socket = getSocket();
    usePracticeStore.getState().setAIParsing(true);
    socket.emit('parse-audio-move-with-gemini', { sessionId, audioBase64, mimeType });
  }, []);

  const resumeSession = useCallback((sessionId: string): boolean => {
    const socket = getSocket();
    if (!socket.connected) {
      console.log('[Socket] Cannot resume - not connected');
      return false;
    }
    console.log('[Socket] Requesting session resume:', sessionId);
    socket.emit('resume-session', { sessionId });
    return true;
  }, []);

  return {
    startPractice,
    startPracticeRandom,
    startPracticeByPlayer,
    submitPracticeMove,
    abandonPractice,
    parseMoveWithAI,
    parseAudioMoveWithGemini,
    resumeSession,
  };
}
