/** @type {import('next').NextConfig} */
import withPWAInit from 'next-pwa';
import path from 'node:path';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {
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
