/**
 * Distractor Move Generator
 *
 * Generates plausible "wrong" chess moves that look similar to the expected move.
 * Used to create multiple-choice style options for notation practice.
 */

const PIECES = ['N', 'B', 'R', 'Q', 'K'] as const;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

// Phonetically similar file substitutions (for voice confusion)
const SIMILAR_FILES: Record<string, string[]> = {
  'a': ['e', 'h'],      // "ay" confused with "ee" or "aitch"
  'b': ['d', 'e'],      // "bee" vs "dee" vs "ee"
  'c': ['e', 'g'],      // "cee" vs "ee" vs "gee"
  'd': ['b', 'e'],      // "dee" vs "bee" vs "ee"
  'e': ['b', 'c', 'd'], // "ee" vs "bee/cee/dee"
  'f': ['h'],           // "eff" sometimes confused
  'g': ['c', 'e'],      // "gee" vs "cee" vs "ee"
  'h': ['a', 'f'],      // "aitch" vs "ay"
};

// Phonetically similar rank substitutions
const SIMILAR_RANKS: Record<string, string[]> = {
  '1': ['7'],           // "one" vs "seven"
  '2': ['3'],           // "two" vs "three"
  '3': ['2', '8'],      // "three" vs "two", "ate" vs "eight"
  '4': ['5'],           // "four" vs "five"
  '5': ['4'],           // "five" vs "four"
  '6': ['7'],           // "six" vs "seven"
  '7': ['1', '6'],      // "seven" vs "one" vs "six"
  '8': ['3'],           // "eight" vs "ate" sounds like "three"
};

// Common opening/middlegame moves as fillers
const COMMON_MOVES = [
  'e4', 'd4', 'Nf3', 'Nc3', 'Bc4', 'Bb5', 'c4', 'f4', 'e5', 'd5',
  'Nf6', 'Nc6', 'Be7', 'Bd6', 'O-O', 'Qd2', 'Re1', 'a3', 'h3', 'b3',
  'g3', 'Bg5', 'Bf4', 'Nd5', 'Ne5', 'Qe2', 'Rd1', 'Rab1', 'c5', 'b6',
];

interface ParsedMove {
  piece: string | null;       // N, B, R, Q, K or null for pawn
  fromFile: string | null;    // Disambiguation file (e.g., Nbd2)
  fromRank: string | null;    // Disambiguation rank (e.g., R1e1)
  capture: boolean;           // 'x' present
  toFile: string | null;      // Destination file
  toRank: string | null;      // Destination rank
  promotion: string | null;   // =Q, =R, =B, =N
  check: string | null;       // + or #
  castling: 'short' | 'long' | null;
}

/**
 * Parse a SAN move into its components
 */
function parseMove(san: string): ParsedMove {
  const result: ParsedMove = {
    piece: null,
    fromFile: null,
    fromRank: null,
    capture: false,
    toFile: null,
    toRank: null,
    promotion: null,
    check: null,
    castling: null,
  };

  // Handle castling
  if (san === 'O-O' || san === '0-0') {
    result.castling = 'short';
    return result;
  }
  if (san === 'O-O-O' || san === '0-0-0') {
    result.castling = 'long';
    return result;
  }

  let s = san;

  // Extract check/mate symbol
  if (s.endsWith('#')) {
    result.check = '#';
    s = s.slice(0, -1);
  } else if (s.endsWith('+')) {
    result.check = '+';
    s = s.slice(0, -1);
  }

  // Extract promotion
  const promoMatch = s.match(/=([QRBN])$/);
  if (promoMatch) {
    result.promotion = promoMatch[1];
    s = s.slice(0, -2);
  }

  // Extract piece (uppercase letter at start, not a file)
  if (s.length > 0 && /^[NBRQK]/.test(s)) {
    result.piece = s[0];
    s = s.slice(1);
  }

  // Check for capture
  if (s.includes('x')) {
    result.capture = true;
    s = s.replace('x', '');
  }

  // Remaining should be [fromFile?][fromRank?][toFile][toRank]
  // Extract destination (last two chars should be file+rank)
  if (s.length >= 2) {
    const lastTwo = s.slice(-2);
    if (/^[a-h][1-8]$/.test(lastTwo)) {
      result.toFile = lastTwo[0];
      result.toRank = lastTwo[1];
      s = s.slice(0, -2);
    }
  }

  // Remaining is disambiguation
  if (s.length > 0) {
    for (const char of s) {
      if (/[a-h]/.test(char)) {
        result.fromFile = char;
      } else if (/[1-8]/.test(char)) {
        result.fromRank = char;
      }
    }
  }

  return result;
}

