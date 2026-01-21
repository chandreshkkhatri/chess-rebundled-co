'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { usePracticeStore } from '@/stores/practiceStore';
import { ChessBoard } from '@/components/ChessBoard';
import { PracticeVoiceInput } from '@/components/PracticeVoiceInput';
import { PracticeProgressBar } from '@/components/PracticeProgressBar';
import { PracticeResults } from '@/components/PracticeResults';

export default function PracticeGamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const [showingOpponentMove, setShowingOpponentMove] = useState(false);

  const { submitPracticeMove, abandonPractice } = usePracticeSocket();
  const {
    status,
    currentPosition,
    currentSide,
    currentMoveIndex,
    selectedGame,
    currentExpectedMove,
    completedData,
    totalMoves,
    moveResults,
    reset,
    mode,
    playerColor,
    pendingOpponentMove,
    setPendingOpponentMove,
    error,
    setError,
  } = usePracticeStore();

  // Calculate correct moves so far (memoized to avoid recalculating on every render)
  const correctMoves = useMemo(() => moveResults.filter((r) => r.isCorrect).length, [moveResults]);

  // Board orientation: in one-side mode, use player's color; otherwise follow current side
  const boardOrientation = mode === 'one-side' && playerColor ? playerColor : currentSide;

  // Handle opponent move animation in one-side mode
  useEffect(() => {
    if (pendingOpponentMove && mode === 'one-side') {
      setShowingOpponentMove(true);
      // Show opponent move briefly, then clear it
      const timeout = setTimeout(() => {
        setShowingOpponentMove(false);
        setPendingOpponentMove(null);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [pendingOpponentMove, mode, setPendingOpponentMove]);

  const handleMoveSubmit = useCallback(
    (move: string, confidence: number) => {
      submitPracticeMove(sessionId, move);
    },
    [sessionId, submitPracticeMove]
  );

  const handleAbandon = useCallback(() => {
    abandonPractice(sessionId);
    reset();
    router.push('/practice');
  }, [sessionId, abandonPractice, reset, router]);

  const handlePlayAgain = useCallback(() => {
    reset();
    router.push('/practice');
  }, [reset, router]);

  // Redirect if no session
  useEffect(() => {
    if (status === 'idle' || status === 'selecting') {
      router.push('/practice');
    }
  }, [status, router]);

  // Show results when completed
  if (status === 'completed' && completedData) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <PracticeResults data={completedData} onPlayAgain={handlePlayAgain} />
      </main>
    );
  }

  // Show error state
  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-white text-lg font-medium mb-2">Something went wrong</p>
          <p className="text-red-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null);
              router.push('/practice');
            }}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all"
          >
            Back to Practice
          </button>
        </div>
      </main>
    );
  }

  // Loading state
  if (!selectedGame || status !== 'playing') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-2">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800 rounded-lg p-2 mb-2">
          <div className="flex items-center justify-between">
            <button
              onClick={handleAbandon}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors text-sm"
            >
              ← Exit
            </button>
            <div className="text-center flex-1 mx-4">
              <div className="text-white font-medium text-sm truncate">
                {selectedGame.title}
              </div>
              <div className="text-slate-500 text-xs">
                {selectedGame.white.shortName} vs {selectedGame.black.shortName}
              </div>
            </div>
            {mode === 'one-side' && playerColor ? (
              <div
                className={`text-sm font-bold px-3 py-1 rounded ${
                  playerColor === 'white'
                    ? 'bg-white text-slate-800'
                    : 'bg-slate-600 text-white'
                }`}
              >
                Playing as {playerColor === 'white' ? '⬜' : '⬛'}
              </div>
            ) : (
              <div
                className={`text-sm font-bold px-3 py-1 rounded ${
                  currentSide === 'white'
                    ? 'bg-white text-slate-800'
                    : 'bg-slate-600 text-white'
                }`}
              >
                {currentSide === 'white' ? '⬜' : '⬛'}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <PracticeProgressBar
          currentMove={currentMoveIndex}
          totalMoves={totalMoves}
          correctMoves={correctMoves}
        />

        {/* Game area */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Board */}
          <div className="flex justify-center lg:flex-1">
            <div className="w-full max-w-md lg:max-w-lg pl-4">
              <ChessBoard
                fen={currentPosition}
                orientation={boardOrientation}
                lastMove={
                  showingOpponentMove && pendingOpponentMove
                    ? { from: pendingOpponentMove.from, to: pendingOpponentMove.to }
                    : currentExpectedMove
                    ? { from: currentExpectedMove.from, to: currentExpectedMove.to }
                    : undefined
                }
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-2 lg:w-72">
            {showingOpponentMove && pendingOpponentMove && (
              <div className="bg-amber-900/50 border border-amber-600 rounded-lg p-3 text-center">
                <p className="text-amber-200 text-sm font-medium">
                  Opponent played: <span className="font-mono">{pendingOpponentMove.san}</span>
                </p>
              </div>
            )}
            <PracticeVoiceInput onMoveSubmit={handleMoveSubmit} disabled={showingOpponentMove} />

            {/* Move History */}
            <div className="bg-slate-800 rounded-lg p-3">
              <h3 className="text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wider">
                Move History
              </h3>
              <div className="max-h-32 overflow-y-auto">
                {moveResults.length === 0 ? (
                  <p className="text-slate-500 text-sm">No moves yet</p>
                ) : (
                  <div className="space-y-1">
                    {moveResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={`text-sm font-mono py-1 px-2 rounded ${
                          result.isCorrect
                            ? 'bg-green-900/30 text-green-300'
                            : 'bg-red-900/30 text-red-300'
                        }`}
                      >
                        <span className="text-slate-500 mr-2">
                          {Math.floor(result.moveIndex / 2) + 1}
                          {result.moveIndex % 2 === 0 ? '.' : '...'}
                        </span>
                        {result.isCorrect ? (
                          <span>{result.expectedMove} ✓</span>
                        ) : (
                          <span>
                            <span className="line-through">{result.submittedMove}</span>
                            <span className="text-slate-400 ml-1">
                              ({result.expectedMove})
                            </span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
