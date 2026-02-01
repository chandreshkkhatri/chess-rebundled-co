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

// Convert technical error messages to user-friendly text
function getFriendlyErrorMessage(error: string): string {
  const lowerError = error.toLowerCase();
  if (lowerError.includes('not_found') || lowerError.includes('not found')) {
    return 'Voice processing is temporarily unavailable. Please try again.';
  }
  if (lowerError.includes('quota') || lowerError.includes('rate limit') || lowerError.includes('too many')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lowerError.includes('network') || lowerError.includes('connection')) {
    return 'Network error. Please check your connection.';
  }
  if (lowerError.includes('audio') && lowerError.includes('format')) {
    return 'Audio format not supported. Please try again.';
  }
  if (lowerError.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  return 'Unable to process voice input. Please try again or type your move.';
}

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
    clearLastMoveResult,
    voiceParsingMode,
    currentPosition,
    currentExpectedMove,
    autoSubmitEnabled,
    inputMode,
    pendingOpponentMove,
  } = usePracticeStore();

  // Determine which features are enabled based on input mode
  const voiceEnabled = inputMode === 'voice-tap';
  const tapGridEnabled = inputMode === 'voice-tap' || inputMode === 'tap-only';
  const textOnlyMode = inputMode === 'text-only';
  const { parseMoveWithAI, parseAudioMoveWithGemini } = usePracticeSocket();
  const isActive = status === 'playing' && !disabled;

  // Selected move (from AI result or alternatives)
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  // Text input fallback state
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  const autoListenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Handle selecting a move option (from tap) - directly submits for single-click UX
  const handleSelectOption = useCallback((move: string) => {
    if (!isSubmitting && isActive) {
      clearLastMoveResult(); // Clear stale feedback from previous move
      setSelectedMove(move);
      // Directly submit - no need for two clicks
      onMoveSubmit(move, 1.0); // Tapped selections have 100% confidence
    }
  }, [isSubmitting, isActive, clearLastMoveResult, onMoveSubmit]);

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
      clearLastMoveResult(); // Clear stale feedback from previous move
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

      // Auto-submit for high confidence legal moves (if enabled)
      if (autoSubmitEnabled && confidence >= AUTO_SUBMIT_CONFIDENCE_THRESHOLD && isLegalMove(parsedMove)) {
        setSelectedMove(parsedMove);
        // Cancel any pending auto-submit to prevent race conditions
        if (autoSubmitTimeoutRef.current) {
          clearTimeout(autoSubmitTimeoutRef.current);
        }
        // Small delay to show the selection visually before submitting
        autoSubmitTimeoutRef.current = setTimeout(() => {
          autoSubmitTimeoutRef.current = null;
          onMoveSubmit(parsedMove, confidence);
        }, 150);
        return;
      }

      if (confidence < LOCAL_PARSE_CONFIDENCE_THRESHOLD) {
        // Low confidence - call Haiku for refinement
        parseMoveWithAI(sessionId, parsedMove);
      }
    }
  }, [parseMoveWithAI, isSubmitting, isAIParsing, isActive, sessionId, clearAIParseState, clearLastMoveResult, voiceParsingMode, selectedMove, isLegalMove, onMoveSubmit, autoSubmitEnabled]);

  // Handle audio ready from Gemini voice (Gemini mode)
  // Block new requests while already parsing to prevent race conditions
  const handleAudioReady = useCallback((audioBase64: string, mimeType: string) => {
    if (!isSubmitting && !isAIParsing && isActive && sessionId && voiceParsingMode === 'gemini-audio') {
      clearAIParseState();
      clearLastMoveResult(); // Clear stale feedback from previous move
      setSelectedMove(null);
      parseAudioMoveWithGemini(sessionId, audioBase64, mimeType);
    }
  }, [parseAudioMoveWithGemini, isSubmitting, isAIParsing, isActive, sessionId, clearAIParseState, clearLastMoveResult, voiceParsingMode]);

  // Auto-select parsed move when AI result comes in (but not during submission)
  // Also auto-submit for high confidence results (covers Gemini mode and Haiku refinements)
  useEffect(() => {
    if (aiParseResult?.parsedMove && !isSubmitting && isActive) {
      setSelectedMove(aiParseResult.parsedMove);

      // Auto-submit for high confidence legal moves from AI parsing (if enabled)
      if (
        autoSubmitEnabled &&
        aiParseResult.confidence >= AUTO_SUBMIT_CONFIDENCE_THRESHOLD &&
        isLegalMove(aiParseResult.parsedMove)
      ) {
        // Cancel any pending auto-submit to prevent race conditions
        if (autoSubmitTimeoutRef.current) {
          clearTimeout(autoSubmitTimeoutRef.current);
        }
        // Small delay to show the selection visually before submitting
        autoSubmitTimeoutRef.current = setTimeout(() => {
          autoSubmitTimeoutRef.current = null;
          onMoveSubmit(aiParseResult.parsedMove, aiParseResult.confidence);
        }, 150);
        return () => {
          if (autoSubmitTimeoutRef.current) {
            clearTimeout(autoSubmitTimeoutRef.current);
            autoSubmitTimeoutRef.current = null;
          }
        };
      }
    }
  }, [aiParseResult, isSubmitting, isActive, isLegalMove, onMoveSubmit, autoSubmitEnabled]);

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

  // Auto-start listening when active and not submitting/parsing (only in voice mode)
  // Keeps listening even when there's a transcript, so speaking again replaces the previous result
  useEffect(() => {
    if (voiceEnabled && isActive && !isListening && !isSubmitting && !isAIParsing) {
      // Start listening immediately (removed 50ms delay for faster response)
      startListening();
    }
  }, [voiceEnabled, isActive, isListening, isSubmitting, isAIParsing, startListening]);

  // Stop listening when input mode changes away from voice
  useEffect(() => {
    if (!voiceEnabled && isListening) {
      stopListening();
    }
  }, [voiceEnabled, isListening, stopListening]);

  // In text-only mode, auto-show text input
  useEffect(() => {
    if (textOnlyMode && isActive) {
      setShowTextInput(true);
    }
  }, [textOnlyMode, isActive]);

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
      setTextInput('');
      setShowTextInput(false);
      clearAIParseState();
      lastProcessedRef.current = null;
      // Cancel any pending auto-submit since submission completed
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
        autoSubmitTimeoutRef.current = null;
      }
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
    setTextInput('');
    clearAIParseState();
    lastProcessedRef.current = null;
    if (autoListenTimeoutRef.current) {
      clearTimeout(autoListenTimeoutRef.current);
      autoListenTimeoutRef.current = null;
    }
    if (voiceEnabled && !isListening && isActive) {
      startListening();
    }
  }, [voiceEnabled, startListening, isListening, isActive, clearAIParseState]);


  // Handle text input submission
  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim() || !isActive || isSubmitting) return;

    const input = textInput.trim();
    clearLastMoveResult(); // Clear stale feedback from previous move

    // First check for exact match (case-insensitive)
    const exactMatch = legalMoves.find(
      m => m.toLowerCase() === input.toLowerCase() ||
           m.replace(/[+#]/g, '').toLowerCase() === input.toLowerCase()
    );

    if (exactMatch) {
      setTextInput('');
      setSelectedMove(exactMatch);
      onMoveSubmit(exactMatch, 1.0);
      return;
    }

    // Try fuzzy matching - find moves that start with input or contain it
    const partialMatches = legalMoves.filter(m =>
      m.toLowerCase().startsWith(input.toLowerCase()) ||
      m.replace(/[+#]/g, '').toLowerCase().startsWith(input.toLowerCase())
    );

    if (partialMatches.length === 1) {
      setTextInput('');
      setSelectedMove(partialMatches[0]);
      onMoveSubmit(partialMatches[0], 0.95);
      return;
    }

    // If we have multiple matches, select the first one but don't auto-submit
    if (partialMatches.length > 1) {
      setSelectedMove(partialMatches[0]);
      setTextInput('');
    }
  }, [textInput, isActive, isSubmitting, legalMoves, clearLastMoveResult, onMoveSubmit]);

  // Handle text input key down
  const handleTextKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTextSubmit();
    } else if (e.key === 'Escape') {
      setShowTextInput(false);
      setTextInput('');
    }
  }, [handleTextSubmit]);

  // Get text input suggestions based on current input
  const textSuggestions = useMemo(() => {
    if (!textInput.trim() || !legalMoves.length) return [];
    const input = textInput.trim().toLowerCase();
    return legalMoves
      .filter(m =>
        m.toLowerCase().startsWith(input) ||
        m.replace(/[+#]/g, '').toLowerCase().startsWith(input)
      )
      .slice(0, 5);
  }, [textInput, legalMoves]);

  // Only show voice-not-supported warning when voice mode is enabled but not supported
  // If user chose tap-only or text-only mode, they don't need voice support
  if (voiceEnabled && !isSupported) {
    return (
      <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-2">
        <div className="text-yellow-200 text-xs">
          Voice recognition not supported in this browser. Use Chrome for voice input, or change to &quot;Tap Only&quot; or &quot;Text Only&quot; mode in Settings.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg p-1.5 h-full flex flex-row gap-2 overflow-hidden">
      {/* Main content area - left side with fixed zones */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* ZONE 1: Status Bar (h-8) - Processing/Error/Confidence/Opponent Move */}
        <div className="h-8 flex-shrink-0 flex items-center justify-center">
          {disabled && pendingOpponentMove ? (
            <div className="text-amber-200 text-xs font-medium">
              Opponent played: <span className="font-mono">{pendingOpponentMove.san}</span>
            </div>
          ) : isAIParsing ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
              <span className="text-yellow-400 text-xs font-mono uppercase tracking-widest">Processing</span>
            </div>
          ) : aiParseError ? (
            <div className="text-red-400 text-xs text-center truncate px-2">{getFriendlyErrorMessage(aiParseError)}</div>
          ) : aiParseResult && aiParseResult.confidence < 1 ? (
            <div className="text-xs text-slate-500 truncate px-2">
              {(aiParseResult.confidence * 100).toFixed(0)}% confident
              {aiParseResult.reasoning && ` • ${aiParseResult.reasoning}`}
            </div>
          ) : error ? (
            <div className="text-red-400 text-xs text-center truncate px-2">{error}</div>
          ) : voiceEnabled && isListening ? (
            <span className="text-slate-400 text-xs">Listening...</span>
          ) : null}
        </div>

        {/* ZONE 2: Tap Grid (flex-1) - Always reserves space */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${tapGridEnabled && isActive ? '' : 'invisible'}`}>
          <div className="w-full">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 text-center">
              {voiceEnabled ? 'Tap or speak a move' : 'Tap a move'}
            </div>
            <div className="grid grid-cols-3 min-[400px]:grid-cols-4 sm:grid-cols-5 gap-1">
              {(moveOptions.length > 0 ? moveOptions : Array(10).fill('—')).map((move, idx) => (
                <button
                  key={moveOptions.length > 0 ? move : idx}
                  onClick={() => move !== '—' && handleSelectOption(move)}
                  disabled={isSubmitting || move === '—'}
                  className={`py-2 px-0.5 rounded font-mono transition-all border min-h-[44px] ${
                    move.length > 4 ? 'text-xs' : move.length > 3 ? 'text-[13px]' : 'text-sm'
                  } ${
                    move === '—'
                      ? 'bg-slate-800/30 border-slate-700 text-slate-600 cursor-default'
                      : selectedMove === move
                        ? 'bg-green-600/30 border-green-500 text-green-300 ring-2 ring-green-500/50'
                        : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-slate-500 active:scale-95'
                  } ${isSubmitting && move !== '—' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {move}
                </button>
              ))}
            </div>
            {voiceEnabled && (
              <div className="text-[9px] text-slate-500 text-center mt-1">
                Tip: Say &quot;delta&quot; for d, &quot;bravo&quot; for b
              </div>
            )}
          </div>
        </div>

        {/* ZONE 3: Text Input (h-12) - Fixed height */}
        <div className="h-12 flex-shrink-0 flex items-center">
          {isActive ? (
            (showTextInput || textOnlyMode) ? (
              <div className="relative w-full">
                <input
                  ref={textInputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleTextKeyDown}
                  placeholder={textOnlyMode ? 'Type your move (e.g., e4, Nf3)' : 'Type move (e.g., e4, Nf3)'}
                  disabled={isSubmitting}
                  autoFocus={!textOnlyMode || !selectedMove}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                />
                {/* Suggestions dropdown */}
                {textSuggestions.length > 0 && textInput.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg overflow-hidden">
                    {textSuggestions.map((move) => (
                      <button
                        key={move}
                        onClick={() => {
                          setTextInput('');
                          setSelectedMove(move);
                          onMoveSubmit(move, 1.0);
                        }}
                        className="w-full px-3 py-2 text-left text-white font-mono text-sm hover:bg-slate-600 transition-colors"
                      >
                        {move}
                      </button>
                    ))}
                  </div>
                )}
                {/* Close button - only show when text input is optional */}
                {!textOnlyMode && (
                  <button
                    onClick={() => {
                      setShowTextInput(false);
                      setTextInput('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    aria-label="Close text input"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowTextInput(true);
                  setTimeout(() => textInputRef.current?.focus(), 0);
                }}
                className="w-full py-2 text-slate-400 hover:text-slate-300 text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Type move instead
              </button>
            )
          ) : (
            <div className="invisible w-full h-full" />
          )}
        </div>

        {/* ZONE 4: Feedback (h-8) - Fixed height */}
        <div className="h-8 flex-shrink-0 flex items-center justify-center">
          {lastMoveResult ? (
            <div
              className={`w-full text-center py-1 px-2 rounded text-xs font-bold uppercase tracking-wide ${lastMoveResult.isCorrect
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
          ) : (
            <div className="invisible w-full h-full" />
          )}
        </div>
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
              : voiceEnabled && isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview)
                ? 'bg-blue-600/70 text-white/90 animate-pulse border border-blue-400'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
            }`}
        >
          {/* Listening indicator - red dot (only in voice mode) */}
          {voiceEnabled && (isListening || isGeminiRecording) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
          <span className="text-[10px] uppercase tracking-wider opacity-80">Submit</span>
          <span className="text-lg font-mono">
            {isSubmitting ? '...' : selectedMove ? selectedMove : (voiceEnabled && isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview)) ? parsedPreview : '—'}
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
