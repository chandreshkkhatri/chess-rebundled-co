'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { UserMenu } from './auth/UserMenu';
import { usePWAStore } from '@/stores/pwaStore';

export function Header() {
  const { deferredPrompt, isStandalone, isIOS, setShowPrompt } = usePWAStore();
  const [showBookmarkInstructions, setShowBookmarkInstructions] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    // Basic mobile detection for bookmark instructions
    const checkMobile = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod|android|blackberry|windows phone/g.test(userAgent);
    };
    setIsMobileDevice(checkMobile());
  }, []);

  const handleInstallClick = () => {
    if (isIOS) {
      setShowPrompt(true); // Show our prompt which has the iOS instructions
    } else if (deferredPrompt) {
      setShowPrompt(true); // Show our prompt to trigger install
    } else {
      // Fallback if no prompt is available (e.g. desktop non-installed)
      setShowPrompt(true);
    }
  };

  const handleBookmarkClick = () => {
    setShowBookmarkInstructions(true);
    setTimeout(() => setShowBookmarkInstructions(false), 5000); // Hide after 5 seconds
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Chess Rebundled - Home">
            <span className="text-xl font-bold text-white">Chess Rebundled</span>
          </Link>
          <div className="flex items-center gap-3">
            {!isStandalone && (
              <button
                onClick={handleInstallClick}
                className="text-slate-400 hover:text-white transition-colors"
                title="Install App"
                aria-label="Install App"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
            )}
            <button
              onClick={handleBookmarkClick}
              className="text-slate-400 hover:text-white transition-colors"
              title="Bookmark Page"
              aria-label="Bookmark Page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>
            </button>
            <div className="w-px h-6 bg-slate-700"></div>
            <UserMenu />
          </div>
        </div>
      </header>
      
      {/* Bookmark Instructions Toast */}
      {showBookmarkInstructions && (
        <div className="fixed top-20 right-4 p-4 bg-slate-800 border border-slate-700 shadow-xl rounded-lg z-50 animate-in fade-in slide-in-from-top-5 max-w-sm flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500 mt-0.5 shrink-0"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>
          <div>
            <h4 className="text-white font-medium mb-1">Bookmark this page</h4>
            <p className="text-sm text-slate-300">
              {isMobileDevice 
                ? "Tap the browser menu (⋮ or ⋯) and select 'Add to Bookmarks'." 
                : "Press " + (window.navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? "Cmd" : "Ctrl") + " + D to bookmark this page."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
