'use client';

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGeminiVoice } from '@/hooks/useGeminiVoice';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { Chess } from 'chess.js';
import { PracticeVoiceDebugOverlay } from './PracticeVoiceDebugOverlay';
import {
  StageState,
  initialStageState,
  getAvailablePieces,
  getDisambiguationOptions,
  getDestinationOptionsWithDistractors,
  getLegalDestinations,
  getMovesForPieceAndDestination,
  getPromotionOptions,
  buildMoveFromSelection,
  isLegalDestination,
  getStageLabel,
  getSelectionBreadcrumb,
} from '@/lib/moveStageParser';

// Debug flag - disabled for production builds
const DEBUG_AUDIO = process.env.NODE_ENV !== 'production';

// Pawn icon SVG component
function PawnIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a3 3 0 0 0-3 3c0 1.1.6 2.1 1.5 2.6-.3.3-.5.7-.5 1.2 0 .6.3 1.1.7 1.4L9 14H7v2h2l-1 4H6v2h12v-2h-2l-1-4h2v-2h-2l-1.7-3.8c.4-.3.7-.8.7-1.4 0-.5-.2-.9-.5-1.2.9-.5 1.5-1.5 1.5-2.6a3 3 0 0 0-3-3z"/>
    </svg>
  );
}

// Check if option is the pawn piece indicator
function isPawnPiece(option: string): boolean {
  return option === 'P';
}

