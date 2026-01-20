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
  const prevIsMyTurnRef = useRef(false);

  const { isSupported, isListening, transcript, confidence, error, startListening, stopListening } =
    useVoiceRecognition({});

  // Auto-start listening when it becomes player's turn
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current && !disabled && !isListening && !pendingMove) {
      // Small delay to ensure smooth transition
      const timeout = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timeout);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, disabled, isListening, pendingMove, startListening]);

  // Parse transcript when it changes and store as pending
  useEffect(() => {
    if (transcript && !isListening) {
      const parsed = parseVoiceInput(transcript);
      if (parsed.notation) {
        setPendingMove({ notation: parsed.notation, confidence: parsed.confidence });
      }
    }
  }, [transcript, isListening]);

  // Clear pending move when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setPendingMove(null);
    }
  }, [isMyTurn]);

  const handleSubmit = useCallback(() => {
    if (pendingMove && isMyTurn && !disabled) {
      onMoveSubmit(pendingMove.notation, pendingMove.confidence);
      setPendingMove(null);
    }
  }, [pendingMove, isMyTurn, disabled, onMoveSubmit]);

  const handleReset = useCallback(() => {
    setPendingMove(null);
    startListening();
  }, [startListening]);

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

      {/* Status indicator */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <div
          className={`w-4 h-4 rounded-full ${
            isListening
              ? 'bg-red-500 animate-pulse'
              : isMyTurn && !disabled
              ? 'bg-green-500'
              : 'bg-gray-300'
          }`}
        />
        <div className="text-center">
          {isListening ? (
            <span className="text-red-500 font-medium">Listening...</span>
          ) : isMyTurn && !disabled ? (
            pendingMove ? (
              <span className="text-blue-600 font-medium">Move detected</span>
            ) : (
              <span className="text-green-600 font-medium">Speak your move</span>
            )
          ) : (
            <span className="text-gray-400">Waiting for your turn</span>
          )}
        </div>
      </div>

      {/* Transcript display */}
      {transcript && (
        <div className="p-3 bg-gray-50 rounded-lg mb-4">
          <div className="text-sm text-gray-500 mb-1">Heard:</div>
          <div className="font-mono text-lg">{transcript}</div>
          {confidence > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              Confidence: {(confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
      )}

      {/* Parsed move display */}
      {pendingMove && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
          <div className="text-sm text-blue-600 mb-1">Parsed move:</div>
          <div className="font-mono text-3xl font-bold text-blue-800 text-center">
            {pendingMove.notation}
          </div>
        </div>
      )}

      {/* Action buttons - always visible when it's my turn */}
      {isMyTurn && !disabled && (
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 py-3 px-4 rounded-lg font-medium transition-colors bg-gray-200 hover:bg-gray-300 text-gray-700"
          >
            Reset
          </button>
          <button
            onClick={handleSubmit}
            disabled={!pendingMove}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              pendingMove
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Submit
          </button>
        </div>
      )}

      {/* Error display */}
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
