'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import type { AiMoveParsedData } from '@/types/aiGame';

export function useAiMoveInput(gameId: string, fen: string, active: boolean) {
  const [aiParseResult, setResult] = useState<AiMoveParsedData | null>(null);
  const [aiParseError, setError] = useState<string | null>(null);
  const [isAIParsing, setParsing] = useState(false);
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const clearAIParseState = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setParsing(false);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    clearAIParseState();
    const socket = getSocket();
    const onResult = (data: AiMoveParsedData) => {
      if (!active || data.gameId !== gameId || data.fen !== fen || data.requestId !== pending.current?.id) return;
      clearAIParseState();
      setResult(data);
    };
    const onError = (data: { requestId: string; message: string }) => {
      if (data.requestId !== pending.current?.id) return;
      clearAIParseState();
      setError(data.message);
    };
    socket.on('ai-move-parsed', onResult);
    socket.on('ai-parse-error', onError);
    socket.on('disconnect', clearAIParseState);
    return () => {
      socket.off('ai-move-parsed', onResult);
      socket.off('ai-parse-error', onError);
      socket.off('disconnect', clearAIParseState);
      clearAIParseState();
    };
  }, [gameId, fen, active, clearAIParseState]);

  const request = useCallback((event: string, payload: Record<string, string | string[]>) => {
    const socket = getSocket();
    if (!active || pending.current) return;
    if (!socket.connected) { setError('Not connected to server'); return; }
    clearAIParseState();
    const requestId = crypto.randomUUID();
    pending.current = { id: requestId, timer: setTimeout(() => {
      pending.current = null;
      setParsing(false);
      setError('Voice parsing timed out. Please try again or type your move.');
    }, 15000) };
    setParsing(true);
    socket.emit(event, { gameId, fen, requestId, ...payload });
  }, [gameId, fen, active, clearAIParseState]);
  const parseText = useCallback((transcript: string, rawTranscript?: string, transcripts?: string[]) =>
    request('ai-parse-move', {
      transcript,
      ...(rawTranscript ? { rawTranscript } : {}),
      ...(transcripts?.length ? { transcripts } : {}),
    }), [request]);
  const parseAudio = useCallback((audioBase64: string, mimeType: string) =>
    request('ai-parse-audio', { audioBase64, mimeType }), [request]);
  return { aiParseResult, aiParseError, isAIParsing, clearAIParseState, parseText, parseAudio };
}