// Get aria-label for piece buttons
function getPieceAriaLabel(option: string): string {
  const pieceNames: Record<string, string> = {
    'K': 'King',
    'Q': 'Queen',
    'R': 'Rook',
    'B': 'Bishop',
    'N': 'Knight',
    'P': 'Pawn',
    'O': 'Castling',
  };
  return pieceNames[option] || option;
}

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
  const tapGridEnabled = true; // Always enabled (voice-tap or tap-only)
  const { parseMoveWithAI, parseAudioMoveWithGemini } = usePracticeSocket();
  const isActive = status === 'playing' && !disabled;

  // Selected move (from AI result or alternatives)
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  // Stage state for two-stage selection
  const [stageState, setStageState] = useState<StageState>(initialStageState);

  // Track wrong tap for feedback animation
  const [wrongTap, setWrongTap] = useState<string | null>(null);

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

  // Get options based on current stage
  const stageOptions = useMemo(() => {
    if (!legalMoves.length) return [];

    switch (stageState.stage) {
      case 'piece':
        return getAvailablePieces(legalMoves);
      case 'disambiguation':
        // Disambiguation now happens AFTER destination selection
        if (!stageState.selectedPiece || !stageState.selectedDestination) return [];
        return getDisambiguationOptions(
          legalMoves,
          stageState.selectedPiece,
          stageState.selectedDestination
        ) || [];
      case 'destination': {
        // For pawns, use the pawn file; for other pieces, use selectedPiece
        const pieceOrFile = stageState.selectedPawnFile || stageState.selectedPiece;
        if (!pieceOrFile) return [];
        return getDestinationOptionsWithDistractors(
          legalMoves,
          pieceOrFile,
          null // Don't filter by disambiguation - show all destinations
        );
      }
      case 'promotion':
        return getPromotionOptions();
      default:
        return [];
    }
  }, [legalMoves, stageState]);

  // Handle piece selection (stage 1)
  const handlePieceSelect = useCallback((piece: string) => {
    if (isSubmitting || !isActive) return;

    // If pawn selected, go directly to destination stage with full pawn moves
    if (piece === 'P') {
      const pawnMoves = getLegalDestinations(legalMoves, 'P');
      // If only one pawn move, auto-select it
      if (pawnMoves.length === 1) {
        // Find the actual legal move (may have +/# suffix)
        const fullMove = legalMoves.find(m => m.replace(/[+#]/g, '') === pawnMoves[0]) || pawnMoves[0];
        clearLastMoveResult();
        setSelectedMove(fullMove);
        onMoveSubmit(fullMove, 1.0);
        return;
      }
      setStageState({
        stage: 'destination',
        selectedPiece: 'P',
        selectedPawnFile: null,
        selectedDisambiguation: null,
        selectedDestination: null,
      });
      return;
    }

    // For all other pieces, go directly to destination stage
    // Disambiguation (if needed) will be handled AFTER destination selection
    const destinations = getLegalDestinations(legalMoves, piece);

    // If only one destination (e.g., single castling option), auto-select
    if (piece === 'O' && destinations.length === 1) {
      clearLastMoveResult();
      setSelectedMove(destinations[0]);
      onMoveSubmit(destinations[0], 1.0);
      return;
    }

    setStageState({
      stage: 'destination',
      selectedPiece: piece,
      selectedPawnFile: null,
      selectedDisambiguation: null,
      selectedDestination: null,
    });
  }, [isSubmitting, isActive, legalMoves, clearLastMoveResult, onMoveSubmit]);

  // Handle disambiguation selection (after destination is already selected)
  const handleDisambiguationSelect = useCallback((disambig: string) => {
    if (isSubmitting || !isActive || !stageState.selectedPiece) return;

    // Destination should already be selected when we get here
    if (stageState.selectedDestination) {
      // Build and submit the move with disambiguation
      const newState = {
        ...stageState,
        selectedDisambiguation: disambig,
      };
      const move = buildMoveFromSelection(newState, legalMoves);
      if (move) {
        clearLastMoveResult();
        setSelectedMove(move);
        onMoveSubmit(move, 1.0);
      }
    }
  }, [isSubmitting, isActive, stageState, legalMoves, clearLastMoveResult, onMoveSubmit]);

  // Handle destination selection (stage 2)
  const handleDestinationSelect = useCallback((destination: string) => {
    if (isSubmitting || !isActive || !stageState.selectedPiece) return;

    // For pawns, destination is already a full SAN (e.g., "e4", "exd5", "e8=Q")
    if (stageState.selectedPiece === 'P') {
      // Check if this is a legal pawn move
      const isLegal = isLegalDestination(legalMoves, 'P', destination, null);
      if (!isLegal) return;

      // Find the actual legal move (may have +/# suffix)
      const fullMove = legalMoves.find(m => m.replace(/[+#]/g, '') === destination) || destination;
      clearLastMoveResult();
      setSelectedMove(fullMove);
      onMoveSubmit(fullMove, 1.0);
      return;
    }

    // For other pieces, check if destination is legal (not a distractor)
    const isLegal = isLegalDestination(
      legalMoves,
      stageState.selectedPiece,
      destination,
      null // Don't filter by disambiguation yet
    );

    if (!isLegal) {
      // Distractor selected - show feedback animation
      setWrongTap(destination);
      setTimeout(() => setWrongTap(null), 300);
      return;
    }

    // Check how many moves can reach this destination
    const matchingMoves = getMovesForPieceAndDestination(
      legalMoves,
      stageState.selectedPiece,
      destination
    );

    if (matchingMoves.length > 1) {
      // Multiple pieces can reach this square - need disambiguation
      const disambigOptions = getDisambiguationOptions(
        legalMoves,
        stageState.selectedPiece,
        destination
      );

      if (disambigOptions && disambigOptions.length > 1) {
        // Go to disambiguation stage with destination already selected
        setStageState(prev => ({
          ...prev,
          stage: 'disambiguation' as const,
          selectedDestination: destination,
        }));
        return;
      }
    }

    // Single move matches - submit it directly
    if (matchingMoves.length === 1) {
      clearLastMoveResult();
      setSelectedMove(matchingMoves[0]);
      onMoveSubmit(matchingMoves[0], 1.0);
      return;
    }

    // Fallback: build move from selection state
    const newState = {
      ...stageState,
      selectedDestination: destination,
    };
    const move = buildMoveFromSelection(newState, legalMoves);
    if (move) {
      clearLastMoveResult();
      setSelectedMove(move);
      onMoveSubmit(move, 1.0);
    }
  }, [isSubmitting, isActive, stageState, legalMoves, clearLastMoveResult, onMoveSubmit]);

  // Handle promotion selection (stage 3)
  const handlePromotionSelect = useCallback((promotion: string) => {
    if (isSubmitting || !isActive || !stageState.selectedDestination) return;

    const move = buildMoveFromSelection(stageState, legalMoves, promotion);
    if (move) {
      clearLastMoveResult();
      setSelectedMove(move);
      onMoveSubmit(move, 1.0);
    }
  }, [isSubmitting, isActive, stageState, legalMoves, clearLastMoveResult, onMoveSubmit]);

  // Handle stage option selection (unified handler)
  const handleStageOptionSelect = useCallback((option: string) => {
    switch (stageState.stage) {
      case 'piece':
        handlePieceSelect(option);
        break;
      case 'disambiguation':
        handleDisambiguationSelect(option);
        break;
      case 'destination':
        handleDestinationSelect(option);
        break;
      case 'promotion':
        handlePromotionSelect(option);
        break;
    }
  }, [stageState.stage, handlePieceSelect, handleDisambiguationSelect, handleDestinationSelect, handlePromotionSelect]);

  // Handle going back one stage
  const handleStageBack = useCallback(() => {
    setStageState(prev => {
      switch (prev.stage) {
        case 'promotion':
          return { ...prev, stage: 'destination' as const, selectedDestination: null };
        case 'disambiguation':
          // Go back to destination selection (disambiguation now comes AFTER destination)
          return {
            ...prev,
            stage: 'destination' as const,
            selectedDestination: null,
            selectedDisambiguation: null,
          };
        case 'destination':
          return { ...initialStageState };
        default:
          return prev;
      }
    });
  }, []);

  // Reset stages
  const resetStages = useCallback(() => {
    setStageState(initialStageState);
  }, []);

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
      resetStages();
      lastProcessedRef.current = null;
      // Cancel any pending auto-submit since submission completed
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
        autoSubmitTimeoutRef.current = null;
      }
    }
  }, [lastMoveResult, clearAIParseState, resetStages]);

  // Reset stages when position changes (new move to guess)
  useEffect(() => {
    resetStages();
  }, [currentExpectedMove, resetStages]);

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
    resetStages();
    lastProcessedRef.current = null;
    if (autoListenTimeoutRef.current) {
      clearTimeout(autoListenTimeoutRef.current);
      autoListenTimeoutRef.current = null;
    }
    if (voiceEnabled && !isListening && isActive) {
      startListening();
    }
  }, [voiceEnabled, startListening, isListening, isActive, clearAIParseState, resetStages]);


  // Only show voice-not-supported warning when voice mode is enabled but not supported
  // If user chose tap-only or text-only mode, they don't need voice support
  if (voiceEnabled && !isSupported) {
    return (
      <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-2">
        <div className="text-yellow-200 text-xs">
          Voice recognition not supported in this browser. Use Chrome for voice input, or change to &quot;Tap Only&quot; mode in Settings.
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

        {/* ZONE 2: Staged Selection Grid (flex-1) - Always reserves space */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${tapGridEnabled && isActive ? '' : 'invisible'}`}>
          <div className="w-full">
            {/* Stage header with back button */}
            <div className="flex items-center justify-between mb-1">
              {stageState.stage !== 'piece' ? (
                <button
                  onClick={handleStageBack}
                  className="text-slate-400 hover:text-white text-xs flex items-center gap-0.5 px-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              ) : (
                <div className="w-12" />
              )}
              <div className="text-[10px] text-slate-500 uppercase tracking-wider text-center flex-1">
                {getStageLabel(stageState, voiceEnabled)}
              </div>
              <div className="w-12" />
            </div>

            {/* Selection breadcrumb */}
            {stageState.selectedPiece && (
              <div className="text-xs text-slate-400 text-center mb-1 font-mono">
                {getSelectionBreadcrumb(stageState)}
              </div>
            )}

            {/* Options grid */}
            <div className="grid grid-cols-3 min-[400px]:grid-cols-4 sm:grid-cols-5 gap-1">
              {(stageOptions.length > 0 ? stageOptions : Array(10).fill('—')).map((option, idx) => {
                return (
                  <button
                    key={stageOptions.length > 0 ? `${stageState.stage}-${option}` : idx}
                    onClick={() => option !== '—' && handleStageOptionSelect(option)}
                    disabled={isSubmitting || option === '—'}
                    aria-label={stageState.stage === 'piece' ? getPieceAriaLabel(option) : option}
                    className={`py-2 px-0.5 rounded font-mono transition-all border min-h-[44px] flex flex-col items-center justify-center ${
                      option.length > 4 ? 'text-xs' : option.length > 3 ? 'text-[13px]' : 'text-sm'
                    } ${
                      wrongTap === option
                        ? 'bg-red-700/50 border-red-500 text-red-200 animate-shake'
                        : option === '—'
                          ? 'bg-slate-800/30 border-slate-700 text-slate-600 cursor-default'
                          : stageState.stage === 'piece'
                            ? 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-slate-500 active:scale-95'
                            : stageState.stage === 'promotion'
                              ? 'bg-purple-700/50 border-purple-600 text-purple-200 hover:bg-purple-600 hover:border-purple-500 active:scale-95'
                              : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-slate-500 active:scale-95'
                    } ${isSubmitting && option !== '—' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {stageState.stage === 'piece' && isPawnPiece(option) ? (
                      <PawnIcon className="w-6 h-6" />
                    ) : (
                      option
                    )}
                  </button>
                );
              })}
            </div>

            {/* Voice tip - only show on piece stage */}
            {voiceEnabled && stageState.stage === 'piece' && (
              <div className="text-[9px] text-slate-500 text-center mt-1">
                Tip: Say &quot;delta&quot; for d, &quot;bravo&quot; for b
              </div>
            )}
          </div>
        </div>

        {/* ZONE 3: Feedback (h-8) - Fixed height */}
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
