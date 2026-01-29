'use client';

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGeminiVoice } from '@/hooks/useGeminiVoice';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { Chess } from 'chess.js';
import { PracticeVoiceDebugOverlay } from './PracticeVoiceDebugOverlay';
import { generateDistractors } from '@/lib/distractorGenerator';

// Debug flag - disabled for production builds
const DEBUG_AUDIO = process.env.NODE_ENV !== 'production';

// Confidence threshold for local parsing (skip Haiku if above this)
// Lowered from 0.85 to 0.70 to skip AI for more moves (d/b files get 0.7 confidence)
const LOCAL_PARSE_CONFIDENCE_THRESHOLD = 0.70;

// Confidence threshold for auto-submit (automatically submit if above this AND move is legal)
const AUTO_SUBMIT_CONFIDENCE_THRESHOLD = 0.85;

// Cooldown to prevent rapid re-triggering from continuous speech recognition
const RESULT_COOLDOWN_MS = 500;

interface PracticeVoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
  showDebugPanel?: boolean;
  onCloseDebugPanel?: () => void;
}

export function PracticeVoiceInput({ onMoveSubmit, disabled = false, showDebugPanel = false, onCloseDebugPanel }: PracticeVoiceInputProps) {
  const {
    status,
    lastMoveResult,
    isSubmitting,
    sessionId,
    aiParseResult,
    aiParseError,
    isAIParsing,
    clearAIParseState,
    voiceParsingMode,
    currentPosition,
    currentExpectedMove,
  } = usePracticeStore();
  const { parseMoveWithAI, parseAudioMoveWithGemini } = usePracticeSocket();
  const isActive = status === 'playing' && !disabled;

  // Selected move (from AI result or alternatives)
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  const autoListenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRef = useRef<{ move: string; timestamp: number } | null>(null);

  // Memoize legal moves from current position to check if parsed preview is valid
  const legalMoves = useMemo(() => {
    if (!currentPosition) return [];
    try {
      const chess = new Chess(currentPosition);
      return chess.moves();
    } catch {
      return [];
    }
  }, [currentPosition]);

  // Check if a move is in the legal moves list (handles check/checkmate notation differences)
  const isLegalMove = useCallback((move: string): boolean => {
    if (!move || legalMoves.length === 0) return false;
    const cleanMove = move.replace(/[+#]/g, '');
    return legalMoves.some(m => m.replace(/[+#]/g, '') === cleanMove);
  }, [legalMoves]);

  // Generate distractor move options (10 options including the correct move)
  const moveOptions = useMemo(() => {
    if (!currentExpectedMove?.san) return [];
    return generateDistractors(currentExpectedMove.san, { count: 10, includeCorrect: true, shuffle: true });
  }, [currentExpectedMove?.san]);

  // Handle selecting a move option (from tap)
  const handleSelectOption = useCallback((move: string) => {
    if (!isSubmitting && isActive) {
      setSelectedMove(move);
      // Set a simple AI parse result so the UI shows it properly
      usePracticeStore.getState().setAIParseResult({
        parsedMove: move,
        transcript: move,
        confidence: 1.0,
        alternatives: [],
        reasoning: 'Selected from options',
      });
    }
  }, [isSubmitting, isActive]);

  // Handle voice result - hook now passes parsed notation (e.g. "e4") directly
  // Block new requests while already parsing to prevent race conditions
  const handleVoiceResult = useCallback((parsedMove: string, confidence: number) => {
    if (!isSubmitting && !isAIParsing && isActive && sessionId && voiceParsingMode === 'webspeech-haiku') {
      const now = Date.now();

      // Skip if same move within cooldown period (prevents rapid re-triggering from continuous recognition)
      if (lastProcessedRef.current &&
          lastProcessedRef.current.move === parsedMove &&
          now - lastProcessedRef.current.timestamp < RESULT_COOLDOWN_MS) {
        return;
      }

      // If we already have a valid legal move selected, don't replace it with an invalid one
      // This prevents noise/garbage from clearing a good selection
      if (selectedMove && isLegalMove(selectedMove) && !isLegalMove(parsedMove)) {
        return;
      }

      // Track this result
      lastProcessedRef.current = { move: parsedMove, timestamp: now };

      // Clear previous state
      clearAIParseState();
      setSelectedMove(null);

      // Always surface a local parse immediately so the UI feels responsive.
      // If confidence is low, we can still refine with Haiku in the background.
      usePracticeStore.getState().setAIParseResult({
        parsedMove,
        transcript: parsedMove,
        confidence,
        alternatives: [],
        reasoning: confidence >= LOCAL_PARSE_CONFIDENCE_THRESHOLD ? 'Parsed locally' : 'Local preview (refining...)',
      });

      // Auto-submit for high confidence legal moves
      if (confidence >= AUTO_SUBMIT_CONFIDENCE_THRESHOLD && isLegalMove(parsedMove)) {
        setSelectedMove(parsedMove);
        // Small delay to show the selection visually before submitting
        setTimeout(() => {
          onMoveSubmit(parsedMove, confidence);
        }, 150);
        return;
      }

      if (confidence < LOCAL_PARSE_CONFIDENCE_THRESHOLD) {
        // Low confidence - call Haiku for refinement
        parseMoveWithAI(sessionId, parsedMove);
      }
    }
  }, [parseMoveWithAI, isSubmitting, isAIParsing, isActive, sessionId, clearAIParseState, voiceParsingMode, selectedMove, isLegalMove, onMoveSubmit]);

  // Handle audio ready from Gemini voice (Gemini mode)
  // Block new requests while already parsing to prevent race conditions
  const handleAudioReady = useCallback((audioBase64: string, mimeType: string) => {
    if (!isSubmitting && !isAIParsing && isActive && sessionId && voiceParsingMode === 'gemini-audio') {
      clearAIParseState();
      setSelectedMove(null);
      parseAudioMoveWithGemini(sessionId, audioBase64, mimeType);
    }
  }, [parseAudioMoveWithGemini, isSubmitting, isAIParsing, isActive, sessionId, clearAIParseState, voiceParsingMode]);

  // Auto-select parsed move when AI result comes in (but not during submission)
  // Also auto-submit for high confidence results (covers Gemini mode and Haiku refinements)
  useEffect(() => {
    if (aiParseResult?.parsedMove && !isSubmitting && isActive) {
      setSelectedMove(aiParseResult.parsedMove);

      // Auto-submit for high confidence legal moves from AI parsing
      if (
        aiParseResult.confidence >= AUTO_SUBMIT_CONFIDENCE_THRESHOLD &&
        isLegalMove(aiParseResult.parsedMove)
      ) {
        // Small delay to show the selection visually before submitting
        const timeoutId = setTimeout(() => {
          onMoveSubmit(aiParseResult.parsedMove, aiParseResult.confidence);
        }, 150);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [aiParseResult, isSubmitting, isActive, isLegalMove, onMoveSubmit]);

  // Web Speech API hook
  const { isSupported: isWebSpeechSupported, isListening: isWebSpeechListening, parsedPreview, error: webSpeechError, startListening: startWebSpeechListening, stopListening: stopWebSpeechListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: handleVoiceResult,
      legalMoves,
    });

  // Gemini Voice hook
  const { isSupported: isGeminiSupported, isListening: isGeminiListening, isRecording: isGeminiRecording, error: geminiError, startListening: startGeminiListening, stopListening: stopGeminiListening, volumeLevel, silenceThreshold } =
    useGeminiVoice({
      onAudioReady: handleAudioReady,
    });

  // Unified listening state based on mode
  const isListening = voiceParsingMode === 'webspeech-haiku' ? isWebSpeechListening : isGeminiListening;
  const isSupported = voiceParsingMode === 'webspeech-haiku' ? isWebSpeechSupported : isGeminiSupported;
  const error = voiceParsingMode === 'webspeech-haiku' ? webSpeechError : geminiError;
  const startListening = voiceParsingMode === 'webspeech-haiku' ? startWebSpeechListening : startGeminiListening;
  const stopListening = voiceParsingMode === 'webspeech-haiku' ? stopWebSpeechListening : stopGeminiListening;

  // Stop the inactive mode when switching
  useEffect(() => {
    if (voiceParsingMode === 'webspeech-haiku') {
      stopGeminiListening();
    } else {
      stopWebSpeechListening();
    }
    // Clear state when switching modes
    clearAIParseState();
    setSelectedMove(null);
  }, [voiceParsingMode, stopGeminiListening, stopWebSpeechListening, clearAIParseState]);

  // Auto-start listening when active and not submitting/parsing
  // Keeps listening even when there's a transcript, so speaking again replaces the previous result
  useEffect(() => {
    if (isActive && !isListening && !isSubmitting && !isAIParsing) {
      // Start listening immediately (removed 50ms delay for faster response)
      startListening();
    }
  }, [isActive, isListening, isSubmitting, isAIParsing, startListening]);

  // Stop listening when submitting or parsing
  useEffect(() => {
    if ((isSubmitting || isAIParsing) && isListening) {
      stopListening();
    }
  }, [isSubmitting, isAIParsing, isListening, stopListening]);

  // Clear state when new move result comes in
  useEffect(() => {
    if (lastMoveResult) {
      setSelectedMove(null);
      clearAIParseState();
      lastProcessedRef.current = null;
    }
  }, [lastMoveResult, clearAIParseState]);

  const handleSubmit = useCallback(() => {
    if (selectedMove && isActive && !isSubmitting) {
      onMoveSubmit(selectedMove, aiParseResult?.confidence || 0.5);
      // Note: State is cleared by lastMoveResult effect when server responds
      // Socket hook has 10s safety timeout if no response
    }
  }, [selectedMove, isActive, isSubmitting, onMoveSubmit, aiParseResult?.confidence]);

  const handleReset = useCallback(() => {
    setSelectedMove(null);
    clearAIParseState();
    lastProcessedRef.current = null;
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
    <div className="bg-slate-800 rounded-lg shadow-lg p-1.5 h-full flex flex-row gap-2 overflow-hidden">
      {/* Main content area - left side */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {isAIParsing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin h-8 w-8 border-4 border-yellow-500 border-t-transparent rounded-full"></div>
            <span className="text-yellow-400 text-xs font-mono uppercase tracking-widest">Processing</span>
          </div>
        ) : aiParseError ? (
          <div className="text-red-400 text-sm text-center px-4">{aiParseError}</div>
        ) : aiParseResult ? (
          <div className="text-center w-full">
            {/* Main result displayed in button now, show alternatives here */}
            {aiParseResult.confidence < 1 && (
              <div className="text-xs text-slate-500 mb-2">
                {(aiParseResult.confidence * 100).toFixed(0)}% confident
                {aiParseResult.reasoning && ` • ${aiParseResult.reasoning}`}
              </div>
            )}

            {/* Alternatives */}
            {aiParseResult.alternatives && aiParseResult.alternatives.length > 0 && (
              <div className="mt-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Alternatives</div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {aiParseResult.alternatives.map((alt) => (
                    <button
                      key={alt}
                      onClick={() => handleSelectAlternative(alt)}
                      className={`px-3 py-1.5 rounded font-mono text-sm transition-colors border ${selectedMove === alt
                        ? 'bg-green-600/20 border-green-500 text-green-300'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                        }`}
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Move options grid - always visible when playing and we have options */}
        {isActive && moveOptions.length > 0 && !isAIParsing && (
          <div className="w-full mt-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 text-center">
              Tap or speak a move
            </div>
            <div className="grid grid-cols-3 min-[400px]:grid-cols-4 sm:grid-cols-5 gap-1">
              {moveOptions.map((move) => (
                <button
                  key={move}
                  onClick={() => handleSelectOption(move)}
                  disabled={isSubmitting}
                  className={`py-2 px-1 rounded font-mono text-sm transition-all border ${
                    selectedMove === move
                      ? 'bg-green-600/30 border-green-500 text-green-300 ring-2 ring-green-500/50'
                      : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-slate-500 active:scale-95'
                  } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {move}
                </button>
              ))}
            </div>
            <div className="text-[9px] text-slate-500 text-center mt-1">
              Tip: Say &quot;delta&quot; for d, &quot;bravo&quot; for b
            </div>
          </div>
        )}

        {/* Last move feedback - anchored bottom */}
        {lastMoveResult && (
          <div
            className={`text-center py-1.5 px-2 rounded mt-auto text-xs font-bold uppercase tracking-wide flex-shrink-0 ${lastMoveResult.isCorrect
              ? 'bg-green-900/40 text-green-400 border border-green-800'
              : 'bg-red-900/40 text-red-400 border border-red-800'
              }`}
          >
            {lastMoveResult.isCorrect ? (
              <>{'\u2713'} Correct!</>
            ) : (
              <>{'\u2717'} Missed: {lastMoveResult.expectedMove}</>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-1 p-1.5 bg-red-900/80 border border-red-500 rounded flex-shrink-0">
            <span className="text-red-100 font-bold text-center text-xs block">{error}</span>
          </div>
        )}
      </div>

      {/* Action buttons - right side, stacked vertically */}
      <div className="flex flex-col gap-2 flex-shrink-0 w-20">
        <button
          onClick={handleReset}
          disabled={isSubmitting || !isActive}
          className={`h-10 rounded-lg font-bold text-xs transition-colors uppercase tracking-wide ${isSubmitting || !isActive
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-500'
            }`}
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedMove || isSubmitting || !isActive}
          className={`relative flex-1 rounded-lg font-bold transition-all shadow-lg flex flex-col items-center justify-center ${isSubmitting
            ? 'bg-yellow-600 text-white cursor-wait animate-pulse'
            : selectedMove && isActive
              ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20 transform active:scale-95'
              : isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview)
                ? 'bg-blue-600/70 text-white/90 animate-pulse border border-blue-400'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
            }`}
        >
          {/* Listening indicator - red dot */}
          {(isListening || isGeminiRecording) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
          <span className="text-[10px] uppercase tracking-wider opacity-80">Submit</span>
          <span className="text-lg font-mono">
            {isSubmitting ? '...' : selectedMove ? selectedMove : isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview) ? parsedPreview : '—'}
          </span>
        </button>
      </div>

      {/* Debug overlay - controlled by sidebar button */}
      {DEBUG_AUDIO && showDebugPanel && onCloseDebugPanel && (
        <PracticeVoiceDebugOverlay
          volumeLevel={volumeLevel}
          silenceThreshold={silenceThreshold}
          isListening={isGeminiListening}
          isRecording={isGeminiRecording}
          isActive={isActive}
          voiceParsingMode={voiceParsingMode}
          onClose={onCloseDebugPanel}
        />
      )}
    </div>
  );
}
