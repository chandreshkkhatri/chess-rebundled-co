'use client';

import { useState, useEffect } from 'react';
import { AuthForm } from './AuthForm';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  // Track when modal opens to reset form state
  const [formKey, setFormKey] = useState(0);

  // Increment key when modal opens to force AuthForm remount (clears form state)
  useEffect(() => {
    if (isOpen) {
      setFormKey((k) => k + 1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSuccess = () => {
    onClose();
    onSuccess?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start pt-16 sm:items-center sm:pt-0 justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 my-4 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1 text-white/70 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <AuthForm key={formKey} onSuccess={handleSuccess} variant="modal" showHeader />
      </div>
    </div>
  );
}
