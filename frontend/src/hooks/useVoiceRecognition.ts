"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { parseVoiceInput } from "@/lib/voiceParser";
import { CONFIDENT_MATCH, matchSpokenMove } from "@/lib/spokenMoveMatcher";

interface UseVoiceRecognitionOptions {
  onResult?: (move: string, confidence: number, rawTranscript: string, transcripts: string[], ambiguous?: boolean) => void;
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

  const runningRef = useRef(false);
  const acceptingRef = useRef(false);
  const processedIndexRef = useRef(0);

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
    recognition.maxAlternatives = 5;

    // Legacy SpeechGrammarList is ignored by recognition services. Resolve
    // final alternatives against the current legal moves instead.
    recognition.onstart = () => {
      if (!acceptingRef.current) { recognition.abort(); return; }
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      runningRef.current = false;
      acceptingRef.current = false;
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      acceptingRef.current = false;
      setIsListening(false);

      switch (event.error) {
        case "aborted":
          // Expected when leaving a turn or pausing input for interpretation.
          break;
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
      if (!acceptingRef.current) return;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (!result.length || index < processedIndexRef.current) continue;
        const transcripts = Array.from({ length: result.length }, (_, i) => result[i].transcript.trim()).filter(Boolean);
        if (!transcripts.length) continue;
        const raw = transcripts[0];
        const legalMoves = legalMovesRef.current;
        const matched = legalMoves?.length ? matchSpokenMove(transcripts, legalMoves) : null;
        const fallback = parseVoiceInput(raw, legalMoves);
        const notation = matched ? matched.move : fallback.notation;
        const candidates = transcripts.map(text => parseVoiceInput(text, legalMoves));
        const legal = candidates.filter(parsed => parsed.confidence >= CONFIDENT_MATCH && !parsed.hasAmbiguity);
        const competing = new Set(legal.map(parsed => parsed.notation)).size > 1;
        const certainty = competing ? Math.min(matched?.confidence ?? fallback.confidence, 0.7)
          : matched?.confidence ?? fallback.confidence;
        const ambiguous = competing || (!!notation && certainty < CONFIDENT_MATCH);
        setTranscript(raw);
        setParsedPreview(notation);
        setConfidence(certainty);
        if (result.isFinal) {
          processedIndexRef.current = index + 1;
          const move = notation || raw;
          if (move) onResultRef.current?.(move, certainty, raw, transcripts, ambiguous);
        }
        // Interim hypotheses are previews only. A legal prefix such as e4
        // can still become "e4 takes d5" or be corrected by the recognizer.
      }
    };

    recognitionRef.current = recognition;

    return () => {
      acceptingRef.current = false;
      runningRef.current = false;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [continuous]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || runningRef.current) return;
    setTranscript("");
    setParsedPreview("");
    setConfidence(0);
    setError(null);
    processedIndexRef.current = 0;
    runningRef.current = true;
    acceptingRef.current = true;
    try {
      recognitionRef.current.start();
    } catch {
      runningRef.current = false;
      acceptingRef.current = false;
    }
  }, []);

  const stopListening = useCallback(() => {
    acceptingRef.current = false;
    if (recognitionRef.current && runningRef.current) {
      // Abort discards pending hypotheses when leaving a turn or input mode.
      recognitionRef.current.abort();
    }
    runningRef.current = false;
    setIsListening(false);
  }, []);

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
