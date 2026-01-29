'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from '@posthog/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoginModalProvider } from '@/contexts/LoginModalContext';

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + '?' + searchParams.toString();
      }
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}

function PostHogProviderInner({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: false, // We capture manually for SPA navigation
        capture_pageleave: true,
      });

      // Register environment as super property (sent with every event)
      posthog.register({
        environment: process.env.NODE_ENV, // 'development' or 'production'
      });
    }
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}

// Combined provider that wraps Auth, LoginModal, and PostHog
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LoginModalProvider>
        <PostHogProviderInner>{children}</PostHogProviderInner>
      </LoginModalProvider>
    </AuthProvider>
  );
}
