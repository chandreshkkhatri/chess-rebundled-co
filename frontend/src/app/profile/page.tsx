'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { updateDisplayName } from '@/lib/firebase';
import { PageLayout } from '@/components/PageLayout';
import { XPProgressBar } from '@/components/XPProgressBar';
import { StreakIndicator } from '@/components/StreakIndicator';
import { UserGamification } from '@/types';

interface UserProfile {
  displayName?: string;
  email?: string;
  photoURL?: string;
  createdAt?: string;
  stats: {
    totalSessions: number;
    totalMoves: number;
    correctMoves: number;
    overallAccuracy: number;
    lastPlayedAt?: string;
  };
  gamification?: UserGamification;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, getIdToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Display name edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

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

        // Use same-origin when SOCKET_URL is not set (production with backend on same domain)
        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
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

  const handleStartEditName = () => {
    setEditedName(user?.displayName || '');
    setNameError(null);
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName('');
    setNameError(null);
  };

  const handleSaveName = async () => {
    const trimmedName = editedName.trim();

    // Validation: max 20 chars, alphanumeric + spaces/hyphens/underscores/periods
    if (!trimmedName) {
      setNameError('Name cannot be empty');
      return;
    }
    if (trimmedName.length > 20) {
      setNameError('Name must be 20 characters or less');
      return;
    }
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(trimmedName)) {
      setNameError('Name can only contain letters, numbers, spaces, hyphens, underscores, and periods');
      return;
    }

    setIsSavingName(true);
    setNameError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        setNameError('Not authenticated');
        setIsSavingName(false);
        return;
      }

      // Update Firebase Auth displayName (so it persists across sessions)
      await updateDisplayName(trimmedName);

      // Also save to Firestore profile
      const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      const response = await fetch(`${apiUrl}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: trimmedName }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save name');
      }

      // Update profile state with new name
      if (profile) {
        setProfile({ ...profile, displayName: trimmedName });
      }
      setIsEditingName(false);
      setEditedName('');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setIsSavingName(false);
    }
  };

  if (isLoading || loadingProfile) {
    return (
      <PageLayout>
        <div className="px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-700 rounded w-1/3"></div>
              <div className="h-32 bg-slate-700 rounded"></div>
              <div className="h-48 bg-slate-700 rounded"></div>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    router.replace('/login?redirect=%2Fprofile');
    return null;
  }

  return (
    <PageLayout>
      <div className="px-4 py-8">
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
                  {(profile?.displayName || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                {isEditingName ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => {
                        setEditedName(e.target.value);
                        if (nameError) setNameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isSavingName) handleSaveName();
                        if (e.key === 'Escape') handleCancelEditName();
                      }}
                      placeholder="Enter your name"
                      maxLength={20}
                      disabled={isSavingName}
                      className={`w-full px-3 py-2 border rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder-slate-400 text-lg ${
                        nameError ? 'border-red-500' : 'border-slate-600'
                      }`}
                      autoFocus
                    />
                    {nameError && (
                      <p className="text-sm text-red-400">{nameError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveName}
                        disabled={isSavingName}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                      >
                        {isSavingName ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEditName}
                        disabled={isSavingName}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-white">
                      {profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'User'}
                    </h1>
                    <button
                      onClick={handleStartEditName}
                      className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Edit name"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
                {user?.email && (
                  <p className="text-slate-400 text-sm mt-1">{user.email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Level & XP Progress */}
          {profile?.gamification && (
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <XPProgressBar
                totalXp={profile.gamification.totalXp}
                level={profile.gamification.level}
                xpToNextLevel={profile.gamification.xpToNextLevel}
              />
            </div>
          )}

          {/* Streak */}
          {profile?.gamification && (
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">Daily Streak</h2>
              <StreakIndicator
                currentStreak={profile.gamification.streaks.currentStreak}
                longestStreak={profile.gamification.streaks.longestStreak}
                streakFreezes={profile.gamification.streaks.streakFreezes}
              />
            </div>
          )}

          {/* Achievements Preview */}
          {profile?.gamification && profile.gamification.achievements.unlocked.length > 0 && (
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Achievements</h2>
                <span className="text-slate-400 text-sm">
                  {profile.gamification.achievements.unlocked.length} unlocked
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.gamification.achievements.unlocked.slice(0, 6).map((achievementId) => (
                  <div
                    key={achievementId}
                    className="bg-slate-700/50 px-3 py-1.5 rounded-full text-sm text-slate-300"
                    title={achievementId}
                  >
                    {achievementId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                ))}
                {profile.gamification.achievements.unlocked.length > 6 && (
                  <div className="bg-slate-700/50 px-3 py-1.5 rounded-full text-sm text-slate-400">
                    +{profile.gamification.achievements.unlocked.length - 6} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Practice Statistics</h2>

            {error ? (
              <p className="text-red-400">{error}</p>
            ) : profile?.stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {profile.stats.totalSessions}
                  </p>
                  <p className="text-slate-400 text-sm">Total Sessions</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {profile.stats.totalMoves}
                  </p>
                  <p className="text-slate-400 text-sm">Total Moves</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-2xl sm:text-3xl font-bold text-green-400">
                    {profile.stats.correctMoves}
                  </p>
                  <p className="text-slate-400 text-sm">Correct Moves</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <p className="text-2xl sm:text-3xl font-bold text-purple-400">
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
      </div>
    </PageLayout>
  );
}
