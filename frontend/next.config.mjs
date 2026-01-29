/** @type {import('next').NextConfig} */
import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {
  reactStrictMode: true,
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
