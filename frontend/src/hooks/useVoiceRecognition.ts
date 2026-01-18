'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { parseVoiceInput } from '@/lib/voiceParser';

interface UseVoiceRecognitionOptions {
  onResult?: (move: string, confidence: number) => void;
  continuous?: boolean;
}

export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}) {
  const { onResult, continuous = false } = options;
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { setVoiceState } = useGameStore();

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Speech recognition not supported in this browser');
      return;
    }

    setIsSupported(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setVoiceState(true, '', 0);
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceState(false, transcript, confidence);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);

      switch (event.error) {
        case 'not-allowed':
          setError('Microphone access denied. Please allow microphone access.');
          break;
        case 'no-speech':
          setError('No speech detected. Try again.');
          break;
        case 'network':
          setError('Network error. Please check your connection.');
          break;
        default:
          setError(`Recognition error: ${event.error}`);
      }

      setVoiceState(false, '', 0);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = event.results[event.resultIndex];
      const rawTranscript = results[0].transcript.trim();
      const rawConfidence = results[0].confidence;

      if (results.isFinal) {
        // Parse the voice input
        const parsed = parseVoiceInput(rawTranscript);

        setTranscript(rawTranscript);
        setConfidence(parsed.confidence);
        setVoiceState(false, rawTranscript, parsed.confidence);

        // Call the result callback with parsed move
        if (onResult && parsed.notation) {
          onResult(parsed.notation, parsed.confidence);
        }
      } else {
        // Interim result
        setTranscript(rawTranscript);
        setVoiceState(true, rawTranscript, rawConfidence);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [continuous, onResult, setVoiceState]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      setConfidence(0);
      setError(null);
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  return {
    isSupported,
    isListening,
    transcript,
    confidence,
    error,
    startListening,
    stopListening,
  };
}
