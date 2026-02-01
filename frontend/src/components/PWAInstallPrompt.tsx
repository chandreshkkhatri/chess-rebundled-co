'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Storage keys for dismissal persistence
const SESSION_DISMISSED_KEY = 'pwa-prompt-session-dismissed';
const PERMANENT_DISMISSED_KEY = 'pwa-prompt-dismissed-until';
const DISMISS_DURATION_DAYS = 30;

function shouldShowPrompt(): boolean {
  try {
    // Check session dismissal (clears on browser close)
    if (sessionStorage.getItem(SESSION_DISMISSED_KEY)) {
      return false;
    }

    // Check permanent dismissal with expiry
    const dismissedUntil = localStorage.getItem(PERMANENT_DISMISSED_KEY);
    if (dismissedUntil) {
      const expiry = parseInt(dismissedUntil, 10);
      if (Date.now() < expiry) {
        return false;
      }
      // Expired, clean up
      localStorage.removeItem(PERMANENT_DISMISSED_KEY);
    }

    return true;
  } catch {
    // Storage access failed (e.g., private browsing mode)
    // Default to showing the prompt
    return true;
  }
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check dismissal state first
    if (!shouldShowPrompt()) return;

    // Check if running in standalone mode (already installed)
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://');

    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Auto-show prompt for iOS if not standalone
    if (isIosDevice) {
      setShowPrompt(true);
    }

    // Capture the PWA install event (Android/Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const dismissForSession = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISSED_KEY, 'true');
    } catch {
      // Storage access failed, just hide prompt for current session
    }
    setShowPrompt(false);
  };

  const dismissPermanently = () => {
    try {
      const expiryTime = Date.now() + (DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000);
      localStorage.setItem(PERMANENT_DISMISSED_KEY, expiryTime.toString());
    } catch {
      // Storage access failed, just hide prompt for current session
    }
    setShowPrompt(false);
  };

  const pathname = usePathname();
  // Don't show in active game (matches /practice/sessionId but not /practice)
  const isGameSession = pathname?.startsWith('/practice/') && pathname !== '/practice';

  if (!showPrompt || isStandalone || isGameSession) return null;

  return (
    <div className="fixed top-0 left-0 right-0 p-4 bg-slate-900 border-b border-slate-700 shadow-2xl z-50 animate-in slide-in-from-top-5">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-white font-bold mb-1">Install App</h3>
            <p className="text-slate-300 text-sm">
              {isIOS
                ? "Tap the Share button and select 'Add to Home Screen' for the best experience."
                : "Install Chess Rebundled for full-screen voice practice."}
            </p>
          </div>

          {isIOS ? (
            <button
              onClick={dismissForSession}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg font-medium text-sm hover:bg-slate-600"
            >
              Got it
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={dismissForSession}
                className="px-3 py-2 text-slate-400 hover:text-white text-sm"
              >
                Later
              </button>
              <button
                onClick={handleInstallClick}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-900/20"
              >
                Install
              </button>
            </div>
          )}
        </div>

        {/* Don't show again link */}
        <button
          onClick={dismissPermanently}
          className="mt-2 text-xs text-slate-500 hover:text-slate-400 underline"
        >
          Don&apos;t show again
        </button>
      </div>
    </div>
  );
}
