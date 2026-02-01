'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { OAuthButtons } from './OAuthButtons';

interface AuthFormProps {
  onSuccess?: () => void;
  variant?: 'page' | 'modal';
  showHeader?: boolean;
  initialView?: 'login' | 'register';
}

type ViewType = 'login' | 'register' | 'forgot-password';

// Map Firebase error codes to user-friendly messages
const friendlyErrors: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password',
  'auth/user-not-found': 'No account found with this email',
  'auth/wrong-password': 'Incorrect password',
  'auth/email-already-in-use': 'An account with this email already exists',
  'auth/credential-already-in-use': 'This account is already linked to another user. Please sign out and sign in directly with this account.',
  'auth/account-exists-with-different-credential': 'An account already exists with the same email but different sign-in method. Try signing in with a different provider.',
  'auth/weak-password': 'Password must be at least 6 characters',
  'auth/popup-closed-by-user': 'Sign-in was cancelled',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/invalid-email': 'Please enter a valid email address',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
};

function getFriendlyError(error: string): string {
  for (const [code, message] of Object.entries(friendlyErrors)) {
    if (error.includes(code)) {
      return message;
    }
  }
  return error;
}

export function AuthForm({
  onSuccess,
  variant = 'page',
  showHeader = true,
  initialView = 'login',
}: AuthFormProps) {
  const [view, setView] = useState<ViewType>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const {
    isAnonymous,
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    signInWithGithub,
    upgradeWithEmail,
    upgradeWithGoogle,
    upgradeWithGithub,
    resetPassword,
    error: authError,
    clearError,
  } = useAuth();

  const error = localError || (authError ? getFriendlyError(authError) : null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setLocalError(null);
    setResetEmailSent(false);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (view === 'forgot-password') {
      if (!trimmedEmail) {
        setLocalError('Please enter your email address');
        return;
      }
      setIsSubmitting(true);
      try {
        await resetPassword(trimmedEmail);
        setResetEmailSent(true);
      } catch {
        // Error handled by AuthContext
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (view === 'register' && trimmedPassword !== confirmPassword.trim()) {
      setLocalError('Passwords do not match');
      return;
    }

    if (trimmedPassword.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      if (view === 'login') {
        await signInWithEmail(trimmedEmail, trimmedPassword);
      } else {
        if (isAnonymous) {
          await upgradeWithEmail(trimmedEmail, trimmedPassword);
        } else {
          await registerWithEmail(trimmedEmail, trimmedPassword);
        }
      }
      resetForm();
      onSuccess?.();
    } catch {
      // Error is handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthSignIn = async (
    signIn: () => Promise<void>,
    upgrade: () => Promise<void>
  ) => {
    setIsSubmitting(true);
    try {
      // For login view, always sign in (replaces anonymous account)
      // For register view with anonymous user, upgrade (links to existing anonymous account)
      if (view === 'register' && isAnonymous) {
        await upgrade();
      } else {
        await signIn();
      }
      resetForm();
      onSuccess?.();
    } catch {
      // Error is handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    setLocalError(null);
    clearError();
    setResetEmailSent(false);
    setView('forgot-password');
  };

  const handleBackToLogin = () => {
    setLocalError(null);
    clearError();
    setResetEmailSent(false);
    setView('login');
  };

  return (
    <>
      {/* Header (optional) */}
      {showHeader && (
        <div className="relative px-6 py-5 bg-gradient-to-r from-purple-600 to-indigo-600">
          <h2 className="text-xl font-bold text-white">
            {view === 'forgot-password'
              ? 'Reset Password'
              : isAnonymous
                ? 'Save Your Progress'
                : 'Welcome Back'}
          </h2>
          {view !== 'forgot-password' && (
            <p className="text-purple-200 text-sm mt-1">
              {isAnonymous
                ? 'Create an account to save your practice history'
                : 'Sign in to continue your practice'}
            </p>
          )}
        </div>
      )}

      {/* Forgot Password View */}
      {view === 'forgot-password' ? (
        <div className="p-6">
          {resetEmailSent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Check your email</h3>
              <p className="text-slate-400 text-sm mb-6">
                We sent a password reset link to <span className="font-medium">{email}</span>
              </p>
              <button
                onClick={handleBackToLogin}
                className="text-purple-600 hover:text-purple-700 font-medium text-sm"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <p className="text-slate-400 text-sm mb-4">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-slate-300 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </span>
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none disabled:bg-slate-600 placeholder-slate-400"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </span>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="w-full text-slate-400 hover:text-slate-200 text-sm font-medium"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setView('login')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                view === 'login'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setView('register')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                view === 'register'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAnonymous ? 'Create Account' : 'Register'}
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* OAuth Buttons */}
            <OAuthButtons
              onGoogle={() => handleOAuthSignIn(signInWithGoogle, upgradeWithGoogle)}
              onGithub={() => handleOAuthSignIn(signInWithGithub, upgradeWithGithub)}
              disabled={isSubmitting}
              isUpgrade={view === 'register' && isAnonymous}
            />

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-slate-800 px-4 text-slate-400">or continue with email</span>
              </div>
            </div>

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                  Email
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none disabled:bg-slate-600 placeholder-slate-400"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none disabled:bg-slate-600 placeholder-slate-400"
                    placeholder="••••••••"
                  />
                </div>
                {view === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-purple-600 hover:text-purple-700 mt-1"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {view === 'register' && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none disabled:bg-slate-600 placeholder-slate-400"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : view === 'login' ? (
                  'Sign In'
                ) : isAnonymous ? (
                  'Save Progress & Create Account'
                ) : (
                  'Create Account'
                )}
              </button>
            </form>

            {isAnonymous && (
              <p className="mt-4 text-xs text-center text-slate-400">
                Your practice history will be saved to your new account
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
