'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/stores/gameStore';

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
    setPlayerName: storeSetPlayerName,
  } = useGameStore();

  // Navigate to game when match is found
  useEffect(() => {
    if (status === 'playing' && roomId) {
      router.push(`/game/${roomId}`);
    }
  }, [status, roomId, router]);

  // Fetch challenges when entering lobby
  useEffect(() => {
    if (hasEnteredLobby && isConnected) {
      getChallenges();
    }
  }, [hasEnteredLobby, isConnected, getChallenges]);

  const handleEnterLobby = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    storeSetPlayerName(playerName);
    setHasEnteredLobby(true);
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
                onKeyDown={(e) => e.key === 'Enter' && handleEnterLobby()}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                maxLength={20}
              />
            </div>

            <button
              onClick={handleEnterLobby}
              disabled={!isConnected}
              className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-all disabled:bg-gray-300"
            >
              {isConnected ? 'Enter Lobby' : 'Connecting...'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Lobby screen
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Game Lobby</h1>
          <p className="text-slate-400">Welcome, {playerName}!</p>
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
