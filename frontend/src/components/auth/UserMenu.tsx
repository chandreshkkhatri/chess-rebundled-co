'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';

export function UserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [equippedBadge, setEquippedBadge] = useState<{ id: string; name: string; emoji: string } | null>(null);

  // Load user equipped badge
  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadBadge = () => {
      const activeBadgeStr = localStorage.getItem("active_badge");
      if (activeBadgeStr) {
        try {
          setEquippedBadge(JSON.parse(activeBadgeStr));
        } catch {
          setEquippedBadge({ id: activeBadgeStr, name: activeBadgeStr, emoji: "🎖️" });
        }
      } else {
        setEquippedBadge(null);
      }
    };

    loadBadge();
    window.addEventListener("active_cosmetics_changed", loadBadge);
    return () => window.removeEventListener("active_cosmetics_changed", loadBadge);
  }, []);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse" />
    );
  }

  // Not logged in - show sign in button
  if (!user) {
    const handleSignIn = () => {
      const redirect = encodeURIComponent(pathname);
      router.push(`/login?redirect=${redirect}`);
    };

    return (
      <button
        onClick={handleSignIn}
        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
      >
        Sign In
      </button>
    );
  }

  // Authenticated user - show avatar dropdown
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const avatarUrl = user.photoURL;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
      >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={32}
              height={32}
              className="rounded-full"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium text-sm">
              {initials}
            </div>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-slate-800 rounded-lg shadow-lg border border-slate-700 py-1 z-50">
            {/* User Info */}
            <div className="px-4 py-3 border-b border-slate-700">
              <p className="text-sm font-medium text-slate-100 truncate flex items-center gap-1.5">
                {equippedBadge && (
                  <span className="bg-purple-900/60 text-purple-300 text-[10px] font-black px-1.5 py-0.5 rounded border border-purple-500/20" title={equippedBadge.name}>
                    {equippedBadge.emoji}
                  </span>
                )}
                <span>{displayName}</span>
              </p>
              {user.email && (
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              )}
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <a
                href="/profile"
                className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                onClick={() => setIsOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile & Stats
              </a>
              <a
                href="/history"
                className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                onClick={() => setIsOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Practice History
              </a>
              <a
                href="/settings"
                className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                onClick={() => setIsOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Account Settings
              </a>
            </div>

            {/* Sign Out */}
            <div className="border-t border-slate-700 py-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  logout();
                }}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-900/30"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
