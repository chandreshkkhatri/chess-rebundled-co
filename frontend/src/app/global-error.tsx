'use client';

import { useEffect, useState } from 'react';
import { isChunkLoadError, reloadForMissingCode } from '@/lib/appUpdate';
import './globals.css';

// Last-resort error screen. After a deploy, an app still running the previous
// build can fail to load a screen whose code file no longer exists; reloading
// once fetches the current build instead of showing an error.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(() => isChunkLoadError(error));

  useEffect(() => {
    if (isChunkLoadError(error) && reloadForMissingCode()) return;
    setReloading(false);
    console.error('[App] Unhandled error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        {reloading ? (
          <p className="text-slate-400">Updating…</p>
        ) : (
          <div className="text-center max-w-md">
            <p className="text-white text-lg font-medium mb-2">Something went wrong</p>
            <p className="text-slate-400 text-sm mb-6">Reloading usually fixes this.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => reset()}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Reload
              </button>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
