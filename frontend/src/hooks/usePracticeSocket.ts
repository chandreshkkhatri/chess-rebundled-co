'use client';

import { useEffect, useCallback, useRef } from 'react';
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
} from '@/types';

// Track if listeners have been attached globally (survives component remounts)
let listenersAttached = false;

export function usePracticeSocket() {
  const {
    setConnected,
    setPlayerName,
    setAvailableGames,
    startSession,
    updatePosition,
    setMoveResult,
    setCompleted,
    setSubmitting,
  } = usePracticeStore();

  // Use ref to track if this instance has initialized
  const initializedRef = useRef(false);

  useEffect(() => {
    // Skip if already initialized in this component instance
    if (initializedRef.current) return;
    initializedRef.current = true;

    const socket = getSocket();

    // Only attach listeners once globally
    if (!listenersAttached) {
      console.log('[usePracticeSocket] Attaching practice socket listeners');
      listenersAttached = true;

      // Remove any existing practice listeners first
      socket.off('practice-games-list');
      socket.off('practice-started');
      socket.off('practice-move-result');
      socket.off('practice-next-move');
      socket.off('practice-completed');
      socket.off('practice-error');

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

    // Don't remove listeners on cleanup - keep them for the lifetime of the app
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

  return {
    getPracticeGames,
    startPractice,
    startPracticeRandom,
    submitPracticeMove,
    abandonPractice,
  };
}
