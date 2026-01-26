'use client';

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGeminiVoice } from '@/hooks/useGeminiVoice';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';
import { Chess } from 'chess.js';
import { PracticeVoiceDebugOverlay } from './PracticeVoiceDebugOverlay';
import { PracticeVoiceStatus } from './PracticeVoiceStatus';

// Debug flag - disabled for production builds
const DEBUG_AUDIO = process.env.NODE_ENV !== 'production';

// Confidence threshold for local parsing (skip Haiku if above this)
// Lowered from 0.85 to 0.70 to skip AI for more moves (d/b files get 0.7 confidence)
const LOCAL_PARSE_CONFIDENCE_THRESHOLD = 0.70;

interface PracticeVoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
  onShowHistory?: () => void;
  moveCount?: number;
}

export function PracticeVoiceInput({ onMoveSubmit, disabled = false, onShowHistory, moveCount = 0 }: PracticeVoiceInputProps) {
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
    geminiTranscription,
    currentPosition,
  } = usePracticeStore();
  const { parseMoveWithAI, parseAudioMoveWithGemini } = usePracticeSocket();
  const isActive = status === 'playing' && !disabled;

  // Raw transcript from speech recognition
  const [rawTranscript, setRawTranscript] = useState<string>('');
  // Selected move (from AI result or alternatives)
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  const autoListenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Handle voice result - hook now passes parsed notation (e.g. "e4") directly
  // Block new requests while already parsing to prevent race conditions
  const handleVoiceResult = useCallback((parsedMove: string, confidence: number) => {
    if (!isSubmitting && !isAIParsing && isActive && sessionId && voiceParsingMode === 'webspeech-haiku') {
      // Clear previous state
      clearAIParseState();
      setSelectedMove(null);

      // Show parsed move immediately (hook already parsed it)
      setRawTranscript(parsedMove);

      // Always surface a local parse immediately so the UI feels responsive.
      // If confidence is low, we can still refine with Haiku in the background.
      usePracticeStore.getState().setAIParseResult({
        parsedMove,
        transcript: parsedMove,
        confidence,
        alternatives: [],
        reasoning: confidence >= LOCAL_PARSE_CONFIDENCE_THRESHOLD ? 'Parsed locally' : 'Local preview (refining...)',
      });

      if (confidence < LOCAL_PARSE_CONFIDENCE_THRESHOLD) {
        // Low confidence - call Haiku for refinement
        parseMoveWithAI(sessionId, parsedMove);
      }
    }
  }, [parseMoveWithAI, isSubmitting, isAIParsing, isActive, sessionId, clearAIParseState, voiceParsingMode]);

  // Handle audio ready from Gemini voice (Gemini mode)
  // Block new requests while already parsing to prevent race conditions
  const handleAudioReady = useCallback((audioBase64: string, mimeType: string) => {
    if (!isSubmitting && !isAIParsing && isActive && sessionId && voiceParsingMode === 'gemini-audio') {
      clearAIParseState();
      setRawTranscript('[Processing audio...]');
      setSelectedMove(null);
      parseAudioMoveWithGemini(sessionId, audioBase64, mimeType);
    }
  }, [parseAudioMoveWithGemini, isSubmitting, isAIParsing, isActive, sessionId, clearAIParseState, voiceParsingMode]);

  // Auto-select parsed move when AI result comes in (but not during submission)
  useEffect(() => {
    if (aiParseResult?.parsedMove && !isSubmitting) {
      setSelectedMove(aiParseResult.parsedMove);
      // Update transcript with Gemini's transcription if available
      if (geminiTranscription && voiceParsingMode === 'gemini-audio') {
        setRawTranscript(geminiTranscription);
      }
    }
  }, [aiParseResult, isSubmitting, geminiTranscription, voiceParsingMode]);

  // Web Speech API hook
  const { isSupported: isWebSpeechSupported, isListening: isWebSpeechListening, transcript, parsedPreview, error: webSpeechError, startListening: startWebSpeechListening, stopListening: stopWebSpeechListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: handleVoiceResult,
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
    setRawTranscript('');
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
      setRawTranscript('');
      setSelectedMove(null);
      clearAIParseState();
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
    setRawTranscript('');
    setSelectedMove(null);
    clearAIParseState();
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
    <div className="bg-slate-800 rounded-lg shadow-lg p-1.5 h-full flex flex-col overflow-hidden">
      {/* History + Status in single row */}
      <div className="flex items-center justify-between gap-1 mb-2 flex-shrink-0">
        {/* History button - mobile only */}
        {onShowHistory && (
          <button
            onClick={onShowHistory}
            className="lg:hidden py-1 px-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 text-xs font-medium"
          >
            ☰ History ({moveCount})
          </button>
        )}
        <PracticeVoiceStatus
          isRecording={isGeminiRecording}
          isListening={isListening}
          isAIParsing={isAIParsing}
          isActive={isActive}
          rawTranscript={rawTranscript}
        />
      </div>

      {/* Action buttons - NOW AT TOP for accessibility */}
      <div className="flex gap-2 mb-2 flex-shrink-0">
        <button
          onClick={handleReset}
          disabled={isSubmitting || !isActive}
          className={`flex-1 h-12 rounded-lg font-bold text-sm transition-colors uppercase tracking-wide ${isSubmitting || !isActive
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-500'
            }`}
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedMove || isSubmitting || !isActive}
          className={`flex-[2] h-12 rounded-lg font-bold text-lg transition-all shadow-lg ${isSubmitting
            ? 'bg-yellow-600 text-white cursor-wait animate-pulse'
            : selectedMove && isActive
              ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20 transform active:scale-95'
              : isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview)
                ? 'bg-blue-600/70 text-white/90 animate-pulse border border-blue-400'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
            }`}
        >
          {isSubmitting ? '...' : selectedMove ? `\u2713 SUBMIT ${selectedMove}` : isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview) ? `${parsedPreview}...` : 'Speak Move...'}
        </button>
      </div>

      {/* Transcript display - shows parsed move (e.g. "e4") */}
      {rawTranscript && (
        <div className="bg-slate-700/50 rounded p-1.5 mb-1 flex-shrink-0 text-center">
          <div className="text-white text-xs font-medium truncate">&ldquo;{rawTranscript}&rdquo;</div>
        </div>
      )}

      {/* AI Parsing result - flexible middle section */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 mb-1 overflow-hidden relative">
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
        ) : transcript ? (
          <div className="text-center">
            {voiceParsingMode === 'webspeech-haiku' && isWebSpeechListening && parsedPreview && isLegalMove(parsedPreview) ? (
              <>
                <div className="font-mono text-2xl text-slate-200">{parsedPreview}</div>
                <div className="font-mono text-xs text-slate-500 mt-1">{transcript}</div>
              </>
            ) : (
              <div className="font-mono text-lg text-slate-400">{transcript}</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-20">
            <div className="text-4xl mb-2">🎤</div>
          </div>
        )}
      </div>

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

      {/* Debug overlay - toggle DEBUG_AUDIO flag to enable */}
      {DEBUG_AUDIO && (
        <PracticeVoiceDebugOverlay
          volumeLevel={volumeLevel}
          silenceThreshold={silenceThreshold}
          isListening={isGeminiListening}
          isRecording={isGeminiRecording}
          isActive={isActive}
          voiceParsingMode={voiceParsingMode}
        />
      )}
    </div>
  );
}
