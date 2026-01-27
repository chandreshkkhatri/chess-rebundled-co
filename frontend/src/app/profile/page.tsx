'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';

interface UserProfile {
  displayName?: string;
  email?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  createdAt?: string;
  stats: {
    totalSessions: number;
    totalMoves: number;
    correctMoves: number;
    overallAccuracy: number;
    lastPlayedAt?: string;
  };
}

export default function ProfilePage() {
  const { user, isAnonymous, isLoading, getIdToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (isLoading || !user) return;

      try {
        const token = await getIdToken();
        if (!token) {
          setError('Not authenticated');
          setLoadingProfile(false);
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/user/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }

        const data = await response.json();
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoadingProfile(false);
      }
    }

    fetchProfile();
  }, [user, isLoading, getIdToken]);

  if (isLoading || loadingProfile) {
    return (
      <>
        <Header />
        <main className="min-h-screen pt-20 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-700 rounded w-1/3"></div>
              <div className="h-32 bg-slate-700 rounded"></div>
              <div className="h-48 bg-slate-700 rounded"></div>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (isAnonymous) {
    return (
      <>
        <Header />
        <main className="min-h-screen pt-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
              <h1 className="text-2xl font-bold text-white mb-4">Create an Account</h1>
              <p className="text-slate-400 mb-6">
                Sign up to save your practice history and track your progress over time.
              </p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
              >
                Go to Home
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen pt-20 px-4 pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* User Info */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <div className="flex items-center gap-4">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-white">
                  {user?.displayName || user?.email?.split('@')[0] || 'User'}
                </h1>
                {user?.email && (
                  <p className="text-slate-400 text-sm">{user.email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Practice Statistics</h2>

            {error ? (
              <p className="text-red-400">{error}</p>
            ) : profile?.stats ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-white">
                    {profile.stats.totalSessions}
                  </p>
                  <p className="text-slate-400 text-sm">Total Sessions</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-white">
                    {profile.stats.totalMoves}
                  </p>
                  <p className="text-slate-400 text-sm">Total Moves</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-green-400">
                    {profile.stats.correctMoves}
                  </p>
                  <p className="text-slate-400 text-sm">Correct Moves</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-3xl font-bold text-purple-400">
                    {(profile.stats.overallAccuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-slate-400 text-sm">Overall Accuracy</p>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">No practice data yet. Start practicing to see your stats!</p>
            )}

            {profile?.stats?.lastPlayedAt && (
              <p className="text-slate-500 text-sm mt-4">
                Last played: {new Date(profile.stats.lastPlayedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-4">
            <Link
              href="/practice"
              className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-center transition-colors"
            >
              Start Practice
            </Link>
            <Link
              href="/history"
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg text-center transition-colors"
            >
              View History
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
