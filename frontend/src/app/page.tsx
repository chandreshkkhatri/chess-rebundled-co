'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/PageLayout';

interface QuickStats {
  overallAccuracy: number;
  totalSessions: number;
}

export default function Home() {
  const { user, isLoading, getIdToken } = useAuth();
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);

  useEffect(() => {
    setQuickStats(null);
    if (!user) return;
    const controller = new AbortController();
    (async () => {
      try {
        const token = await getIdToken();
        if (!token || controller.signal.aborted) return;
        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
        const response = await fetch(`${apiUrl}/api/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted) {
          setQuickStats({
            overallAccuracy: data.stats?.overallAccuracy ?? 0,
            totalSessions: data.stats?.totalSessions ?? 0,
          });
        }
      } catch {
        // Optional dashboard statistics must not block practice or AI play.
      }
    })();
    return () => controller.abort();
  }, [user, getIdToken]);

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center p-4 py-16">
          <div className="animate-pulse text-center">
            <div className="h-10 w-48 bg-slate-700 rounded-sm mx-auto mb-4" />
            <div className="h-4 w-64 bg-slate-700 rounded-sm mx-auto" />
          </div>
        </div>
      </PageLayout>
    );
  }

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Player';

  return (
    <PageLayout>
      <main className="flex items-center justify-center p-4 py-12">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">Chess Rebundled</h1>
            <p className="text-lg text-slate-400">
              Speak your moves. Practice with great players. Play a conversational AI opponent.
            </p>
            {user && (
              <p className="text-slate-400 mt-3">
                Welcome back, <span className="text-white font-semibold">{displayName}</span>!
              </p>
            )}
          </div>

          {user && quickStats && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-800 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-green-400">
                  {quickStats.totalSessions > 0 ? `${(quickStats.overallAccuracy * 100).toFixed(0)}%` : '—'}
                </p>
                <p className="text-sm text-slate-400">Practice accuracy</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-blue-400">{quickStats.totalSessions}</p>
                <p className="text-sm text-slate-400">Completed sessions</p>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            <Link href="/practice" className="bg-slate-800 rounded-2xl p-6 hover:ring-2 hover:ring-purple-500 transition-all">
              <span className="text-3xl" aria-hidden="true">🎙️</span>
              <h2 className="text-xl font-bold text-white mt-3 mb-2">Speech Practice</h2>
              <p className="text-slate-400 text-sm">
                Replay historical games by speaking your moves. Choose a game or a player from the database, with text and tap input also available.
              </p>
              <p className="text-purple-300 text-sm font-medium mt-4">Start practicing →</p>
            </Link>
            <Link href="/play-ai" className="bg-slate-800 rounded-2xl p-6 hover:ring-2 hover:ring-pink-500 transition-all">
              <span className="text-3xl text-pink-300" aria-hidden="true">♞</span>
              <h2 className="text-xl font-bold text-white mt-3 mb-2">Play vs AI</h2>
              <p className="text-slate-400 text-sm">
                Choose an AI personality that talks with you as it plays, then review the game and conversation.
              </p>
              <p className="text-pink-300 text-sm font-medium mt-4">Choose your opponent →</p>
            </Link>
          </div>

          <nav aria-label="More ways to practice" className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-400">
            <Link href="/play" className="hover:text-purple-300">Play Online</Link>
            <Link href="/trainer" className="hover:text-purple-300">Coordinate Trainer</Link>
            <Link href="/settings" className="hover:text-purple-300">Speech & Input Settings</Link>
            {user && <Link href="/profile" className="hover:text-purple-300">Profile & Stats</Link>}
            {user && <Link href="/history" className="hover:text-purple-300">Practice History</Link>}
          </nav>
          {!user && (
            <p className="text-center text-slate-400 text-sm mt-8">
              <Link href="/login" className="text-purple-300 hover:text-purple-200">Sign in</Link> to practice with speech, save your history, and play AI games.
            </p>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
