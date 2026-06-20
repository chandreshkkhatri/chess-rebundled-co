// Phonetic alphabet mappings for file disambiguation
const PHONETIC_FILES: Record<string, string> = {
  alpha: 'a',
  alfa: 'a',
  bravo: 'b',
  charlie: 'c',
  delta: 'd',
  echo: 'e',
  foxtrot: 'f',
  fox: 'f',
  golf: 'g',
  hotel: 'h',
  // Common alternatives
  apple: 'a',
  boy: 'b',
  cat: 'c',
  david: 'd',
  dog: 'd',
  edward: 'e',
  frank: 'f',
  george: 'g',
  henry: 'h',
};

const PHONETIC_RANKS: Record<string, string> = {
  one: '1',
  two: '2',
  too: '2',
  to: '2',
  three: '3',
  four: '4',
  for: '4',
  fore: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ate: '8',
};

const PIECE_MAPPINGS: Record<string, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  castle: 'R',
  tower: 'R',
  bishop: 'B',
  knight: 'N',
  horse: 'N',
  night: 'N',
  pawn: '',
};

const CAPTURE_WORDS = ['takes', 'captures', 'capture', 'take', 'by'];

export interface ParsedMove {
  notation: string;
  confidence: number;
  alternatives: string[];
  hasAmbiguity: boolean;
  ambiguousType?: 'db' | 'piece';
}

