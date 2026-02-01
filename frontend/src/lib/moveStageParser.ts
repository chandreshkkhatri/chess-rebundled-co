/**
 * Move Stage Parser
 *
 * Utilities for two-stage move input selection with systematic mirror distractors.
 */

import { parseMove } from './distractorGenerator';

// Stage types
export type SelectionStage = 'piece' | 'pawnFile' | 'disambiguation' | 'destination' | 'promotion';

// Stage state interface
export interface StageState {
  stage: SelectionStage;
  selectedPiece: string | null;        // 'N', 'B', 'R', 'Q', 'K', 'P' for pawn, 'O' for castling
  selectedPawnFile: string | null;     // 'a'-'h' for which pawn file (when P selected)
  selectedDisambiguation: string | null; // file or rank for disambiguation
  selectedDestination: string | null;
}

// Initial stage state
export const initialStageState: StageState = {
  stage: 'piece',
  selectedPiece: null,
  selectedPawnFile: null,
  selectedDisambiguation: null,
  selectedDestination: null,
};

const FILE_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/**
 * Get horizontal mirror of a file (a↔h, b↔g, c↔f, d↔e)
 */
function horizontalMirrorFile(file: string): string {
  const map: Record<string, string> = {
    'a': 'h', 'b': 'g', 'c': 'f', 'd': 'e',
    'e': 'd', 'f': 'c', 'g': 'b', 'h': 'a',
  };
  return map[file] || file;
}

/**
 * Get vertical mirror of a rank (1↔8, 2↔7, 3↔6, 4↔5)
 */
function verticalMirrorRank(rank: string): string {
  const map: Record<string, string> = {
    '1': '8', '2': '7', '3': '6', '4': '5',
    '5': '4', '6': '3', '7': '2', '8': '1',
  };
  return map[rank] || rank;
}

/**
 * Get diagonal mirror of a square (swap file position with rank position)
 * e.g., e4 → d5 (both are 4 steps from corner)
 */
function diagonalMirrorSquare(file: string, rank: string): { file: string; rank: string } {
  // Mirror across a1-h8 diagonal: swap file index with rank index
  const fileIdx = FILE_ORDER.indexOf(file);
  const rankIdx = parseInt(rank) - 1;

  // Swap positions
  const newFileIdx = rankIdx;
  const newRankIdx = fileIdx;

  return {
    file: FILE_ORDER[newFileIdx] || file,
    rank: String(newRankIdx + 1),
  };
}

/**
 * Extract available pieces from legal moves
 * Returns pieces that can move (N, B, R, Q, K), 'P' for pawns, 'O' for castling
 */
export function getAvailablePieces(legalMoves: string[]): string[] {
  const pieces = new Set<string>();
  let hasPawnMove = false;

  for (const move of legalMoves) {
    // Handle castling
    if (move === 'O-O' || move === 'O-O-O') {
      pieces.add('O');
      continue;
    }

    const parsed = parseMove(move);

    if (parsed.piece) {
      // Piece move (N, B, R, Q, K)
      pieces.add(parsed.piece);
    } else if (parsed.toFile) {
      // Pawn move - just track that pawns can move
      hasPawnMove = true;
    }
  }

  // Add 'P' for pawns if any pawn can move
  if (hasPawnMove) {
    pieces.add('P');
  }

  // Sort: pieces first (K, Q, R, B, N), then P for pawns, then O for castling
  const FULL_PIECE_ORDER = ['K', 'Q', 'R', 'B', 'N', 'P', 'O'];
  return Array.from(pieces).sort((a, b) => {
    return FULL_PIECE_ORDER.indexOf(a) - FULL_PIECE_ORDER.indexOf(b);
  });
}

/**
 * Check if disambiguation is needed for a piece
 * Returns disambiguation options (files or ranks) if needed, null otherwise
 */
