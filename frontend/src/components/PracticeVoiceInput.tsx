'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { usePracticeStore } from '@/stores/practiceStore';

interface PracticeVoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
}

export function PracticeVoiceInput({ onMoveSubmit, disabled = false }: PracticeVoiceInputProps) {
  const { status, currentSide, lastMoveResult, isSubmitting, mode, playerColor } = usePracticeStore();
  const isActive = status === 'playing' && !disabled;
  const [pendingMove, setPendingMove] = useState<{ notation: string; confidence: number } | null>(null);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs to avoid recreating the callback
  const isActiveRef = useRef(isActive);
  const isSubmittingRef = useRef(isSubmitting);

  useEffect(() => {
    isActiveRef.current = isActive;
    isSubmittingRef.current = isSubmitting;
  }, [isActive, isSubmitting]);

  // Stable callback using refs
  const handleVoiceResult = useCallback((move: string, confidence: number) => {
    if (!isSubmittingRef.current && isActiveRef.current) {
      setPendingMove({ notation: move, confidence });
    }
  }, []);

  const { isSupported, isListening, transcript, error, startListening, stopListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: handleVoiceResult,
    });

  // Auto-start listening when active and not submitting
  useEffect(() => {
    if (isActive && !isListening && !pendingMove && !isSubmitting) {
      const timeout = setTimeout(() => {
        startListening();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isActive, isListening, pendingMove, isSubmitting, startListening]);

  // Stop listening when submitting
  useEffect(() => {
    if (isSubmitting && isListening) {
      stopListening();
    }
  }, [isSubmitting, isListening, stopListening]);

  // Clear pending move when new move result comes in
  useEffect(() => {
    if (lastMoveResult) {
      setPendingMove(null);
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    }
  }, [lastMoveResult]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (pendingMove && isActive && !isSubmitting) {
      console.log('[PracticeVoiceInput] Submitting move:', pendingMove.notation);
      onMoveSubmit(pendingMove.notation, pendingMove.confidence);

      // Fallback: reset after 3 seconds if no response
      submitTimeoutRef.current = setTimeout(() => {
        console.log('[PracticeVoiceInput] Timeout - resetting');
        setPendingMove(null);
      }, 3000);
    }
  }, [pendingMove, isActive, isSubmitting, onMoveSubmit]);

  const handleReset = useCallback(() => {
    setPendingMove(null);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
    if (!isListening && isActive) {
      startListening();
    }
  }, [startListening, isListening, isActive]);

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
      {/* Side indicator */}
      <div
        className={`text-center py-2 px-3 rounded-lg mb-2 font-bold ${
          currentSide === 'white'
            ? 'bg-white text-slate-800'
            : 'bg-slate-600 text-white'
        }`}
      >
        {mode === 'one-side' && playerColor ? (
          <>Your move ({playerColor === 'white' ? '⬜' : '⬛'})</>
        ) : (
          <>{currentSide === 'white' ? '⬜ White' : '⬛ Black'} to move</>
        )}
      </div>

      {/* Status + Listening indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isListening
              ? 'bg-red-500 animate-pulse'
              : isActive
              ? 'bg-green-400'
              : 'bg-slate-600'
          }`}
        />
        <span className={`text-sm ${isListening ? 'text-red-400' : 'text-slate-400'}`}>
          {isListening ? 'Listening...' : pendingMove ? 'Move detected' : isActive ? 'Ready' : 'Waiting'}
        </span>
      </div>

      {/* Parsed move display */}
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
            {isActive ? 'Say your move...' : ''}
          </div>
        )}
      </div>

      {/* Last move feedback */}
      {lastMoveResult && (
        <div
          className={`text-center py-1 px-2 rounded mb-2 text-sm font-medium ${
            lastMoveResult.isCorrect
              ? 'bg-green-900/50 text-green-300'
              : 'bg-red-900/50 text-red-300'
          }`}
        >
          {lastMoveResult.isCorrect ? (
            <>✓ Correct!</>
          ) : (
            <>✗ Expected: {lastMoveResult.expectedMove}</>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          disabled={isSubmitting || !isActive}
          className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
            isSubmitting || !isActive
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-slate-600 hover:bg-slate-500 text-white'
          }`}
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={!pendingMove || isSubmitting || !isActive}
          className={`flex-[2] py-3 px-4 rounded-lg font-bold text-lg transition-colors ${
            isSubmitting
              ? 'bg-yellow-500 text-white cursor-wait animate-pulse'
              : pendingMove && isActive
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

      {/* Phonetic hint */}
      <div className="mt-2 text-xs text-slate-500 text-center">
        Tip: Say "Echo 4" for e4, "Delta 4" for d4
      </div>
    </div>
  );
}
