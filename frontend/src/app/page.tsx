'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { useAuth } from '@/contexts/AuthContext';
import { usePracticeStore } from '@/stores/practiceStore';
import { PageLayout } from '@/components/PageLayout';
import { useEffect, useState } from 'react';

interface QuickStats {
  streak: number;
  totalXp: number;
  overallAccuracy: number;
  totalSessions: number;
}

export default function Home() {
  const router = useRouter();

  // Initialize socket connection
  usePracticeSocket();

  const { user, isLoading, getIdToken } = useAuth();
  const { isConnected } = usePracticeStore();
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);

  // Fetch lightweight profile stats for the dashboard banner
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
        const res = await fetch(`${apiUrl}/api/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setQuickStats({
          streak: data.gamification?.streaks?.currentStreak ?? 0,
          totalXp: data.gamification?.totalXp ?? 0,
          overallAccuracy: data.stats?.overallAccuracy ?? 0,
          totalSessions: data.stats?.totalSessions ?? 0,
        });
      } catch {
        // Non-critical — silently ignore
      }
    })();
  }, [user, getIdToken]);

  // Loading state
  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center p-4 py-16">
          <div className="animate-pulse text-center">
            <div className="h-10 w-48 bg-slate-700 rounded mx-auto mb-4"></div>
            <div className="h-4 w-64 bg-slate-700 rounded mx-auto"></div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Authenticated user — dashboard
  if (user) {
    const displayName = user.displayName || user.email?.split('@')[0] || 'Player';

    return (
      <PageLayout>
        <div className="flex items-center justify-center p-4 py-8">
          <div className="max-w-md md:max-w-2xl lg:max-w-4xl w-full">
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold text-white mb-2">Chess Rebundled</h1>
              <p className="text-slate-400">
                Welcome back, <span className="text-white font-semibold">{displayName}</span>!
              </p>
            </div>

            {/* Quick Stats Banner */}
            {quickStats && (
              <div className="grid grid-cols-4 gap-2 mb-6">
                <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/50">
                  <p className="text-xl font-black text-orange-400">
                    {quickStats.streak > 0 ? `🔥 ${quickStats.streak}` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Streak</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/50">
                  <p className="text-xl font-black text-purple-400">{quickStats.totalXp.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">XP</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/50">
                  <p className="text-xl font-black text-green-400">
                    {quickStats.totalSessions > 0
                      ? `${(quickStats.overallAccuracy * 100).toFixed(0)}%`
                      : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Accuracy</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/50">
                  <p className="text-xl font-black text-blue-400">{quickStats.totalSessions}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Sessions</p>
                </div>
              </div>
            )}

            {/* Action cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <button
                onClick={() => router.push('/practice')}
                disabled={!isConnected}
                className="bg-slate-800 rounded-2xl p-6 text-left hover:bg-slate-750 hover:ring-2 hover:ring-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="text-3xl mb-3">&#9812;&#9818;</div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-purple-300 transition-colors">
                  Solo Practice
                </h2>
                <p className="text-sm text-slate-400">
                  Learn chess notation by replaying famous historical games
                </p>
              </button>

              <button
                onClick={() => router.push('/play')}
                disabled={!isConnected}
                className="bg-slate-800 rounded-2xl p-6 text-left hover:bg-slate-750 hover:ring-2 hover:ring-green-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="text-3xl mb-3">&#9813;&#9819;</div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-green-300 transition-colors">
                  Play Online
                </h2>
                <p className="text-sm text-slate-400">
                  Challenge another player using chess notation
                </p>
              </button>

              <button
                onClick={() => router.push('/play-ai')}
                disabled={!isConnected}
                className="bg-slate-800 rounded-2xl p-6 text-left hover:bg-slate-750 hover:ring-2 hover:ring-pink-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="text-3xl mb-3">🤖</div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-pink-300 transition-colors">
                  Play vs AI
                </h2>
                <p className="text-sm text-slate-400">
                  Face an AI opponent that thinks out loud and talks back while it plays
                </p>
              </button>

              <button
                onClick={() => router.push('/trainer')}
                className="bg-slate-800 rounded-2xl p-6 text-left hover:bg-slate-750 hover:ring-2 hover:ring-indigo-500/50 transition-all group"
              >
                <div className="text-3xl mb-3">🎯</div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Coordinate Trainer
                </h2>
                <p className="text-sm text-slate-400">
                  Build lightning-fast notation recall with a 30-second speed game
                </p>
              </button>
            </div>

            {/* Quick links */}
            <div className="flex justify-center gap-6 text-sm">
              <Link href="/profile" className="text-slate-400 hover:text-purple-300 transition-colors">
                Profile & Stats
              </Link>
              <Link href="/history" className="text-slate-400 hover:text-purple-300 transition-colors">
                Practice History
              </Link>
              <Link href="/trainer" className="text-slate-400 hover:text-purple-300 transition-colors">
                Notation Trainer
              </Link>
              <Link href="/settings" className="text-slate-400 hover:text-purple-300 transition-colors">
                Settings
              </Link>
            </div>

            {!isConnected && (
              <div className="mt-6 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-center">
                <p className="text-sm text-yellow-400">Connecting to server...</p>
              </div>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  // Unauthenticated — landing page
  return (
    <PageLayout>
      <div className="flex items-center justify-center p-4 py-16">
        <div className="max-w-md md:max-w-2xl lg:max-w-4xl w-full">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-6xl font-bold text-white tracking-tight mb-4">Chess Rebundled</h1>
            <p className="text-xl text-slate-400 mb-10">
              Master chess notation through famous historical games and online play
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login?initialView=register"
                className="px-10 py-4 bg-purple-500 hover:bg-purple-600 text-white text-lg font-bold rounded-lg transition-all text-center"
              >
                Get Started
              </Link>
              <Link
                href="/login"
                className="px-10 py-4 bg-slate-700 hover:bg-slate-600 text-slate-200 text-lg font-medium rounded-lg transition-all text-center"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded-xl p-5">
              <div className="text-2xl mb-2">&#9822;</div>
              <h3 className="font-semibold text-white mb-1">Learn Notation</h3>
              <p className="text-sm text-slate-400">
                Build fluency in algebraic notation by replaying moves from real grandmaster games
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-5">
              <div className="text-2xl mb-2">&#127908;</div>
              <h3 className="font-semibold text-white mb-1">Voice & Text Input</h3>
              <p className="text-sm text-slate-400">
                Type moves or speak them — AI-powered voice recognition understands natural chess language
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-5">
              <div className="text-2xl mb-2">&#9813;&#9819;</div>
              <h3 className="font-semibold text-white mb-1">Challenge Friends</h3>
              <p className="text-sm text-slate-400">
                Invite a friend or find a random opponent — all moves submitted as notation, not drag-and-drop
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-5">
              <div className="text-2xl mb-2">&#9889;</div>
              <h3 className="font-semibold text-white mb-1">Level Up</h3>
              <p className="text-sm text-slate-400">
                Earn XP, maintain daily streaks, and unlock achievements as your notation skills improve
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
