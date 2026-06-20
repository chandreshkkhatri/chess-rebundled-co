'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMultiplayerSocket } from '@/hooks/useMultiplayerSocket';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/PageLayout';
import type { TimeControl } from '@/types/multiplayer';

const TIME_CONTROLS: { label: string; description: string; value: TimeControl | null | 'any' }[] = [
  { label: 'Any', description: 'Match anything', value: 'any' },
  { label: 'No Clock', description: 'Untimed game', value: null },
  { label: '15+10', description: 'Rapid', value: { initialTimeMs: 900_000, incrementMs: 10_000 } },
  { label: '10 min', description: 'Rapid', value: { initialTimeMs: 600_000, incrementMs: 0 } },
  { label: '5+5', description: 'Blitz', value: { initialTimeMs: 300_000, incrementMs: 5_000 } },
  { label: '5 min', description: 'Blitz', value: { initialTimeMs: 300_000, incrementMs: 0 } },
  { label: '3+2', description: 'Blitz', value: { initialTimeMs: 180_000, incrementMs: 2_000 } },
];

function tcKey(tc: TimeControl | null | 'any'): string {
  if (tc === 'any') return 'any';
  if (!tc) return 'no-clock';
  return `${tc.initialTimeMs}-${tc.incrementMs}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTCLabel(key: string): string {
  if (key === 'any') return 'Any';
  if (key === 'no-clock') return 'No Clock';
  const [initialStr, incrementStr] = key.split('-');
  const mins = parseInt(initialStr, 10) / 60000;
  const inc = parseInt(incrementStr, 10) / 1000;
  if (inc > 0) return `${mins}+${inc}`;
  return `${mins} min`;
}

type LobbyTab = 'find' | 'invite' | 'join' | 'bot';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type PlayerColorPreference = 'white' | 'black' | 'random';

const BOT_DIFFICULTIES: {
  id: BotDifficulty;
  label: string;
  icon: string;
  description: string;
  skillLabel: string;
  color: string;
}[] = [
  { id: 'easy',   label: 'Easy',   icon: '🐣', description: 'Great for beginners',       skillLabel: 'Stockfish Lvl 0',  color: 'border-green-600  bg-green-900/20  text-green-300'  },
  { id: 'medium', label: 'Medium', icon: '⚔️', description: 'A solid challenge',          skillLabel: 'Stockfish Lvl 10', color: 'border-yellow-600 bg-yellow-900/20 text-yellow-300' },
  { id: 'hard',   label: 'Hard',   icon: '🔥', description: 'For experienced players',   skillLabel: 'Stockfish Lvl 15', color: 'border-orange-600 bg-orange-900/20 text-orange-300' },
  { id: 'expert', label: 'Expert', icon: '💀', description: 'Brutal — near-perfect play', skillLabel: 'Stockfish Lvl 20', color: 'border-red-600    bg-red-900/20    text-red-300'    },
];

export default function PlayLobbyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<LobbyTab>('find');
  const [selectedTC, setSelectedTC] = useState<TimeControl | null | 'any'>('any');
  const [joinCode, setJoinCode] = useState('');
  
  // Bot settings
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('easy');
  const [botColor, setBotColor] = useState<PlayerColorPreference>('random');
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);

  const { user } = useAuth();
  const { findGame, cancelFind, createInvite, joinInvite } = useMultiplayerSocket();
  usePracticeSocket();

  const {
    isConnected,
    isSearching,
    inviteCode,
    gameId,
    status,
    error,
    onlineCount,
    waitingPlayers,
    searchStartedAt,
    searchTimedOut,
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

  // Elapsed timer for searching state
  useEffect(() => {
    if (isSearching && searchStartedAt) {
      setElapsedMs(Date.now() - searchStartedAt);
      elapsedRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (useMultiplayerStore.getState().searchStartedAt || Date.now()));
      }, 1000);
    } else {
      setElapsedMs(0);
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    }
    return () => {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    };
  }, [isSearching, searchStartedAt]);

  const requireAuth = () => {
    if (!user) {
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
    const tc = selectedTC === 'any' ? null : selectedTC;
    createInvite(tc);
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

  const handleStartBotGame = () => {
    // Determine actual color if random
    const finalColor = botColor === 'random' 
      ? (Math.random() < 0.5 ? 'white' : 'black') 
      : botColor;
    
    // Redirect to the dedicated bot play route
    router.push(`/bot?difficulty=${botDifficulty}&color=${finalColor}`);
  };

  // Build a map of queue sizes from waitingPlayers
  const queueCounts: Record<string, number> = {};
  for (const wp of waitingPlayers) {
    queueCounts[wp.timeControl] = (queueCounts[wp.timeControl] || 0) + 1;
  }

  // Searching state — lobby view
  if (isSearching) {
    const otherWaiting = waitingPlayers.filter(wp => wp.uid !== user?.uid);
    return (
      <PageLayout>
        <main className="flex items-center justify-center p-4 py-16">
          <div className="max-w-md w-full">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="animate-spin h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <h2 className="text-2xl font-bold text-white mb-1">Looking for an opponent</h2>
              <p className="text-slate-400 text-sm">
                {selectedTC === 'any'
                  ? 'Any time control'
                  : selectedTC
                    ? `${selectedTC.initialTimeMs / 60000} min${selectedTC.incrementMs ? ` + ${selectedTC.incrementMs / 1000}s` : ''}`
                    : 'No clock'}
                {' \u00b7 '}
                {formatElapsed(elapsedMs)}
              </p>
            </div>

            {/* Lobby info card */}
            <div className="bg-slate-800 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-400">Players online</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-200">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                  {onlineCount}
                </span>
              </div>

              {otherWaiting.length > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Also waiting</p>
                  <div className="space-y-2">
                    {otherWaiting.map((wp) => (
                      <div key={wp.uid} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
                        <span className="text-sm text-slate-200">{wp.displayName}</span>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{formatTCLabel(wp.timeControl)}</span>
                          <span className="text-slate-500">{formatElapsed(Date.now() - wp.waitingSince)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-2">No other players waiting</p>
              )}
            </div>

            {/* Timeout fallback */}
            {searchTimedOut && (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-4">
                <p className="text-sm text-amber-300 mb-2">No opponents found yet</p>
                <p className="text-xs text-slate-400 mb-3">
                  {onlineCount <= 1
                    ? "You're the only one online right now."
                    : `${onlineCount} player${onlineCount !== 1 ? 's' : ''} online, but none matching your time control.`}
                </p>
                <button
                  onClick={() => {
                    handleCancel();
                    setTab('invite');
                  }}
                  className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all"
                >
                  Create Invite Link Instead
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">Still searching in the background...</p>
              </div>
            )}

            <button
              onClick={handleCancel}
              className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
            >
              Cancel
            </button>
          </div>
        </main>
      </PageLayout>
    );
  }

  // Invite created — waiting
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
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-2">Play Online</h1>
            <p className="text-slate-400">Challenge another player using chess notation</p>
          </div>

          {/* Online count */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse"></span>
            <span className="text-sm text-slate-300">
              {onlineCount <= 1
                ? "You're the only one here \u2014 invite a friend!"
                : `${onlineCount} player${onlineCount !== 1 ? 's' : ''} online`}
            </span>
          </div>

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
            <div className="flex mb-6 bg-slate-700 rounded-lg p-1 overflow-x-auto">
              {(['find', 'invite', 'join', 'bot'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    tab === t
                      ? 'bg-purple-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'find' ? 'Find Game' : t === 'invite' ? 'Create Invite' : t === 'join' ? 'Join Invite' : 'Play Bot'}
                </button>
              ))}
            </div>

            {/* Time Control Selection (for find/invite tabs) */}
            {(tab === 'find' || tab === 'invite') && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Time Control</h3>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_CONTROLS.map((tc) => {
                    const key = tcKey(tc.value);
                    const isSelected = key === tcKey(selectedTC);
                    const queueCount = queueCounts[key] || 0;
                    // Only show "Any" in find tab
                    if (tc.value === 'any' && tab !== 'find') return null;
                    return (
                      <button
                        key={tc.label}
                        onClick={() => setSelectedTC(tc.value)}
                        className={`relative p-3 rounded-lg border-2 text-center transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-900/30'
                            : 'border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        <div className="font-semibold text-slate-100 text-sm">{tc.label}</div>
                        <div className="text-xs text-slate-400">{tc.description}</div>
                        {queueCount > 0 && tab === 'find' && (
                          <span className="absolute -top-1.5 -right-1.5 bg-purple-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                            {queueCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bot Configuration Options */}
            {tab === 'bot' && (
              <div className="mb-6 space-y-6">
                {/* Difficulty picker */}
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-3">Difficulty</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {BOT_DIFFICULTIES.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setBotDifficulty(d.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          botDifficulty === d.id
                            ? d.color
                            : 'border-slate-600 hover:border-slate-500 bg-transparent text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg leading-none">{d.icon}</span>
                          <span className="font-bold text-sm">{d.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">{d.description}</p>
                        <p className="text-[9px] font-mono text-slate-600 mt-1">{d.skillLabel}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color picker */}
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-3">Your Color</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(['white', 'random', 'black'] as const).map((color) => (
                      <button
                        key={color}
                        onClick={() => setBotColor(color)}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                          botColor === color
                            ? 'border-purple-500 bg-purple-900/30 text-purple-200'
                            : 'border-slate-600 hover:border-slate-500 text-slate-300'
                        }`}
                      >
                        <span className="text-2xl leading-none">
                          {color === 'white' ? '♔' : color === 'black' ? '♚' : '🎲'}
                        </span>
                        <span className="font-semibold text-xs capitalize">{color}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Waiting players preview (find tab only) */}
            {tab === 'find' && waitingPlayers.length > 0 && (
              <div className="mb-4 bg-slate-700/30 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Players waiting</p>
                <div className="space-y-1.5">
                  {waitingPlayers.slice(0, 5).map((wp) => (
                    <div key={wp.uid} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{wp.displayName}</span>
                      <span className="text-xs text-slate-500">{formatTCLabel(wp.timeControl)}</span>
                    </div>
                  ))}
                  {waitingPlayers.length > 5 && (
                    <p className="text-xs text-slate-500">+{waitingPlayers.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Action based on tab */}
            {tab === 'find' && (
              <button
                onClick={handleFindGame}
                disabled={!isConnected || !user}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
              >
                Find Opponent
              </button>
            )}

            {tab === 'invite' && (
              <button
                onClick={handleCreateInvite}
                disabled={!isConnected || !user}
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
                  disabled={!isConnected || !joinCode.trim() || !user}
                  className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
                >
                  Join Game
                </button>
              </div>
            )}

            {tab === 'bot' && (
              <button
                onClick={handleStartBotGame}
                className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400"
              >
                Start Bot Game
              </button>
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
