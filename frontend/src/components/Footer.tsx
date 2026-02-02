'use client';

import Link from 'next/link';
import { useAppConfig } from '@/hooks/useAppConfig';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { discordInviteUrl } = useAppConfig();

  return (
    <footer className="bg-slate-900/80 backdrop-blur-sm border-t border-slate-700/50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Copyright */}
          <p className="text-sm text-slate-400">
            © {currentYear} Chess Rebundled
          </p>

          {/* Links */}
          <nav className="flex items-center gap-6">
            <Link
              href="/blog"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Blog
            </Link>
            {discordInviteUrl && (
              <a
                href={discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Discord
              </a>
            )}
            <Link
              href="/privacy"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
