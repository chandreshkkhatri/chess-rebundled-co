/**
 * Move Parser Utilities
 *
 * Parses chess moves in Standard Algebraic Notation (SAN) into components.
 * Used by moveStageParser.ts for staged move input.
 */

export interface ParsedMove {
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
export function parseMove(san: string): ParsedMove {
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
