'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useGeminiVoice } from '@/hooks/useGeminiVoice';
import { usePracticeStore } from '@/stores/practiceStore';
import { usePracticeSocket } from '@/hooks/usePracticeSocket';

// Debug flag - disabled for production builds
const DEBUG_AUDIO = process.env.NODE_ENV !== 'production';

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

  const autoListenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startGeminiListeningRef = useRef<(() => Promise<void>) | null>(null);

  // Handle raw voice result - show transcript and request AI parsing (Web Speech mode)
  // Block new requests while already parsing to prevent race conditions
  const handleVoiceResult = useCallback((transcript: string) => {
    if (!isSubmitting && !isAIParsing && isActive && sessionId && voiceParsingMode === 'webspeech-haiku') {
      // Clear previous state before setting new transcript
      clearAIParseState();
      setRawTranscript(transcript);
      setSelectedMove(null);
      // Request AI parsing - the store will be updated via socket
      parseMoveWithAI(sessionId, transcript);
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
      // Restart listening immediately for parallel processing
      setTimeout(() => {
        if (startGeminiListeningRef.current) {
          startGeminiListeningRef.current();
        }
      }, 50);
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
  const { isSupported: isWebSpeechSupported, isListening: isWebSpeechListening, transcript, error: webSpeechError, startListening: startWebSpeechListening, stopListening: stopWebSpeechListening } =
    useVoiceRecognition({
      continuous: true,
      onResult: handleVoiceResult,
    });

  // Gemini Voice hook
  const { isSupported: isGeminiSupported, isListening: isGeminiListening, isRecording: isGeminiRecording, error: geminiError, startListening: startGeminiListening, stopListening: stopGeminiListening, volumeLevel, silenceThreshold } =
    useGeminiVoice({
      onAudioReady: handleAudioReady,
    });

  // Keep ref updated for handleAudioReady callback
  useEffect(() => {
    startGeminiListeningRef.current = startGeminiListening;
  }, [startGeminiListening]);

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
      }, 100);
      return () => {
        if (autoListenTimeoutRef.current) {
          clearTimeout(autoListenTimeoutRef.current);
          autoListenTimeoutRef.current = null;
        }
      };
    }
  }, [isActive, isListening, isSubmitting, isAIParsing, startListening]);

  // Stop listening when submitting (but allow listening during parsing for parallel processing)
  useEffect(() => {
    if (isSubmitting && isListening) {
      stopListening();
    }
  }, [isSubmitting, isListening, stopListening]);

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
        <div className="flex items-center gap-1.5 ml-auto bg-slate-900/50 py-1 px-2 rounded-full">
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
          <span className={`text-xs font-medium ${isGeminiRecording ? 'text-red-400' : isListening ? 'text-red-400' : isAIParsing ? 'text-yellow-400' : 'text-slate-400'}`}>
            {isGeminiRecording ? 'Recording' : isListening ? 'Listening' : isAIParsing ? 'Parsing' : rawTranscript ? 'Ready' : isActive ? 'Ready' : 'Waiting'}
          </span>
        </div>
      </div>

      {/* Action buttons - NOW AT TOP for accessibility */}
      <div className="flex gap-2 mb-2 flex-shrink-0">
        <button
          onClick={handleReset}
          disabled={isSubmitting || !isActive}
          className={`flex-1 h-12 rounded-lg font-bold text-sm transition-colors uppercase tracking-wide ${
            isSubmitting || !isActive
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-500'
          }`}
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedMove || isSubmitting || !isActive}
          className={`flex-[2] h-12 rounded-lg font-bold text-lg transition-all shadow-lg ${
            isSubmitting
              ? 'bg-yellow-600 text-white cursor-wait animate-pulse'
              : selectedMove && isActive
              ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20 transform active:scale-95'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
          }`}
        >
          {isSubmitting ? '...' : selectedMove ? `\u2713 SUBMIT ${selectedMove}` : 'Speak Move...'}
        </button>
      </div>

      {/* Raw transcript display - compact */}
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
                      className={`px-3 py-1.5 rounded font-mono text-sm transition-colors border ${
                        selectedMove === alt
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
          <div className="text-center opacity-50">
            <div className="font-mono text-sm text-slate-400">Listening...</div>
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
          className={`text-center py-1.5 px-2 rounded mt-auto text-xs font-bold uppercase tracking-wide flex-shrink-0 ${
            lastMoveResult.isCorrect
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
        <div className="fixed bottom-4 right-4 bg-black/90 text-white p-3 rounded-lg font-mono text-xs z-50 min-w-[200px] border border-green-500/50">
          <div className="text-green-400 font-bold mb-2">🎤 Audio Debug</div>

          {/* Volume bar */}
          <div className="mb-2">
            <div className="flex justify-between mb-1">
              <span>Volume:</span>
              <span>{(volumeLevel * 100).toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-slate-700 rounded overflow-hidden relative">
              {/* Threshold marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10"
                style={{ left: `${silenceThreshold * 100}%` }}
              />
              {/* Volume level */}
              <div
                className={`h-full transition-all duration-75 ${
                  volumeLevel > silenceThreshold ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(volumeLevel * 100, 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Threshold: {(silenceThreshold * 100).toFixed(1)}% (yellow line)
            </div>
          </div>

          {/* States */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Listening:</span>
              <span className={isGeminiListening ? 'text-green-400' : 'text-red-400'}>
                {isGeminiListening ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Recording:</span>
              <span className={isGeminiRecording ? 'text-green-400 animate-pulse' : 'text-red-400'}>
                {isGeminiRecording ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Mode:</span>
              <span className="text-blue-400">{voiceParsingMode}</span>
            </div>
            <div className="flex justify-between">
              <span>Active:</span>
              <span className={isActive ? 'text-green-400' : 'text-red-400'}>
                {isActive ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
