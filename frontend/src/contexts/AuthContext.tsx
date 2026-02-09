'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  User,
  subscribeToAuthState,
  signInWithEmail,
  registerWithEmail,
  signInWithGoogle,
  signInWithGithub,
  linkAccountWithGoogle,
  linkAccountWithGithub,
  logout,
  getIdToken,
  resetPassword,
} from '@/lib/firebase';
import { trackEvent } from '@/lib/analytics';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Auth actions
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;

  // Link additional providers to existing account
  linkWithGoogle: () => Promise<void>;
  linkWithGithub: () => Promise<void>;

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
  const [error, setError] = useState<string | null>(null);

  // Subscribe to auth state on mount
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleError = useCallback((err: unknown, defaultMessage: string) => {
    const message = err instanceof Error ? err.message : defaultMessage;
    setError(message);
    throw err;
  }, []);

  const handleSignInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmail(email, password);
    } catch (err) {
      handleError(err, 'Failed to sign in');
    }
  }, [handleError]);

  const handleRegisterWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      await registerWithEmail(email, password);
      trackEvent('sign_up', { method: 'email' });
    } catch (err) {
      handleError(err, 'Failed to register');
    }
  }, [handleError]);

  const handleSignInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (err) {
      handleError(err, 'Failed to sign in with Google');
    }
  }, [handleError]);

  const handleSignInWithGithub = useCallback(async () => {
    try {
      setError(null);
      await signInWithGithub();
    } catch (err) {
      handleError(err, 'Failed to sign in with GitHub');
    }
  }, [handleError]);

  const handleLinkWithGoogle = useCallback(async () => {
    try {
      setError(null);
      await linkAccountWithGoogle();
    } catch (err) {
      handleError(err, 'Failed to link Google account');
    }
  }, [handleError]);

  const handleLinkWithGithub = useCallback(async () => {
    try {
      setError(null);
      await linkAccountWithGithub();
    } catch (err) {
      handleError(err, 'Failed to link GitHub account');
    }
  }, [handleError]);

  const handleLogout = useCallback(async () => {
    try {
      setError(null);
      await logout();
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
    error,

    signInWithEmail: handleSignInWithEmail,
    registerWithEmail: handleRegisterWithEmail,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithGithub: handleSignInWithGithub,

    linkWithGoogle: handleLinkWithGoogle,
    linkWithGithub: handleLinkWithGithub,

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
