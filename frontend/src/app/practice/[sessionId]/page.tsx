'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { usePracticeStore } from '@/stores/practiceStore';
import { useAuth } from '@/contexts/AuthContext';
import { ChessBoard } from '@/components/ChessBoard';
import { PracticeVoiceInput } from '@/components/PracticeVoiceInput';
import { PracticeResults } from '@/components/PracticeResults';
import { MoveHistory } from '@/components/MoveHistory';
import { SettingsModal } from '@/components/SettingsModal';
import { DiscordIcon } from '@/components/icons/DiscordIcon';

// Debug flag - matches PracticeVoiceInput
const DEBUG_AUDIO = process.env.NODE_ENV !== 'production';

export default function PracticeGamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const [showingOpponentMove, setShowingOpponentMove] = useState(false);
  const [showGameInfo, setShowGameInfo] = useState(false);
  const [showMoveHistory, setShowMoveHistory] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [resumeAttempted, setResumeAttempted] = useState(false);

  const { submitPracticeMove, abandonPractice, resumeSession } = usePracticeSocket();
  const { user, isAnonymous } = useAuth();
  const {
    status,
    currentPosition,
    currentSide,
    currentMoveIndex,
    selectedGame,
    currentExpectedMove,
    completedData,
    gamificationResult,
    totalMoves,
    moveResults,
    reset,
    mode,
    playerColor,
    pendingOpponentMove,
    setPendingOpponentMove,
    error,
    setError,
    isStarting,
    playerName,
    isConnected,
    sessionId: storedSessionId,
  } = usePracticeStore();

  // Calculate correct moves so far (memoized to avoid recalculating on every render)
  const correctMoves = useMemo(() => moveResults.filter((r) => r.isCorrect).length, [moveResults]);

  // Calculate live accuracy percentage
  const liveAccuracy = useMemo(() => {
    if (moveResults.length === 0) return 100;
    return Math.round((correctMoves / moveResults.length) * 100);
  }, [correctMoves, moveResults.length]);

  // Determine the display name for the player
  const displayName = useMemo(() => {
    if (user && !isAnonymous) {
      return playerName || user.displayName || 'You';
    }
    return playerName || 'You';
  }, [user, isAnonymous, playerName]);

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

  // Attempt to resume session on mount if we have a stored sessionId that matches the URL
  useEffect(() => {
    // Only attempt resume if:
    // 1. We haven't already attempted
    // 2. Status is idle (no active session in state)
    // 3. Socket is connected
    // 4. The stored sessionId matches the URL sessionId (page refresh scenario)
    if (
      !resumeAttempted &&
      status === 'idle' &&
      isConnected &&
      !isStarting &&
      storedSessionId === sessionId
    ) {
      setResumeAttempted(true);
      setIsResuming(true);
      const success = resumeSession(sessionId);
      if (!success) {
        // Socket not connected, will not retry
        setIsResuming(false);
      }
    }
  }, [resumeAttempted, status, isConnected, isStarting, storedSessionId, sessionId, resumeSession]);

  // Handle resume result
  useEffect(() => {
    if (isResuming) {
      // Session resumed successfully
      if (status === 'playing') {
        setIsResuming(false);
      }
      // Session resume failed (error was set)
      if (error) {
        setIsResuming(false);
      }
    }
  }, [isResuming, status, error]);

  // Redirect if no session
  // Bug 4 fix: Don't redirect while starting, resuming, or if already playing/completed
  useEffect(() => {
    if (isStarting || isResuming || status === 'playing' || status === 'completed') {
      return;
    }
    // Only redirect if we've attempted resume and it failed, or if there's no stored session
    if ((status === 'idle' || status === 'selecting') && (resumeAttempted || storedSessionId !== sessionId)) {
      router.push('/practice');
    }
  }, [status, isStarting, isResuming, resumeAttempted, storedSessionId, sessionId, router]);

  // Show results when completed
  if (status === 'completed' && completedData) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <PracticeResults data={completedData} gamification={gamificationResult ?? undefined} onPlayAgain={handlePlayAgain} />
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
          <p className="text-slate-400">
            {isResuming ? 'Resuming session...' : 'Loading...'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh flex flex-col p-2 overflow-hidden">
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
            {/* Live accuracy - only show after first move */}
            {moveResults.length > 0 && (
              <div
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  liveAccuracy >= 80
                    ? 'bg-green-600/20 text-green-400'
                    : liveAccuracy >= 60
                    ? 'bg-yellow-600/20 text-yellow-400'
                    : 'bg-red-600/20 text-red-400'
                }`}
              >
                {liveAccuracy}%
              </div>
            )}
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
            {/* Player indicator with name and avatar */}
            <div
              className={`text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                (mode === 'one-side' && playerColor ? playerColor : currentSide) === 'white'
                  ? 'bg-white text-slate-800'
                  : 'bg-slate-600 text-white'
              }`}
            >
              {(mode === 'one-side' && playerColor ? playerColor : currentSide) === 'white' ? '⬜' : '⬛'}
              {user && !isAnonymous && user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-4 h-4 rounded-full" />
              ) : null}
              <span className="max-w-[60px] truncate">{displayName}</span>
            </div>
            {/* Settings - desktop only */}
            <button
              onClick={() => setShowSettings(true)}
              className="hidden lg:flex items-center text-slate-400 hover:text-white transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {/* Discord link - desktop only */}
            <a
              href="https://discord.gg/ySGBwu9xvk"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex items-center text-slate-400 hover:text-indigo-400 transition-colors"
              title="Join our Discord"
            >
              <DiscordIcon className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Game area with mobile sidebar */}
        <div className="flex flex-row gap-1 lg:gap-3 flex-1 min-h-0 overflow-hidden">
          {/* Mobile left sidebar */}
          <div className="flex lg:hidden flex-col items-center justify-between py-2 px-1 bg-slate-800/50 rounded-lg flex-shrink-0">
            {/* Top group */}
            <div className="flex flex-col items-center gap-1">
              <a
                href="https://discord.gg/ySGBwu9xvk"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-slate-400 hover:text-indigo-400 transition-colors"
                title="Join Discord"
              >
                <DiscordIcon className="w-5 h-5" />
              </a>
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Bottom group */}
            <div className="flex flex-col items-center gap-1">
              {/* History button */}
              <button
                onClick={() => setShowMoveHistory(true)}
                className="p-1.5 text-slate-400 hover:text-white transition-colors relative"
                title="Move History"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                {moveResults.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-purple-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {moveResults.length}
                  </span>
                )}
              </button>

              {/* Audio debug button - only in dev mode */}
              {DEBUG_AUDIO && (
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className={`p-1.5 transition-colors ${showDebugPanel ? 'text-green-400' : 'text-slate-400 hover:text-green-400'}`}
                  title="Audio Debug"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {/* Microphone (smaller, shifted left) */}
                    <path d="M9 2a2.5 2.5 0 0 0-2.5 2.5v6a2.5 2.5 0 0 0 5 0v-6A2.5 2.5 0 0 0 9 2z" />
                    <path d="M14.5 9v1.5a5.5 5.5 0 0 1-11 0V9" />
                    <line x1="9" y1="16" x2="9" y2="19" />
                    <line x1="6" y1="19" x2="12" y2="19" />
                    {/* Bug icon (debug) - bottom right */}
                    <ellipse cx="18.5" cy="17" rx="3" ry="4" />
                    <line x1="15.5" y1="15" x2="14" y2="13.5" />
                    <line x1="21.5" y1="15" x2="23" y2="13.5" />
                    <line x1="15.5" y1="17" x2="14" y2="17" />
                    <line x1="21.5" y1="17" x2="23" y2="17" />
                    <line x1="15.5" y1="19" x2="14" y2="20.5" />
                    <line x1="21.5" y1="19" x2="23" y2="20.5" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Main content: board + controls */}
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
                showDebugPanel={showDebugPanel}
                onCloseDebugPanel={() => setShowDebugPanel(false)}
              />
            </div>

            {/* Move History - hidden on mobile, visible on desktop */}
            <div className="hidden lg:flex lg:flex-initial bg-slate-800 rounded-lg p-1.5 min-h-0 flex-col">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
                Moves
              </h3>
              <MoveHistory
                moves={moveResults}
                mode={mode}
                playerColor={playerColor}
                variant="compact"
                theme="dark"
                maxHeight="max-h-32"
              />
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
              <MoveHistory
                moves={moveResults}
                mode={mode}
                playerColor={playerColor}
                variant="full"
                theme="dark"
                className="flex-1"
              />
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </main>
  );
}
