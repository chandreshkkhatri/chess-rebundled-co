'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMultiplayerSocket } from '@/hooks/useMultiplayerSocket';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/PageLayout';
import type { TimeControl } from '@/types/multiplayer';

const TIME_CONTROLS: { label: string; description: string; value: TimeControl | null }[] = [
  { label: 'No Clock', description: 'Untimed game', value: null },
  { label: '10 min', description: 'Standard', value: { initialTimeMs: 600_000, incrementMs: 0 } },
  { label: '5 min', description: 'Blitz', value: { initialTimeMs: 300_000, incrementMs: 0 } },
  { label: '3 min', description: 'Blitz', value: { initialTimeMs: 180_000, incrementMs: 0 } },
  { label: '3+2', description: 'Blitz w/ increment', value: { initialTimeMs: 180_000, incrementMs: 2_000 } },
  { label: '1 min', description: 'Bullet', value: { initialTimeMs: 60_000, incrementMs: 0 } },
];

type LobbyTab = 'find' | 'invite' | 'join';

export default function PlayLobbyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<LobbyTab>('find');
  const [selectedTC, setSelectedTC] = useState<TimeControl | null>(null);
  const [joinCode, setJoinCode] = useState('');

  const { user, isAnonymous } = useAuth();
  const { findGame, cancelFind, createInvite, joinInvite } = useMultiplayerSocket();
  // Also init practice socket for connection (shared singleton)
  usePracticeSocket();

  const {
    isConnected,
    isSearching,
    inviteCode,
    gameId,
    status,
    error,
    setError,
    reset,
  } = useMultiplayerStore();

  // Navigate to game when found
  useEffect(() => {
    if (status === 'playing' && gameId) {
      router.push(`/play/${gameId}`);
    }
  }, [status, gameId, router]);

  // Reset on mount
  useEffect(() => {
    const state = useMultiplayerStore.getState();
    if (state.status !== 'idle' && state.status !== 'searching') {
      reset();
    }
  }, [reset]);

  // Check for join code in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const joinParam = params.get('join');
      if (joinParam) {
        setTab('join');
        setJoinCode(joinParam);
      }
    }
  }, []);

  const requireAuth = () => {
    if (!user || isAnonymous) {
      setError('Please sign in to play multiplayer');
      return false;
    }
    return true;
  };

  const handleFindGame = () => {
    if (!requireAuth()) return;
    findGame(selectedTC);
  };

  const handleCreateInvite = () => {
    if (!requireAuth()) return;
    createInvite(selectedTC);
  };

  const handleJoinInvite = () => {
    if (!requireAuth()) return;
    const code = joinCode.trim();
    if (!code) return;
    joinInvite(code);
  };

  const handleCancel = () => {
    cancelFind();
    reset();
  };

  // Searching state
  if (isSearching) {
    return (
      <PageLayout>
        <main className="flex items-center justify-center p-4 py-16">
          <div className="text-center max-w-md">
            <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-white mb-2">Searching for opponent...</h2>
            <p className="text-slate-400 mb-6">
              {selectedTC
                ? `${selectedTC.initialTimeMs / 60000} min${selectedTC.incrementMs ? ` + ${selectedTC.incrementMs / 1000}s` : ''}`
                : 'No clock'}
            </p>
            <button
              onClick={handleCancel}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
            >
              Cancel
            </button>
          </div>
        </main>
      </PageLayout>
    );
  }

  // Invite created - waiting
  if (inviteCode) {
    const inviteUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/play?join=${inviteCode}`
      : '';

    return (
      <PageLayout>
        <main className="flex items-center justify-center p-4 py-16">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-white mb-2">Invite Created</h2>
            <p className="text-slate-400 mb-6">Share this code with your opponent</p>

            <div className="bg-slate-700 rounded-xl p-6 mb-6">
              <p className="text-3xl font-mono font-bold text-purple-400 tracking-wider mb-4">
                {inviteCode}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(inviteUrl || inviteCode)}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-all"
              >
                Copy Link
              </button>
            </div>

            <div className="animate-pulse text-slate-400 text-sm mb-6">
              Waiting for opponent to join...
            </div>

            <button
              onClick={handleCancel}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
            >
              Cancel
            </button>
          </div>
        </main>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <main className="flex items-center justify-center p-4 py-8">
        <div className="max-w-md md:max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Play Online</h1>
            <p className="text-slate-400">Challenge another player using chess notation</p>
          </div>

          {/* Auth warning */}
          {(!user || isAnonymous) && (
            <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-center">
              <p className="text-sm text-yellow-400">
                Please <a href="/login" className="underline font-medium">sign in</a> to play multiplayer
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-300 underline mt-1">
                Dismiss
              </button>
            </div>
          )}

          {/* Connection */}
          {!isConnected && (
            <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
              <p className="text-sm text-yellow-400">Connecting to server...</p>
            </div>
          )}

          <div className="bg-slate-800 rounded-2xl shadow-xl p-6">
            {/* Tabs */}
            <div className="flex mb-6 bg-slate-700 rounded-lg p-1">
              {(['find', 'invite', 'join'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    tab === t
                      ? 'bg-purple-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'find' ? 'Find Game' : t === 'invite' ? 'Create Invite' : 'Join Invite'}
                </button>
              ))}
            </div>

            {/* Time Control Selection (for find/invite tabs) */}
            {tab !== 'join' && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Time Control</h3>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CONTROLS.map((tc) => {
                    const isSelected = selectedTC === tc.value ||
                      (selectedTC === null && tc.value === null) ||
                      (selectedTC && tc.value &&
                        selectedTC.initialTimeMs === tc.value.initialTimeMs &&
                        selectedTC.incrementMs === tc.value.incrementMs);
                    return (
                      <button
                        key={tc.label}
                        onClick={() => setSelectedTC(tc.value)}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-900/30'
                            : 'border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        <div className="font-semibold text-slate-100 text-sm">{tc.label}</div>
                        <div className="text-xs text-slate-400">{tc.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action based on tab */}
            {tab === 'find' && (
              <button
                onClick={handleFindGame}
                disabled={!isConnected || !user || isAnonymous}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
              >
                Find Opponent
              </button>
            )}

            {tab === 'invite' && (
              <button
                onClick={handleCreateInvite}
                disabled={!isConnected || !user || isAnonymous}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
              >
                Create Invite Link
              </button>
            )}

            {tab === 'join' && (
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinInvite()}
                    placeholder="Enter invite code"
                    className="w-full px-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder-slate-400 font-mono tracking-wider"
                    maxLength={20}
                  />
                </div>
                <button
                  onClick={handleJoinInvite}
                  disabled={!isConnected || !joinCode.trim() || !user || isAnonymous}
                  className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
                >
                  Join Game
                </button>
              </div>
            )}

            <button
              onClick={() => router.push('/')}
              className="w-full mt-3 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-all"
            >
              Back to Home
            </button>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
