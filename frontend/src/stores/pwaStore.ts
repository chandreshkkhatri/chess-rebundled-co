import { create } from 'zustand';

// Storage keys for dismissal persistence
export const SESSION_DISMISSED_KEY = 'pwa-prompt-session-dismissed';
export const PERMANENT_DISMISSED_KEY = 'pwa-prompt-dismissed-until';
// 10 years in days
export const DISMISS_DURATION_DAYS = 3650;
export const TEMPORARY_DISMISS_DURATION_DAYS = 1;

interface PWAStore {
  deferredPrompt: any;
  showPrompt: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  setDeferredPrompt: (prompt: any) => void;
  setShowPrompt: (show: boolean) => void;
  setIsIOS: (isIOS: boolean) => void;
  setIsStandalone: (isStandalone: boolean) => void;
  dismissForSession: () => void;
  dismissPermanently: () => void;
}

export const usePWAStore = create<PWAStore>((set) => ({
  deferredPrompt: null,
  showPrompt: false,
  isIOS: false,
  isStandalone: false,
  setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt }),
  setShowPrompt: (show) => set({ showPrompt: show }),
  setIsIOS: (isIOS) => set({ isIOS }),
  setIsStandalone: (isStandalone) => set({ isStandalone }),
  
  dismissForSession: () => {
    try {
      const expiryTime = Date.now() + (TEMPORARY_DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000);
      localStorage.setItem(SESSION_DISMISSED_KEY, expiryTime.toString());
    } catch {
      // Storage access failed, just hide prompt for current session
      sessionStorage.setItem(SESSION_DISMISSED_KEY, 'true');
    }
    set({ showPrompt: false });
  },
  
  dismissPermanently: () => {
    try {
      const expiryTime = Date.now() + (DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000);
      localStorage.setItem(PERMANENT_DISMISSED_KEY, expiryTime.toString());
    } catch {
      // Storage access failed
    }
    set({ showPrompt: false });
  }
}));

export function shouldShowPrompt(): boolean {
  try {
    // Check 24-hour dismissal
    const sessionDismissedUntil = localStorage.getItem(SESSION_DISMISSED_KEY);
    if (sessionDismissedUntil) {
      const expiry = parseInt(sessionDismissedUntil, 10);
      if (Date.now() < expiry) {
        return false;
      }
      localStorage.removeItem(SESSION_DISMISSED_KEY);
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

    // legacy session storage check
    if (sessionStorage.getItem(SESSION_DISMISSED_KEY)) {
      return false;
    }

    return true;
  } catch {
    // Storage access failed (e.g., private browsing mode)
    // Default to showing the prompt
    return true;
  }
}
