'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/stores/gameStore';

// Feature flag for multiplayer mode
const MULTIPLAYER_ENABLED = process.env.NEXT_PUBLIC_MULTIPLAYER_ENABLED === 'true';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [hasEnteredLobby, setHasEnteredLobby] = useState(false);

  const { createChallenge, cancelChallenge, getChallenges, acceptChallenge } = useSocket();
  const {
    isConnected,
    challenges,
    myChallenge,
    status,
    roomId,
    playerName: storedPlayerName,
    setPlayerName: storeSetPlayerName,
  } = useGameStore();

  // Load stored player name on mount
  useEffect(() => {
    if (storedPlayerName) {
      setPlayerName(storedPlayerName);
      // Only auto-enter lobby if multiplayer is enabled
      if (MULTIPLAYER_ENABLED) {
        setHasEnteredLobby(true);
      }
    }
  }, [storedPlayerName]);

  // Navigate to game when match is found
  useEffect(() => {
    const validGameStatuses = ['ready', 'countdown', 'playing'];
    if (validGameStatuses.includes(status) && roomId) {
      router.push(`/game/${roomId}`);
    }
  }, [status, roomId, router]);

  // Fetch challenges when entering lobby (only if multiplayer enabled)
  useEffect(() => {
    if (hasEnteredLobby && isConnected && MULTIPLAYER_ENABLED) {
      getChallenges();
    }
  }, [hasEnteredLobby, isConnected, getChallenges]);

  // If multiplayer is disabled and somehow we're in lobby state, redirect to practice
  useEffect(() => {
    if (!MULTIPLAYER_ENABLED && hasEnteredLobby) {
      router.push('/practice');
    }
  }, [hasEnteredLobby, router]);

  const handleEnterLobby = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    storeSetPlayerName(playerName);
    setHasEnteredLobby(true);
  };

  const handleLogout = () => {
    storeSetPlayerName('');
    setPlayerName('');
    setHasEnteredLobby(false);
    cancelChallenge();
  };

  const handleCreateChallenge = () => {
    createChallenge(playerName);
  };

  const handleCancelChallenge = () => {
    cancelChallenge();
  };

  const handleAcceptChallenge = (challengeId: string) => {
    acceptChallenge(challengeId, playerName);
  };

  // Name entry screen
  if (!hasEnteredLobby) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Chess Rebundled</h1>
            <p className="text-slate-400">Test your chess memory with famous historical games</p>
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
                onKeyDown={(e) => e.key === 'Enter' && (MULTIPLAYER_ENABLED ? handleEnterLobby() : router.push('/practice'))}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                maxLength={20}
              />
            </div>

            {MULTIPLAYER_ENABLED ? (
              <>
                <button
                  onClick={handleEnterLobby}
                  disabled={!isConnected}
                  className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-all disabled:bg-gray-300"
                >
                  {isConnected ? 'Enter Lobby' : 'Connecting...'}
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-sm text-gray-500">or</span>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/practice')}
                  disabled={!isConnected}
                  className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-gray-300"
                >
                  Solo Practice
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (playerName.trim()) {
                    storeSetPlayerName(playerName);
                  }
                  router.push('/practice');
                }}
                disabled={!isConnected}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-gray-300"
              >
                {isConnected ? 'Start Practice' : 'Connecting...'}
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // If multiplayer is disabled, don't show lobby
  if (!MULTIPLAYER_ENABLED) {
    return null; // Will redirect via useEffect
  }

  // Lobby screen (only shown when multiplayer is enabled)
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header with logout */}
        <div className="flex items-center justify-between mb-8">
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">Game Lobby</h1>
            <p className="text-slate-400">Welcome, {playerName}!</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm"
            title="Change name"
          >
            Logout
          </button>
        </div>

        {/* My Challenge Section */}
        {myChallenge ? (
          <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-yellow-800">Your Challenge is Active</h3>
                <p className="text-yellow-700 text-sm">Waiting for an opponent to accept...</p>
              </div>
              <button
                onClick={handleCancelChallenge}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
              <span className="text-yellow-700 text-sm">Searching for opponent...</span>
            </div>
          </div>
        ) : (
          <button
            onClick={handleCreateChallenge}
            className="w-full py-4 px-6 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg mb-6 text-lg transition-colors"
          >
            Create Challenge
          </button>
        )}

        {/* Available Challenges */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Available Challenges</h2>

          {challenges.filter((c) => c.id !== myChallenge?.id).length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No open challenges. Create one or wait for others!
            </p>
          ) : (
            <div className="space-y-3">
              {challenges
                .filter((c) => c.id !== myChallenge?.id)
                .map((challenge) => (
                  <div
                    key={challenge.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div>
                      <span className="font-medium text-gray-800">{challenge.creatorName}</span>
                      <span className="text-gray-500 text-sm ml-2">
                        {formatTimeAgo(challenge.createdAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleAcceptChallenge(challenge.id)}
                      disabled={!!myChallenge}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Accept
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Solo Practice Button */}
        <button
          onClick={() => router.push('/practice')}
          className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg mt-6 transition-colors"
        >
          Solo Practice
        </button>

        {/* How to play */}
        <div className="mt-8 text-center text-slate-400 text-sm">
          <h3 className="font-semibold mb-2">How to Play</h3>
          <ol className="space-y-1 text-left max-w-xs mx-auto">
            <li>1. Create a challenge or accept one</li>
            <li>2. A random famous chess game will be selected</li>
            <li>3. Speak the moves before time runs out</li>
            <li>4. Score points for correct moves!</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
