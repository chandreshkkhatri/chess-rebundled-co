'use client';

import { useEffect, useCallback } from 'react';
import { getSocket, connectSocket, setAuthToken } from '@/lib/socket';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { subscribeToAuthState, getIdToken } from '@/lib/firebase';
import {
  MultiplayerGameStartedData,
  MultiplayerMoveMadeData,
  MultiplayerGameOverData,
  MultiplayerGameResumedData,
} from '@/types/multiplayer';
import type { TimeControl } from '@/types/multiplayer';
import type { AIParsedMoveResult } from '@/types';

// Module-level flags (survive remounts)
let mpListenersAttached = false;
let mpAuthSubscribed = false;
let mpSubmitTimeoutId: NodeJS.Timeout | null = null;
let mpSearchTimeoutId: NodeJS.Timeout | null = null;

export function useMultiplayerSocket() {
  const { setConnected, setSubmitting } = useMultiplayerStore();

  // Subscribe to auth state changes
  useEffect(() => {
    if (!mpAuthSubscribed) {
      mpAuthSubscribed = true;
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

    if (!mpListenersAttached) {
      mpListenersAttached = true;

      // Clean stale listeners
      socket.off('mp-searching');
      socket.off('mp-search-cancelled');
      socket.off('mp-invite-created');
      socket.off('mp-game-found');
      socket.off('mp-move-made');
      socket.off('mp-game-over');
      socket.off('mp-clock-update');
      socket.off('mp-draw-offered');
      socket.off('mp-draw-declined');
      socket.off('mp-illegal-move');
      socket.off('mp-opponent-connected');
      socket.off('mp-opponent-disconnected');
      socket.off('mp-game-resumed');
      socket.off('mp-game-not-found');
      socket.off('mp-move-parsed');
      socket.off('mp-parse-error');
      socket.off('mp-audio-move-parsed');
      socket.off('mp-audio-parse-error');
      socket.off('mp-error');
      socket.off('mp-lobby-stats');

      socket.on('connect', () => {
        useMultiplayerStore.getState().setConnected(true);
      });

      socket.on('disconnect', () => {
        const store = useMultiplayerStore.getState();
        store.setConnected(false);
        store.setSubmitting(false);
        store.setAIParsing(false);
        store.clearAIParseState();
        if (mpSubmitTimeoutId) {
          clearTimeout(mpSubmitTimeoutId);
          mpSubmitTimeoutId = null;
        }
      });

      // Lobby stats
      socket.on('mp-lobby-stats', (data: { onlineCount: number; waitingPlayers: { uid: string; displayName: string; timeControl: string; waitingSince: number }[] }) => {
        useMultiplayerStore.getState().setLobbyStats(data);
      });

      // Matchmaking
      socket.on('mp-searching', () => {
        useMultiplayerStore.getState().setSearching(true);
        // Start 30s search timeout
        if (mpSearchTimeoutId) clearTimeout(mpSearchTimeoutId);
        mpSearchTimeoutId = setTimeout(() => {
          mpSearchTimeoutId = null;
          const s = useMultiplayerStore.getState();
          if (s.isSearching) {
            s.setSearchTimedOut(true);
          }
        }, 30_000);
      });

      socket.on('mp-search-cancelled', () => {
        useMultiplayerStore.getState().setSearching(false);
        if (mpSearchTimeoutId) { clearTimeout(mpSearchTimeoutId); mpSearchTimeoutId = null; }
      });

      socket.on('mp-invite-created', (data: { inviteCode: string; gameId: string }) => {
        const store = useMultiplayerStore.getState();
        store.setInviteCode(data.inviteCode);
      });

      socket.on('mp-game-found', (data: MultiplayerGameStartedData) => {
        if (mpSearchTimeoutId) { clearTimeout(mpSearchTimeoutId); mpSearchTimeoutId = null; }
        useMultiplayerStore.getState().startGame(data);
      });

      // Gameplay
      socket.on('mp-move-made', (data: MultiplayerMoveMadeData) => {
        if (mpSubmitTimeoutId) {
          clearTimeout(mpSubmitTimeoutId);
          mpSubmitTimeoutId = null;
        }
        useMultiplayerStore.getState().applyMove(data);
      });

      socket.on('mp-game-over', (data: MultiplayerGameOverData) => {
        if (mpSubmitTimeoutId) {
          clearTimeout(mpSubmitTimeoutId);
          mpSubmitTimeoutId = null;
        }
        useMultiplayerStore.getState().setGameOver(data);
      });

      socket.on('mp-clock-update', (data: { white: number; black: number }) => {
        useMultiplayerStore.getState().updateClock(data.white, data.black);
      });

      socket.on('mp-draw-offered', (data: { by: 'white' | 'black' }) => {
        useMultiplayerStore.getState().setDrawOffer(data.by);
      });

      socket.on('mp-draw-declined', () => {
        useMultiplayerStore.getState().setDrawOffer(null);
      });

      socket.on('mp-illegal-move', (data: { move: string; reason: string }) => {
        useMultiplayerStore.getState().setIllegalMove(data.move, data.reason);
      });

      socket.on('mp-opponent-connected', (data: { displayName: string }) => {
        useMultiplayerStore.getState().setOpponentConnected(data.displayName);
      });

      socket.on('mp-opponent-disconnected', () => {
        useMultiplayerStore.getState().setOpponentDisconnected();
      });

      socket.on('mp-game-resumed', (data: MultiplayerGameResumedData) => {
        useMultiplayerStore.getState().resumeGame(data);
      });

      socket.on('mp-game-not-found', (data: { gameId: string; reason: string }) => {
        const store = useMultiplayerStore.getState();
        store.setError(`Game not found: ${data.reason}`);
        store.reset();
      });

      // AI parsing
      socket.on('mp-move-parsed', (data: AIParsedMoveResult) => {
        useMultiplayerStore.getState().setAIParseResult(data);
      });

      socket.on('mp-parse-error', (data: { message: string }) => {
        useMultiplayerStore.getState().setAIParseError(data.message);
      });

      socket.on('mp-audio-move-parsed', (data: AIParsedMoveResult) => {
        useMultiplayerStore.getState().setAIParseResult(data);
      });

      socket.on('mp-audio-parse-error', (data: { message: string }) => {
        useMultiplayerStore.getState().setAIParseError(data.message);
      });

      socket.on('mp-error', (data: { message: string }) => {
        const store = useMultiplayerStore.getState();
        store.setError(data.message);
        store.setSearching(false);
        store.setSubmitting(false);
      });
    }

    connectSocket();

    if (socket.connected) {
      setConnected(true);
    }
  }, [setConnected]);

  // --- Emitters ---

  const findGame = useCallback((timeControl: TimeControl | null | 'any') => {
    const socket = getSocket();
    if (!socket.connected) {
      useMultiplayerStore.getState().setError('Not connected to server');
      return;
    }
    useMultiplayerStore.getState().setSearching(true);
    socket.emit('mp-find-game', { timeControl });
  }, []);

  const cancelFind = useCallback(() => {
    const socket = getSocket();
    socket.emit('mp-cancel-find');
    useMultiplayerStore.getState().setSearching(false);
    if (mpSearchTimeoutId) { clearTimeout(mpSearchTimeoutId); mpSearchTimeoutId = null; }
  }, []);

  const createInvite = useCallback((timeControl: TimeControl | null) => {
    const socket = getSocket();
    if (!socket.connected) {
      useMultiplayerStore.getState().setError('Not connected to server');
      return;
    }
    socket.emit('mp-create-invite', { timeControl });
  }, []);

  const joinInvite = useCallback((inviteCode: string) => {
    const socket = getSocket();
    if (!socket.connected) {
      useMultiplayerStore.getState().setError('Not connected to server');
      return;
    }
    socket.emit('mp-join-invite', { inviteCode });
  }, []);

  const submitMove = useCallback((gameId: string, move: string) => {
    const socket = getSocket();
    const state = useMultiplayerStore.getState();
    if (state.isSubmitting) return;

    if (mpSubmitTimeoutId) {
      clearTimeout(mpSubmitTimeoutId);
    }

    setSubmitting(true);
    socket.emit('mp-submit-move', { gameId, move });

    mpSubmitTimeoutId = setTimeout(() => {
      mpSubmitTimeoutId = null;
      const currentState = useMultiplayerStore.getState();
      if (currentState.isSubmitting) {
        currentState.setSubmitting(false);
        currentState.setError('Move submission timed out. Please try again.');
      }
    }, 5000);
  }, [setSubmitting]);

  const resign = useCallback((gameId: string) => {
    const socket = getSocket();
    socket.emit('mp-resign', { gameId });
  }, []);

  const offerDraw = useCallback((gameId: string) => {
    const socket = getSocket();
    socket.emit('mp-offer-draw', { gameId });
  }, []);

  const respondDraw = useCallback((gameId: string, accept: boolean) => {
    const socket = getSocket();
    socket.emit('mp-respond-draw', { gameId, accept });
  }, []);

  const reconnect = useCallback((gameId: string): boolean => {
    const socket = getSocket();
    if (!socket.connected) return false;
    socket.emit('mp-reconnect', { gameId });
    return true;
  }, []);

  const parseMoveWithAI = useCallback((gameId: string, transcript: string) => {
    const socket = getSocket();
    useMultiplayerStore.getState().setAIParsing(true);
    socket.emit('mp-parse-move-with-ai', { gameId, transcript });
  }, []);

  const parseAudioMoveWithGemini = useCallback((
    gameId: string,
    audioBase64: string,
    mimeType: string
  ) => {
    const socket = getSocket();
    useMultiplayerStore.getState().setAIParsing(true);
    socket.emit('mp-parse-audio-move-with-gemini', { gameId, audioBase64, mimeType });
  }, []);

  return {
    findGame,
    cancelFind,
    createInvite,
    joinInvite,
    submitMove,
    resign,
    offerDraw,
    respondDraw,
    reconnect,
    parseMoveWithAI,
    parseAudioMoveWithGemini,
  };
}
