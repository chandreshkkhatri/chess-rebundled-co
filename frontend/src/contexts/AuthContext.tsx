'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  User,
  subscribeToAuthState,
  signInAsGuest,
  signInWithEmail,
  registerWithEmail,
  signInWithGoogle,
  signInWithGithub,
  upgradeAnonymousWithEmail,
  upgradeAnonymousWithGoogle,
  upgradeAnonymousWithGithub,
  logout,
  getIdToken,
  resetPassword,
} from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAnonymous: boolean;
  isLoggedOut: boolean;
  error: string | null;

  // Auth actions
  signInAsGuest: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;

  // Upgrade anonymous to permanent
  upgradeWithEmail: (email: string, password: string) => Promise<void>;
  upgradeWithGoogle: () => Promise<void>;
  upgradeWithGithub: () => Promise<void>;

  // Password reset
  resetPassword: (email: string) => Promise<void>;

  // Other
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to auth state on mount
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auto sign-in as guest if no user after initial load (unless user explicitly logged out)
  useEffect(() => {
    if (!isLoading && !user && !isLoggedOut) {
      // Automatically sign in anonymously
      signInAsGuest().catch((err) => {
        console.error('Failed to sign in anonymously:', err);
        setError('Failed to initialize session');
      });
    }
  }, [isLoading, user, isLoggedOut]);

  const handleError = useCallback((err: unknown, defaultMessage: string) => {
    const message = err instanceof Error ? err.message : defaultMessage;
    setError(message);
    throw err;
  }, []);

  const handleSignInAsGuest = useCallback(async () => {
    try {
      setError(null);
      await signInAsGuest();
    } catch (err) {
      handleError(err, 'Failed to sign in as guest');
    }
  }, [handleError]);

  const handleSignInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      setIsLoggedOut(false);
      await signInWithEmail(email, password);
    } catch (err) {
      handleError(err, 'Failed to sign in');
    }
  }, [handleError]);

  const handleRegisterWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      await registerWithEmail(email, password);
    } catch (err) {
      handleError(err, 'Failed to register');
    }
  }, [handleError]);

  const handleSignInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      setIsLoggedOut(false);
      await signInWithGoogle();
    } catch (err) {
      handleError(err, 'Failed to sign in with Google');
    }
  }, [handleError]);

  const handleSignInWithGithub = useCallback(async () => {
    try {
      setError(null);
      setIsLoggedOut(false);
      await signInWithGithub();
    } catch (err) {
      handleError(err, 'Failed to sign in with GitHub');
    }
  }, [handleError]);

  const handleUpgradeWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      await upgradeAnonymousWithEmail(email, password);
    } catch (err) {
      handleError(err, 'Failed to upgrade account');
    }
  }, [handleError]);

  const handleUpgradeWithGoogle = useCallback(async () => {
    try {
      setError(null);
      await upgradeAnonymousWithGoogle();
    } catch (err) {
      handleError(err, 'Failed to upgrade with Google');
    }
  }, [handleError]);

  const handleUpgradeWithGithub = useCallback(async () => {
    try {
      setError(null);
      await upgradeAnonymousWithGithub();
    } catch (err) {
      handleError(err, 'Failed to upgrade with GitHub');
    }
  }, [handleError]);

  const handleLogout = useCallback(async () => {
    try {
      setError(null);
      await logout();
      setIsLoggedOut(true); // Stay logged out, don't auto sign-in as guest
    } catch (err) {
      handleError(err, 'Failed to sign out');
    }
  }, [handleError]);

  const handleResetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      await resetPassword(email);
    } catch (err) {
      handleError(err, 'Failed to send password reset email');
    }
  }, [handleError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAnonymous: user?.isAnonymous ?? false,
    isLoggedOut,
    error,

    signInAsGuest: handleSignInAsGuest,
    signInWithEmail: handleSignInWithEmail,
    registerWithEmail: handleRegisterWithEmail,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithGithub: handleSignInWithGithub,

    upgradeWithEmail: handleUpgradeWithEmail,
    upgradeWithGoogle: handleUpgradeWithGoogle,
    upgradeWithGithub: handleUpgradeWithGithub,

    resetPassword: handleResetPassword,

    logout: handleLogout,
    getIdToken,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
