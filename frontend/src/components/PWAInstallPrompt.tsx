'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePWAStore, shouldShowPrompt } from '@/stores/pwaStore';

export function PWAInstallPrompt() {
  const {
    deferredPrompt,
    showPrompt,
    isIOS,
    isStandalone,
    setDeferredPrompt,
    setShowPrompt,
    setIsIOS,
    setIsStandalone,
    dismissForSession,
    dismissPermanently
  } = usePWAStore();

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
  }, [setIsStandalone, setIsIOS, setShowPrompt, setDeferredPrompt]);

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

  const pathname = usePathname();
  // Don't show in active game (matches /practice/sessionId but not /practice)
  const isGameSession = pathname?.startsWith('/practice/') && pathname !== '/practice';

  if (!showPrompt || isStandalone || isGameSession) return null;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 sm:left-auto left-4 p-4 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl z-50 animate-in slide-in-from-bottom-5 max-w-sm w-auto shadow-purple-900/20">
      <div className="flex flex-col">
        <div className="mb-3">
          <h3 className="text-white font-bold mb-1 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Install App
          </h3>
          <p className="text-slate-300 text-sm">
            {isIOS
              ? "Tap the Share button and select 'Add to Home Screen' for the best experience."
              : "Install Chess Rebundled for full-screen voice practice."}
          </p>
        </div>

        <div className="flex items-center justify-between mt-2">
          {isIOS ? (
            <button
              onClick={dismissForSession}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium text-sm hover:bg-slate-700 w-full"
            >
              Got it
            </button>
          ) : (
            <>
              <div className="flex gap-2 w-full justify-between">
                <div>
                  <button
                    onClick={dismissPermanently}
                    className="px-2 py-2 text-xs text-slate-500 hover:text-slate-400"
                  >
                    Don&apos;t show
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={dismissForSession}
                    className="px-3 py-2 text-slate-400 hover:text-white text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Later
                  </button>
                  <button
                    onClick={handleInstallClick}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-purple-900/20 transition-all"
                  >
                    Install
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
