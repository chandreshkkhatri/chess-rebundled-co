'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { parseVoiceInput } from '@/lib/voiceParser';

interface UseVoiceRecognitionOptions {
  onResult?: (move: string, confidence: number) => void;
  continuous?: boolean;
}

export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}) {
  const { onResult, continuous = false } = options;
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Keep onResult ref up to date
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

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
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);

      switch (event.error) {
        case 'not-allowed':
          setError('Microphone access denied. Click the camera icon in address bar to allow.');
          break;
        case 'no-speech':
          setError('No speech detected. Please speak closer or try again.');
          break;
        case 'network':
          setError('Network error. Check your connection.');
          break;
        case 'audio-capture':
          setError('No microphone found. Ensure it is connected.');
          break;
        case 'service-not-allowed':
            setError('Browser blocked voice service. Try generic Chrome.');
            break;
        default:
          setError(`Recognition error: ${event.error}`);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = event.results[event.resultIndex];
      const rawTranscript = results[0].transcript.trim();

      if (results.isFinal) {
        // Parse the voice input
        const parsed = parseVoiceInput(rawTranscript);

        setTranscript(rawTranscript);
        setConfidence(parsed.confidence);

        // Call the result callback with parsed move (using ref)
        if (onResultRef.current && parsed.notation) {
          onResultRef.current(parsed.notation, parsed.confidence);
        }
      } else {
        // Interim result
        setTranscript(rawTranscript);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [continuous]);

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
