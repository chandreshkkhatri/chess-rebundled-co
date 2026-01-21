'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');

  // Initialize socket connection
  usePracticeSocket();

  const { isConnected, playerName: storedPlayerName, setPlayerName: storeSetPlayerName } = usePracticeStore();

  // Load stored player name on mount
  useEffect(() => {
    if (storedPlayerName) {
      setPlayerName(storedPlayerName);
    }
  }, [storedPlayerName]);

  const handleStartPractice = () => {
    if (playerName.trim()) {
      storeSetPlayerName(playerName.trim());
    }
    router.push('/practice');
  };

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
              onKeyDown={(e) => e.key === 'Enter' && handleStartPractice()}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              maxLength={20}
            />
          </div>

          <button
            onClick={handleStartPractice}
            disabled={!isConnected}
            className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-gray-300"
          >
            {isConnected ? 'Start Practice' : 'Connecting...'}
          </button>

          {/* Features overview */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">Features</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-purple-500">&#9679;</span>
                Famous historical chess games
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">&#9679;</span>
                Voice input with AI-powered move parsing
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">&#9679;</span>
                Play as both sides or choose a color
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">&#9679;</span>
                Track your accuracy and progress
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
