'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/PageLayout';
import { PracticeReplay, ReplayGame } from '@/components/PracticeReplay';
import { PracticeMoveResult } from '@/types';

interface SessionDetail {
  id: string;
  gameTitle: string;
  playerColor: 'white' | 'black' | null;
  moves: PracticeMoveResult[];
  game: ReplayGame | null;
}

export default function SessionReplayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { user, isLoading, getIdToken } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user) return;
    let cancelled = false;

    async function fetchSession() {
      try {
        const token = await getIdToken();
        if (!token) throw new Error('Not authenticated');
        const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
        const response = await fetch(`${apiUrl}/api/user/sessions/${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 404) throw new Error('Session not found');
        if (!response.ok) throw new Error('Failed to load session');
        const data: SessionDetail = await response.json();
        if (!cancelled) setSession(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load session');
      }
    }

    fetchSession();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, getIdToken, sessionId]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/history/${sessionId}`)}`);
    }
  }, [isLoading, user, router, sessionId]);

  if (session?.game) {
    return (
      <PracticeReplay
        game={session.game}
        moveResults={session.moves ?? []}
        initialOrientation={session.playerColor ?? 'white'}
        onBack={() => router.push('/history')}
        backLabel="Back to history"
      />
    );
  }

  const message = error
    ?? (session && !session.game ? 'This game is no longer available for replay.' : null);

  return (
    <PageLayout>
      <div className="px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {message ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
              <p className="text-slate-300 mb-4">{message}</p>
              <Link
                href="/history"
                className="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Back to History
              </Link>
            </div>
          ) : (
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-700 rounded-sm w-1/3"></div>
              <div className="aspect-square max-w-md bg-slate-700 rounded-xl"></div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
