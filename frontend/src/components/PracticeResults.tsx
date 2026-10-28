'use client';

import { PracticeCompletedData } from '@/types';
import Link from 'next/link';
import { MoveHistory } from './MoveHistory';

// Utility functions extracted outside component to prevent recreation
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getPerformanceMessage(accuracy: number): { emoji: string; text: string } {
  const percent = accuracy * 100;
  if (percent >= 90) return { emoji: '🏆', text: 'Excellent!' };
  if (percent >= 70) return { emoji: '👏', text: 'Great job!' };
  if (percent >= 50) return { emoji: '👍', text: 'Good effort!' };
  return { emoji: '💪', text: 'Keep practicing!' };
}

interface PracticeResultsProps {
  data: PracticeCompletedData;
  onPlayAgain: () => void;
  onReviewOnBoard?: () => void;
}

export function PracticeResults({ data, onPlayAgain, onReviewOnBoard }: PracticeResultsProps) {
  const accuracyPercent = (data.accuracy * 100).toFixed(1);
  const avgTimePerMove = (data.averageTimePerMove / 1000).toFixed(1);
  const performance = getPerformanceMessage(data.accuracy);

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
      <div className="text-center mb-6">
        <div className="text-5xl mb-2">{performance.emoji}</div>
        <h2 className="text-2xl font-bold text-slate-100">{performance.text}</h2>
        <p className="text-slate-400 mt-1">{data.game.title}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-6">
        <div className="bg-blue-900/30 rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-blue-400">{accuracyPercent}%</div>
          <div className="text-xs sm:text-sm text-blue-300">Accuracy</div>
        </div>
        <div className="bg-green-900/30 rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-green-400">
            {data.correctMoves}/{data.totalMoves}
          </div>
          <div className="text-xs sm:text-sm text-green-300">Correct</div>
        </div>
        <div className="bg-purple-900/30 rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-purple-400">{formatTime(data.totalTimeMs)}</div>
          <div className="text-xs sm:text-sm text-purple-300">Total Time</div>
        </div>
        <div className="bg-orange-900/30 rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-orange-400">{avgTimePerMove}s</div>
          <div className="text-xs sm:text-sm text-orange-300">Avg/Move</div>
        </div>
      </div>

      {/* Move Review */}
      <div className="mb-6">
        <h3 className="font-semibold text-slate-300 mb-2">Move Review</h3>
        <div className="bg-slate-700 rounded-lg p-2">
          <MoveHistory
            moves={data.moveResults}
            mode="both-sides"
            playerColor={null}
            variant="full"
            theme="dark"
            maxHeight="max-h-40"
            autoScroll={false}
          />
        </div>
      </div>

      {/* Trivia */}
      {data.trivia.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-slate-300 mb-2">Did You Know? 💡</h3>
          <div className="space-y-2">
            {data.trivia.slice(0, 2).map((fact, idx) => (
              <div key={idx} className="text-sm text-slate-300 bg-yellow-900/30 p-3 rounded-sm">
                {fact}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game Info */}
      <div className="text-center text-sm text-slate-400 mb-4">
        <p>
          {data.game.white.shortName} vs {data.game.black.shortName}
        </p>
        <p>
          {data.game.event}, {data.game.year}
        </p>
      </div>

      {/* Auto-save confirmation */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-1.5 text-sm text-green-400 bg-green-900/30 px-3 py-1.5 rounded-full">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Saved to your history
        </div>
        <Link
          href="/history"
          className="block mt-2 text-sm text-purple-400 hover:text-purple-300 underline"
        >
          View all sessions
        </Link>
      </div>

      {onReviewOnBoard && (
        <button
          onClick={onReviewOnBoard}
          className="w-full mb-2 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all"
        >
          Replay on Board
        </button>
      )}

      <button
        onClick={onPlayAgain}
        className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all"
      >
        Practice Another Game
      </button>
    </div>
  );
}
