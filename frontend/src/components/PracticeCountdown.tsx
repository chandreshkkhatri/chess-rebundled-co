'use client';

import { useEffect, useState, useMemo } from 'react';
import { HistoricalGame, PracticeMode } from '@/types';

interface PracticeCountdownProps {
  game: HistoricalGame;
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null;
  onComplete: () => void;
}

export function PracticeCountdown({
  game,
  mode,
  playerColor,
  onComplete,
}: PracticeCountdownProps) {
  const [count, setCount] = useState(5);
  const [isVisible, setIsVisible] = useState(false);

  // Pick a random trivia fact (if available)
  const triviaFact = useMemo(() => {
    if (game.trivia && game.trivia.length > 0) {
      return game.trivia[Math.floor(Math.random() * game.trivia.length)];
    }
    return null;
  }, [game.trivia]);

  // Fade in animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Countdown logic
  useEffect(() => {
    if (count === 0) {
      // Small delay before completing to show "GO!"
      const timer = setTimeout(() => {
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setCount((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [count, onComplete]);

  // Result description
  const getResultText = (result: string) => {
    switch (result) {
      case '1-0':
        return 'White wins';
      case '0-1':
        return 'Black wins';
      case '1/2-1/2':
        return 'Draw';
      default:
        return result;
    }
  };

  // Difficulty badge color
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'intermediate':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'advanced':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  // Mode description
  const getModeText = () => {
    if (mode === 'both-sides') {
      return 'Playing both sides';
    }
    return `Playing as ${playerColor === 'white' ? 'White' : 'Black'}`;
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-900 to-slate-800">
      <div
        className={`max-w-lg w-full transition-all duration-500 ${
          isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
        }`}
      >
        {/* Countdown Number */}
        <div className="text-center mb-8">
          <div
            className={`inline-flex items-center justify-center w-32 h-32 rounded-full border-4 transition-all duration-300 ${
              count === 0
                ? 'bg-green-500/20 border-green-500 text-green-400'
                : 'bg-purple-500/20 border-purple-500 text-purple-400'
            }`}
          >
            <span
              className={`font-bold transition-all duration-300 ${
                count === 0 ? 'text-4xl' : 'text-7xl'
              }`}
              style={{
                animation: count > 0 ? 'pulse 1s ease-in-out infinite' : undefined,
              }}
            >
              {count === 0 ? 'GO!' : count}
            </span>
          </div>
        </div>

        {/* Game Info Card */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
          {/* Game Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            {game.title}
          </h1>

          {/* Event & Year */}
          <p className="text-slate-400 text-center mb-4">
            {game.event}, {game.year}
          </p>

          {/* Players */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">&#9812;</span>
              <span className="text-slate-200">{game.white.name}</span>
            </div>
            <span className="text-slate-500">vs</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl">&#9818;</span>
              <span className="text-slate-200">{game.black.name}</span>
            </div>
          </div>

          {/* Result & Difficulty */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full bg-slate-700/50 text-slate-300 text-sm">
              {getResultText(game.result)}
            </span>
            <span
              className={`px-3 py-1 rounded-full border text-sm capitalize ${getDifficultyColor(
                game.difficulty
              )}`}
            >
              {game.difficulty}
            </span>
          </div>

          {/* Mode Indicator */}
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/50 rounded-lg text-purple-300">
              {mode === 'one-side' && playerColor === 'white' && <span className="text-lg">&#9812;</span>}
              {mode === 'one-side' && playerColor === 'black' && <span className="text-lg">&#9818;</span>}
              {mode === 'both-sides' && <span className="text-lg">&#9812;&#9818;</span>}
              {getModeText()}
            </span>
          </div>

          {/* Trivia */}
          {triviaFact && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-200/90 italic text-center">
                &quot;{triviaFact}&quot;
              </p>
            </div>
          )}
        </div>

        {/* Preparing text */}
        <p className="text-center text-slate-500 text-sm mt-4">
          Get ready to identify the moves...
        </p>
      </div>

      {/* Pulse animation style */}
      <style jsx>{`
        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
      `}</style>
    </main>
  );
}
