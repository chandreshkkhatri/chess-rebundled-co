'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { usePracticeStore } from '@/stores/practiceStore';
import { ChessBoard } from '@/components/ChessBoard';
import { PracticeVoiceInput } from '@/components/PracticeVoiceInput';
import { PracticeResults } from '@/components/PracticeResults';

export default function PracticeGamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const [showingOpponentMove, setShowingOpponentMove] = useState(false);
  const [showGameInfo, setShowGameInfo] = useState(false);
  const [showMoveHistory, setShowMoveHistory] = useState(false);

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
    <main className="h-screen flex flex-col p-2 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header with integrated progress */}
        <div className="bg-slate-800 rounded-lg py-1 px-2 mb-1">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleAbandon}
              className="py-1 px-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors text-sm"
              title="Exit practice"
            >
              ←
            </button>
            <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
              <span className="text-white font-medium text-sm truncate">
                {selectedGame.white.shortName} vs {selectedGame.black.shortName}
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowGameInfo(!showGameInfo)}
                  className="w-5 h-5 flex items-center justify-center rounded-full border border-slate-500 text-slate-400 hover:border-slate-300 hover:text-white transition-colors text-xs"
                  title="Game info"
                >
                  i
                </button>
                {showGameInfo && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-10 bg-slate-700 rounded-lg p-2 shadow-lg max-w-xs">
                    <div className="text-white text-sm">{selectedGame.title}</div>
                  </div>
                )}
              </div>
            </div>
            {/* Progress indicator */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-xs">{currentMoveIndex}/{totalMoves}</span>
              <div className="w-10 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${totalMoves > 0 ? (currentMoveIndex / totalMoves) * 100 : 0}%` }}
                />
              </div>
            </div>
            {/* Side indicator with "You" */}
            {mode === 'one-side' && playerColor ? (
              <div
                className={`text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  playerColor === 'white'
                    ? 'bg-white text-slate-800'
                    : 'bg-slate-600 text-white'
                }`}
              >
                {playerColor === 'white' ? '⬜' : '⬛'} You
              </div>
            ) : (
              <div
                className={`text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  currentSide === 'white'
                    ? 'bg-white text-slate-800'
                    : 'bg-slate-600 text-white'
                }`}
              >
                {currentSide === 'white' ? '⬜' : '⬛'} You
              </div>
            )}
          </div>
        </div>

        {/* Game area */}
        <div className="flex flex-col lg:flex-row gap-1 lg:gap-3 flex-1 min-h-0 overflow-hidden">
          {/* Board - constrained to leave room for controls */}
          <div className="flex justify-center flex-shrink-0 lg:flex-1 lg:flex-shrink min-h-0">
            <div className="w-full max-w-[min(100%,calc(100vh-220px))] lg:max-w-lg">
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

          {/* Control area - voice input on mobile, sidebar on desktop */}
          <div className="flex flex-col gap-1 lg:gap-2 flex-1 min-h-0 lg:w-72 lg:flex-initial">
            {/* Opponent move indicator */}
            {showingOpponentMove && pendingOpponentMove && (
              <div className="hidden lg:block bg-amber-900/50 border border-amber-600 rounded-lg p-2 text-center">
                <p className="text-amber-200 text-sm font-medium">
                  Opponent played: <span className="font-mono">{pendingOpponentMove.san}</span>
                </p>
              </div>
            )}

            {/* Voice input - full width on mobile */}
            <div className="flex-1 lg:flex-initial min-w-0 min-h-0">
              <PracticeVoiceInput
                onMoveSubmit={handleMoveSubmit}
                disabled={showingOpponentMove}
                onShowHistory={() => setShowMoveHistory(true)}
                moveCount={moveResults.length}
              />
            </div>

            {/* Move History - hidden on mobile, visible on desktop */}
            <div className="hidden lg:flex lg:flex-initial bg-slate-800 rounded-lg p-1.5 min-h-0 flex-col">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
                Moves
              </h3>
              <div className="overflow-y-auto lg:max-h-32">
                {moveResults.length === 0 ? (
                  <p className="text-slate-500 text-xs">No moves</p>
                ) : (
                  <div className="space-y-0.5">
                    {moveResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={`text-xs font-mono py-0.5 px-1 rounded ${
                          result.isCorrect
                            ? 'bg-green-900/30 text-green-300'
                            : 'bg-red-900/30 text-red-300'
                        }`}
                      >
                        <span className="text-slate-500 mr-1">
                          {Math.floor(result.moveIndex / 2) + 1}.
                        </span>
                        {result.isCorrect ? (
                          <span>{result.expectedMove} ✓</span>
                        ) : (
                          <span>
                            <span className="line-through">{result.submittedMove}</span>
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

        {/* Move History Overlay - mobile only */}
        {showMoveHistory && (
          <div
            className="lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowMoveHistory(false)}
          >
            <div
              className="bg-slate-800 rounded-lg p-3 max-w-sm w-full mx-4 max-h-[60vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-white font-semibold">Move History</h3>
                <button
                  onClick={() => setShowMoveHistory(false)}
                  className="text-slate-400 hover:text-white text-xl leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
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
                          {Math.floor(result.moveIndex / 2) + 1}.
                        </span>
                        {result.isCorrect ? (
                          <span>{result.expectedMove} ✓</span>
                        ) : (
                          <span>
                            <span className="line-through">{result.submittedMove}</span>
                            <span className="text-slate-400 ml-1">({result.expectedMove})</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
