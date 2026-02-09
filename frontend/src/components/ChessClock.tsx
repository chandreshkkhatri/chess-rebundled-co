'use client';

import { useState, useEffect, useRef } from 'react';

interface ChessClockProps {
  whiteTimeMs: number;
  blackTimeMs: number;
  turn: 'white' | 'black';
  isActive: boolean; // Game is active (not paused/completed)
  playerColor: 'white' | 'black';
}

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function ClockDisplay({
  timeMs,
  isActive,
  label,
  isLow,
}: {
  timeMs: number;
  isActive: boolean;
  label: string;
  isLow: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm ${
        isActive
          ? isLow
            ? 'bg-red-900/50 text-red-300 border border-red-700'
            : 'bg-purple-900/50 text-purple-200 border border-purple-700'
          : 'bg-slate-700 text-slate-400'
      }`}
    >
      <span className="text-xs font-sans">{label}</span>
      <span className={`font-bold ${isActive && isLow ? 'animate-pulse' : ''}`}>
        {formatTime(timeMs)}
      </span>
    </div>
  );
}

export function ChessClock({ whiteTimeMs, blackTimeMs, turn, isActive, playerColor }: ChessClockProps) {
  const [displayWhite, setDisplayWhite] = useState(whiteTimeMs);
  const [displayBlack, setDisplayBlack] = useState(blackTimeMs);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef(Date.now());

  // Sync with server values
  useEffect(() => {
    setDisplayWhite(whiteTimeMs);
    setDisplayBlack(blackTimeMs);
    lastTickRef.current = Date.now();
  }, [whiteTimeMs, blackTimeMs]);

  // Local countdown tick for smooth display
  useEffect(() => {
    if (!isActive) return;

    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      if (turn === 'white') {
        setDisplayWhite((prev) => Math.max(0, prev - elapsed));
      } else {
        setDisplayBlack((prev) => Math.max(0, prev - elapsed));
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isActive, turn]);

  const LOW_TIME_THRESHOLD = 30_000; // 30 seconds

  // Show opponent clock on top, player clock on bottom
  const topColor = playerColor === 'white' ? 'black' : 'white';
  const bottomColor = playerColor;
  const topTime = topColor === 'white' ? displayWhite : displayBlack;
  const bottomTime = bottomColor === 'white' ? displayWhite : displayBlack;

  return (
    <div className="flex items-center gap-3">
      <ClockDisplay
        timeMs={topTime}
        isActive={isActive && turn === topColor}
        label={topColor === 'white' ? 'W' : 'B'}
        isLow={topTime < LOW_TIME_THRESHOLD}
      />
      <ClockDisplay
        timeMs={bottomTime}
        isActive={isActive && turn === bottomColor}
        label={bottomColor === 'white' ? 'W' : 'B'}
        isLow={bottomTime < LOW_TIME_THRESHOLD}
      />
    </div>
  );
}