/**
 * Build a SAN move from parsed components
 */
function buildMove(parsed: ParsedMove): string {
  if (parsed.castling === 'short') return 'O-O';
  if (parsed.castling === 'long') return 'O-O-O';

  let move = '';

  if (parsed.piece) {
    move += parsed.piece;
  }

  if (parsed.fromFile) {
    move += parsed.fromFile;
  }

  if (parsed.fromRank) {
    move += parsed.fromRank;
  }

  if (parsed.capture) {
    // For pawn captures, need the from file
    if (!parsed.piece && !parsed.fromFile && parsed.toFile) {
      // This is a capture but we don't have disambiguation - skip the x
    } else {
      move += 'x';
    }
  }

  if (parsed.toFile) {
    move += parsed.toFile;
  }

  if (parsed.toRank) {
    move += parsed.toRank;
  }

  if (parsed.promotion) {
    move += '=' + parsed.promotion;
  }

  // Don't add check symbols to distractors (they'd be wrong anyway)

  return move;
}

/**
 * Get adjacent files
 */
function getAdjacentFiles(file: string): string[] {
  const idx = FILES.indexOf(file as typeof FILES[number]);
  if (idx === -1) return [];

  const result: string[] = [];
  if (idx > 0) result.push(FILES[idx - 1]);
  if (idx < 7) result.push(FILES[idx + 1]);
  return result;
}

/**
 * Get adjacent ranks
 */
function getAdjacentRanks(rank: string): string[] {
  const idx = RANKS.indexOf(rank as typeof RANKS[number]);
  if (idx === -1) return [];

  const result: string[] = [];
  if (idx > 0) result.push(RANKS[idx - 1]);
  if (idx < 7) result.push(RANKS[idx + 1]);
  return result;
}

/**
 * Mirror a file across the a1-h8 diagonal (a↔h, b↔g, c↔f, d↔e)
 * This represents how a square looks from the opposite side of the board
 */
function mirrorFile(file: string): string {
  const fileMap: Record<string, string> = {
    'a': 'h', 'b': 'g', 'c': 'f', 'd': 'e',
    'e': 'd', 'f': 'c', 'g': 'b', 'h': 'a',
  };
  return fileMap[file] || file;
}

/**
 * Mirror a rank across the a1-h8 diagonal (1↔8, 2↔7, 3↔6, 4↔5)
 */
function mirrorRank(rank: string): string {
  const rankMap: Record<string, string> = {
    '1': '8', '2': '7', '3': '6', '4': '5',
    '5': '4', '6': '3', '7': '2', '8': '1',
  };
  return rankMap[rank] || rank;
}

/**
 * Get a random file
 */
function getRandomFile(): string {
  return FILES[Math.floor(Math.random() * FILES.length)];
}

/**
 * Get a random rank
 */
function getRandomRank(): string {
  return RANKS[Math.floor(Math.random() * RANKS.length)];
}

export interface DistractorOptions {
  count?: number;           // How many total options (default 10)
  includeCorrect?: boolean; // Include the correct answer (default true)
  shuffle?: boolean;        // Randomize order (default true)
}

/**
 * Generate distractor moves that look similar to the expected move
 */
