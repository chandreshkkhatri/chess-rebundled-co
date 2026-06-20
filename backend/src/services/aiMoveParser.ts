import { GoogleGenAI } from "@google/genai";
import { withTimeout } from "../lib/withTimeout.js";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

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
  const { allowGuessOnUnclear = true, confusionMap } = options;

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
1. The "move" field MUST be one of the legal moves listed above, or empty string if unparseable
2. "confidence" should be 0.0-1.0 based on how clear the transcript is
3. "alternatives" should list 0-3 other possible legal moves if ambiguous
4. "reasoning" briefly explains the interpretation
${
  allowGuessOnUnclear
    ? "If the transcript is unclear, pick the most likely legal move based on common chess patterns."
    : "If the transcript is unclear or multiple legal moves are plausible, return an empty move with low confidence instead of guessing."
}`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
        contents: prompt,
      }),
      AI_PARSE_TIMEOUT_MS,
      "AI move parse",
    );

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

    const parsed = JSON.parse(jsonMatch[0]) as AIParsedMove;

    // Validate that the move is in the legal moves list
    if (parsed.move && !legalMoves.includes(parsed.move)) {
      // Try to find a matching legal move (case-insensitive, ignore check symbols)
      const cleanParsedMove = parsed.move.replace(/[+#]/g, "");
      const matchingMove = legalMoves.find(
        (m) => m.replace(/[+#]/g, "") === cleanParsedMove,
      );
      if (matchingMove) {
        parsed.move = matchingMove;
      } else {
        console.warn(
          "[AI Parser] Move not in legal moves list:",
          parsed.move,
          "Legal:",
          legalMoves,
        );
        // Keep the parsed move but lower confidence
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
    console.error("[AI Parser] Error calling Gemini API:", error);
    return {
      move: "",
      confidence: 0,
      alternatives: [],
      reasoning: `AI parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
