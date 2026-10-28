'use client';

import { useEffect } from 'react';
import { useAppUpdateStore, watchForUpdates } from '@/lib/appUpdate';

// Offers a reload once a newer build is deployed. It never reloads on its own:
// that would interrupt a game or a move being spoken.
export function AppUpdateBanner() {
  const updateReady = useAppUpdateStore((state) => state.updateReady);
  const dismissed = useAppUpdateStore((state) => state.dismissed);

  useEffect(() => watchForUpdates(), []);

  if (!updateReady || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-purple-500/40 bg-slate-800 px-4 py-3 shadow-lg">
        <p className="flex-1 text-sm text-slate-200">A new version of the app is available.</p>
        <button
          onClick={() => useAppUpdateStore.setState({ dismissed: true })}
          className="shrink-0 px-2 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Later
        </button>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
