'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { useAuth } from '@/contexts/AuthContext';
import { updateDisplayName } from '@/lib/firebase';
import { Header } from '@/components/Header';

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');

  // Initialize socket connection
  usePracticeSocket();

  const { user, isAnonymous, isLoading, getIdToken } = useAuth();
  const { isConnected, playerName: storedPlayerName, setPlayerName: storeSetPlayerName } = usePracticeStore();

  // Load player name: prioritize authenticated user's displayName, then stored name
  useEffect(() => {
    if (user && !isAnonymous && user.displayName) {
      setPlayerName(user.displayName);
    } else if (storedPlayerName) {
      setPlayerName(storedPlayerName);
    }
  }, [user, isAnonymous, storedPlayerName]);

  const handleStartPractice = async () => {
    const name = playerName.trim();
    if (name) {
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
          console.error('Failed to save name to profile:', e);
        }
      }
    }
    router.push('/practice');
  };

  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center p-4 pt-20">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Chess Rebundled</h1>
            <p className="text-slate-400">Learn chess notation by speaking moves from famous games</p>
          </div>

        <div className="bg-slate-800 rounded-2xl shadow-xl p-6">
          {/* Show loading skeleton while auth is loading */}
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-10 bg-slate-700 rounded mb-4"></div>
              <div className="h-12 bg-slate-700 rounded"></div>
            </div>
          ) : user && !isAnonymous && user.displayName ? (
            /* Authenticated user with displayName - skip name input */
            <div className="text-center">
              <p className="text-slate-300 mb-6">
                Welcome back, <span className="text-white font-semibold">{user.displayName}</span>!
              </p>
              <button
                onClick={() => router.push('/practice')}
                disabled={!isConnected}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
              >
                {isConnected ? 'Start Practice' : 'Connecting...'}
              </button>
              <Link
                href="/profile"
                className="inline-block mt-3 text-sm text-slate-400 hover:text-slate-300 transition-colors"
              >
                Not you? Change name
              </Link>
            </div>
          ) : (
            /* Guest or authenticated without displayName - show name input */
            <>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartPractice()}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder-slate-400"
                  maxLength={20}
                />
              </div>

              <button
                onClick={handleStartPractice}
                disabled={!isConnected}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
              >
                {isConnected ? 'Start Practice' : 'Connecting...'}
              </button>
            </>
          )}

          {/* Features overview */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 text-center">Features</h3>
            <ul className="text-sm text-slate-400 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-purple-400">&#9679;</span>
                Famous historical chess games
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">&#9679;</span>
                Voice input with AI-powered move parsing
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">&#9679;</span>
                Play as both sides or choose a color
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">&#9679;</span>
                Track your accuracy and progress
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
