import { ThinkingLevel, Type, type ThinkingConfig } from "@google/genai";
import { genai, GEMINI_AUDIO_MODEL } from "../lib/genaiClient.js";
import { withTimeout } from "../lib/withTimeout.js";
import { recordGeminiAudioResult } from "./geminiAudioHealth.js";

// Audio inference is heavier than text, so allow a bit more headroom — but
// still cap it so a hung request can't strand the client on "Processing...".
const AUDIO_PARSE_TIMEOUT_MS = 12000;

// The schema's stand-in for "no move": the model must pick a listed value.
const UNCLEAR = "unclear";

export interface GeminiAudioParsedMove {
  move: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
  transcription?: string;
}

export interface GeminiAudioParseOptions {
  allowGuessOnUnclear?: boolean;
  confusionMap?: Record<string, string[]>;
}

const THINKING_LEVELS: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/**
 * Picking one move from a short list needs little reasoning, and thinking
 * tokens are most of a slow reply, so ask for the least. "default" leaves the
 * model's own setting, for models without thinking levels (Gemini 2.5).
 */
export function audioThinkingConfig(
  setting = process.env.GEMINI_AUDIO_THINKING_LEVEL,
): ThinkingConfig | undefined {
  const level = (setting || "minimal").trim().toLowerCase();
  if (level === "default") return undefined;
  return { thinkingLevel: THINKING_LEVELS[level] ?? ThinkingLevel.MINIMAL };
}

const withoutCheck = (move: string) => move.replace(/[+#]/g, "");

/** The legal move a reply names, tolerating a missing or extra check sign. */
function legalMoveFor(move: unknown, legalMoves: string[]): string | undefined {
  if (typeof move !== "string" || !move || move === UNCLEAR) return undefined;
  return legalMoves.includes(move)
    ? move
    : legalMoves.find((m) => withoutCheck(m) === withoutCheck(move));
}

/**
 * Parse a chess move directly from audio using Gemini multimodal.
 * Takes raw audio data (base64) and current board position,
 * returns the most likely chess move in SAN notation.
 */
export async function parseChessMoveFromAudio(
  audioBase64: string,
  mimeType: string,
  currentFen: string,
  legalMoves: string[],
  options: GeminiAudioParseOptions = {},
): Promise<GeminiAudioParsedMove> {
  const { allowGuessOnUnclear = true, confusionMap } = options;

  // Build user-specific confusion context if calibration data exists
  let userConfusionContext = "";
  if (confusionMap && Object.keys(confusionMap).length > 0) {
    const mappings = Object.entries(confusionMap)
      .map(
        ([target, heardAs]) =>
          `- "${target}" often sounds like: ${heardAs.map((h) => `"${h}"`).join(", ")}`,
      )
      .join("\n");
    userConfusionContext = `\nUser-specific patterns:\n${mappings}\n`;
  }

  const prompt = `You are a fast chess move parser.
Context:
- FEN: ${currentFen}
- Legal Moves: ${legalMoves.join(", ")}

Task: Identify the spoken move from the audio.
- "move" must be one of the Legal Moves, or "${UNCLEAR}" if no move was spoken.
- ${
    allowGuessOnUnclear
      ? "If the audio is ambiguous, choose the most phonetically similar legal move."
      : `If the audio is ambiguous or too noisy to distinguish between legal moves, return "${UNCLEAR}" with low confidence instead of guessing.`
  }
- "confidence" is 0.0-1.0; "alternatives" lists up to 3 other legal moves it could have been.
- "transcription" is the words you heard, e.g. "echo four".
${userConfusionContext}`;

  const started = Date.now();
  const controller = new AbortController();
  try {
    // Structured output: the move can only be one of this position's legal
    // moves (or "unclear"), and the reply carries no free-text reasoning, so
    // it is short and needs no clean-up.
    const response = await withTimeout(
      genai.models.generateContent({
        model: GEMINI_AUDIO_MODEL,
        contents: [
          { inlineData: { data: audioBase64, mimeType } },
          prompt,
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcription: { type: Type.STRING },
              move: { type: Type.STRING, enum: [...legalMoves, UNCLEAR] },
              confidence: { type: Type.NUMBER },
              alternatives: { type: Type.ARRAY, maxItems: 3, items: { type: Type.STRING, enum: [...legalMoves, UNCLEAR] } },
            },
            required: ["transcription", "move", "confidence", "alternatives"],
            propertyOrdering: ["transcription", "move", "confidence", "alternatives"],
          },
          thinkingConfig: audioThinkingConfig(),
          abortSignal: controller.signal,
          // Gemini rejects a server deadline below 10s; withTimeout and the
          // abort signal enforce ours. No SDK retries: a retry would land
          // after the player has given up on this attempt.
          httpOptions: { timeout: Math.max(10_000, AUDIO_PARSE_TIMEOUT_MS), retryOptions: { attempts: 1 } },
        },
      }),
      AUDIO_PARSE_TIMEOUT_MS,
      "Gemini audio parse",
    );

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed: Partial<Record<keyof GeminiAudioParsedMove, unknown>> | null = null;
    try {
      const value: unknown = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (value && typeof value === "object") parsed = value;
    } catch {
      // Treated as an unreadable reply below.
    }
    const usage = response.usageMetadata;
    // One line per parse, for comparing models and thinking levels.
    console.info("[Gemini Audio Parser] timing", JSON.stringify({
      model: GEMINI_AUDIO_MODEL,
      ms: Date.now() - started,
      audioBytes: Math.floor((audioBase64.length * 3) / 4),
      mimeType,
      inputTokens: usage?.promptTokenCount,
      thoughtTokens: usage?.thoughtsTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount,
      move: parsed && typeof parsed.move === "string" ? parsed.move : null,
    }));

    if (!parsed) {
      recordGeminiAudioResult(false);
      console.error("[Gemini Audio Parser] No JSON found in response:", text);
      return {
        move: "",
        confidence: 0,
        alternatives: [],
        reasoning: "Failed to parse AI response",
      };
    }
    recordGeminiAudioResult(true);

    const move = legalMoveFor(parsed.move, legalMoves) ?? "";
    const confidence = typeof parsed.confidence === "number" && !Number.isNaN(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
    const alternatives: string[] = [];
    for (const alt of Array.isArray(parsed.alternatives) ? parsed.alternatives : []) {
      const legal = legalMoveFor(alt, legalMoves);
      if (legal && legal !== move && !alternatives.includes(legal)) alternatives.push(legal);
    }
    const transcription = typeof parsed.transcription === "string" ? parsed.transcription.trim() : "";

    return {
      move,
      confidence: move ? confidence : Math.min(confidence, 0.3),
      alternatives: alternatives.slice(0, 3),
      transcription: transcription || undefined,
      reasoning: move ? undefined : transcription ? "No legal move matched what was heard." : "No move was heard.",
    };
  } catch (error) {
    controller.abort();
    recordGeminiAudioResult(false);
    console.error("[Gemini Audio Parser] Error:", error);
    return {
      move: "",
      confidence: 0,
      alternatives: [],
      reasoning: `Audio parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
