'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { usePracticeStore } from '@/stores/practiceStore';
import { PracticeMode } from '@/types';

export default function PracticeSelectPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | null>(null);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const hasStartedRef = useRef(false);
  const startTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { startPracticeRandom } = usePracticeSocket();
  const {
    isConnected,
    sessionId,
    status,
    error,
    isStarting,
    playerName: storedPlayerName,
    setPlayerName: storeSetPlayerName,
    setError,
    setStarting,
    reset,
  } = usePracticeStore();

  // Load stored player name on mount
  useEffect(() => {
    if (storedPlayerName) {
      setPlayerName(storedPlayerName);
      setHasEnteredName(true);
    }
  }, [storedPlayerName]);

  // Always reset to idle on mount - user is on /practice so any existing session is stale
  useEffect(() => {
    const currentStatus = usePracticeStore.getState().status;
    if (currentStatus !== 'idle') {
      reset();
      hasStartedRef.current = false;
    }
  }, [reset]);

  // Navigate to game when session starts
  useEffect(() => {
    if (status === 'playing' && sessionId) {
      router.push(`/practice/${sessionId}`);
    }
  }, [status, sessionId, router]);

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

  const handleEnterName = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    storeSetPlayerName(playerName);
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

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEnterName()}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                maxLength={20}
              />
            </div>

            <button
              onClick={handleEnterName}
              disabled={!isConnected}
              className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-gray-300"
            >
              {isConnected ? 'Continue' : 'Connecting...'}
            </button>

            <button
              onClick={() => router.push('/')}
              className="w-full mt-3 py-3 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-all"
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

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => handleSelectColor('white')}
                className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all"
              >
                <span className="text-5xl mb-2">&#9812;</span>
                <span className="font-medium text-gray-700">White</span>
              </button>
              <button
                onClick={() => handleSelectColor('black')}
                className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all"
              >
                <span className="text-5xl mb-2">&#9818;</span>
                <span className="font-medium text-gray-700">Black</span>
              </button>
            </div>

            <button
              onClick={() => setSelectedMode(null)}
              className="w-full py-3 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-all"
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
            <p className="text-slate-400">Hi {playerName}! How would you like to practice?</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="space-y-4 mb-6">
              <button
                onClick={() => handleSelectMode('both-sides')}
                className="w-full flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-2xl">&#9812;&#9818;</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Both Sides</h3>
                  <p className="text-sm text-gray-500">Identify all moves for White and Black</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectMode('one-side')}
                className="w-full flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-2xl">&#9812;</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">One Side</h3>
                  <p className="text-sm text-gray-500">Play as White or Black only</p>
                </div>
              </button>
            </div>

            <button
              onClick={() => {
                setHasEnteredName(false);
                setShowModeSelection(false);
              }}
              className="w-full py-3 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-all"
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
    // Go back to mode selection
    setShowModeSelection(true);
    setSelectedMode(null);
    setSelectedColor(null);
    // Will trigger the useEffect to start again
  };

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
