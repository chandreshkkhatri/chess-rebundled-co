'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { updateDisplayName } from '@/lib/firebase';
import { PageLayout } from '@/components/PageLayout';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading, logout, getIdToken, resetPassword, linkWithGoogle, linkWithGithub } = useAuth();

  // Display name edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Password reset state
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);

  // Account linking state
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isLinkingGithub, setIsLinkingGithub] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleStartEditName = () => {
    setEditedName(user?.displayName || '');
    setNameError(null);
    setNameSuccess(false);
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName('');
    setNameError(null);
  };

  const handleSaveName = async () => {
    const trimmedName = editedName.trim();

    // Validation
    if (!trimmedName) {
      setNameError('Name cannot be empty');
      return;
    }
    if (trimmedName.length > 20) {
      setNameError('Name must be 20 characters or less');
      return;
    }
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(trimmedName)) {
      setNameError('Name can only contain letters, numbers, spaces, hyphens, underscores, and periods');
      return;
    }

    setIsSavingName(true);
    setNameError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        setNameError('Not authenticated');
        setIsSavingName(false);
        return;
      }

      // Update Firebase Auth displayName
      await updateDisplayName(trimmedName);

      // Also save to Firestore profile
      const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      const response = await fetch(`${apiUrl}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: trimmedName }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save name');
      }

      setIsEditingName(false);
      setEditedName('');
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/');
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;

    setIsResettingPassword(true);
    setPasswordResetError(null);

    try {
      await resetPassword(user.email);
      setPasswordResetSent(true);
      setTimeout(() => setPasswordResetSent(false), 5000);
    } catch (err) {
      setPasswordResetError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);
    setLinkError(null);

    try {
      await linkWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link Google account';
      // Handle common Firebase errors
      if (message.includes('already in use') || message.includes('credential-already-in-use')) {
        setLinkError('This Google account is already linked to another user');
      } else {
        setLinkError(message);
      }
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleLinkGithub = async () => {
    setIsLinkingGithub(true);
    setLinkError(null);

    try {
      await linkWithGithub();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link GitHub account';
      if (message.includes('already in use') || message.includes('credential-already-in-use')) {
        setLinkError('This GitHub account is already linked to another user');
      } else {
        setLinkError(message);
      }
    } finally {
      setIsLinkingGithub(false);
    }
  };

  // Get linked providers
  const getLinkedProviders = () => {
    if (!user?.providerData) return [];
    return user.providerData.map((provider) => provider.providerId);
  };

  const linkedProviders = getLinkedProviders();
  const hasGoogle = linkedProviders.includes('google.com');
  const hasGithub = linkedProviders.includes('github.com');
  const hasPassword = linkedProviders.includes('password');

  if (isLoading) {
    return (
      <PageLayout>
        <div className="px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-700 rounded w-1/3"></div>
              <div className="h-32 bg-slate-700 rounded"></div>
              <div className="h-32 bg-slate-700 rounded"></div>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    router.replace('/login?redirect=%2Fsettings');
    return null;
  }

  return (
    <PageLayout>
      <div className="px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold text-white">Account Settings</h1>

          {/* Profile Section */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>

            {/* Avatar and basic info */}
            <div className="flex items-center gap-4 mb-6">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-white font-medium">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </p>
                {user.email && (
                  <p className="text-slate-400 text-sm">{user.email}</p>
                )}
              </div>
            </div>

            {/* Display Name Edit */}
            <div className="border-t border-slate-700 pt-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Display Name
              </label>
              {isEditingName ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => {
                      setEditedName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSavingName) handleSaveName();
                      if (e.key === 'Escape') handleCancelEditName();
                    }}
                    placeholder="Enter your name"
                    maxLength={20}
                    disabled={isSavingName}
                    className={`w-full px-3 py-2 border rounded-lg bg-slate-700 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder-slate-400 ${
                      nameError ? 'border-red-500' : 'border-slate-600'
                    }`}
                    autoFocus
                  />
                  {nameError && (
                    <p className="text-sm text-red-400">{nameError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      disabled={isSavingName}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                      {isSavingName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelEditName}
                      disabled={isSavingName}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-slate-100">
                    {user.displayName || 'Not set'}
                  </span>
                  <button
                    onClick={handleStartEditName}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  {nameSuccess && (
                    <span className="text-sm text-green-400">Saved!</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Linked Accounts Section */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Linked Accounts</h2>
            <p className="text-slate-400 text-sm mb-4">
              Accounts you can use to sign in to Chess Rebundled.
            </p>

            <div className="space-y-3">
              {/* Google */}
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span className="text-slate-200">Google</span>
                </div>
                {hasGoogle ? (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                    className="text-sm text-purple-400 hover:text-purple-300 transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {isLinkingGoogle ? 'Linking...' : 'Link'}
                  </button>
                )}
              </div>

              {/* GitHub */}
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span className="text-slate-200">GitHub</span>
                </div>
                {hasGithub ? (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={handleLinkGithub}
                    disabled={isLinkingGithub}
                    className="text-sm text-purple-400 hover:text-purple-300 transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {isLinkingGithub ? 'Linking...' : 'Link'}
                  </button>
                )}
              </div>

              {/* Password */}
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-slate-200">Password</span>
                </div>
                {hasPassword ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-400 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Set
                    </span>
                    {passwordResetSent ? (
                      <span className="text-sm text-green-400">Email sent!</span>
                    ) : (
                      <button
                        onClick={handlePasswordReset}
                        disabled={isResettingPassword || !user?.email}
                        className="text-sm text-purple-400 hover:text-purple-300 transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
                      >
                        {isResettingPassword ? 'Sending...' : 'Change'}
                      </button>
                    )}
                  </div>
                ) : user?.email ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Not set</span>
                    {passwordResetSent ? (
                      <span className="text-sm text-green-400">Email sent!</span>
                    ) : (
                      <button
                        onClick={handlePasswordReset}
                        disabled={isResettingPassword}
                        className="text-sm text-purple-400 hover:text-purple-300 transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
                      >
                        {isResettingPassword ? 'Sending...' : 'Create'}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">Not set</span>
                )}
              </div>

              {passwordResetError && (
                <p className="text-sm text-red-400 mt-2">{passwordResetError}</p>
              )}
              {linkError && (
                <p className="text-sm text-red-400 mt-2">{linkError}</p>
              )}
            </div>
          </div>

          {/* Sign Out Section */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Sign Out</h2>
            <p className="text-slate-400 text-sm mb-4">
              Sign out of your account on this device.
            </p>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
