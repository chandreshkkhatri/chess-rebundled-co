'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGeminiVoice } from '@/hooks/useGeminiVoice';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';

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
  } = usePracticeStore();
  const { parseMoveWithAI, parseAudioMoveWithGemini } = usePracticeSocket();
  const isActive = status === 'playing' && !disabled;

  // Raw transcript from speech recognition
  const [rawTranscript, setRawTranscript] = useState<string>('');
  // Selected move (from AI result or alternatives)
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoListenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle raw voice result - show transcript and request AI parsing (Web Speech mode)
  // Speaking again automatically replaces the previous result (no reset needed)
  const handleVoiceResult = useCallback((transcript: string) => {
    if (!isSubmitting && isActive && sessionId && voiceParsingMode === 'webspeech-haiku') {
      // Clear previous state before setting new transcript
      clearAIParseState();
      setRawTranscript(transcript);
      setSelectedMove(null);
      // Request AI parsing - the store will be updated via socket
      parseMoveWithAI(sessionId, transcript);
    }
  }, [parseMoveWithAI, isSubmitting, isActive, sessionId, clearAIParseState, voiceParsingMode]);

  // Handle audio ready from Gemini voice (Gemini mode)
  const handleAudioReady = useCallback((audioBase64: string, mimeType: string) => {
    if (!isSubmitting && isActive && sessionId && voiceParsingMode === 'gemini-audio') {
      clearAIParseState();
      setRawTranscript('[Processing audio...]');
      setSelectedMove(null);
      parseAudioMoveWithGemini(sessionId, audioBase64, mimeType);
    }
  }, [parseAudioMoveWithGemini, isSubmitting, isActive, sessionId, clearAIParseState, voiceParsingMode]);

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
  const { isSupported: isWebSpeechSupported, isListening: isWebSpeechListening, transcript, error: webSpeechError, startListening: startWebSpeechListening, stopListening: stopWebSpeechListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: handleVoiceResult,
    });

  // Gemini Voice hook
  const { isSupported: isGeminiSupported, isListening: isGeminiListening, isRecording: isGeminiRecording, error: geminiError, startListening: startGeminiListening, stopListening: stopGeminiListening } =
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
    <div className="bg-slate-800 rounded-lg shadow-lg p-1.5 h-full flex flex-col overflow-hidden">
      {/* History + Status in single row */}
      <div className="flex items-center justify-between gap-1 mb-1 flex-shrink-0">
        {/* History button - mobile only */}
        {onShowHistory && (
          <button
            onClick={onShowHistory}
            className="lg:hidden py-0.5 px-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 text-xs"
          >
            ☰ {moveCount}
          </button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <div
            className={`w-2 h-2 rounded-full ${
              isGeminiRecording
                ? 'bg-red-600 animate-pulse'
                : isListening
                ? 'bg-red-500 animate-pulse'
                : isAIParsing
                ? 'bg-yellow-500 animate-pulse'
                : isActive
                ? 'bg-green-400'
                : 'bg-slate-600'
            }`}
          />
          <span className={`text-xs ${isGeminiRecording ? 'text-red-400' : isListening ? 'text-red-400' : isAIParsing ? 'text-yellow-400' : 'text-slate-400'}`}>
            {isGeminiRecording ? 'Recording' : isListening ? 'Listening' : isAIParsing ? 'Parsing' : rawTranscript ? 'Ready' : isActive ? 'Ready' : 'Waiting'}
          </span>
        </div>
      </div>

      {/* Raw transcript display - compact */}
      {rawTranscript && (
        <div className="bg-slate-700 rounded p-1.5 mb-1 flex-shrink-0">
          <div className="text-white text-xs font-medium truncate">&ldquo;{rawTranscript}&rdquo;</div>
        </div>
      )}

      {/* AI Parsing result - flexible middle section */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 mb-1 overflow-hidden">
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
              className={`font-mono text-lg md:text-xl font-bold cursor-pointer py-1 px-2 rounded-lg transition-colors ${
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
            {/* Alternatives - compact */}
            {aiParseResult.alternatives && aiParseResult.alternatives.length > 0 && (
              <div className="mt-1 flex justify-center gap-1 flex-wrap">
                {aiParseResult.alternatives.map((alt) => (
                  <button
                    key={alt}
                    onClick={() => handleSelectAlternative(alt)}
                    className={`px-2 py-0.5 rounded font-mono text-xs transition-colors ${
                      selectedMove === alt
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {alt}
                  </button>
                ))}
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

      {/* Last move feedback - compact */}
      {lastMoveResult && (
        <div
          className={`text-center py-0.5 px-1 rounded mb-1 text-xs font-medium flex-shrink-0 ${
            lastMoveResult.isCorrect
              ? 'bg-green-900/50 text-green-300'
              : 'bg-red-900/50 text-red-300'
          }`}
        >
          {lastMoveResult.isCorrect ? (
            <>{'\u2713'} Correct!</>
          ) : (
            <>{'\u2717'} {lastMoveResult.expectedMove}</>
          )}
        </div>
      )}

      {/* Action buttons - pinned to bottom */}
      <div className="flex gap-1.5 mt-auto flex-shrink-0">
        <button
          onClick={handleReset}
          disabled={isSubmitting || !isActive}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium text-xs transition-colors ${
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
          className={`flex-[2] py-1.5 px-2 rounded-lg font-bold text-sm transition-colors ${
            isSubmitting
              ? 'bg-yellow-500 text-white cursor-wait animate-pulse'
              : selectedMove && isActive
              ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '...' : `${'\u2713'} ${selectedMove || 'OK'}`}
        </button>
      </div>

      {/* Error display - compact */}
      {error && (
        <div className="mt-1 p-1.5 bg-red-900/80 border border-red-500 rounded flex-shrink-0">
          <span className="text-red-100 font-bold text-center text-xs block">{error}</span>
        </div>
      )}
    </div>
  );
}
