'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGameStore } from '@/stores/gameStore';
import { parseVoiceInput } from '@/lib/voiceParser';

interface VoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
}

export function VoiceInput({ onMoveSubmit, disabled }: VoiceInputProps) {
  const { currentTurn, myColor, status } = useGameStore();
  const isMyTurn = currentTurn === myColor && status === 'playing';
  const [pendingMove, setPendingMove] = useState<{ notation: string; confidence: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prevIsMyTurnRef = useRef(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { isSupported, isListening, transcript, confidence, error, startListening, stopListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: (move, confidence) => {
        if (!isSubmitting) {
          setPendingMove({ notation: move, confidence });
        }
      },
    });

  // Auto-start listening when it becomes player's turn
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current && !disabled && !isListening && !pendingMove && !isSubmitting) {
      const timeout = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timeout);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, disabled, isListening, pendingMove, isSubmitting, startListening]);

  // Stop listening when submitting
  useEffect(() => {
      if (isSubmitting && isListening) {
          stopListening();
      }
  }, [isSubmitting, isListening, stopListening]);

  // Clear pending move and submitting state when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setPendingMove(null);
      setIsSubmitting(false);
      if (isListening) {
          stopListening();
      }
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    }
  }, [isMyTurn, isListening, stopListening]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (pendingMove && isMyTurn && !disabled && !isSubmitting) {
      console.log('[VoiceInput] Submitting move:', pendingMove.notation);
      setIsSubmitting(true);
      onMoveSubmit(pendingMove.notation, pendingMove.confidence);

      // Fallback: reset after 5 seconds if turn doesn't change
      submitTimeoutRef.current = setTimeout(() => {
        console.log('[VoiceInput] Timeout - resetting isSubmitting');
        setIsSubmitting(false);
      }, 5000);
    }
  }, [pendingMove, isMyTurn, disabled, isSubmitting, onMoveSubmit]);

  const handleReset = useCallback(() => {
    setPendingMove(null);
    setIsSubmitting(false);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
    // Restart listening if it stopped (or just clear pending if still listening)
    if (!isListening) {
        startListening();
    }
  }, [startListening, isListening]);

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
        <div className="text-yellow-800 text-xs">
          Voice recognition not supported. Use Chrome.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg p-3">
      {/* Integrated Turn Indicator */}
      <div
        className={`text-center py-2 px-3 rounded-lg mb-2 font-bold ${
          isMyTurn
            ? 'bg-green-500 text-white animate-pulse'
            : 'bg-slate-700 text-slate-400'
        }`}
      >
        {isMyTurn ? "🎤 Your turn - speak!" : "⏳ Opponent's turn"}
      </div>

      {/* Status + Listening indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isListening
              ? 'bg-red-500 animate-pulse'
              : isMyTurn && !disabled
              ? 'bg-green-400'
              : 'bg-slate-600'
          }`}
        />
        <span className={`text-sm ${isListening ? 'text-red-400' : 'text-slate-400'}`}>
          {isListening ? 'Listening...' : pendingMove ? 'Move detected' : isMyTurn ? 'Ready' : 'Waiting'}
        </span>
      </div>

      {/* Parsed move display - always reserve space */}
      <div className="h-14 flex items-center justify-center mb-2">
        {pendingMove ? (
          <div className="text-center">
            <div className="font-mono text-3xl font-bold text-green-400">
              {pendingMove.notation}
            </div>
          </div>
        ) : transcript ? (
          <div className="text-center">
            <div className="font-mono text-lg text-slate-400">{transcript}</div>
          </div>
        ) : (
          <div className="text-slate-600 text-sm">
            {isMyTurn ? 'Say your move...' : ''}
          </div>
        )}
      </div>

      {/* Action buttons - PROMINENT */}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          disabled={!isMyTurn || isSubmitting || disabled}
          className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
            !isMyTurn || isSubmitting || disabled
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-slate-600 hover:bg-slate-500 text-white'
          }`}
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={!pendingMove || isSubmitting || !isMyTurn || disabled}
          className={`flex-[2] py-3 px-4 rounded-lg font-bold text-lg transition-colors ${
            isSubmitting
              ? 'bg-yellow-500 text-white cursor-wait animate-pulse'
              : pendingMove && isMyTurn && !disabled
              ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '...' : '✓ SUBMIT'}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-2 p-3 bg-red-900/80 border border-red-500 rounded-lg flex flex-col items-center gap-2">
            <span className="text-red-100 font-bold text-center text-sm">{error}</span>
            {error.includes('denied') || error.includes('blocked') ? (
                <div className="text-xs text-red-200">Check browser settings</div>
            ) : (
                <button 
                    onClick={handleReset}
                    className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-xs text-white uppercase font-bold tracking-wider"
                >
                    Retry
                </button>
            )}
        </div>
      )}

      {/* Compact phonetic hint */}
      <div className="mt-2 text-xs text-slate-500 text-center">
        Tip: Say "Echo 4" for e4, "Delta 4" for d4
      </div>
    </div>
  );
}
