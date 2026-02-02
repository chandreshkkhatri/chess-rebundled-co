'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { usePracticeStore } from '@/stores/practiceStore';
import { useAuth } from '@/contexts/AuthContext';
import { updateDisplayName } from '@/lib/firebase';
import { PracticeMode } from '@/types';
import { PracticeCountdown } from '@/components/PracticeCountdown';

export default function PracticeSelectPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | null>(null);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const hasStartedRef = useRef(false);
  const startTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { startPracticeRandom } = usePracticeSocket();
  const { user, isAnonymous, getIdToken } = useAuth();
  const {
    isConnected,
    sessionId,
    status,
    error,
    isStarting,
    selectedGame,
    mode: storeMode,
    playerColor: storePlayerColor,
    playerName: storedPlayerName,
    setPlayerName: storeSetPlayerName,
    setError,
    setStarting,
    reset,
  } = usePracticeStore();

  // Countdown state - show countdown when game is ready before navigating
  const [showCountdown, setShowCountdown] = useState(false);

  // Load player name: prioritize authenticated user's displayName, then stored name
  useEffect(() => {
    // For authenticated (non-anonymous) users, use their profile displayName
    if (user && !isAnonymous && user.displayName) {
      setPlayerName(user.displayName);
      storeSetPlayerName(user.displayName);
      setHasEnteredName(true);
      setShowModeSelection(true);
    } else if (storedPlayerName) {
      setPlayerName(storedPlayerName);
      setHasEnteredName(true);
      setShowModeSelection(true);
    }
  }, [user, isAnonymous, storedPlayerName, storeSetPlayerName]);

  // Always reset to idle on mount - user is on /practice so any existing session is stale
  useEffect(() => {
    const currentStatus = usePracticeStore.getState().status;
    if (currentStatus !== 'idle') {
      reset();
      hasStartedRef.current = false;
    }
  }, [reset]);

  // Show countdown when session starts (instead of immediate navigation)
  useEffect(() => {
    if (status === 'playing' && sessionId && selectedGame && !showCountdown) {
      setShowCountdown(true);
    }
  }, [status, sessionId, selectedGame, showCountdown]);

  // Handle countdown completion - navigate to game
  const handleCountdownComplete = useCallback(() => {
    if (sessionId) {
      router.push(`/practice/${sessionId}`);
    }
  }, [sessionId, router]);

  // Start practice when mode is selected (or immediately for both-sides)
  useEffect(() => {
    const canStart = hasEnteredName &&
                     isConnected &&
                     !hasStartedRef.current &&
                     status === 'idle' &&
                     !isStarting &&
                     showModeSelection &&
                     selectedMode !== null &&
                     (selectedMode === 'both-sides' || (selectedMode === 'one-side' && selectedColor !== null));

    if (canStart) {
      // Small delay to ensure listeners are attached after React Strict Mode double-mount
      const timeout = setTimeout(() => {
        if (!hasStartedRef.current) {
          hasStartedRef.current = true;
          const success = startPracticeRandom(playerName, selectedMode, selectedColor);

          if (success) {
            // Set timeout for server response - if no response in 8s, show error
            startTimeoutRef.current = setTimeout(() => {
              const currentStatus = usePracticeStore.getState().status;
              const currentIsStarting = usePracticeStore.getState().isStarting;

              if (currentStatus === 'idle' && currentIsStarting) {
                usePracticeStore.getState().setError('Server did not respond. Please try again.');
                usePracticeStore.getState().setStarting(false);
                hasStartedRef.current = false;
              }
            }, 8000);
          } else {
            // Emit failed (e.g., not connected), allow retry
            hasStartedRef.current = false;
          }
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [hasEnteredName, isConnected, status, isStarting, playerName, selectedMode, selectedColor, showModeSelection, startPracticeRandom]);

  // Clear timeout when navigating to game or on error
  useEffect(() => {
    if (status === 'playing' || error) {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    }
  }, [status, error]);

  // Reset hasStartedRef when error is set (allows retry)
  useEffect(() => {
    if (error) {
      hasStartedRef.current = false;
    }
  }, [error]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
    };
  }, []);

  const handleEnterName = async () => {
    const name = playerName.trim();
    if (!name) {
      setNameError('Please enter your name');
      return;
    }

    setNameError(null);
    setIsSubmitting(true);
    storeSetPlayerName(name);

    // For authenticated users, also save to their profile and Firebase Auth
    if (user && !isAnonymous) {
      try {
        // Update Firebase Auth displayName (so it persists across sessions)
        await updateDisplayName(name);

        // Also save to Firestore profile
        const token = await getIdToken();
        if (token) {
          fetch('/api/user/profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ displayName: name }),
          }).catch((e) => console.error('Failed to save name to profile:', e));
        }
      } catch (e) {
        // Non-blocking, just log
        console.error('Failed to save name to profile:', e);
      }
    }

    setIsSubmitting(false);
    setHasEnteredName(true);
    setShowModeSelection(true);
  };

  const handleSelectMode = (mode: PracticeMode) => {
    setSelectedMode(mode);
    if (mode === 'both-sides') {
      setSelectedColor(null);
      // Auto-start will trigger via useEffect
    }
  };

  const handleSelectColor = (color: 'white' | 'black') => {
    setSelectedColor(color);
    // Auto-start will trigger via useEffect
  };

  const handleBackToModeSelection = () => {
    setSelectedColor(null);
  };

  // Name entry screen
  if (!hasEnteredName) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Solo Practice</h1>
            <p className="text-slate-400">Practice identifying moves at your own pace</p>
          </div>

          <div className="bg-slate-800 rounded-2xl shadow-xl p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && !isSubmitting && handleEnterName()}
                placeholder="Enter your name"
                className={`w-full px-4 py-3 border rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder-slate-400 ${
                  nameError ? 'border-red-500' : 'border-slate-600'
                }`}
                maxLength={20}
                disabled={isSubmitting}
              />
              {nameError && (
                <p className="mt-2 text-sm text-red-400">{nameError}</p>
              )}
            </div>

            <button
              onClick={handleEnterName}
              disabled={!isConnected || isSubmitting}
              className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
            >
              {!isConnected ? 'Connecting...' : isSubmitting ? 'Saving...' : 'Continue'}
            </button>

            <button
              onClick={() => router.push('/')}
              className="w-full mt-3 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-all"
            >
              Back to Home
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-8 text-center text-slate-400 text-sm">
            <h3 className="font-semibold mb-2">How Practice Mode Works</h3>
            <ol className="space-y-1 text-left max-w-sm mx-auto">
              <li>1. A random famous historical game will be selected</li>
              <li>2. Choose to identify all moves or just one side</li>
              <li>3. Speak the moves using voice input</li>
              <li>4. Track your accuracy and improve!</li>
            </ol>
            <div className="mt-3 p-2 bg-slate-700/50 rounded text-xs text-slate-300 max-w-sm mx-auto">
              <span className="text-yellow-400 font-semibold">Tip:</span> Use phonetic alphabet for clearer recognition:
              <span className="text-blue-300"> &quot;delta 4&quot;</span> for d4,
              <span className="text-blue-300"> &quot;bravo 3&quot;</span> for b3
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Color selection for one-side mode
  if (showModeSelection && selectedMode === 'one-side' && selectedColor === null && status === 'idle') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Choose Your Side</h1>
            <p className="text-slate-400">Play as White or Black</p>
          </div>

          <div className="bg-slate-800 rounded-2xl shadow-xl p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => handleSelectColor('white')}
                className="flex flex-col items-center justify-center p-6 border-2 border-slate-600 rounded-xl hover:border-purple-500 hover:bg-purple-900/30 transition-all"
              >
                <span className="text-5xl mb-2">&#9812;</span>
                <span className="font-medium text-slate-200">White</span>
              </button>
              <button
                onClick={() => handleSelectColor('black')}
                className="flex flex-col items-center justify-center p-6 border-2 border-slate-600 rounded-xl hover:border-purple-500 hover:bg-purple-900/30 transition-all"
              >
                <span className="text-5xl mb-2">&#9818;</span>
                <span className="font-medium text-slate-200">Black</span>
              </button>
            </div>

            <button
              onClick={() => setSelectedMode(null)}
              className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-all"
            >
              Back to Mode Selection
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Mode selection screen
  if (showModeSelection && status === 'idle' && !hasStartedRef.current) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Choose Practice Mode</h1>
            <p className="text-slate-400">
              Hi {playerName}! How would you like to practice?
              <Link href="/profile" className="ml-2 text-purple-400 hover:text-purple-300 text-sm transition-colors">
                Change name
              </Link>
            </p>
          </div>

          <div className="bg-slate-800 rounded-2xl shadow-xl p-6">
            {/* Connection status */}
            {!isConnected && (
              <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <p className="text-sm text-yellow-400">Connecting to server...</p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <button
                onClick={() => handleSelectMode('both-sides')}
                disabled={!isConnected}
                className="w-full flex items-center p-4 border-2 border-slate-600 rounded-xl hover:border-purple-500 hover:bg-purple-900/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-600 disabled:hover:bg-transparent"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-purple-900/50 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-2xl">&#9812;&#9818;</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100">Both Sides</h3>
                  <p className="text-sm text-slate-400">Identify all moves for White and Black</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectMode('one-side')}
                disabled={!isConnected}
                className="w-full flex items-center p-4 border-2 border-slate-600 rounded-xl hover:border-purple-500 hover:bg-purple-900/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-600 disabled:hover:bg-transparent"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-purple-900/50 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-2xl">&#9812;</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100">One Side</h3>
                  <p className="text-sm text-slate-400">Play as White or Black only</p>
                </div>
              </button>
            </div>

            <button
              onClick={() => {
                setHasEnteredName(false);
                setShowModeSelection(false);
              }}
              className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-all"
            >
              Back
            </button>
          </div>
        </div>
      </main>
    );
  }

  const handleRetry = () => {
    setError(null);
    setStarting(false);
    hasStartedRef.current = false;
    setShowCountdown(false);
    // Go back to mode selection
    setShowModeSelection(true);
    setSelectedMode(null);
    setSelectedColor(null);
    // Will trigger the useEffect to start again
  };

  // Show countdown when game is ready
  if (showCountdown && selectedGame) {
    return (
      <PracticeCountdown
        game={selectedGame}
        mode={storeMode}
        playerColor={storePlayerColor}
        onComplete={handleCountdownComplete}
      />
    );
  }

  // Loading screen while starting practice session
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {error ? (
          <>
            <div className="text-red-400 text-5xl mb-4">!</div>
            <p className="text-white text-lg font-medium mb-2">Failed to start practice</p>
            <p className="text-red-400 text-sm mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={handleRetry}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  reset();
                  router.push('/');
                }}
                className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
              >
                Back to Home
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white text-lg font-medium">Selecting a random game...</p>
            <p className="text-slate-400 text-sm mt-2">Preparing your practice session</p>
          </>
        )}
      </div>
    </main>
  );
}
