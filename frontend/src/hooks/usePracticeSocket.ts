'use client';

import { useEffect, useCallback } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';
import { usePracticeStore } from '@/stores/practiceStore';
import { useGameStore } from '@/stores/gameStore';
import {
  HistoricalGame,
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
    setPlayerName,
    setSubmitting,
  } = usePracticeStore();

  useEffect(() => {
    const socket = getSocket();

    // Only attach listeners ONCE globally - never remove them
    // This prevents race conditions with React Strict Mode's double-mounting
    if (!listenersAttached) {
      listenersAttached = true;
      console.log('[usePracticeSocket] Attaching global practice socket listeners (permanent)');

      // Remove any stale listeners first (safety cleanup from previous hot reloads)
      socket.off('practice-games-list');
      socket.off('practice-started');
      socket.off('practice-move-result');
      socket.off('practice-next-move');
      socket.off('practice-completed');
      socket.off('practice-error');
      socket.off('move-parsed');
      socket.off('parse-error');

      socket.on('connect', () => {
        console.log('[PRACTICE] Connected to server. Socket ID:', socket.id);
        usePracticeStore.getState().setConnected(true);
        const gameState = useGameStore.getState();
        if (gameState.playerName) {
          usePracticeStore.getState().setPlayerName(gameState.playerName);
        }
      });

      socket.on('disconnect', () => {
        console.log('[PRACTICE] Disconnected from server');
        usePracticeStore.getState().setConnected(false);
      });

      socket.on('practice-games-list', (games: HistoricalGame[]) => {
        console.log('[PRACTICE] Games list received:', games.length);
        usePracticeStore.getState().setAvailableGames(games);
      });

      socket.on('practice-started', (data: PracticeStartedData) => {
        console.log('[PRACTICE] Session started:', data.sessionId, 'mode:', data.mode);
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
        console.log('[PRACTICE] Move result:', result.isCorrect ? 'CORRECT' : 'WRONG');
        usePracticeStore.getState().setMoveResult(result);
      });

      socket.on('practice-next-move', (data: PracticeNextMoveData) => {
        console.log('[PRACTICE] Next move:', data.currentMoveIndex);
        usePracticeStore.getState().updatePosition({
          position: data.position,
          currentMoveIndex: data.currentMoveIndex,
          currentSide: data.currentSide,
          expectedMove: data.expectedMove,
          opponentMove: data.opponentMove,
        });
      });

      socket.on('practice-completed', (data: PracticeCompletedData) => {
        console.log('[PRACTICE] Completed:', `${data.correctMoves}/${data.totalMoves}`);
        usePracticeStore.getState().setCompleted(data);
      });

      socket.on('practice-error', (data: { message: string }) => {
        console.error('[PRACTICE] Error:', data.message);
        usePracticeStore.getState().setError(data.message);
      });

      // AI parsing events
      socket.on('move-parsed', (data: AIParsedMoveResult) => {
        console.log('[PRACTICE] AI parsed move:', data.parsedMove, `(${(data.confidence * 100).toFixed(0)}% confident)`);
        window.dispatchEvent(new CustomEvent('ai-move-parsed', { detail: data }));
      });

      socket.on('parse-error', (data: { message: string }) => {
        console.error('[PRACTICE] AI parse error:', data.message);
        window.dispatchEvent(new CustomEvent('ai-parse-error', { detail: data }));
      });
    }

    connectSocket();

    // If socket is already connected, set connected state immediately
    if (socket.connected) {
      setConnected(true);
      const gameState = useGameStore.getState();
      if (gameState.playerName) {
        setPlayerName(gameState.playerName);
      }
    }

    // NO CLEANUP - listeners stay attached forever to prevent race conditions
  }, [setConnected, setPlayerName]);

  const getPracticeGames = useCallback(() => {
    // Deprecated - kept for backward compatibility
    const socket = getSocket();
    socket.emit('get-practice-games');
  }, []);

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
  ) => {
    const socket = getSocket();
    socket.emit('start-practice-random', { playerName, mode, playerColor });
  }, []);

  const submitPracticeMove = useCallback((sessionId: string, move: string) => {
    const socket = getSocket();
    const state = usePracticeStore.getState();

    // Don't submit if already submitting
    if (state.isSubmitting) {
      console.log('[PRACTICE] Ignoring move submission - already submitting');
      return;
    }

    // Set submission lock
    setSubmitting(true);

    console.log('[PRACTICE] Submitting move:', {
      sessionId,
      move,
      socketId: socket.id,
    });
    socket.emit('submit-practice-move', { sessionId, move });
  }, [setSubmitting]);

  const abandonPractice = useCallback((sessionId: string) => {
    const socket = getSocket();
    socket.emit('abandon-practice', { sessionId });
  }, []);

  const parseMoveWithAI = useCallback((sessionId: string, transcript: string) => {
    const socket = getSocket();
    console.log('[PRACTICE] Requesting AI parse for:', transcript);
    socket.emit('parse-move-with-ai', { sessionId, transcript });
  }, []);

  return {
    getPracticeGames,
    startPractice,
    startPracticeRandom,
    submitPracticeMove,
    abandonPractice,
    parseMoveWithAI,
  };
}
