'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';

interface UseTimerOptions {
  onTimeUp?: () => void;
  warningThreshold?: number;
  onWarning?: (remaining: number) => void;
}

export function useTimer(options: UseTimerOptions = {}) {
  const { onTimeUp, warningThreshold = 3000, onWarning } = options;
  const { timeRemaining, timeLimit, status, currentTurn, myColor } = useGameStore();
  const hasWarnedRef = useRef(false);
  const hasEndedRef = useRef(false);

  // Handle warnings
  useEffect(() => {
    if (status !== 'playing') {
      hasWarnedRef.current = false;
      hasEndedRef.current = false;
      return;
    }

    if (currentTurn !== myColor) {
      return;
    }

    if (timeRemaining <= warningThreshold && !hasWarnedRef.current) {
      hasWarnedRef.current = true;
      onWarning?.(timeRemaining);
    }

    if (timeRemaining <= 0 && !hasEndedRef.current) {
      hasEndedRef.current = true;
      onTimeUp?.();
    }
  }, [timeRemaining, status, currentTurn, myColor, warningThreshold, onTimeUp, onWarning]);

  // Reset warning flag when time resets
  useEffect(() => {
    if (timeRemaining > warningThreshold) {
      hasWarnedRef.current = false;
    }
    if (timeRemaining > 0) {
      hasEndedRef.current = false;
    }
  }, [timeRemaining, warningThreshold]);

  const percentage = (timeRemaining / timeLimit) * 100;
  const seconds = Math.ceil(timeRemaining / 1000);
  const isMyTurn = currentTurn === myColor;
  const isWarning = timeRemaining <= warningThreshold;
  const isCritical = timeRemaining <= 1000;

  return {
    timeRemaining,
    seconds,
    percentage,
    isMyTurn,
    isWarning,
    isCritical,
  };
}
