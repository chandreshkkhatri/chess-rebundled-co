"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { parseVoiceInput } from "@/lib/voiceParser";

// Configuration for early interim result triggering
const INTERIM_STABILITY_MS = 300; // Trigger early if same result for this long
const INTERIM_MIN_CONFIDENCE = 0.75; // Minimum confidence to trigger early

interface UseVoiceRecognitionOptions {
  onResult?: (move: string, confidence: number, rawTranscript: string) => void;
  continuous?: boolean;
  legalMoves?: string[];
}

export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}) {
  const { onResult, continuous = false, legalMoves } = options;
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const legalMovesRef = useRef(legalMoves);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsedPreview, setParsedPreview] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Track interim results for early triggering
  const lastInterimRef = useRef<{ notation: string; timestamp: number } | null>(
    null,
  );
  const hasTriggeredRef = useRef(false); // Prevent double-triggering
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs up to date
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    legalMovesRef.current = legalMoves;
  }, [legalMoves]);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError("Speech recognition not supported in this browser");
      return;
    }

    setIsSupported(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-US";
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
        case "not-allowed":
          setError(
            "Microphone access denied. Click the camera icon in address bar to allow.",
          );
          break;
        case "no-speech":
          // Ignore no-speech error to allow silent auto-restart
          // setError('No speech detected. Please speak closer or try again.');
          break;
        case "network":
          setError("Network error. Check your connection.");
          break;
        case "audio-capture":
          setError("No microphone found. Ensure it is connected.");
          break;
        case "service-not-allowed":
          setError("Browser blocked voice service. Try generic Chrome.");
          break;
        default:
          setError(`Recognition error: ${event.error}`);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = event.results[event.resultIndex];
      const rawTranscript = results[0].transcript.trim();

      // Always update live transcript and a local parsed preview for immediate UI feedback
      const parsed = parseVoiceInput(rawTranscript, legalMovesRef.current);
      setTranscript(rawTranscript);
      setParsedPreview(parsed.notation);
      setConfidence(parsed.confidence);

      const moveForCallback = parsed.notation || rawTranscript;

      if (results.isFinal) {
        // Clear stability timer since we got final result
        if (stabilityTimerRef.current) {
          clearTimeout(stabilityTimerRef.current);
          stabilityTimerRef.current = null;
        }

        // Only trigger if we haven't already triggered early
        if (
          !hasTriggeredRef.current &&
          onResultRef.current &&
          moveForCallback
        ) {
          onResultRef.current(
            moveForCallback,
            parsed.confidence,
            rawTranscript,
          );
        }
        // Reset for next recognition
        hasTriggeredRef.current = false;
        lastInterimRef.current = null;
      } else {
        // Interim result - check for early trigger opportunity
        const now = Date.now();

        // Skip if we've already triggered for this recognition session
        if (hasTriggeredRef.current) return;

        // Skip if no valid parsed move
        if (!parsed.notation) {
          lastInterimRef.current = null;
          return;
        }

        // Check if this is the same result as before
        if (
          lastInterimRef.current &&
          lastInterimRef.current.notation === parsed.notation
        ) {
          // Same result - check if stable for long enough
          const elapsed = now - lastInterimRef.current.timestamp;
          if (
            elapsed >= INTERIM_STABILITY_MS &&
            parsed.confidence >= INTERIM_MIN_CONFIDENCE
          ) {
            // Trigger early callback!
            if (onResultRef.current) {
              hasTriggeredRef.current = true;
              onResultRef.current(
                moveForCallback,
                parsed.confidence,
                rawTranscript,
              );
            }
          }
        } else {
          // New result - start stability timer
          lastInterimRef.current = {
            notation: parsed.notation,
            timestamp: now,
          };

          // Clear existing timer
          if (stabilityTimerRef.current) {
            clearTimeout(stabilityTimerRef.current);
          }

          // Set new timer to check stability after INTERIM_STABILITY_MS
          if (parsed.confidence >= INTERIM_MIN_CONFIDENCE) {
            stabilityTimerRef.current = setTimeout(() => {
              stabilityTimerRef.current = null;
              // Re-check conditions in case something changed
              if (
                !hasTriggeredRef.current &&
                lastInterimRef.current?.notation === parsed.notation &&
                onResultRef.current
              ) {
                hasTriggeredRef.current = true;
                onResultRef.current(
                  parsed.notation,
                  parsed.confidence,
                  rawTranscript,
                );
              }
            }, INTERIM_STABILITY_MS);
          }
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
    };
  }, [continuous]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript("");
      setParsedPreview("");
      setConfidence(0);
      setError(null);
      // Reset early trigger tracking
      hasTriggeredRef.current = false;
      lastInterimRef.current = null;
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
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
    parsedPreview,
    confidence,
    error,
    startListening,
    stopListening,
  };
}
