'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useVoiceRecognition } from './useVoiceRecognition';
import { useGeminiVoice } from './useGeminiVoice';
import { CONFIDENT_MATCH } from '@/lib/spokenMoveMatcher';
import type { TrainingEngine, TrainingParse } from '@/lib/voiceTraining';

interface CaptureResult extends TrainingParse { latencyMs: number }
interface PendingCapture {
  engine: TrainingEngine;
  started: number;
  phase: 'listening' | 'processing';
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
}

/** Knows the position, never the exercise ID, expected move, or prompt phrase. */
export function useVoiceTrainingCapture(engine: TrainingEngine, fen: string, getIdToken: () => Promise<string | null>) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<PendingCapture | null>(null);
  const stop = useRef({ browser: () => {}, gemini: () => {} });
  const token = useRef(getIdToken);
  useEffect(() => { token.current = getIdToken; }, [getIdToken]);
  const legalMoves = useMemo(() => { try { return new Chess(fen).moves(); } catch { return []; } }, [fen]);

  const release = useCallback(() => {
    const current = pending.current;
    pending.current = null;
    if (current) { clearTimeout(current.timer); current.controller.abort(); }
    stop.current.browser(); stop.current.gemini();
    return current;
  }, []);
  const cancel = useCallback(() => {
    release(); setPhase('idle'); setResult(null); setError(null);
  }, [release]);
  const finish = useCallback((current: PendingCapture, parsed: TrainingParse) => {
    if (pending.current !== current) return;
    const latencyMs = Date.now() - current.started;
    release(); setPhase('idle'); setResult({ ...parsed, latencyMs });
  }, [release]);
  const fail = useCallback((current: PendingCapture, message: string) => {
    if (pending.current !== current) return;
    release(); setPhase('idle'); setError(message);
  }, [release]);

  const parse = useCallback(async (current: PendingCapture, input: Record<string, unknown>) => {
    if (pending.current !== current || current.phase !== 'listening') return;
    current.phase = 'processing';
    clearTimeout(current.timer);
    stop.current.browser(); stop.current.gemini();
    setPhase('processing');
    current.timer = setTimeout(() => fail(current, 'Voice processing timed out. Please retry; this recording was not scored.'), 20000);
    try {
      const idToken = await token.current();
      if (pending.current !== current) return;
      if (!idToken) throw new Error('Please sign in again to use voice training.');
      const response = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || ''}/api/user/voice-training/parse`, {
        method: 'POST', signal: current.controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ engine: current.engine, fen, ...input }),
      });
      const parsed = await response.json();
      if (!response.ok) throw new Error(parsed.error || 'Voice processing failed. Please retry.');
      if (typeof parsed.move !== 'string' || typeof parsed.transcription !== 'string' || !Array.isArray(parsed.alternatives) || !Number.isFinite(parsed.confidence)) {
        throw new Error('Invalid voice response. Please retry.');
      }
      finish(current, parsed);
    } catch (err) {
      if (pending.current === current) fail(current, err instanceof Error ? err.message : 'Voice processing failed. Please retry.');
    }
  }, [fen, fail, finish]);

  const browser = useVoiceRecognition({ continuous: false, legalMoves,
    onResult: (move, confidence, raw, transcripts, ambiguous) => {
      const current = pending.current;
      if (!current || current.engine !== 'browser' || current.phase !== 'listening') return;
      if (confidence >= CONFIDENT_MATCH && !ambiguous && legalMoves.includes(move)) {
        finish(current, { move, confidence, transcription: raw, alternatives: [] });
      } else void parse(current, { transcript: move || raw, rawTranscript: raw, transcripts });
    },
  });
  const gemini = useGeminiVoice({ onAudioReady: (audioBase64, mimeType) => {
    const current = pending.current;
    if (current?.engine === 'gemini') void parse(current, { audioBase64, mimeType });
  } });
  stop.current = { browser: browser.stopListening, gemini: gemini.stopListening };
  const startBrowser = browser.startListening;
  const startGemini = gemini.startListening;

  const start = useCallback(() => {
    if (pending.current) return;
    setResult(null); setError(null);
    const current: PendingCapture = { engine, started: Date.now(), phase: 'listening', controller: new AbortController(), timer: null! };
    current.timer = setTimeout(() => finish(current, {
      move: '', confidence: 0, alternatives: [], transcription: '', reasoning: 'No speech was detected. Check your microphone and try again.',
    }), 12000);
    pending.current = current;
    setPhase('listening');
    if (engine === 'browser') startBrowser(); else void startGemini();
  }, [engine, startBrowser, startGemini, finish]);

  const captureError = engine === 'browser' ? browser.error : gemini.error;
  useEffect(() => {
    if (captureError && pending.current?.phase === 'listening') fail(pending.current, captureError);
  }, [captureError, fail]);
  useEffect(() => { cancel(); return () => { release(); }; }, [engine, fen, cancel, release]);

  return { phase, result, error, start, cancel,
    supported: engine === 'browser' ? browser.isSupported : gemini.isSupported,
    volumeLevel: gemini.volumeLevel,
  };
}
