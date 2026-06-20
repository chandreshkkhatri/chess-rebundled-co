'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/PageLayout';

interface SessionSummary {
  id: string;
  gameId: string;
  gameTitle: string;
  mode: 'both-sides' | 'one-side';
  playerColor: 'white' | 'black' | null;
  status: 'completed' | 'abandoned';
  startedAt: string;
  completedAt: string | null;
  summary: {
    totalMoves: number;
    correctMoves: number;
    accuracy: number;
  } | null;
}

/** Returns a human-readable relative time string like "2 days ago" */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Returns tailwind colour classes for the accuracy value */
function accuracyColor(acc: number): { text: string; bar: string } {
  if (acc >= 0.8) return { text: 'text-green-400', bar: 'bg-green-500' };
  if (acc >= 0.5) return { text: 'text-yellow-400', bar: 'bg-yellow-500' };
  return { text: 'text-red-400', bar: 'bg-red-500' };
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, isLoading, getIdToken } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      if (isLoading || !user) return;

      try {
        const token = await getIdToken();
        if (!token) {
          setError('Not authenticated');
          setLoadingSessions(false);
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
        const response = await fetch(`${apiUrl}/api/user/sessions?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Failed to fetch sessions');

        const data = await response.json();
        setSessions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      } finally {
        setLoadingSessions(false);
      }
    }

    fetchSessions();
  }, [user, isLoading, getIdToken]);

  if (isLoading || loadingSessions) {
    return (
      <PageLayout>
        <div className="px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-700 rounded w-1/3"></div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-slate-700 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    router.replace('/login?redirect=%2Fhistory');
    return null;
  }

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const avgAccuracy =
    sessions.length > 0
      ? sessions
          .filter((s) => s.summary)
          .reduce((sum, s) => sum + (s.summary?.accuracy ?? 0), 0) /
        (sessions.filter((s) => s.summary).length || 1)
      : null;

  return (
    <PageLayout>
      <div className="px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Practice History</h1>
              {sessions.length > 0 && (
                <p className="text-slate-400 text-sm mt-0.5">
                  {completedCount} completed · {sessions.length - completedCount} abandoned
                  {avgAccuracy !== null && (
                    <span className={`ml-2 font-semibold ${accuracyColor(avgAccuracy).text}`}>
                      · {(avgAccuracy * 100).toFixed(0)}% avg accuracy
                    </span>
                  )}
                </p>
              )}
            </div>
            <Link
              href="/practice"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              New Session
            </Link>
          </div>

          {error ? (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-400">{error}</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center">
              <div className="text-5xl mb-4">♟️</div>
              <p className="text-slate-300 font-semibold mb-1">No sessions yet</p>
              <p className="text-slate-400 text-sm mb-4">
                Replay famous grandmaster games to build your notation skills.
              </p>
              <Link
                href="/practice"
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
              >
                Start Your First Session
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const colors = session.summary
                  ? accuracyColor(session.summary.accuracy)
                  : { text: 'text-slate-400', bar: 'bg-slate-600' };
                const accPct = session.summary
                  ? Math.round(session.summary.accuracy * 100)
                  : null;

                return (
                  <div
                    key={session.id}
                    className="bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors overflow-hidden"
                  >
                    {/* Top strip */}
                    <div className="flex items-start justify-between px-4 pt-4 pb-2 gap-3">
                      {/* Left: title + meta */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate text-sm leading-tight">
                          {session.gameTitle}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                          {/* Mode badge */}
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                            {session.mode === 'both-sides' ? '⇄ Both Sides' : '→ One Side'}
                          </span>

                          {/* Color badge */}
                          {session.playerColor && (
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                session.playerColor === 'white'
                                  ? 'bg-slate-200 text-slate-800'
                                  : 'bg-slate-900 text-slate-300 border border-slate-600'
                              }`}
                            >
                              {session.playerColor === 'white' ? '♔' : '♚'}{' '}
                              {session.playerColor}
                            </span>
                          )}

                          {/* Abandoned badge */}
                          {session.status === 'abandoned' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-900/40 text-amber-400 border border-amber-700/40 px-2 py-0.5 rounded-full">
                              Abandoned
                            </span>
                          )}

                          {/* Relative time */}
                          <span className="text-[10px] text-slate-500">
                            {session.completedAt
                              ? relativeTime(session.completedAt)
                              : session.startedAt
                              ? relativeTime(session.startedAt)
                              : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Right: accuracy number */}
                      {accPct !== null && (
                        <div className="flex-shrink-0 text-right">
                          <p className={`text-2xl font-black ${colors.text}`}>{accPct}%</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {session.summary!.correctMoves}/{session.summary!.totalMoves} moves
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Accuracy bar */}
                    {accPct !== null && (
                      <div className="h-1.5 bg-slate-700 mx-4 mb-3 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} rounded-full transition-all`}
                          style={{ width: `${accPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
