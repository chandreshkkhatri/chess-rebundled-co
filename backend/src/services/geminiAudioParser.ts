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
 * Parse a chess move directly from audio using Gemini 2.5 Flash multimodal.
 * Takes raw audio data (base64) and current board position,
 * returns the most likely chess move in SAN notation.
 */
export async function parseChessMoveFromAudio(
  audioBase64: string,
  mimeType: string,
  currentFen: string,
  legalMoves: string[]
): Promise<GeminiAudioParsedMove> {
  const prompt = `You are a fast chess move parser.
Context:
- FEN: ${currentFen}
- Legal Moves: ${legalMoves.join(', ')}

Task: Identify the spoken move from the audio.
- Match strictly against the Legal Moves list.
- If the audio is ambiguous, choose the most phonetically similar legal move.
- output JSON only.

Returns:
{"move": "e4", "confidence": 0.9, "alternatives": ["d4"], "reasoning": "Heard echo-four", "transcription": "echo four"}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
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
