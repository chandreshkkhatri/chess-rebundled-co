/** @type {import('next').NextConfig} */
import withPWAInit from 'next-pwa';
import { execSync } from 'node:child_process';
import path from 'node:path';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

// Shown in Settings so players and support can tell which build is running.
function buildVersion() {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev'; // e.g. Docker builds, whose context has no .git
  }
}

// One ID per build, compared by open pages with /version.json to detect a
// deploy. Next evaluates this file in several processes during a build; they
// inherit the environment, so the first evaluation's values are shared.
process.env.NEXT_PUBLIC_BUILD_ID ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
process.env.NEXT_PUBLIC_BUILD_TIME ||= new Date().toISOString();

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: buildVersion(),
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
  },
  output: 'standalone',
  outputFileTracingRoot: path.resolve(import.meta.dirname, '..'),
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Allow Firebase Auth popups to communicate with the opener window
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Only proxy socket.io to local backend in development
    // In production, socket.io connects directly via NEXT_PUBLIC_SOCKET_URL
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/socket.io/:path*',
          destination: 'http://localhost:3001/socket.io/:path*',
        },
      ];
    }
    return [];
  },
};

export default withPWA(nextConfig);
