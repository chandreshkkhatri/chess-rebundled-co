import { Type } from "@google/genai";
import { genai, GEMINI_MODEL, MOVE_PARSER_THINKING } from "../lib/genaiClient.js";
import { validateParsedMove } from "../lib/validateParsedMove.js";
import { withTimeout } from "../lib/withTimeout.js";
import { logGeminiTiming } from "../lib/geminiTiming.js";

// Cap Gemini text-parse latency so a hung request surfaces as an error
// instead of leaving the client awaiting forever.
const AI_PARSE_TIMEOUT_MS = 7000;

export interface AIParsedMove {
  move: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
}

export interface AIParseOptions {
  allowGuessOnUnclear?: boolean;
  confusionMap?: Record<string, string[]>;
  // Other guesses the speech recognizer offered for the same utterance, most likely first.
  alternativeTranscripts?: string[];
}

// The schema's stand-in for "no move": the model must pick a listed value.
const UNCLEAR = "unclear";

/** Joins the recognizer's guesses into one cache key, so the same set of guesses reuses one answer. */
export function transcriptCacheText(transcript: string, alternatives: string[] = []): string {
  return [transcript, ...alternatives].join(" | ");
}

/**
 * Parse a spoken chess move transcript using Gemini.
 * Takes the raw speech-to-text transcript and the current board position,
 * then returns the most likely chess move in SAN notation.
 */
export async function parseChessMoveWithAI(
  transcript: string,
  currentFen: string,
  legalMoves: string[],
  options: AIParseOptions = {},
): Promise<AIParsedMove> {
  const { allowGuessOnUnclear = false, confusionMap, alternativeTranscripts = [] } = options;

  // Build user-specific confusion context if calibration data exists
  let userConfusionContext = "";
  if (confusionMap && Object.keys(confusionMap).length > 0) {
    const mappings = Object.entries(confusionMap)
      .map(
        ([target, heardAs]) =>
          `- "${target}" is often transcribed as: ${heardAs.map((h) => `"${h}"`).join(", ")}`,
      )
      .join("\n");
    userConfusionContext = `\n**User-Specific Speech Patterns (from calibration):**\n${mappings}\n`;
  }

  const prompt = `You are a chess move parser. Convert spoken text to standard algebraic notation (SAN).

Current position (FEN): ${currentFen}
Legal moves in this position: ${legalMoves.join(", ")}
Spoken text: "${transcript}"
${alternativeTranscripts.length
    ? `The speech recognizer also offered these guesses for the same words, most likely first:\n${alternativeTranscripts.map((text) => `- "${text}"`).join("\n")}\nThe correct move is usually the legal move that several guesses point to.\n`
    : ""}
Parse the spoken text and return the chess move. Consider these common speech patterns:

**NATO Phonetic Alphabet:**
- Alpha/Alfa = a, Bravo = b, Charlie = c, Delta = d, Echo = e, Foxtrot = f, Golf = g, Hotel = h

**Alternative Names:**
- Adam/Apple/Able = a
- Boy/Baker = b
- Charlie/Cat = c
- David/Dog/Delta = d
- Edward/Easy/Echo = e
- Frank/Fox = f
- George/Golf = g
- Henry/Hotel/Harry = h

**Number Words:**
- one/won = 1, two/to/too = 2, three = 3, four/for = 4
- five = 5, six = 6, seven = 7, eight/ate = 8

**Piece Names:**
- knight/night/horse = N
- bishop = B
- rook/castle/tower = R
- queen = Q
- king = K
- pawn = (no prefix)

**Special Moves:**
- "takes", "captures", "x", "by" = x (capture)
- "castle king side", "short castle", "king side castle", "O-O" = O-O
- "castle queen side", "long castle", "queen side castle", "O-O-O" = O-O-O
- "check" = + (optional, don't require it)
- "promotes to queen", "equals queen", "queen" (at end) = =Q

**Common Mishearings:**
- "be" might be "B" (bishop) or "b" (file)
- "see" might be "C" or "c"
- "gee" might be "G" or "g"
- "age" might be "H" or "8"
- "night" = knight
- "for" = 4, "four"
- "to" = 2, "two"
- "won" = 1, "one"
- "ate" = 8, "eight"
${userConfusionContext}
Return ONLY valid JSON in this exact format, no other text:
{"move": "e4", "confidence": 0.95, "alternatives": ["d4"], "reasoning": "Echo=e, four=4"}

Rules:
Never substitute a popular, strategically good, or expected move for the spoken move.
If the speaker says d4, do not return Nf3 just because it is a plausible opening.
Background noise, silence, unrelated speech and incomplete moves must return "unclear".
1. The "move" field MUST be one of the legal moves listed above, or "unclear" if unparseable
2. "confidence" should be 0.0-1.0 based on how clear the transcript is
3. "alternatives" should list 0-3 other possible legal moves ONLY if the speech is actually ambiguous; otherwise use []
4. "reasoning" briefly explains the interpretation
${
  allowGuessOnUnclear
    ? "If the transcript is unclear, pick the most likely legal move based on common chess patterns."
    : 'If the transcript is unclear or multiple legal moves are plausible, return "unclear" with low confidence instead of guessing.'
}`;

  try {
    // Structured output: the move can only be one of this position's legal moves
    // (or "unclear"), so an invented move is rejected before it reaches us.
    const started = Date.now();
    const response = await withTimeout(
      genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              move: { type: Type.STRING, enum: [...legalMoves, UNCLEAR] },
              confidence: { type: Type.NUMBER },
              alternatives: { type: Type.ARRAY, maxItems: 3, items: { type: Type.STRING, enum: legalMoves } },
              reasoning: { type: Type.STRING },
            },
            required: ["move", "confidence", "alternatives", "reasoning"],
          },
          thinkingConfig: MOVE_PARSER_THINKING,
        },
      }),
      AI_PARSE_TIMEOUT_MS,
      "AI move parse",
    );

    logGeminiTiming("[AI Parser]", GEMINI_MODEL, started, response.usageMetadata);
    const text = response.text || "";

    // Extract JSON from response (in case there's any extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[AI Parser] No JSON found in response:", text);
      return {
        move: "",
        confidence: 0,
        alternatives: [],
        reasoning: "Failed to parse AI response",
      };
    }

    return validateParsedMove(JSON.parse(jsonMatch[0]), legalMoves, transcript);

  } catch (error) {
    console.error("[AI Parser] Error calling Gemini API:", error);
    return {
      move: "",
      confidence: 0,
      alternatives: [],
      reasoning: `AI parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
