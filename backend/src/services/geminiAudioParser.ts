import { genai, GEMINI_TRANSCRIPTION_MODEL } from "../lib/genaiClient.js";
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
      const response = await genai.models.generateContent({
        model: GEMINI_TRANSCRIPTION_MODEL,
        config: { responseMimeType: "application/json" },
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
        return { ...empty, transcription: '', reasoning: 'No intelligible speech detected' };
      }
      const parsed = await parseChessMoveWithAI(transcription, currentFen, legalMoves, {
        ...options, allowGuessOnUnclear: options.allowGuessOnUnclear ?? false,
      });
      if (accepting) recordGeminiAudioResult(!parsed.reasoning?.startsWith('AI parsing failed:'));
      return { ...parsed, transcription };
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
