'use client';

import { usePracticeStore } from '@/stores/practiceStore';

interface SettingsModalProps {
  onClose: () => void;
}

const INPUT_MODE_OPTIONS = [
  { value: 'voice-tap' as const, label: 'Voice + Tap', description: 'Speak or tap moves' },
  { value: 'tap-only' as const, label: 'Tap Only', description: 'Tap moves from grid' },
  { value: 'text-only' as const, label: 'Text Only', description: 'Type moves manually' },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { autoSubmitEnabled, setAutoSubmitEnabled, inputMode, setInputMode } = usePracticeStore();

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
              role="switch"
              aria-checked={autoSubmitEnabled}
              aria-label="Auto-submit moves"
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

          {/* Input mode selector */}
          <div>
            <div className="text-white text-sm font-medium mb-2">
              Input method
            </div>
            <div className="space-y-2">
              {INPUT_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setInputMode(option.value)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                    inputMode === option.value
                      ? 'bg-purple-500/20 border-purple-500 text-white'
                      : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      inputMode === option.value
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-slate-500'
                    }`}
                  >
                    {inputMode === option.value && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-slate-400">{option.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
