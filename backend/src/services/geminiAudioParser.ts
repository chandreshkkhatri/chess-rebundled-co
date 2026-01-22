import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export interface GeminiAudioParsedMove {
  move: string;
  confidence: number;
  alternatives: string[];
  reasoning?: string;
  transcription?: string;
}

/**
 * Parse a chess move directly from audio using Gemini 2.0 Flash multimodal.
 * Takes raw audio data (base64) and current board position,
 * returns the most likely chess move in SAN notation.
 */
export async function parseChessMoveFromAudio(
  audioBase64: string,
  mimeType: string,
  currentFen: string,
  legalMoves: string[]
): Promise<GeminiAudioParsedMove> {
  const prompt = `You are a chess move parser. Listen to the audio and convert the spoken chess move to standard algebraic notation (SAN).

Current position (FEN): ${currentFen}
Legal moves in this position: ${legalMoves.join(', ')}

Parse the spoken audio and identify the chess move. Consider these common speech patterns:

**NATO Phonetic Alphabet:**
- Alpha/Alfa = a, Bravo = b, Charlie = c, Delta = d, Echo = e, Foxtrot = f, Golf = g, Hotel = h

**Alternative Names:**
- Adam/Apple/Able = a, Boy/Baker = b, Charlie/Cat = c, David/Dog/Delta = d
- Edward/Easy/Echo = e, Frank/Fox = f, George/Golf = g, Henry/Hotel/Harry = h

**Number Words:**
- one/won = 1, two/to/too = 2, three = 3, four/for = 4
- five = 5, six = 6, seven = 7, eight/ate = 8

**Piece Names:**
- knight/night/horse = N, bishop = B, rook/castle/tower = R, queen = Q, king = K, pawn = (no prefix)

**Special Moves:**
- "takes", "captures", "x" = x (capture)
- "castle king side", "short castle" = O-O
- "castle queen side", "long castle" = O-O-O
- "promotes to queen" = =Q

Return ONLY valid JSON in this exact format, no other text:
{"move": "e4", "confidence": 0.95, "alternatives": ["d4"], "reasoning": "Heard 'Echo four'", "transcription": "echo four"}

Rules:
1. The "move" field MUST be one of the legal moves listed above, or empty string if unparseable
2. "confidence" should be 0.0-1.0 based on audio clarity
3. "alternatives" should list 0-3 other possible legal moves if ambiguous
4. "reasoning" briefly explains the interpretation
5. "transcription" is what you heard in the audio`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
        prompt,
      ],
    });

    const text = response.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Gemini Audio Parser] No JSON found in response:', text);
      return { move: '', confidence: 0, alternatives: [], reasoning: 'Failed to parse AI response' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiAudioParsedMove;

    // Validate move is in legal moves list
    if (parsed.move && !legalMoves.includes(parsed.move)) {
      const cleanParsedMove = parsed.move.replace(/[+#]/g, '');
      const matchingMove = legalMoves.find(m => m.replace(/[+#]/g, '') === cleanParsedMove);
      if (matchingMove) {
        parsed.move = matchingMove;
      } else {
        console.warn('[Gemini Audio Parser] Move not in legal moves:', parsed.move);
        parsed.confidence = Math.min(parsed.confidence, 0.3);
        parsed.reasoning = (parsed.reasoning || '') + ' [Warning: move may not be legal]';
      }
    }

    // Filter alternatives to only include legal moves
    if (parsed.alternatives) {
      parsed.alternatives = parsed.alternatives.filter((alt: string) =>
        legalMoves.some(m => m.replace(/[+#]/g, '') === alt.replace(/[+#]/g, ''))
      );
    }

    return parsed;
  } catch (error) {
    console.error('[Gemini Audio Parser] Error:', error);
    return {
      move: '',
      confidence: 0,
      alternatives: [],
      reasoning: `Audio parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