export function generateDistractors(
  expectedMove: string,
  options: DistractorOptions = {}
): string[] {
  const { count = 10, includeCorrect = true, shuffle = true } = options;

  const distractors = new Set<string>();
  const parsed = parseMove(expectedMove);

  // Strategy 1: Castling swap
  if (parsed.castling === 'short') {
    distractors.add('O-O-O');
  } else if (parsed.castling === 'long') {
    distractors.add('O-O');
  }

  // Strategy 2: Same piece, adjacent squares
  if (parsed.toFile && parsed.toRank) {
    for (const f of getAdjacentFiles(parsed.toFile)) {
      distractors.add(buildMove({ ...parsed, toFile: f }));
    }
    for (const r of getAdjacentRanks(parsed.toRank)) {
      distractors.add(buildMove({ ...parsed, toRank: r }));
    }
    // Diagonal adjacent
    for (const f of getAdjacentFiles(parsed.toFile)) {
      for (const r of getAdjacentRanks(parsed.toRank)) {
        distractors.add(buildMove({ ...parsed, toFile: f, toRank: r }));
      }
    }
  }

  // Strategy 3: Different piece, same square (only for piece moves)
  if (parsed.piece && parsed.toFile && parsed.toRank) {
    for (const p of PIECES) {
      if (p !== parsed.piece) {
        distractors.add(buildMove({ ...parsed, piece: p }));
      }
    }
  }

  // Strategy 4: For pawn moves, try other pieces on same square
  if (!parsed.piece && parsed.toFile && parsed.toRank && !parsed.capture) {
    for (const p of PIECES) {
      distractors.add(buildMove({ ...parsed, piece: p }));
    }
  }

  // Strategy 5: Phonetically similar squares
  if (parsed.toFile && SIMILAR_FILES[parsed.toFile]) {
    for (const f of SIMILAR_FILES[parsed.toFile]) {
      distractors.add(buildMove({ ...parsed, toFile: f }));
    }
  }
  if (parsed.toRank && SIMILAR_RANKS[parsed.toRank]) {
    for (const r of SIMILAR_RANKS[parsed.toRank]) {
      distractors.add(buildMove({ ...parsed, toRank: r }));
    }
  }

  // Strategy 6: Toggle capture (add x or remove x)
  if (parsed.toFile && parsed.toRank) {
    const captureToggled = buildMove({ ...parsed, capture: !parsed.capture });
    if (captureToggled !== expectedMove) {
      distractors.add(captureToggled);
    }
  }

  // Strategy 7: Mirror move (diagonal reflection across a1-h8)
  // This is confusing because a square for white looks like its mirror for black
  // e.g., e4 for white visually appears where d5 is for black
  if (parsed.toFile && parsed.toRank && !parsed.castling) {
    const mirroredFile = mirrorFile(parsed.toFile);
    const mirroredRank = mirrorRank(parsed.toRank);

    // Full mirror (both file and rank)
    distractors.add(buildMove({ ...parsed, toFile: mirroredFile, toRank: mirroredRank }));

    // Mirror variations with same piece, nearby squares
    for (const f of getAdjacentFiles(mirroredFile)) {
      distractors.add(buildMove({ ...parsed, toFile: f, toRank: mirroredRank }));
    }
    for (const r of getAdjacentRanks(mirroredRank)) {
      distractors.add(buildMove({ ...parsed, toFile: mirroredFile, toRank: r }));
    }

    // Different piece on mirror square
    if (parsed.piece) {
      for (const p of PIECES) {
        if (p !== parsed.piece) {
          distractors.add(buildMove({ ...parsed, piece: p, toFile: mirroredFile, toRank: mirroredRank }));
        }
      }
    }
  }

  // Strategy 8: Promotion variants
  if (parsed.promotion) {
    const promoOptions = ['Q', 'R', 'B', 'N'];
    for (const p of promoOptions) {
      if (p !== parsed.promotion) {
        distractors.add(buildMove({ ...parsed, promotion: p }));
      }
    }
    // Also add without promotion
    distractors.add(buildMove({ ...parsed, promotion: null }));
  }

  // Strategy 9: Random squares with same piece
  if (parsed.piece) {
    for (let i = 0; i < 3; i++) {
      const randomMove = buildMove({
        ...parsed,
        toFile: getRandomFile(),
        toRank: getRandomRank(),
        fromFile: null,
        fromRank: null,
      });
      if (randomMove !== expectedMove) {
        distractors.add(randomMove);
      }
    }
  }

  // Strategy 10: Add common moves as fillers
  for (const m of COMMON_MOVES) {
    if (m !== expectedMove && distractors.size < count * 2) {
      distractors.add(m);
    }
  }

  // Remove the expected move from distractors (in case it got added)
  distractors.delete(expectedMove);

  // Convert to array and prioritize similar moves over common fillers
  let result = Array.from(distractors);

  // Limit to count - 1 (saving space for correct answer)
  const targetCount = includeCorrect ? count - 1 : count;
  result = result.slice(0, targetCount);

  // Add correct answer
  if (includeCorrect) {
    result.push(expectedMove);
  }

  // Shuffle
  if (shuffle) {
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }

  return result;
}
