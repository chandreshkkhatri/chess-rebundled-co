'use client';

import { useRouter } from 'next/navigation';

export default function PracticeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">!</div>
        <h2 className="text-xl text-white mb-4">Something went wrong</h2>
        <p className="text-slate-400 mb-6">{error.message || 'An unexpected error occurred'}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all"
          >
            Try again
          </button>
          <button
            onClick={() => router.push('/practice')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
          >
            Back to Practice
          </button>
        </div>
      </div>
    </div>
  );
}
