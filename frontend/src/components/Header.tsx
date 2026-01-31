'use client';

import Link from 'next/link';
import { UserMenu } from './auth/UserMenu';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="Chess Rebundled - Home">
          <span className="text-xl font-bold text-white">Chess Rebundled</span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
