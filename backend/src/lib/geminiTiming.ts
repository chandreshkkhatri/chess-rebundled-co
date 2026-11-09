import type { GenerateContentResponseUsageMetadata } from "@google/genai";

export interface GeminiCallTiming {
  model: string;
  ms: number;
  thoughtTokens: number;
  outputTokens: number | null;
}

/**
 * Measures one Gemini call and logs it as one line, for comparing models and
 * thinking levels in production logs (`grep "timing"`).
 */
export function logGeminiTiming(
  label: string,
  model: string,
  started: number,
  usage: GenerateContentResponseUsageMetadata | undefined,
): GeminiCallTiming {
  const timing = {
    model,
    ms: Date.now() - started,
    thoughtTokens: usage?.thoughtsTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? null,
  };
  console.info(`${label} timing`, JSON.stringify({ ...timing, inputTokens: usage?.promptTokenCount ?? null }));
  return timing;
}
