"use client";

import { useEffect, useCallback } from "react";
import { getSocket, connectSocket, setAuthToken } from "@/lib/socket";
import { useAiGameStore } from "@/stores/aiGameStore";
import { subscribeToAuthState, getIdToken } from "@/lib/firebase";
import {
  AiChatMessage,
  AiErrorData,
  AiGameOverData,
  AiGameResumedData,
  AiGameStartedData,
  AiMoveMadeData,
  AiReviewData,
} from "@/types/aiGame";

// Module-level flags (survive remounts)
let aiListenersAttached = false;
let aiAuthSubscribed = false;
let aiSubmitTimeoutId: NodeJS.Timeout | null = null;

export function useAiGameSocket() {
  const { setConnected, setSubmitting } = useAiGameStore();

  // Subscribe to auth state changes
  useEffect(() => {
    if (!aiAuthSubscribed) {
      aiAuthSubscribed = true;
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

    if (!aiListenersAttached) {
      aiListenersAttached = true;

      // Clean stale listeners
      socket.off("ai-game-started");
      socket.off("ai-move-made");
      socket.off("ai-typing");
      socket.off("ai-chat-message");
      socket.off("ai-bot-turn-started");
      socket.off("ai-bot-turn-ended");
      socket.off("ai-game-over");
      socket.off("ai-game-resumed");
      socket.off("ai-review-data");
      socket.off("ai-illegal-move");
      socket.off("ai-game-not-found");
      socket.off("ai-error");

      socket.on("connect", () => {
        useAiGameStore.getState().setConnected(true);
      });

      socket.on("disconnect", () => {
        const store = useAiGameStore.getState();
        store.setConnected(false);
        store.setSubmitting(false);
        if (aiSubmitTimeoutId) {
          clearTimeout(aiSubmitTimeoutId);
          aiSubmitTimeoutId = null;
        }
      });

      socket.on("ai-game-started", (data: AiGameStartedData) => {
        useAiGameStore.getState().startGame(data);
      });

      socket.on("ai-move-made", (data: AiMoveMadeData) => {
        if (aiSubmitTimeoutId) {
          clearTimeout(aiSubmitTimeoutId);
          aiSubmitTimeoutId = null;
        }
        useAiGameStore.getState().applyMove(data);
      });

      socket.on("ai-typing", (data: { gameId: string; typing: boolean }) => {
        useAiGameStore.getState().setTyping(data.typing);
      });

      socket.on(
        "ai-chat-message",
        (data: { gameId: string; message: AiChatMessage }) => {
          useAiGameStore.getState().appendChat(data.message);
        },
      );

      socket.on("ai-bot-turn-started", () => {
        useAiGameStore.getState().setBotTurnInProgress(true);
      });

      socket.on("ai-bot-turn-ended", () => {
        useAiGameStore.getState().setBotTurnInProgress(false);
      });

      socket.on("ai-game-over", (data: AiGameOverData) => {
        if (aiSubmitTimeoutId) {
          clearTimeout(aiSubmitTimeoutId);
          aiSubmitTimeoutId = null;
        }
        useAiGameStore.getState().setGameOver(data);
      });

      socket.on("ai-game-resumed", (data: AiGameResumedData) => {
        useAiGameStore.getState().resumeGame(data);
      });

      socket.on("ai-review-data", (data: AiReviewData) => {
        useAiGameStore.getState().setReviewData(data);
      });

      socket.on(
        "ai-illegal-move",
        (data: { gameId: string; move: string; reason: string }) => {
          useAiGameStore.getState().setError(data.reason);
        },
      );

      socket.on(
        "ai-game-not-found",
        (data: { gameId: string; reason: string }) => {
          const store = useAiGameStore.getState();
          store.setNotFound(true);
          store.setError(data.reason);
        },
      );

      socket.on("ai-error", (data: AiErrorData) => {
        useAiGameStore.getState().setError(data.message);
      });
    }

    connectSocket();

    if (socket.connected) {
      setConnected(true);
    }
  }, [setConnected]);

  // --- Emitters ---

  const startGame = useCallback(
    (personaId: string, playerColor: "white" | "black" | "random") => {
      const socket = getSocket();
      if (!socket.connected) {
        useAiGameStore.getState().setError("Not connected to server");
        return;
      }
      socket.emit("ai-start", { personaId, playerColor });
    },
    [],
  );

  const submitMove = useCallback(
    (gameId: string, move: string) => {
      const socket = getSocket();
      const state = useAiGameStore.getState();
      if (state.isSubmitting) return;

      if (aiSubmitTimeoutId) {
        clearTimeout(aiSubmitTimeoutId);
      }

      setSubmitting(true);
      socket.emit("ai-submit-move", { gameId, move });

      aiSubmitTimeoutId = setTimeout(() => {
        aiSubmitTimeoutId = null;
        const current = useAiGameStore.getState();
        if (current.isSubmitting) {
          current.setSubmitting(false);
          current.setError("Move submission timed out. Please try again.");
        }
      }, 5000);
    },
    [setSubmitting],
  );

  const sendChat = useCallback((gameId: string, text: string) => {
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit("ai-send-chat", { gameId, text });
  }, []);

  const resign = useCallback((gameId: string) => {
    const socket = getSocket();
    socket.emit("ai-resign", { gameId });
  }, []);

  const reconnect = useCallback((gameId: string): boolean => {
    const socket = getSocket();
    if (!socket.connected) return false;
    socket.emit("ai-reconnect", { gameId });
    return true;
  }, []);

  const getReview = useCallback((gameId: string): boolean => {
    const socket = getSocket();
    if (!socket.connected) return false;
    socket.emit("ai-get-review", { gameId });
    return true;
  }, []);

  return { startGame, submitMove, sendChat, resign, reconnect, getReview };
}
