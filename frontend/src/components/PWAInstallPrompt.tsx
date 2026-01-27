'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
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

    // Auto-show prompt for iOS if not standalone (simplistic check, can be refined to be less intrusive)
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

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  const pathname = usePathname();
  // Don't show in active game (matches /practice/sessionId but not /practice)
  const isGameSession = pathname?.startsWith('/practice/') && pathname !== '/practice';

  if (!showPrompt || isStandalone || isGameSession) return null;

  return (
    <div className="fixed top-0 left-0 right-0 p-4 bg-slate-900 border-b border-slate-700 shadow-2xl z-50 animate-in slide-in-from-top-5">
      <div className="max-w-md mx-auto flex items-center justify-between gap-4">
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
            onClick={handleDismiss}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg font-medium text-sm hover:bg-slate-600"
          >
            Close
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
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
    </div>
  );
}
