import { Chess } from 'chess.js';

export interface MoveValidationResult {
  isValid: boolean;
  normalizedMove: string;
  matchesExpected: boolean;
}

export class PgnService {
  private chess: Chess;

  constructor() {
    this.chess = new Chess();
  }

  /**
   * Parse PGN and extract moves array
   */
  parsePgn(pgn: string): string[] {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history();
  }

  /**
   * Get FEN at a specific move index
   */
  getFenAtMove(moves: string[], moveIndex: number): string {
    const chess = new Chess();
    for (let i = 0; i < moveIndex && i < moves.length; i++) {
      chess.move(moves[i]);
    }
    return chess.fen();
  }

  /**
   * Validate a submitted move against the expected move
   */
  validateMove(
    submittedMove: string,
    expectedMove: string,
    currentFen: string
  ): MoveValidationResult {
    const chess = new Chess(currentFen);

    // Normalize the submitted move
    const normalizedSubmitted = this.normalizeMove(submittedMove);
    const normalizedExpected = this.normalizeMove(expectedMove);

    // Try to make the move to see if it's valid
    try {
      const move = chess.move(normalizedSubmitted);
      if (move) {
        // Check if it matches the expected move (ignoring check/mate symbols)
        const matchesExpected = this.movesMatch(move.san, expectedMove);
        return {
          isValid: true,
          normalizedMove: move.san,
          matchesExpected,
        };
      }
    } catch {
      // Try with sloppy parsing (more lenient)
      try {
        const move = chess.move(normalizedSubmitted, { strict: false });
        if (move) {
          const matchesExpected = this.movesMatch(move.san, expectedMove);
          return {
            isValid: true,
            normalizedMove: move.san,
            matchesExpected,
          };
        }
      } catch {
        // Move is invalid
      }
    }

    return {
      isValid: false,
      normalizedMove: submittedMove,
      matchesExpected: false,
    };
  }

  /**
   * Check if two moves are the same (ignoring check/checkmate symbols)
   */
  private movesMatch(move1: string, move2: string): boolean {
    const clean1 = move1.replace(/[+#!?]/g, '');
    const clean2 = move2.replace(/[+#!?]/g, '');
    return clean1 === clean2;
  }

  /**
   * Normalize move notation for comparison
   */
  private normalizeMove(move: string): string {
    return move
      .trim()
      // Handle common voice recognition errors
      .replace(/knight/gi, 'N')
      .replace(/king/gi, 'K')
      .replace(/queen/gi, 'Q')
      .replace(/rook/gi, 'R')
      .replace(/bishop/gi, 'B')
      .replace(/pawn/gi, '')
      // Handle capture variations
      .replace(/takes/gi, 'x')
      .replace(/captures/gi, 'x')
      .replace(/by/gi, 'x')
      // Handle castling
      .replace(/castle\s*king\s*side/gi, 'O-O')
      .replace(/castle\s*queen\s*side/gi, 'O-O-O')
      .replace(/short\s*castle/gi, 'O-O')
      .replace(/long\s*castle/gi, 'O-O-O')
      .replace(/0-0-0/gi, 'O-O-O')
      .replace(/0-0/gi, 'O-O')
      // Remove "to" and extra spaces
      .replace(/\s*to\s*/gi, '')
      .replace(/\s+/g, '');
  }

  /**
   * Get legal moves for current position
   */
  getLegalMoves(fen: string): string[] {
    const chess = new Chess(fen);
    return chess.moves();
  }
}
