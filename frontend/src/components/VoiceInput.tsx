'use client';

import { useEffect, useCallback } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGameStore } from '@/stores/gameStore';

interface VoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
}

export function VoiceInput({ onMoveSubmit, disabled }: VoiceInputProps) {
  const { currentTurn, myColor, status } = useGameStore();
  const isMyTurn = currentTurn === myColor && status === 'playing';

  const handleResult = useCallback(
    (move: string, confidence: number) => {
      if (isMyTurn && !disabled) {
        onMoveSubmit(move, confidence);
      }
    },
    [isMyTurn, disabled, onMoveSubmit]
  );

  const { isSupported, isListening, transcript, confidence, error, startListening, stopListening } =
    useVoiceRecognition({
      onResult: handleResult,
    });

  // Auto-start listening when it's my turn
  useEffect(() => {
    if (isMyTurn && !disabled && isSupported && !isListening) {
      startListening();
    }
    if (!isMyTurn && isListening) {
      stopListening();
    }
  }, [isMyTurn, disabled, isSupported, isListening, startListening, stopListening]);

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="text-yellow-800 text-sm">
          Voice recognition not supported. Please use a Chrome-based browser.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Voice Input
      </h3>

      {/* Microphone button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={!isMyTurn || disabled}
          className={`
            w-16 h-16 rounded-full flex items-center justify-center
            transition-all duration-200
            ${
              isListening
                ? 'bg-red-500 animate-pulse'
                : isMyTurn && !disabled
                ? 'bg-blue-500 hover:bg-blue-600'
                : 'bg-gray-300'
            }
          `}
        >
          <svg
            className="w-8 h-8 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>

        <div className="text-center">
          {isListening ? (
            <span className="text-red-500 font-medium">Listening...</span>
          ) : isMyTurn && !disabled ? (
            <span className="text-gray-600">Click or speak your move</span>
          ) : (
            <span className="text-gray-400">Waiting for your turn</span>
          )}
        </div>
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500 mb-1">Heard:</div>
          <div className="font-mono text-lg">{transcript}</div>
          {confidence > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              Confidence: {(confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg">
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      )}

      {/* Phonetic hint */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          <strong>Tip:</strong> Use phonetic alphabet for clarity:{' '}
          <span className="font-mono">Delta 4</span> for d4,{' '}
          <span className="font-mono">Bravo 4</span> for b4
        </div>
      </div>
    </div>
  );
}
