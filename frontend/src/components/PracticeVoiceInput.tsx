'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';

interface PracticeVoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
}

export function PracticeVoiceInput({ onMoveSubmit, disabled = false }: PracticeVoiceInputProps) {
  const {
    status,
    currentSide,
    lastMoveResult,
    isSubmitting,
    mode,
    playerColor,
    sessionId,
    aiParseResult,
    aiParseError,
    isAIParsing,
    clearAIParseState,
  } = usePracticeStore();
  const { parseMoveWithAI } = usePracticeSocket();
  const isActive = status === 'playing' && !disabled;

  // Raw transcript from speech recognition
  const [rawTranscript, setRawTranscript] = useState<string>('');
  // Selected move (from AI result or alternatives)
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoListenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle raw voice result - show transcript and request AI parsing
  const handleVoiceResult = useCallback((transcript: string) => {
    if (!isSubmitting && isActive && sessionId) {
      setRawTranscript(transcript);
      setSelectedMove(null);
      // Request AI parsing - the store will be updated via socket
      parseMoveWithAI(sessionId, transcript);
    }
  }, [parseMoveWithAI, isSubmitting, isActive, sessionId]);

  // Auto-select parsed move when AI result comes in (but not during submission)
  useEffect(() => {
    if (aiParseResult?.parsedMove && !isSubmitting) {
      setSelectedMove(aiParseResult.parsedMove);
    }
  }, [aiParseResult, isSubmitting]);

  const { isSupported, isListening, transcript, error, startListening, stopListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: handleVoiceResult,
    });

  // Auto-start listening when active and not submitting
  useEffect(() => {
    if (isActive && !isListening && !rawTranscript && !isSubmitting && !isAIParsing) {
      autoListenTimeoutRef.current = setTimeout(() => {
        autoListenTimeoutRef.current = null;
        startListening();
      }, 300);
      return () => {
        if (autoListenTimeoutRef.current) {
          clearTimeout(autoListenTimeoutRef.current);
          autoListenTimeoutRef.current = null;
        }
      };
    }
  }, [isActive, isListening, rawTranscript, isSubmitting, isAIParsing, startListening]);

  // Stop listening when submitting or parsing
  useEffect(() => {
    if ((isSubmitting || isAIParsing) && isListening) {
      stopListening();
    }
  }, [isSubmitting, isAIParsing, isListening, stopListening]);

  // Clear state when new move result comes in
  useEffect(() => {
    if (lastMoveResult) {
      setRawTranscript('');
      setSelectedMove(null);
      clearAIParseState();
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    }
  }, [lastMoveResult, clearAIParseState]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (selectedMove && isActive && !isSubmitting) {
      // Track move index at submission time to avoid clearing wrong state
      const moveIndexAtSubmit = usePracticeStore.getState().currentMoveIndex;
      onMoveSubmit(selectedMove, aiParseResult?.confidence || 0.5);

      // Fallback: reset after 3 seconds if no response (only if still on same move)
      submitTimeoutRef.current = setTimeout(() => {
        const currentIndex = usePracticeStore.getState().currentMoveIndex;
        if (currentIndex === moveIndexAtSubmit) {
          setRawTranscript('');
          setSelectedMove(null);
          clearAIParseState();
        }
      }, 3000);
    }
  }, [selectedMove, isActive, isSubmitting, onMoveSubmit, aiParseResult?.confidence, clearAIParseState]);

  const handleReset = useCallback(() => {
    setRawTranscript('');
    setSelectedMove(null);
    clearAIParseState();
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
    if (autoListenTimeoutRef.current) {
      clearTimeout(autoListenTimeoutRef.current);
      autoListenTimeoutRef.current = null;
    }
    if (!isListening && isActive) {
      startListening();
    }
  }, [startListening, isListening, isActive, clearAIParseState]);

  const handleSelectAlternative = useCallback((move: string) => {
    setSelectedMove(move);
  }, []);

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
          <>Your move ({playerColor === 'white' ? '\u2B1C' : '\u2B1B'})</>
        ) : (
          <>{currentSide === 'white' ? '\u2B1C White' : '\u2B1B Black'} to move</>
        )}
      </div>

      {/* Status + Listening indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isListening
              ? 'bg-red-500 animate-pulse'
              : isAIParsing
              ? 'bg-yellow-500 animate-pulse'
              : isActive
              ? 'bg-green-400'
              : 'bg-slate-600'
          }`}
        />
        <span className={`text-sm ${isListening ? 'text-red-400' : isAIParsing ? 'text-yellow-400' : 'text-slate-400'}`}>
          {isListening ? 'Listening...' : isAIParsing ? 'AI parsing...' : rawTranscript ? 'Ready to submit' : isActive ? 'Ready' : 'Waiting'}
        </span>
      </div>

      {/* Raw transcript display */}
      {rawTranscript && (
        <div className="bg-slate-700 rounded-lg p-2 mb-2">
          <div className="text-xs text-slate-400 mb-1">You said:</div>
          <div className="text-white text-sm font-medium">&ldquo;{rawTranscript}&rdquo;</div>
        </div>
      )}

      {/* AI Parsing result */}
      <div className="min-h-[60px] flex flex-col items-center justify-center mb-2">
        {isAIParsing ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
            <span className="text-yellow-400 text-sm">AI parsing...</span>
          </div>
        ) : aiParseError ? (
          <div className="text-red-400 text-sm text-center">{aiParseError}</div>
        ) : aiParseResult ? (
          <div className="text-center w-full">
            <div
              className={`font-mono text-3xl font-bold cursor-pointer py-2 px-4 rounded-lg transition-colors ${
                selectedMove === aiParseResult.parsedMove
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-700 text-green-400 hover:bg-slate-600'
              }`}
              onClick={() => setSelectedMove(aiParseResult.parsedMove)}
            >
              {aiParseResult.parsedMove || '???'}
            </div>
            {aiParseResult.confidence < 1 && (
              <div className="text-xs text-slate-500 mt-1">
                {(aiParseResult.confidence * 100).toFixed(0)}% confident
                {aiParseResult.reasoning && ` - ${aiParseResult.reasoning}`}
              </div>
            )}
            {/* Alternatives */}
            {aiParseResult.alternatives && aiParseResult.alternatives.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-slate-500 mb-1">Also possible:</div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {aiParseResult.alternatives.map((alt) => (
                    <button
                      key={alt}
                      onClick={() => handleSelectAlternative(alt)}
                      className={`px-3 py-1 rounded font-mono text-sm transition-colors ${
                        selectedMove === alt
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            <>{'\u2713'} Correct!</>
          ) : (
            <>{'\u2717'} Expected: {lastMoveResult.expectedMove}</>
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
          disabled={!selectedMove || isSubmitting || !isActive}
          className={`flex-[2] py-3 px-4 rounded-lg font-bold text-lg transition-colors ${
            isSubmitting
              ? 'bg-yellow-500 text-white cursor-wait animate-pulse'
              : selectedMove && isActive
              ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '...' : `${'\u2713'} SUBMIT ${selectedMove || ''}`}
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
        Tip: Say &ldquo;Echo 4&rdquo; for e4, &ldquo;knight delta 5&rdquo; for Nd5
      </div>
    </div>
  );
}
