'use client';

import { PracticeCompletedData, GamificationResult } from '@/types';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
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
  gamification?: GamificationResult;
  onPlayAgain: () => void;
}

export function PracticeResults({ data, gamification, onPlayAgain }: PracticeResultsProps) {
  const { user, isAnonymous } = useAuth();
  const isAuthenticated = user && !isAnonymous;

  const accuracyPercent = (data.accuracy * 100).toFixed(1);
  const avgTimePerMove = (data.averageTimePerMove / 1000).toFixed(1);
  const performance = getPerformanceMessage(data.accuracy);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
      <div className="text-center mb-6">
        <div className="text-5xl mb-2">{performance.emoji}</div>
        <h2 className="text-2xl font-bold text-gray-800">{performance.text}</h2>
        <p className="text-gray-600 mt-1">{data.game.title}</p>
      </div>

      {/* XP Earned Section */}
      {gamification && (
        <div className="mb-6 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">XP Earned</span>
            <span className="text-2xl font-bold">+{gamification.xp.totalXp}</span>
          </div>

          {/* XP Breakdown */}
          <div className="text-sm opacity-90 space-y-1">
            <div className="flex justify-between">
              <span>Base XP</span>
              <span>+{gamification.xp.baseXp}</span>
            </div>
            {gamification.xp.bonuses.perfectSession > 0 && (
              <div className="flex justify-between text-yellow-200">
                <span>Perfect Session!</span>
                <span>+{gamification.xp.bonuses.perfectSession}</span>
              </div>
            )}
            {gamification.xp.bonuses.highAccuracy > 0 && (
              <div className="flex justify-between text-green-200">
                <span>High Accuracy Bonus</span>
                <span>+{gamification.xp.bonuses.highAccuracy}</span>
              </div>
            )}
            {gamification.xp.bonuses.firstGameCompletion > 0 && (
              <div className="flex justify-between text-blue-200">
                <span>First Completion Bonus</span>
                <span>+{gamification.xp.bonuses.firstGameCompletion}</span>
              </div>
            )}
            {gamification.xp.bonuses.dailyFirst > 0 && (
              <div className="flex justify-between text-orange-200">
                <span>Daily First Bonus</span>
                <span>+{gamification.xp.bonuses.dailyFirst}</span>
              </div>
            )}
            {gamification.xp.bonuses.streakMultiplier > 0 && (
              <div className="flex justify-between text-pink-200">
                <span>Streak Bonus</span>
                <span>+{gamification.xp.bonuses.streakMultiplier}</span>
              </div>
            )}
          </div>

          {/* Level Up */}
          {gamification.xp.leveledUp && (
            <div className="mt-3 pt-3 border-t border-white/20 text-center">
              <span className="text-xl">🎉</span>
              <span className="font-bold ml-2">Level Up! Now Level {gamification.xp.newLevel}</span>
            </div>
          )}
        </div>
      )}

      {/* Achievements Unlocked */}
      {gamification && gamification.newAchievements.length > 0 && (
        <div className="mb-6 bg-amber-50 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-2">Achievements Unlocked!</h3>
          <div className="space-y-2">
            {gamification.newAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm"
              >
                <div>
                  <p className="font-medium text-gray-800">{achievement.name}</p>
                  <p className="text-sm text-gray-500">{achievement.description}</p>
                </div>
                <span className="text-purple-600 font-medium">+{achievement.xpReward} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streak Update */}
      {gamification && gamification.streakUpdated && gamification.newStreak > 0 && (
        <div className="mb-6 bg-orange-50 rounded-lg p-4 text-center">
          <span className="text-2xl">🔥</span>
          <span className="ml-2 font-semibold text-orange-700">
            {gamification.newStreak} Day Streak!
          </span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{accuracyPercent}%</div>
          <div className="text-sm text-blue-700">Accuracy</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-green-600">
            {data.correctMoves}/{data.totalMoves}
          </div>
          <div className="text-sm text-green-700">Correct</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">{formatTime(data.totalTimeMs)}</div>
          <div className="text-sm text-purple-700">Total Time</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-orange-600">{avgTimePerMove}s</div>
          <div className="text-sm text-orange-700">Avg/Move</div>
        </div>
      </div>

      {/* Move Review */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-700 mb-2">Move Review</h3>
        <div className="bg-gray-50 rounded-lg p-2">
          <MoveHistory
            moves={data.moveResults}
            mode="both-sides"
            playerColor={null}
            variant="full"
            theme="light"
            maxHeight="max-h-40"
            autoScroll={false}
          />
        </div>
      </div>

      {/* Trivia */}
      {data.trivia.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-700 mb-2">Did You Know? 💡</h3>
          <div className="space-y-2">
            {data.trivia.slice(0, 2).map((fact, idx) => (
              <div key={idx} className="text-sm text-gray-600 bg-yellow-50 p-3 rounded">
                {fact}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game Info */}
      <div className="text-center text-sm text-gray-500 mb-4">
        <p>
          {data.game.white.shortName} vs {data.game.black.shortName}
        </p>
        <p>
          {data.game.event}, {data.game.year}
        </p>
      </div>

      {/* Auto-save confirmation for authenticated users */}
      {isAuthenticated ? (
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-1.5 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved to your history
          </div>
          <Link
            href="/history"
            className="block mt-2 text-sm text-purple-600 hover:text-purple-700 underline"
          >
            View all sessions
          </Link>
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400 mb-3">
          Sign in to save your progress
        </p>
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
