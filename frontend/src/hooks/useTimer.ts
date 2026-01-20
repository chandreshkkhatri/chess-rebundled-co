'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';

interface UseTimerOptions {
  onTimeUp?: () => void;
  warningThreshold?: number;
  onWarning?: (remaining: number) => void;
}

export function useTimer(options: UseTimerOptions = {}) {
  const { onTimeUp, warningThreshold = 30000, onWarning } = options; // 30 seconds warning for 3-min timer
  const { whiteTime, blackTime, timeLimit, status, currentTurn, myColor } = useGameStore();
  const hasWarnedRef = useRef(false);
  const hasEndedRef = useRef(false);

  // Get time for current player
  const myTime = myColor === 'white' ? whiteTime : blackTime;
  const opponentTime = myColor === 'white' ? blackTime : whiteTime;
  const isMyTurn = currentTurn === myColor;

  // Handle warnings
  useEffect(() => {
    if (status !== 'playing') {
      hasWarnedRef.current = false;
      hasEndedRef.current = false;
      return;
    }

    if (!isMyTurn) {
      return;
    }

    if (myTime <= warningThreshold && !hasWarnedRef.current) {
      hasWarnedRef.current = true;
      onWarning?.(myTime);
    }

    if (myTime <= 0 && !hasEndedRef.current) {
      hasEndedRef.current = true;
      onTimeUp?.();
    }
  }, [myTime, status, isMyTurn, warningThreshold, onTimeUp, onWarning]);

  // Reset warning flag when time goes above threshold
  useEffect(() => {
    if (myTime > warningThreshold) {
      hasWarnedRef.current = false;
    }
    if (myTime > 0) {
      hasEndedRef.current = false;
    }
  }, [myTime, warningThreshold]);

  const myPercentage = (myTime / timeLimit) * 100;
  const opponentPercentage = (opponentTime / timeLimit) * 100;

  // Format time as mm:ss
  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const myTimeFormatted = formatTime(myTime);
  const opponentTimeFormatted = formatTime(opponentTime);

  const isWarning = myTime <= warningThreshold;
  const isCritical = myTime <= 10000; // Critical at 10 seconds

  return {
    whiteTime,
    blackTime,
    myTime,
    opponentTime,
    myTimeFormatted,
    opponentTimeFormatted,
    myPercentage,
    opponentPercentage,
    isMyTurn,
    isWarning,
    isCritical,
  };
}
