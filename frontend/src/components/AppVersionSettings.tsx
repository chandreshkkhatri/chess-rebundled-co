'use client';

import { APP_VERSION, checkForUpdate, useAppUpdateStore, type UpdateCheck } from '@/lib/appUpdate';

const APP_BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || '';

const CHECK_MESSAGES: Partial<Record<UpdateCheck, { text: string; className: string }>> = {
  checking: { text: 'Checking for updates…', className: 'text-slate-400' },
  current: { text: 'You have the latest version.', className: 'text-green-400' },
  failed: { text: 'Could not check for updates. Check your connection and try again.', className: 'text-red-400' },
};

function formatBuildTime(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Settings section: which build is running, and a manual update check. */
export function AppVersionSettings() {
  const updateReady = useAppUpdateStore((state) => state.updateReady);
  const check = useAppUpdateStore((state) => state.check);
  const builtAt = formatBuildTime(APP_BUILD_TIME);
  const message = updateReady ? null : CHECK_MESSAGES[check];

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-2">App Version</h2>
      <p className="text-slate-400 text-sm mb-4">
        Version <span className="font-mono text-slate-200">{APP_VERSION}</span>
        {builtAt && <>, built {builtAt}</>}
      </p>
      {updateReady ? (
        <div className="space-y-3">
          <p className="text-sm text-purple-300">A new version is ready.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
          >
            Reload to Update
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => void checkForUpdate()}
            disabled={check === 'checking'}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            Check for Updates
          </button>
          {message && <p className={`text-sm ${message.className}`}>{message.text}</p>}
        </div>
      )}
    </div>
  );
}
