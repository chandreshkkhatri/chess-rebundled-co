'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { LoginModalProvider } from '@/contexts/LoginModalContext';

// Combined provider that wraps Auth and LoginModal
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LoginModalProvider>{children}</LoginModalProvider>
    </AuthProvider>
  );
}
