'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LoginModal } from '@/components/auth/LoginModal';

interface LoginModalContextType {
  openLoginModal: (options?: { onSuccess?: () => void }) => void;
  closeLoginModal: () => void;
  isOpen: boolean;
}

const LoginModalContext = createContext<LoginModalContextType | null>(null);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | undefined>();
  const [mounted, setMounted] = useState(false);

  // Only render portal after mounting (client-side)
  useEffect(() => {
    setMounted(true);
  }, []);

  const openLoginModal = useCallback((options?: { onSuccess?: () => void }) => {
    setOnSuccessCallback(() => options?.onSuccess);
    setIsOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setIsOpen(false);
    setOnSuccessCallback(undefined);
  }, []);

  const handleSuccess = useCallback(() => {
    closeLoginModal();
    onSuccessCallback?.();
  }, [closeLoginModal, onSuccessCallback]);

  return (
    <LoginModalContext.Provider value={{ openLoginModal, closeLoginModal, isOpen }}>
      {children}
      {mounted && createPortal(
        <LoginModal
          isOpen={isOpen}
          onClose={closeLoginModal}
          onSuccess={handleSuccess}
        />,
        document.body
      )}
    </LoginModalContext.Provider>
  );
}

export function useLoginModal() {
  const context = useContext(LoginModalContext);
  if (!context) {
    throw new Error('useLoginModal must be used within LoginModalProvider');
  }
  return context;
}