export function getDisambiguationOptions(
  legalMoves: string[],
  selectedPiece: string
): string[] | null {
  if (selectedPiece === 'O' || FILE_ORDER.includes(selectedPiece)) {
    // Castling and pawns don't need disambiguation in the traditional sense
    return null;
  }

  // Find all moves for this piece
  const pieceMoves = legalMoves.filter(move => {
    const parsed = parseMove(move);
    return parsed.piece === selectedPiece;
  });

  // Check if any destination has multiple source options
  const destToDisambig = new Map<string, Set<string>>();

  for (const move of pieceMoves) {
    const parsed = parseMove(move);
    if (!parsed.toFile || !parsed.toRank) continue;

    const dest = parsed.toFile + parsed.toRank;
    const disambig = parsed.fromFile || parsed.fromRank;

    if (disambig) {
      if (!destToDisambig.has(dest)) {
        destToDisambig.set(dest, new Set());
      }
      destToDisambig.get(dest)!.add(disambig);
    }
  }

  // If any destination has multiple disambiguation options, we need disambiguation stage
  for (const [, disambigs] of destToDisambig) {
    if (disambigs.size > 1) {
      return Array.from(disambigs).sort();
    }
  }

  return null;
}

/**
 * Get legal destinations for a selected piece (and optional disambiguation)
 * For pawns (selectedPiece === 'P'), returns full SAN moves (e4, exd5, e8=Q)
 * For pawn files (a-h), returns destination squares
 */
