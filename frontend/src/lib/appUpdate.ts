import { create } from 'zustand';

// An open page keeps running the build it loaded; an installed app resumed
// from the background can stay on an old build for days. This module compares
// the running build with the deployed one (/version.json), offers a reload when
// they differ, and recovers pages whose code files a deploy removed.
//
// The PWA service worker is not involved: next-pwa 5 injects its registration
// into the Pages Router entry, which App Router pages never load, so no worker
// is registered and a full page load always fetches the current build.

export type UpdateCheck = 'idle' | 'checking' | 'current' | 'found' | 'failed';

interface AppUpdateState {
  updateReady: boolean; // a newer build is deployed; reloading runs it
  dismissed: boolean; // the player chose "Later" for this update
  check: UpdateCheck; // result of the last check started from Settings
}

export const useAppUpdateStore = create<AppUpdateState>(() => ({
  updateReady: false,
  dismissed: false,
  check: 'idle',
}));

// Embedded at build time (see next.config.mjs); /version.json reports the same
// values for the build the server is running.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
export const APP_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || '';

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
// Coming back to the foreground checks at most this often.
const FOREGROUND_CHECK_GAP_MS = 60 * 1000;
// A second missing-file failure this soon after a reload shows the error instead.
const CHUNK_RELOAD_GUARD_MS = 30 * 1000;
const CHUNK_RELOAD_KEY = 'app-update-chunk-reload-at';

/** True for errors raised when a code file of an older build no longer exists. */
export function isChunkLoadError(reason: unknown): boolean {
  if (!reason) return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  const text = String(typeof message === 'string' ? message : reason);
  return name === 'ChunkLoadError' ||
    /Loading (CSS )?chunk [\w./-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(text);
}

/** Reloads to fetch the current build, unless that was just tried. Returns whether it reloaded. */
export function reloadForMissingCode(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < CHUNK_RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage there is no loop guard; a single reload is still the best recovery.
  }
  window.location.reload();
  return true;
}

/** Asks the server which build it is running and marks an update when it differs. */
export async function checkForUpdate({ quiet = false } = {}): Promise<UpdateCheck> {
  const finish = (check: UpdateCheck) => {
    if (!quiet) useAppUpdateStore.setState({ check });
    return check;
  };
  if (useAppUpdateStore.getState().updateReady) return finish('found');
  // Development servers have no fixed build to compare against.
  if (!APP_BUILD_ID) return finish('current');
  if (!quiet) useAppUpdateStore.setState({ check: 'checking' });
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return finish('failed');
    const deployed = (await response.json()) as { buildId?: unknown };
    if (typeof deployed.buildId !== 'string' || !deployed.buildId) return finish('failed');
    if (deployed.buildId === APP_BUILD_ID) return finish('current');
    useAppUpdateStore.setState({ updateReady: true, dismissed: false });
    return finish('found');
  } catch {
    return finish('failed');
  }
}

/** Starts periodic and foreground update checks and missing-code recovery. Returns a cleanup. */
export function watchForUpdates(): () => void {
  const onMissingCode = (reason: unknown) => {
    if (isChunkLoadError(reason)) reloadForMissingCode();
  };
  const onError = (event: ErrorEvent) => onMissingCode(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => onMissingCode(event.reason);

  let lastCheck = Date.now();
  const backgroundCheck = () => {
    lastCheck = Date.now();
    void checkForUpdate({ quiet: true });
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck >= FOREGROUND_CHECK_GAP_MS) {
      backgroundCheck();
    }
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const timer = setInterval(backgroundCheck, UPDATE_CHECK_INTERVAL_MS);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    clearInterval(timer);
  };
}
