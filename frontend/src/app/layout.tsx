import type { Metadata, Viewport } from 'next';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chess Rebundled - Learn Chess Notation by Voice',
  description: 'Master chess notation by speaking moves from famous historical games',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192x192.svg',
    apple: '/icons/icon-192x192.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Providers>
          <PWAInstallPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
