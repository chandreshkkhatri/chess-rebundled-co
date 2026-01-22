'use client';

import { useEffect, useCallback } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';
import { usePracticeStore } from '@/stores/practiceStore';
import {
  PracticeMoveResult,
  PracticeStartedData,
  PracticeNextMoveData,
  PracticeCompletedData,
  PracticeMode,
  AIParsedMoveResult,
} from '@/types';

// Track if listeners have been attached (module-level, survives remounts)
// IMPORTANT: Never remove listeners - they stay attached for the app's lifetime
let listenersAttached = false;

export function usePracticeSocket() {
  const {
    setConnected,
    setSubmitting,
  } = usePracticeStore();

  useEffect(() => {
    const socket = getSocket();

    // Only attach listeners ONCE globally - never remove them
    // This prevents race conditions with React Strict Mode's double-mounting
    if (!listenersAttached) {
      listenersAttached = true;

      // Remove any stale listeners first (safety cleanup from previous hot reloads)
      socket.off('practice-started');
      socket.off('practice-move-result');
      socket.off('practice-next-move');
      socket.off('practice-completed');
      socket.off('practice-error');
      socket.off('move-parsed');
      socket.off('parse-error');
      socket.off('audio-move-parsed');
      socket.off('audio-parse-error');

      socket.on('connect', () => {
        usePracticeStore.getState().setConnected(true);
      });

      socket.on('disconnect', () => {
        usePracticeStore.getState().setConnected(false);
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
      });

      socket.on('practice-move-result', (result: PracticeMoveResult) => {
        usePracticeStore.getState().setMoveResult(result);
      });

      socket.on('practice-next-move', (data: PracticeNextMoveData) => {
        usePracticeStore.getState().updatePosition({
          position: data.position,
          currentMoveIndex: data.currentMoveIndex,
          currentSide: data.currentSide,
          expectedMove: data.expectedMove,
          opponentMove: data.opponentMove,
        });
      });

      socket.on('practice-completed', (data: PracticeCompletedData) => {
        usePracticeStore.getState().setCompleted(data);
      });

      socket.on('practice-error', (data: { message: string }) => {
        console.log('[Socket] Received practice-error:', data.message);
        usePracticeStore.getState().setError(data.message);
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

  const submitPracticeMove = useCallback((sessionId: string, move: string) => {
    const socket = getSocket();
    const state = usePracticeStore.getState();

    // Don't submit if already submitting
    if (state.isSubmitting) {
      return;
    }

    setSubmitting(true);
    socket.emit('submit-practice-move', { sessionId, move });
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

  return {
    startPractice,
    startPracticeRandom,
    submitPracticeMove,
    abandonPractice,
    parseMoveWithAI,
    parseAudioMoveWithGemini,
  };
}
