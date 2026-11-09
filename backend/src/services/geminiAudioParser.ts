import { genai, GEMINI_TRANSCRIPTION_MODEL, TRANSCRIPTION_THINKING } from "../lib/genaiClient.js";
import { logGeminiTiming } from "../lib/geminiTiming.js";
import { explicitSpokenMove } from "../lib/validateParsedMove.js";
import { withTimeout } from "../lib/withTimeout.js";
import { recordGeminiAudioResult } from "./geminiAudioHealth.js";
import { parseChessMoveWithAI } from "./aiMoveParser.js";

// Covers both transcription and interpretation, below the client's 14s timeout.
const AUDIO_PARSE_TIMEOUT_MS = 12000;

export interface GeminiAudioParsedMove {
  move: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
  transcription?: string;
  /** Milliseconds per stage; interpretation is null when it was not needed. */
  timing?: { transcriptionMs: number; interpretationMs: number | null; transcriptionThoughtTokens: number };
}

// Confidence for a transcription that is literally a legal move ("d4").
const EXPLICIT_MOVE_CONFIDENCE = 0.95;

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
};
const comparable = (text: string) => text.toLowerCase()
  .replace(/\b(one|two|three|four|five|six|seven|eight)\b/g, (word) => NUMBER_WORDS[word])
  .replace(/[^a-z0-9]/g, "");

/**
 * Whether the speaker's calibration says this transcription is often a
 * different move. Interpretation then decides, with the calibration.
 */
function calibrationQuestions(transcription: string, move: string, confusionMap?: Record<string, string[]>): boolean {
  const heard = comparable(transcription);
  return Object.entries(confusionMap ?? {}).some(([target, heardAs]) =>
    comparable(target) !== comparable(move) && heardAs.some((text) => comparable(text) === heard));
}

export interface GeminiAudioParseOptions {
  allowGuessOnUnclear?: boolean;
  confusionMap?: Record<string, string[]>;
}

/** Transcribe without board context, then interpret only the actual words. */
export async function parseChessMoveFromAudio(
  audioBase64: string,
  mimeType: string,
  currentFen: string,
  legalMoves: string[],
  options: GeminiAudioParseOptions = {},
): Promise<GeminiAudioParsedMove> {
  const empty = { move: "", confidence: 0, alternatives: [] as string[] };
  let accepting = true;
  try {
    return await withTimeout((async () => {
      // Never give the transcription stage a board, candidate moves, calibration
      // substitutions, or a worked chess example. In live testing a combined
      // prompt invented e4 with 90% confidence even for digital silence.
      const started = Date.now();
      const response = await genai.models.generateContent({
        model: GEMINI_TRANSCRIPTION_MODEL,
        config: { responseMimeType: "application/json", thinkingConfig: TRANSCRIPTION_THINKING },
        contents: [
          { inlineData: { data: audioBase64, mimeType } },
          `Transcribe this audio verbatim. Preserve the spoken words and letter names.
Do not interpret, complete, correct, or guess what the speaker intended.
If there is silence, noise, music, or no intelligible speech, return an empty
transcription and speechDetected=false instead of guessing.
Return JSON with exactly two fields: transcription (string), speechDetected (boolean).`,
        ],
      });
      if (!accepting) return empty;
      const stage1 = logGeminiTiming("[Gemini Audio Parser] transcription", GEMINI_TRANSCRIPTION_MODEL, started, response.usageMetadata);
      const timing = { transcriptionMs: stage1.ms, interpretationMs: null as number | null, transcriptionThoughtTokens: stage1.thoughtTokens };
      const json = (response.text || "").match(/\{[\s\S]*\}/);
      if (!json) {
        recordGeminiAudioResult(false);
        return { ...empty, reasoning: "Failed to transcribe audio" };
      }
      const decoded: unknown = JSON.parse(json[0]);
      if (!decoded || typeof decoded !== 'object') { recordGeminiAudioResult(false); return empty; }
      const spoken = decoded as Record<string, unknown>;
      if (typeof spoken.speechDetected !== 'boolean' || typeof spoken.transcription !== 'string') {
        recordGeminiAudioResult(false);
        return { ...empty, reasoning: 'Invalid transcription response' };
      }
      const transcription = typeof spoken.transcription === 'string' ? spoken.transcription.trim() : '';
      if (spoken.speechDetected !== true || !transcription || transcription.length > 500) {
        recordGeminiAudioResult(true);
        return { ...empty, transcription: '', reasoning: 'No intelligible speech detected', timing };
      }
      // A transcription that is literally a legal move ("d4") needs no second
      // call: validateParsedMove only lets interpretation return that move or
      // nothing. Calibration that says these words are often another move
      // still goes to interpretation.
      const explicit = explicitSpokenMove(transcription, legalMoves);
      if (explicit && !calibrationQuestions(transcription, explicit, options.confusionMap)) {
        recordGeminiAudioResult(true);
        return { move: explicit, confidence: EXPLICIT_MOVE_CONFIDENCE, alternatives: [], transcription, timing };
      }
      const interpretationStarted = Date.now();
      const parsed = await parseChessMoveWithAI(transcription, currentFen, legalMoves, {
        ...options, allowGuessOnUnclear: options.allowGuessOnUnclear ?? false,
      });
      timing.interpretationMs = Date.now() - interpretationStarted;
      if (accepting) recordGeminiAudioResult(!parsed.reasoning?.startsWith('AI parsing failed:'));
      return { ...parsed, transcription, timing };
    })(), AUDIO_PARSE_TIMEOUT_MS, "Gemini audio parse");
  } catch (error) {
    recordGeminiAudioResult(false);
    console.error("[Gemini Audio Parser] Error:", error);
    return {
      ...empty,
      reasoning: `Audio parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  } finally {
    accepting = false;
  }
}