// Helper to check if a move matches any legal move (ignoring +/# suffixes)
function isLegalMove(notation: string, legalMoves: string[]): boolean {
  const clean = notation.replace(/[+#]/g, '');
  return legalMoves.some(m => m.replace(/[+#]/g, '') === clean);
}

export function parseVoiceInput(transcript: string, legalMoves?: string[]): ParsedMove {
  let normalized = transcript.toLowerCase().trim();

  // Pre-process transcript to map common homophones to standard chess notations
  normalized = normalized
    .replace(/\bsee\s*(\d)\b/g, 'c$1')      // "see 4" -> "c4"
    .replace(/\bsea\s*(\d)\b/g, 'c$1')      // "sea 4" -> "c4"
    .replace(/\bbe\s*(\d)\b/g, 'b$1')       // "be 4" -> "b4"
    .replace(/\bbefore\b/g, 'b4')           // "before" -> "b4"
    .replace(/\bbee\s*(\d)\b/g, 'b$1')      // "bee 4" -> "b4"
    .replace(/\beff\s*(\d)\b/g, 'f$1')      // "eff 4" -> "f4"
    .replace(/\bhalf\s*(\d)\b/g, 'f$1')     // "half 4" -> "f4"
    .replace(/\bgee\s*(\d)\b/g, 'g$1')      // "gee 4" -> "g4"
    .replace(/\beach\s*(\d)\b/g, 'h$1')     // "each 3" -> "h3"
    .replace(/\bage\s*(\d)\b/g, 'h$1')      // "age 3" -> "h3"
    .replace(/\bay\s*(\d)\b/g, 'a$1')       // "ay 1" -> "a1"
    .replace(/\baye\s*(\d)\b/g, 'a$1')      // "aye 1" -> "a1"
    .replace(/\bdate\b/g, 'd8')             // "date" -> "d8"
    .replace(/\btoo\b/g, 'two')             // homophones for ranks
    .replace(/\bto\b/g, 'two')
    .replace(/\bfor\b/g, 'four')
    .replace(/\bfore\b/g, 'four')
    .replace(/\bate\b/g, 'eight')
    .replace(/\bnight\b/g, 'knight')
    .replace(/\bbrooke\b/g, 'rook')
    .replace(/\bbrook\b/g, 'rook');

  let alternatives: string[] = [];
  let hasAmbiguity = false;

  // Check for castling first
  if (/castle\s*(king\s*side|short)/i.test(normalized)) {
    return { notation: 'O-O', confidence: 0.95, alternatives: [], hasAmbiguity: false };
  }
  if (/castle\s*(queen\s*side|long)/i.test(normalized)) {
    return { notation: 'O-O-O', confidence: 0.95, alternatives: [], hasAmbiguity: false };
  }

  // Parse the move
  let piece = '';
  let file = '';
  let rank = '';
  let isCapture = false;
  let fromFile = '';

  const words = normalized.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check for piece
    if (PIECE_MAPPINGS[word] !== undefined) {
      piece = PIECE_MAPPINGS[word];
      continue;
    }

    // Check for capture
    if (CAPTURE_WORDS.includes(word)) {
      isCapture = true;
      continue;
    }

    // Check for phonetic file
    if (PHONETIC_FILES[word]) {
      if (!file) {
        file = PHONETIC_FILES[word];
      } else {
        fromFile = file;
        file = PHONETIC_FILES[word];
      }
      continue;
    }

    // Check for phonetic rank
    if (PHONETIC_RANKS[word]) {
      rank = PHONETIC_RANKS[word];
      continue;
    }

    // Check for direct file (a-h)
    if (/^[a-h]$/i.test(word)) {
      if (!file) {
        file = word.toLowerCase();
      } else {
        fromFile = file;
        file = word.toLowerCase();
      }
      continue;
    }

    // Check for direct rank (1-8)
    if (/^[1-8]$/.test(word)) {
      rank = word;
      continue;
    }

    // Check for combined square (e4, d5, etc.)
    const squareMatch = word.match(/^([a-h])([1-8])$/i);
    if (squareMatch) {
      file = squareMatch[1].toLowerCase();
      rank = squareMatch[2];
      continue;
    }
  }

  // Build the notation
  let notation = '';

  if (piece) notation += piece;
  if (fromFile) notation += fromFile;
  if (isCapture) notation += 'x';
  if (file) notation += file;
  if (rank) notation += rank;

  // Check for d/b ambiguity
  if (file === 'd' || file === 'b') {
    hasAmbiguity = true;
    const altFile = file === 'd' ? 'b' : 'd';
    const altNotation = notation.replace(file, altFile);
    alternatives.push(altNotation);
  }

  // Calculate base confidence
  let confidence = 0.9;
  if (hasAmbiguity) confidence = 0.7;
  if (!file || !rank) confidence = 0.5;

  // Validate against legal moves if provided
  if (legalMoves && legalMoves.length > 0 && notation) {
    const mainLegal = isLegalMove(notation, legalMoves);

    if (mainLegal && !hasAmbiguity) {
      // Exact match, no ambiguity - high confidence
      confidence = 0.95;
    } else if (hasAmbiguity && (file === 'd' || file === 'b')) {
      // d/b ambiguity - try to resolve using legal moves
      const altFile = file === 'd' ? 'b' : 'd';
      const altNotation = notation.replace(file, altFile);
      const altLegal = isLegalMove(altNotation, legalMoves);

      if (mainLegal && !altLegal) {
        // Only main is legal - resolve ambiguity
        confidence = 0.95;
        hasAmbiguity = false;
        alternatives = [];
      } else if (!mainLegal && altLegal) {
        // Only alt is legal - swap to the legal one
        notation = altNotation;
        confidence = 0.95;
        hasAmbiguity = false;
        alternatives = [];
      } else if (mainLegal && altLegal) {
        // Both are legal - keep ambiguity but note both are valid
        confidence = 0.75;
      }
      // If neither is legal, keep low confidence
    } else if (!mainLegal) {
      // Parsed move isn't legal - lower confidence
      confidence = Math.min(confidence, 0.5);
    }
  }

  return {
    notation,
    confidence,
    alternatives,
    hasAmbiguity,
    ambiguousType: hasAmbiguity ? 'db' : undefined,
  };
}

export function formatMoveForDisplay(move: string): string {
  // Add spaces for readability
  return move
    .replace(/([KQRBN])/, '$1 ')
    .replace(/x/, ' takes ')
    .replace(/O-O-O/, 'Castle queenside')
    .replace(/O-O/, 'Castle kingside')
    .replace(/\+/, ' check')
    .replace(/#/, ' checkmate');
}
