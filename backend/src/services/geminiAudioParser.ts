import { GoogleGenAI } from "@google/genai";
import { withTimeout } from "../lib/withTimeout";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Audio inference is heavier than text, so allow a bit more headroom — but
// still cap it so a hung request can't strand the client on "Processing...".
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
- Match strictly against the Legal Moves list.
- ${
    allowGuessOnUnclear
      ? "If the audio is ambiguous, choose the most phonetically similar legal move."
      : "If the audio is ambiguous or too noisy to distinguish between legal moves, return an empty move with low confidence instead of guessing."
  }
${userConfusionContext}- output JSON only.

Returns:
{"move": "e4", "confidence": 0.9, "alternatives": ["d4"], "reasoning": "Heard echo-four", "transcription": "echo four"}`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
        contents: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType,
            },
          },
          prompt,
        ],
      }),
      AUDIO_PARSE_TIMEOUT_MS,
      "Gemini audio parse",
    );

    const text = response.text || "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Gemini Audio Parser] No JSON found in response:", text);
      return {
        move: "",
        confidence: 0,
        alternatives: [],
        reasoning: "Failed to parse AI response",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiAudioParsedMove;

    // Validate move is in legal moves list
    if (parsed.move && !legalMoves.includes(parsed.move)) {
      const cleanParsedMove = parsed.move.replace(/[+#]/g, "");
      const matchingMove = legalMoves.find(
        (m) => m.replace(/[+#]/g, "") === cleanParsedMove,
      );
      if (matchingMove) {
        parsed.move = matchingMove;
      } else {
        console.warn(
          "[Gemini Audio Parser] Move not in legal moves:",
          parsed.move,
        );
        parsed.confidence = Math.min(parsed.confidence, 0.3);
        parsed.reasoning =
          (parsed.reasoning || "") + " [Warning: move may not be legal]";
      }
    }

    // Filter alternatives to only include legal moves
    if (parsed.alternatives) {
      parsed.alternatives = parsed.alternatives.filter((alt: string) =>
        legalMoves.some(
          (m) => m.replace(/[+#]/g, "") === alt.replace(/[+#]/g, ""),
        ),
      );
    }

    return parsed;
  } catch (error) {
    console.error("[Gemini Audio Parser] Error:", error);
    return {
      move: "",
      confidence: 0,
      alternatives: [],
      reasoning: `Audio parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
