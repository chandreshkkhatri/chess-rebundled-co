'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';

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

export default function HistoryPage() {
  const { user, isAnonymous, isLoading, getIdToken } = useAuth();
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

        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/user/sessions?limit=50`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch sessions');
        }

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
      <>
        <Header />
        <main className="min-h-screen pt-20 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-700 rounded w-1/3"></div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-slate-700 rounded"></div>
              ))}
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
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Practice History</h1>
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
              <p className="text-slate-400 mb-4">No practice sessions yet.</p>
              <Link
                href="/practice"
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
              >
                Start Your First Session
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-white">{session.gameTitle}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                        <span className="capitalize">{session.mode.replace('-', ' ')}</span>
                        {session.playerColor && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{session.playerColor}</span>
                          </>
                        )}
                        {session.completedAt && (
                          <>
                            <span>·</span>
                            <span>{new Date(session.completedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {session.summary && (
                      <div className="text-right">
                        <p className={`text-lg font-bold ${
                          session.summary.accuracy >= 0.8 ? 'text-green-400' :
                          session.summary.accuracy >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {(session.summary.accuracy * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-slate-500">
                          {session.summary.correctMoves}/{session.summary.totalMoves} moves
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
