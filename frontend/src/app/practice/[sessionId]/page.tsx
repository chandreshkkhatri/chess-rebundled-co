'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { usePracticeStore } from '@/stores/practiceStore';
import { useAuth } from '@/contexts/AuthContext';
import { ChessBoard } from '@/components/ChessBoard';
import { PracticeVoiceInput } from '@/components/PracticeVoiceInput';
import { PracticeResults } from '@/components/PracticeResults';
import { MoveHistory } from '@/components/MoveHistory';
import { SettingsModal } from '@/components/SettingsModal';
import { DiscordIcon } from '@/components/icons/DiscordIcon';
import { LiveGamificationBadge } from '@/components/LiveGamificationBadge';
import { AchievementToastContainer } from '@/components/AchievementToast';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useStockfish } from '@/hooks/useStockfish';
import { Chess } from 'chess.js';

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
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [highlightSquares, setHighlightSquares] = useState<string[]>([]);
  const [wrongMoveEvaluation, setWrongMoveEvaluation] = useState<string | null>(null);
  const [isEvaluatingWrongMove, setIsEvaluatingWrongMove] = useState(false);

  const { isReady: isStockfishReady, evaluatePosition } = useStockfish();

  const { submitPracticeMove, abandonPractice, resumeSession } = usePracticeSocket();
  const { user } = useAuth();
  const { discordInviteUrl } = useAppConfig();
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
    isOpponentThinking,
    playerName,
    isConnected,
    sessionId: storedSessionId,
    pendingAchievements,
    queueAchievements,
    dismissAchievement,
    lastMoveResult,
  } = usePracticeStore();

  // Calculate correct moves so far (memoized to avoid recalculating on every render)
  const correctMoves = useMemo(() => moveResults.filter((r) => r.isCorrect).length, [moveResults]);

  // Calculate live accuracy percentage
  const liveAccuracy = useMemo(() => {
    if (moveResults.length === 0) return 100;
    return Math.round((correctMoves / moveResults.length) * 100);
  }, [correctMoves, moveResults.length]);

  // Compute unlocked trivia facts based on game progress
  const unlockedTrivia = useMemo(() => {
    if (!selectedGame || !selectedGame.trivia) return [];
    const progress = totalMoves > 0 ? currentMoveIndex / totalMoves : 0;
    
    return selectedGame.trivia.map((fact, idx) => {
      // 1st fact unlocks at 25%, 2nd at 50%, 3rd at 75%
      const milestone = (idx + 1) * 0.25;
      return {
        text: fact,
        unlocked: progress >= milestone,
        milestone: Math.round(milestone * 100),
      };
    });
  }, [selectedGame, currentMoveIndex, totalMoves]);

  // Determine the display name for the player
  const displayName = useMemo(() => {
    if (user) {
      return playerName || user.displayName || 'You';
    }
    return playerName || 'You';
  }, [user, playerName]);

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
      setWrongMoveEvaluation(null);
      submitPracticeMove(sessionId, move);
    },
    [sessionId, submitPracticeMove]
  );

  useEffect(() => {
    if (lastMoveResult && !lastMoveResult.isCorrect && isStockfishReady) {
      const { expectedMove, submittedMove } = lastMoveResult;
      
      const analyze = async () => {
        setIsEvaluatingWrongMove(true);
        setWrongMoveEvaluation(null);
        try {
          // 1. Play expected move
          const chessExpected = new Chess(currentPosition);
          try {
            chessExpected.move(expectedMove);
          } catch {}
          const expectedFen = chessExpected.fen();
          
          // 2. Play submitted move
          const chessSubmitted = new Chess(currentPosition);
          try {
            chessSubmitted.move(submittedMove);
          } catch {}
          const submittedFen = chessSubmitted.fen();
          
          // 3. Evaluate both
          const expectedScore = await evaluatePosition(expectedFen, 10);
          const submittedScore = await evaluatePosition(submittedFen, 10);
          
          // 4. Calculate centipawn loss (from perspective of side to move)
          const sideToMove = currentPosition.split(' ')[1];
          const loss = sideToMove === 'w' 
            ? expectedScore - submittedScore 
            : submittedScore - expectedScore;
            
          // 5. Classify
          let classification = '';
          if (loss >= 150) {
            classification = `Blunder (-${(loss / 100).toFixed(2)})`;
          } else if (loss >= 50) {
            classification = `Mistake (-${(loss / 100).toFixed(2)})`;
          } else if (loss >= 20) {
            classification = `Inaccuracy (-${(loss / 100).toFixed(2)})`;
          } else {
            classification = 'Playable alternative';
          }
          
          setWrongMoveEvaluation(classification);
        } catch (err) {
          console.error('[Stockfish Eval] Error evaluating wrong move:', err);
        } finally {
          setIsEvaluatingWrongMove(false);
        }
      };
      
      analyze();
    } else {
      setWrongMoveEvaluation(null);
      setIsEvaluatingWrongMove(false);
    }
  }, [lastMoveResult, isStockfishReady, currentPosition, evaluatePosition]);

  const handleAbandon = useCallback(() => {
    if (window.confirm('Abandon this practice session? Your progress will be lost.')) {
      abandonPractice(sessionId);
      reset();
      router.push('/practice');
    }
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

  // Queue achievements when gamificationResult comes in with newAchievements
  useEffect(() => {
    if (gamificationResult?.newAchievements && gamificationResult.newAchievements.length > 0) {
      // Delay slightly to not interrupt gameplay flow
      const timeout = setTimeout(() => {
        queueAchievements(gamificationResult.newAchievements);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [gamificationResult, queueAchievements]);

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
    <main className="h-dvh flex flex-col pt-2 lg:pt-8 px-2 lg:px-4 pb-2 lg:pb-4 overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header with integrated progress */}
        <div className="bg-slate-800 rounded-lg py-1 px-2 mb-1 lg:mb-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleAbandon}
              className="py-1 px-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors text-sm"
              title="Exit practice"
            >
              ←
            </button>
            {/* Game title - hidden on mobile when compact */}
            <div className={`flex-1 flex items-center justify-center gap-1 min-w-0 ${isHeaderCompact ? 'hidden' : 'flex'} sm:flex`}>
              <span className="text-white font-medium text-sm truncate">
                {selectedGame.white.shortName} vs {selectedGame.black.shortName} ({selectedGame.year})
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowGameInfo(!showGameInfo)}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-slate-500 text-slate-400 hover:border-slate-300 hover:text-white transition-colors text-xs"
                  title="Game info"
                >
                  i
                </button>
                {showGameInfo && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 bg-slate-700 rounded-lg p-3 shadow-xl max-w-xs w-64 border border-slate-600 text-left">
                    <div className="text-white font-bold text-sm border-b border-slate-600 pb-1.5 mb-2">{selectedGame.title}</div>
                    <div className="space-y-1.5">
                      <div className="text-xs text-slate-300"><span className="font-semibold text-slate-400">Event:</span> {selectedGame.event}</div>
                      <div className="text-xs text-slate-300"><span className="font-semibold text-slate-400">Year:</span> {selectedGame.year}</div>
                      
                      {selectedGame.trivia && selectedGame.trivia.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-600">
                          <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Unlocked Insights:</div>
                          <div className="space-y-1">
                            {unlockedTrivia.map((item, idx) => (
                              <div key={idx} className="text-[11px]">
                                {item.unlocked ? (
                                  <span className="text-purple-300">💡 {item.text}</span>
                                ) : (
                                  <span className="text-slate-500 italic">🔒 Locked ({item.milestone}% progress)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Compact mode toggle - mobile only */}
            <button
              onClick={() => setIsHeaderCompact(!isHeaderCompact)}
              className="sm:hidden p-1 text-slate-400 hover:text-white transition-colors"
              title={isHeaderCompact ? 'Show full header' : 'Compact header'}
            >
              {isHeaderCompact ? '⊕' : '⊖'}
            </button>
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
            {/* Gamification badge - authenticated users only */}
            <div className="hidden sm:block">
              <LiveGamificationBadge />
            </div>
            {/* Progress indicator - wider on mobile in compact mode */}
            <div className={`flex items-center gap-1.5 ${isHeaderCompact ? 'flex-1' : ''} sm:flex-initial`}>
              <span className="text-slate-400 text-xs">{currentMoveIndex}/{totalMoves}</span>
              <div className={`h-1.5 bg-slate-700 rounded-full overflow-hidden ${isHeaderCompact ? 'flex-1' : 'w-10'} sm:w-10`}>
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
              {user && user.photoURL ? (
                <Image src={user.photoURL} alt="" width={16} height={16} className="rounded-full" unoptimized />
              ) : null}
              {/* Hide name on mobile when compact */}
              <span className={`max-w-[60px] truncate ${isHeaderCompact ? 'hidden' : 'inline'} sm:inline`}>{displayName}</span>
            </div>
            {/* Settings - desktop only */}
            <button
              onClick={() => setShowSettings(true)}
              className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-white transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {/* Discord link - desktop only */}
            {discordInviteUrl && (
              <a
                href={discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-indigo-400 transition-colors"
                title="Join our Discord"
              >
                <DiscordIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {/* Game area with mobile sidebar */}
        <div className="flex flex-row gap-1 lg:gap-3 flex-1 min-h-0 overflow-hidden">
          {/* Mobile left sidebar */}
          <div className="flex lg:hidden flex-col items-center justify-between py-2 px-1 bg-slate-800/50 rounded-lg flex-shrink-0">
            {/* Top group */}
            <div className="flex flex-col items-center gap-1">
              {discordInviteUrl && (
                <a
                  href={discordInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-400 hover:text-indigo-400 transition-colors"
                  title="Join Discord"
                >
                  <DiscordIcon className="w-5 h-5" />
                </a>
              )}
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

          {/* Main content: board + practice controls */}
          <div className="flex flex-col lg:flex-row gap-1 lg:gap-4 flex-1 min-h-0 overflow-hidden">
            <div className="flex justify-center flex-shrink-0 lg:flex-[1.15] lg:flex-shrink min-h-0">
              <div className="w-full max-w-[min(100%,calc(100vh-250px))] lg:max-w-[min(58vh,620px)] xl:max-w-[min(64vh,700px)] flex flex-col justify-center">
                
                {/* Top Player Plate (Opponent in One-Side Mode) */}
                <div className="flex items-center gap-2 px-1 py-1.5 lg:py-2 text-white">
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xl bg-slate-700`}>
                    {boardOrientation === 'white' ? '♚' : '♔'}
                  </div>
                  <div className="font-semibold truncate">
                    {boardOrientation === 'white' ? selectedGame.black.name : selectedGame.white.name}
                  </div>
                </div>

                <div className="w-full relative self-center bg-slate-850 rounded-[4px]">
                  {isOpponentThinking && mode === 'one-side' && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-purple-400 z-10 animate-tubelight-top pointer-events-none rounded-t-[4px]"></div>
                  )}
                  {!isOpponentThinking && status === 'playing' && mode === 'one-side' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-400 z-10 animate-tubelight-bottom pointer-events-none rounded-b-[4px]"></div>
                  )}
                   <ChessBoard
                    fen={currentPosition}
                    orientation={boardOrientation}
                    lastMove={
                      showingOpponentMove && pendingOpponentMove
                        ? { from: pendingOpponentMove.from, to: pendingOpponentMove.to }
                        : currentExpectedMove && !isOpponentThinking
                        ? { from: currentExpectedMove.from, to: currentExpectedMove.to }
                        : undefined
                    }
                    highlightSquares={highlightSquares}
                  />
                </div>

                {/* Bottom Player Plate (User in One-Side Mode) */}
                <div className="flex items-center gap-2 px-1 py-1.5 lg:py-2 text-white">
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xl font-bold bg-slate-200 text-slate-800`}>
                    {boardOrientation === 'white' ? '♔' : '♚'}
                  </div>
                  <div className="font-semibold truncate flex items-center gap-2">
                    {boardOrientation === 'white' ? selectedGame.white.name : selectedGame.black.name}
                    {mode === 'one-side' && (
                      <span className="text-xs font-normal bg-purple-600/50 text-purple-200 px-2 py-0.5 rounded">You</span>
                    )}
                  </div>
                </div>

              </div>
            </div>

          {/* Control area - voice input stays primary; supporting details remain compact. */}
          <div className="flex flex-col gap-1 lg:gap-2 flex-1 min-h-0 lg:w-[360px] xl:w-[410px] lg:flex-initial">
            {/* Voice input - full width on mobile, dominant panel on desktop */}
            <div className="flex-1 min-w-0 min-h-0 lg:min-h-[360px]">
              <PracticeVoiceInput
                onMoveSubmit={handleMoveSubmit}
                disabled={showingOpponentMove || isOpponentThinking}
                showDebugPanel={showDebugPanel}
                onCloseDebugPanel={() => setShowDebugPanel(false)}
                onHighlightSquares={setHighlightSquares}
                wrongMoveEvaluation={wrongMoveEvaluation}
                isEvaluatingWrongMove={isEvaluatingWrongMove}
              />
            </div>

            {/* Move History - hidden on mobile, compact on desktop */}
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
                maxHeight="max-h-28"
              />
            </div>

            {/* Historical Insights - desktop only, compact supporting context */}
            {selectedGame.trivia && selectedGame.trivia.length > 0 && (
              <div className="hidden lg:flex lg:flex-initial bg-slate-800 rounded-lg p-3 min-h-0 flex-col border border-slate-700/50">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Historical Insights
                </h3>
                <div className="space-y-2 overflow-y-auto max-h-[110px] pr-1">
                  {unlockedTrivia.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2 rounded text-xs transition-all duration-500 border ${
                        item.unlocked 
                          ? 'bg-purple-900/10 border-purple-500/20 text-purple-200 animate-unlock-pulse' 
                          : 'bg-slate-900/40 border-slate-800 text-slate-500 select-none'
                      }`}
                    >
                      {item.unlocked ? (
                        <div>{item.text}</div>
                      ) : (
                        <div className="flex items-center gap-1.5 italic font-mono text-[10px]">
                          <span>🔒 Locked</span>
                          <span className="text-[9px] text-slate-600">({item.milestone}% progress)</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              className="bg-slate-800 rounded-lg p-3 max-w-sm w-full mx-4 max-h-[80vh] sm:max-h-[60vh] flex flex-col"
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

        {/* Achievement Toasts */}
        <AchievementToastContainer
          achievements={pendingAchievements}
          onDismiss={dismissAchievement}
        />
      </div>
    </main>
  );
}
