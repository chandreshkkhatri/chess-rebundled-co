import { Chess } from 'chess.js';

export interface ParsedPgnGame {
  headers: {
    event: string;
    site: string;
    date: string;
    round: string;
    white: string;
    black: string;
    result: string;
    eco?: string;
    whiteElo?: string;
    blackElo?: string;
    [key: string]: string | undefined;
  };
  pgn: string;
  moves: string[];
}

/**
 * Parse a multi-game PGN file and extract individual games
 */
export function parsePgnFile(pgnContent: string): ParsedPgnGame[] {
  const games: ParsedPgnGame[] = [];

  // Split by empty line followed by [Event which marks start of new game
  // PGN format: headers, empty line, moves, empty line(s), next game
  const gameStrings = splitIntoGames(pgnContent);

  for (const gameStr of gameStrings) {
    try {
      const parsed = parseSingleGame(gameStr);
      if (parsed && parsed.moves.length >= 10) {
        games.push(parsed);
      }
    } catch (error) {
      // Skip invalid games, log for debugging
      console.warn('Failed to parse game:', (error as Error).message);
    }
  }

  return games;
}

/**
 * Split a multi-game PGN string into individual game strings
 */
function splitIntoGames(pgnContent: string): string[] {
  const games: string[] = [];
  const lines = pgnContent.split('\n');

  let currentGame: string[] = [];
  let inGame = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Start of a new game (Event header)
    if (trimmedLine.startsWith('[Event ')) {
      if (currentGame.length > 0) {
        games.push(currentGame.join('\n'));
      }
      currentGame = [line];
      inGame = true;
    } else if (inGame) {
      currentGame.push(line);
    }
  }

  // Don't forget the last game
  if (currentGame.length > 0) {
    games.push(currentGame.join('\n'));
  }

  return games;
}

/**
 * Parse a single PGN game string
 */
function parseSingleGame(pgnStr: string): ParsedPgnGame | null {
  const headers = extractHeaders(pgnStr);

  // Validate required headers
  if (!headers.event || !headers.white || !headers.black || !headers.result) {
    return null;
  }

  // Parse moves using chess.js
  const chess = new Chess();
  try {
    chess.loadPgn(pgnStr);
  } catch {
    return null;
  }

  const moves = chess.history();

  if (moves.length === 0) {
    return null;
  }

  return {
    headers,
    pgn: pgnStr,
    moves,
  };
}

/**
 * Extract PGN headers from a game string
 */
function extractHeaders(pgnStr: string): ParsedPgnGame['headers'] {
  const headers: ParsedPgnGame['headers'] = {
    event: '',
    site: '',
    date: '',
    round: '',
    white: '',
    black: '',
    result: '',
  };

  // Match all header lines: [Key "Value"]
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;

  while ((match = headerRegex.exec(pgnStr)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2];

    switch (key) {
      case 'event':
        headers.event = value;
        break;
      case 'site':
        headers.site = value;
        break;
      case 'date':
        headers.date = value;
        break;
      case 'round':
        headers.round = value;
        break;
      case 'white':
        headers.white = value;
        break;
      case 'black':
        headers.black = value;
        break;
      case 'result':
        headers.result = value;
        break;
      case 'eco':
        headers.eco = value;
        break;
      case 'whiteelo':
        headers.whiteElo = value;
        break;
      case 'blackelo':
        headers.blackElo = value;
        break;
      default:
        headers[key] = value;
    }
  }

  return headers;
}

/**
 * Extract year from PGN date header
 * Date format is typically: YYYY.MM.DD or YYYY.??.?? for unknown
 */
export function extractYear(dateStr: string): number | null {
  if (!dateStr) return null;

  const yearMatch = dateStr.match(/^(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1475 && year <= new Date().getFullYear()) {
      return year;
    }
  }

  return null;
}

/**
 * Filter games by criteria
 */
export function filterGames(
  games: ParsedPgnGame[],
  options: {
    minYear?: number;
    maxYear?: number;
    minMoves?: number;
    maxMoves?: number;
    minElo?: number;
    excludeDraws?: boolean;
  } = {}
): ParsedPgnGame[] {
  return games.filter((game) => {
    const year = extractYear(game.headers.date);

    // Year filter
    if (options.minYear && year && year < options.minYear) return false;
    if (options.maxYear && year && year > options.maxYear) return false;

    // Move count filter
    if (options.minMoves && game.moves.length < options.minMoves) return false;
    if (options.maxMoves && game.moves.length > options.maxMoves) return false;

    // ELO filter
    if (options.minElo) {
      const whiteElo = parseInt(game.headers.whiteElo || '0', 10);
      const blackElo = parseInt(game.headers.blackElo || '0', 10);
      if (whiteElo < options.minElo && blackElo < options.minElo) return false;
    }

    // Draw filter
    if (options.excludeDraws && game.headers.result === '1/2-1/2') return false;

    return true;
  });
}
