'use client';

import { usePracticeStore } from '@/stores/practiceStore';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { autoSubmitEnabled, setAutoSubmitEnabled } = usePracticeStore();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-semibold text-lg">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {/* Auto-submit toggle */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-white text-sm font-medium">
                Auto-submit moves
              </div>
              <div className="text-slate-400 text-xs mt-0.5">
                Automatically submit high-confidence moves without confirmation
              </div>
            </div>
            <button
              onClick={() => setAutoSubmitEnabled(!autoSubmitEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                autoSubmitEnabled ? 'bg-purple-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoSubmitEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
