export interface ValidatedParsedMove {
  move: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
  transcription?: string;
}

/** Treat model output as untrusted; only canonical legal SAN reaches clients. */
export function validateParsedMove(value: unknown, legalMoves: string[], transcript?: string): ValidatedParsedMove {
  if (!value || typeof value !== 'object') return { move: '', confidence: 0, alternatives: [] };
  const parsed = value as Record<string, unknown>;
  const canonical = (move: unknown) => typeof move === 'string'
    ? legalMoves.find(legal => legal.replace(/[+#]/g, '') === move.trim().replace(/[+#]/g, ''))
    : undefined;
  let move = canonical(parsed.move) || '';
  // A model must not replace an explicitly transcribed SAN move with another
  // legal move. In audio mode this also catches disagreement with its own text.
  const spoken = transcript ?? (typeof parsed.transcription === 'string' ? parsed.transcription : '');
  const explicitMove = canonical(spoken.trim().replace(/[.,!?]+$/g, ''));
  if (explicitMove && move !== explicitMove) move = '';
  const alternatives = Array.isArray(parsed.alternatives)
    ? [...new Set(parsed.alternatives.map(canonical).filter((alt): alt is string => !!alt && alt !== move))].slice(0, 3)
    : [];
  return {
    move,
    confidence: move && typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(alternatives.length ? 0.7 : 1, parsed.confidence)) : 0,
    alternatives,
    ...(typeof parsed.reasoning === 'string' ? { reasoning: parsed.reasoning } : {}),
    ...(typeof parsed.transcription === 'string' ? { transcription: parsed.transcription } : {}),
  };
}