export function getLegalDestinations(
  legalMoves: string[],
  selectedPiece: string,
  selectedDisambiguation: string | null = null
): string[] {
  const destinations = new Set<string>();

  // Handle castling
  if (selectedPiece === 'O') {
    if (legalMoves.includes('O-O')) destinations.add('O-O');
    if (legalMoves.includes('O-O-O')) destinations.add('O-O-O');
    return Array.from(destinations);
  }

  // Handle 'P' - return all pawn moves as full SAN (without +/#)
  if (selectedPiece === 'P') {
    for (const move of legalMoves) {
      const parsed = parseMove(move);
      // Pawn moves have no piece letter
      if (!parsed.piece && parsed.toFile && parsed.toRank) {
        // Strip check/mate symbols for display
        const cleanMove = move.replace(/[+#]/g, '');
        destinations.add(cleanMove);
      }
    }
    return Array.from(destinations).sort();
  }

  const isPawnFile = FILE_ORDER.includes(selectedPiece);

  for (const move of legalMoves) {
    const parsed = parseMove(move);

    if (isPawnFile) {
      // For specific pawn file, match by source file
      const pawnFile = parsed.capture ? parsed.fromFile : parsed.toFile;
      if (pawnFile === selectedPiece && parsed.toFile && parsed.toRank) {
        destinations.add(parsed.toFile + parsed.toRank);
      }
    } else if (parsed.piece === selectedPiece) {
      // For pieces, check disambiguation if needed
      if (selectedDisambiguation) {
        if (parsed.fromFile !== selectedDisambiguation && parsed.fromRank !== selectedDisambiguation) {
          continue;
        }
      }
      if (parsed.toFile && parsed.toRank) {
        destinations.add(parsed.toFile + parsed.toRank);
      }
    }
  }

  return Array.from(destinations).sort();
}

/**
 * Generate mirror distractors for a destination square
 * Returns a limited number of mirror squares (1-2) to avoid overwhelming the user
 */
export function getMirrorDistractors(destination: string, maxDistractors: number = 1): string[] {
  if (destination.length !== 2) return [];

  const file = destination[0];
  const rank = destination[1];

  const allMirrors: string[] = [];

  // Horizontal mirror (a↔h, b↔g, etc.)
  const hMirror = horizontalMirrorFile(file) + rank;
  if (hMirror !== destination) allMirrors.push(hMirror);

  // Vertical mirror (1↔8, 2↔7, etc.)
  const vMirror = file + verticalMirrorRank(rank);
  if (vMirror !== destination) allMirrors.push(vMirror);

  // Diagonal mirror
  const dMirror = diagonalMirrorSquare(file, rank);
  const dMirrorStr = dMirror.file + dMirror.rank;
  if (dMirrorStr !== destination) allMirrors.push(dMirrorStr);

  // Full mirror (both horizontal and vertical)
  const fullMirror = horizontalMirrorFile(file) + verticalMirrorRank(rank);
  if (fullMirror !== destination && !allMirrors.includes(fullMirror)) allMirrors.push(fullMirror);

  // Return limited number of distractors (shuffle and take first N)
  // Use a simple deterministic shuffle based on destination to be consistent
  const seed = destination.charCodeAt(0) + destination.charCodeAt(1);
  const shuffled = allMirrors.sort((a, b) => {
    const aVal = (a.charCodeAt(0) + a.charCodeAt(1) + seed) % 4;
    const bVal = (b.charCodeAt(0) + b.charCodeAt(1) + seed) % 4;
    return aVal - bVal;
  });

  return shuffled.slice(0, maxDistractors);
}

/**
 * Prioritize pawn moves when there are too many to display
 * Priority: promotions > captures > center files > edge files
 */
function prioritizePawnMoves(moves: string[], maxOptions: number): string[] {
  const scored = moves.map(move => {
    let score = 0;

    // Promotions are highest priority (critical moves)
    if (move.includes('=')) score += 100;

    // Captures are high priority (tactical)
    if (move.includes('x')) score += 50;

    // Center files (d, e) are more important
    const file = move[0];
    if (file === 'd' || file === 'e') score += 20;
    else if (file === 'c' || file === 'f') score += 10;
    // a, b, g, h get no bonus

    return { move, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxOptions)
    .map(s => s.move);
}

/**
 * Get destination options with mirror distractors
 * Caps total options at maxOptions (default 10)
 */
export function getDestinationOptionsWithDistractors(
  legalMoves: string[],
  selectedPiece: string,
  selectedDisambiguation: string | null = null,
  maxOptions: number = 10
): string[] {
  const legalDestinations = getLegalDestinations(legalMoves, selectedPiece, selectedDisambiguation);

  // For castling, just return the options (1-2 max, no distractors)
  if (selectedPiece === 'O') {
    return legalDestinations;
  }

  // For pawn moves, return full SANs without distractors
  // If too many, prioritize the most important ones
  if (selectedPiece === 'P') {
    if (legalDestinations.length > maxOptions) {
      return prioritizePawnMoves(legalDestinations, maxOptions);
    }
    return legalDestinations;
  }

  // For piece moves: fill up to maxOptions with distractors
  const distractorBudget = Math.max(0, maxOptions - legalDestinations.length);

  if (distractorBudget === 0) {
    // Already at or over max, just return legal destinations (truncated if needed)
    return legalDestinations.slice(0, maxOptions);
  }

  // Collect distractors up to budget
  const allOptions = new Set(legalDestinations);
  let distractorCount = 0;

  // Round-robin: add 1 mirror per legal destination until budget exhausted
  for (const dest of legalDestinations) {
    if (distractorCount >= distractorBudget) break;
    const mirrors = getMirrorDistractors(dest, 1);
    for (const mirror of mirrors) {
      if (!allOptions.has(mirror) && distractorCount < distractorBudget) {
        allOptions.add(mirror);
        distractorCount++;
      }
    }
  }

  // If still have budget, try getting more mirrors from each destination
  if (distractorCount < distractorBudget) {
    for (const dest of legalDestinations) {
      if (distractorCount >= distractorBudget) break;
      const mirrors = getMirrorDistractors(dest, 4); // Get all possible mirrors
      for (const mirror of mirrors) {
        if (!allOptions.has(mirror) && distractorCount < distractorBudget) {
          allOptions.add(mirror);
          distractorCount++;
        }
      }
    }
  }

  // Shuffle all options together (deterministic based on first legal destination)
  const result = Array.from(allOptions);
  const seed = legalDestinations[0]?.charCodeAt(0) || 0;
  return result.sort((a, b) => {
    const aVal = (a.charCodeAt(0) * 8 + a.charCodeAt(1) + seed) % 64;
    const bVal = (b.charCodeAt(0) * 8 + b.charCodeAt(1) + seed) % 64;
    return aVal - bVal;
  });
}

/**
 * Get promotion options (always Q, R, B, N)
 */
export function getPromotionOptions(): string[] {
  return ['Q', 'R', 'B', 'N'];
}

/**
 * Build the final move SAN from selection state
 */
export function buildMoveFromSelection(
  state: StageState,
  legalMoves: string[],
  promotion: string | null = null
): string | null {
  const { selectedPiece, selectedPawnFile, selectedDisambiguation, selectedDestination } = state;

  if (!selectedPiece || !selectedDestination) return null;

  // Handle castling
  if (selectedPiece === 'O') {
    if (legalMoves.includes(selectedDestination)) {
      return selectedDestination;
    }
    return null;
  }

  // Handle pawn moves when selectedDestination is already a full SAN (e.g., "e4", "exd5")
  // This happens when piece is 'P' and we skipped the pawnFile stage
  if (selectedPiece === 'P' && !selectedPawnFile) {
    // The destination is already the full move SAN (without +/#)
    // Find matching legal move (may have +/# suffix)
    const match = legalMoves.find(move => move.replace(/[+#]/g, '') === selectedDestination);
    return match || null;
  }

  // For pawns with specific file (legacy path), use selectedPawnFile
  const isPawn = selectedPiece === 'P';
  const pawnFileToMatch = isPawn ? selectedPawnFile : null;

  // Find matching legal move
  const match = legalMoves.find(move => {
    const parsed = parseMove(move);

    if (isPawn) {
      if (parsed.piece) return false; // Not a pawn move
      if (!pawnFileToMatch) return false;

      const pawnFile = parsed.capture ? parsed.fromFile : parsed.toFile;
      const dest = parsed.toFile! + parsed.toRank!;

      if (pawnFile !== pawnFileToMatch || dest !== selectedDestination) return false;

      // Check promotion match
      if (promotion) {
        return parsed.promotion === promotion;
      } else {
        return parsed.promotion === null;
      }
    } else {
      if (parsed.piece !== selectedPiece) return false;

      const dest = parsed.toFile! + parsed.toRank!;
      if (dest !== selectedDestination) return false;

      // Check disambiguation match
      if (selectedDisambiguation) {
        return parsed.fromFile === selectedDisambiguation || parsed.fromRank === selectedDisambiguation;
      }

      return true;
    }
  });

  return match || null;
}

/**
 * Check if a destination is a legal move
 */
export function isLegalDestination(
  legalMoves: string[],
  selectedPiece: string,
  destination: string,
  selectedDisambiguation: string | null = null
): boolean {
  const legalDests = getLegalDestinations(legalMoves, selectedPiece, selectedDisambiguation);
  return legalDests.includes(destination);
}

/**
 * Get display label for a stage
 */
export function getStageLabel(state: StageState, voiceEnabled: boolean): string {
  switch (state.stage) {
    case 'piece':
      return voiceEnabled ? 'Tap or speak piece' : 'Select piece';
    case 'pawnFile':
      return 'Which pawn?';
    case 'disambiguation':
      return `Which ${state.selectedPiece}?`;
    case 'destination': {
      // For pawns (P without pawnFile), show "Select pawn move"
      if (state.selectedPiece === 'P' && !state.selectedPawnFile) {
        return 'Select pawn move';
      }
      const piece = state.selectedPawnFile || state.selectedPiece;
      return `Move ${piece} to...`;
    }
    case 'promotion':
      return 'Promote to...';
    default:
      return '';
  }
}

/**
 * Get breadcrumb display for current selection
 */
export function getSelectionBreadcrumb(state: StageState): string {
  const parts: string[] = [];

  if (state.selectedPiece) {
    if (state.selectedPiece === 'P' && state.selectedPawnFile) {
      parts.push(`P(${state.selectedPawnFile})`);
    } else if (state.selectedPiece === 'P') {
      parts.push('Pawn');
    } else {
      parts.push(state.selectedPiece);
    }
  }
  if (state.selectedDisambiguation) {
    parts.push(`(${state.selectedDisambiguation})`);
  }
  if (state.selectedDestination && state.stage !== 'destination') {
    parts.push('→');
    parts.push(state.selectedDestination);
  }

  return parts.join(' ');
}
