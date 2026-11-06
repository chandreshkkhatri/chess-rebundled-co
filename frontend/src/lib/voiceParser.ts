// Phonetic alphabet mappings for file disambiguation
const PHONETIC_FILES: Record<string, string> = {
  ay: 'a', aye: 'a',
  bee: 'b', be: 'b',
  see: 'c', sea: 'c',
  dee: 'd',
  ee: 'e',
  eff: 'f', half: 'f',
  gee: 'g',
  aitch: 'h', each: 'h', age: 'h',
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
  won: '1',
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

const CAPTURE_WORDS = ['takes', 'captures', 'capture', 'take', 'by', 'x'];

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
  const empty: ParsedMove = { notation: '', confidence: 0, alternatives: [], hasAmbiguity: false };
  const clean = (move: string) => move.replace(/[+#]/g, '');
  const direct = transcript.trim().replace(/[.,!?]+$/g, '');
  // Preserve SAN's case (B is a bishop, b is a file).
  const exact = legalMoves?.find(move => clean(move) === clean(direct));
  if (exact) return { ...empty, notation: exact, confidence: 0.95 };
  if (/^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?$/.test(direct)) {
    return { ...empty, notation: direct, confidence: legalMoves ? 0.5 : 0.9 };
  }

  let normalized = transcript.toLowerCase().trim().replace(/[.,!?]/g, '');
  normalized = normalized
    .replace(/\bbefore\b/g, 'b4')
    .replace(/\bdate\b/g, 'd8')
    .replace(/\bnight\b/g, 'knight')
    .replace(/\bbrooke?\b/g, 'rook');

  if (/^(?:castle (?:king\s*side|short)|(?:king\s*side|short) castle)$/.test(normalized)) {
    return { ...empty, notation: 'O-O', confidence: !legalMoves || isLegalMove('O-O', legalMoves) ? 0.95 : 0.5 };
  }
  if (/^(?:castle (?:queen\s*side|long)|(?:queen\s*side|long) castle)$/.test(normalized)) {
    return { ...empty, notation: 'O-O-O', confidence: !legalMoves || isLegalMove('O-O-O', legalMoves) ? 0.95 : 0.5 };
  }

  let promotion = '';
  normalized = normalized.replace(/\s+(?:(?:promotes?|promoting)(?: to)?|equals?)\s+(queen|rook|bishop|knight)$/, (_, pieceName: string) => {
    promotion = '=' + PIECE_MAPPINGS[pieceName];
    return '';
  });
  // "to" before a file is a separator, while "f to" can mean f2.
  const files = [...Object.keys(PHONETIC_FILES), '[a-h](?:[1-8])?'].join('|');
  normalized = normalized.replace(new RegExp('\\bto(?=\\s+(?:' + files + ')\\b)', 'g'), ' ');
  normalized = normalized.replace(/\bcheck(?:mate)?\b/g, ' ').trim();

  let alternatives: string[] = [];
  let hasAmbiguity = false;

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
      if (file) fromFile = file;
      file = squareMatch[1].toLowerCase();
      rank = squareMatch[2];
      continue;
    } else {
      // Unknown words need the contextual parser; do not mine a move from noise.
      return empty;
    }
  }

  if (!file || !rank) return empty;

  // Build the notation
  let notation = '';

  if (piece) notation += piece;
  if (fromFile && (piece || isCapture)) notation += fromFile;
  if (isCapture) notation += 'x';
  if (file) notation += file;
  if (rank) notation += rank;

  notation += promotion;
  let confidence = 0.9;
  if (legalMoves) {
    const exactMove = legalMoves.find(move => clean(move) === notation);
    if (exactMove) {
      notation = exactMove;
      confidence = 0.95;
    } else {
      // SAN supplies capture/disambiguation details that speakers often omit.
      // Resolve only when the explicitly spoken piece and destination are unique.
      const matches = legalMoves.filter(move => {
        const match = clean(move).match(/^([KQRBN]?)([a-h1-8]*)(x?)([a-h][1-8])(=[QRBN])?$/);
        return match && match[1] === piece && match[4] === file + rank &&
          (!isCapture || match[3] === 'x') && (match[5] || '') === promotion &&
          (!fromFile || !match[2] || match[2].includes(fromFile));
      });
      if (matches.length === 1) {
        notation = matches[0];
        confidence = 0.9;
      } else if (matches.length > 1) {
        notation = matches[0];
        alternatives = matches.slice(1);
        hasAmbiguity = true;
        confidence = 0.5;
      } else confidence = 0.5;
    }
  }

  return {
    notation,
    confidence,
    alternatives,
    hasAmbiguity,
    ambiguousType: hasAmbiguity ? 'piece' : undefined,
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
