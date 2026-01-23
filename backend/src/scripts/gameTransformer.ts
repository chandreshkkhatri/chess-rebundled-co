import { HistoricalGame } from '../types/index.js';
import { ParsedPgnGame, extractYear } from './pgnBulkParser.js';

export interface TransformedGame extends Omit<HistoricalGame, 'id'> {
  needsReview: boolean;
  reviewReasons: string[];
}

export interface TransformOptions {
  defaultDifficulty?: 'beginner' | 'intermediate' | 'advanced';
  generateTitle?: boolean;
}

/**
 * Transform a parsed PGN game into the HistoricalGame format
 */
export function transformGame(
  parsed: ParsedPgnGame,
  options: TransformOptions = {}
): TransformedGame {
  const { headers, pgn, moves } = parsed;
  const reviewReasons: string[] = [];

  // Extract year
  const year = extractYear(headers.date);
  if (!year) {
    reviewReasons.push('Missing or invalid year');
  }

  // Extract player names
  const whiteName = headers.white || 'Unknown';
  const blackName = headers.black || 'Unknown';

  if (whiteName === 'Unknown' || blackName === 'Unknown') {
    reviewReasons.push('Missing player name(s)');
  }

  // Extract short names (last name or single name)
  const whiteShortName = extractShortName(whiteName);
  const blackShortName = extractShortName(blackName);

  // Validate and normalize result
  const result = normalizeResult(headers.result);
  if (!result) {
    reviewReasons.push('Invalid game result');
  }

  // Generate title
  const title = generateTitle(whiteShortName, blackShortName, headers.event, year);

  // Estimate difficulty based on game characteristics
  const difficulty = options.defaultDifficulty || estimateDifficulty(parsed);

  // Empty trivia - needs manual review
  const trivia: string[] = [];
  reviewReasons.push('Trivia needs to be added');

  return {
    title,
    event: headers.event || 'Unknown Event',
    year: year || 1900,
    white: {
      name: whiteName,
      shortName: whiteShortName,
    },
    black: {
      name: blackName,
      shortName: blackShortName,
    },
    result: result || '1-0',
    pgn,
    moves,
    difficulty,
    trivia,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

/**
 * Extract short name (typically last name) from full player name
 * Handles various formats:
 * - "Kasparov, Garry" -> "Kasparov"
 * - "Bobby Fischer" -> "Fischer"
 * - "Morphy" -> "Morphy"
 */
function extractShortName(fullName: string): string {
  if (!fullName || fullName === 'Unknown') {
    return 'Unknown';
  }

  // Handle "LastName, FirstName" format
  if (fullName.includes(',')) {
    return fullName.split(',')[0].trim();
  }

  // Handle "FirstName LastName" format - take last part
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }

  // Single name
  return fullName.trim();
}

/**
 * Normalize game result to valid format
 */
function normalizeResult(result: string): '1-0' | '0-1' | '1/2-1/2' | null {
  if (!result) return null;

  const normalized = result.trim();

  if (normalized === '1-0') return '1-0';
  if (normalized === '0-1') return '0-1';
  if (normalized === '1/2-1/2' || normalized === '½-½') return '1/2-1/2';

  return null;
}

/**
 * Generate a title for the game
 */
function generateTitle(
  whiteShort: string,
  blackShort: string,
  event: string,
  year: number | null
): string {
  const players = `${whiteShort} vs ${blackShort}`;
  const eventPart = event && event !== 'Unknown Event' ? `, ${event}` : '';
  const yearPart = year ? ` (${year})` : '';

  return `${players}${eventPart}${yearPart}`;
}

/**
 * Estimate game difficulty based on various factors
 */
function estimateDifficulty(
  parsed: ParsedPgnGame
): 'beginner' | 'intermediate' | 'advanced' {
  const { moves, headers } = parsed;
  const moveCount = moves.length;

  // Check for high-rated players
  const whiteElo = parseInt(headers.whiteElo || '0', 10);
  const blackElo = parseInt(headers.blackElo || '0', 10);
  const maxElo = Math.max(whiteElo, blackElo);

  // Very high-level games are advanced
  if (maxElo >= 2600) {
    return 'advanced';
  }

  // Long games tend to be more complex
  if (moveCount > 60) {
    return 'advanced';
  }

  // Medium-length games with decent players
  if (moveCount > 40 || maxElo >= 2400) {
    return 'intermediate';
  }

  // Short tactical games or lower-rated
  return 'beginner';
}

/**
 * Batch transform multiple games
 */
export function transformGames(
  games: ParsedPgnGame[],
  options: TransformOptions = {}
): TransformedGame[] {
  return games.map((game) => transformGame(game, options));
}

/**
 * Generate review queue entry for manual review
 */
export interface ReviewQueueEntry {
  index: number;
  title: string;
  event: string;
  year: number;
  white: string;
  black: string;
  moveCount: number;
  reviewReasons: string[];
  suggestedTitle: string;
}

export function generateReviewQueue(games: TransformedGame[]): ReviewQueueEntry[] {
  return games
    .map((game, index) => ({
      index,
      title: game.title,
      event: game.event,
      year: game.year,
      white: game.white.name,
      black: game.black.name,
      moveCount: game.moves.length,
      reviewReasons: game.reviewReasons,
      suggestedTitle: game.title,
    }))
    .filter((entry) => entry.reviewReasons.length > 0);
}
