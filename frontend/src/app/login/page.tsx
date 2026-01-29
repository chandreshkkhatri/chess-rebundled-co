'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForm } from '@/components/auth/AuthForm';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAnonymous, isLoading } = useAuth();

  const redirectTo = searchParams.get('redirect') || '/';

  // Redirect if already authenticated (non-anonymous)
  useEffect(() => {
    if (!isLoading && user && !isAnonymous) {
      router.replace(decodeURIComponent(redirectTo));
    }
  }, [user, isAnonymous, isLoading, router, redirectTo]);

  const handleSuccess = () => {
    router.replace(decodeURIComponent(redirectTo));
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
      </main>
    );
  }

  // Already logged in - show redirect message
  if (user && !isAnonymous) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-slate-400">Redirecting...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>
        </div>

        {/* Auth card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <AuthForm onSuccess={handleSuccess} variant="page" showHeader />
        </div>

        {/* Guest option */}
        {!user && (
          <p className="mt-6 text-center text-slate-400 text-sm">
            Just want to try it out?{' '}
            <Link href="/practice" className="text-purple-400 hover:text-purple-300">
              Continue as guest
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
