#!/usr/bin/env npx tsx

/**
 * CLI Script to bulk import chess games from PGN files
 *
 * Usage:
 *   npx tsx backend/src/scripts/importGames.ts --file ./data/games.pgn
 *   npx tsx backend/src/scripts/importGames.ts --file ./data/games.pgn --dry-run --limit 100
 *
 * Options:
 *   --file <path>     Path to PGN file (required)
 *   --dry-run         Parse and validate without inserting to database
 *   --limit <n>       Limit number of games to import
 *   --min-year <n>    Only import games from this year or later
 *   --max-year <n>    Only import games up to this year
 *   --min-moves <n>   Only import games with at least this many moves (default: 10)
 *   --exclude-draws   Skip drawn games (1/2-1/2)
 */

import * as fs from 'fs';
import * as path from 'path';
import { connectToDatabase, closeDatabaseConnection } from '../services/database.js';
import { insertManyGames, getGameCount } from '../services/gameRepository.js';
import { parsePgnFile, filterGames, ParsedPgnGame } from './pgnBulkParser.js';
import {
  transformGames,
  generateReviewQueue,
  TransformedGame,
  ReviewQueueEntry,
} from './gameTransformer.js';
import { HistoricalGame } from '../types/index.js';

interface CliOptions {
  file: string;
  dryRun: boolean;
  limit?: number;
  minYear?: number;
  maxYear?: number;
  minMoves: number;
  excludeDraws: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    file: '',
    dryRun: false,
    minMoves: 10,
    excludeDraws: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        options.file = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--min-year':
        options.minYear = parseInt(args[++i], 10);
        break;
      case '--max-year':
        options.maxYear = parseInt(args[++i], 10);
        break;
      case '--min-moves':
        options.minMoves = parseInt(args[++i], 10);
        break;
      case '--exclude-draws':
        options.excludeDraws = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Chess Game Importer - Bulk import PGN games to MongoDB

Usage:
  npx tsx backend/src/scripts/importGames.ts --file <path> [options]

Options:
  --file <path>      Path to PGN file (required)
  --dry-run          Parse and validate without inserting to database
  --limit <n>        Limit number of games to import
  --min-year <n>     Only import games from this year or later
  --max-year <n>     Only import games up to this year
  --min-moves <n>    Only import games with at least this many moves (default: 10)
  --exclude-draws    Skip drawn games (1/2-1/2)
  --help, -h         Show this help message

Examples:
  # Dry run to preview import
  npx tsx backend/src/scripts/importGames.ts --file ./data/historical.pgn --dry-run --limit 100

  # Import historical games only (before year 2000)
  npx tsx backend/src/scripts/importGames.ts --file ./data/games.pgn --max-year 2000

  # Import with all filters
  npx tsx backend/src/scripts/importGames.ts --file ./data/games.pgn --min-year 1850 --max-year 1999 --exclude-draws --limit 500
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Validate required options
  if (!options.file) {
    console.error('Error: --file option is required');
    printHelp();
    process.exit(1);
  }

  // Check file exists
  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Chess Game Importer');
  console.log('='.repeat(60));
  console.log(`File: ${filePath}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Limit: ${options.limit || 'none'}`);
  console.log(`Min year: ${options.minYear || 'none'}`);
  console.log(`Max year: ${options.maxYear || 'none'}`);
  console.log(`Min moves: ${options.minMoves}`);
  console.log(`Exclude draws: ${options.excludeDraws}`);
  console.log('='.repeat(60));

  // Read PGN file
  console.log('\nReading PGN file...');
  const pgnContent = fs.readFileSync(filePath, 'utf-8');
  console.log(`File size: ${(pgnContent.length / 1024 / 1024).toFixed(2)} MB`);

  // Parse PGN
  console.log('\nParsing PGN games...');
  let games: ParsedPgnGame[] = parsePgnFile(pgnContent);
  console.log(`Parsed ${games.length} games from file`);

  // Filter games
  console.log('\nFiltering games...');
  games = filterGames(games, {
    minYear: options.minYear,
    maxYear: options.maxYear,
    minMoves: options.minMoves,
    excludeDraws: options.excludeDraws,
  });
  console.log(`${games.length} games after filtering`);

  // Apply limit
  if (options.limit && games.length > options.limit) {
    games = games.slice(0, options.limit);
    console.log(`Limited to ${games.length} games`);
  }

  if (games.length === 0) {
    console.log('\nNo games to import. Check your filters.');
    process.exit(0);
  }

  // Transform games
  console.log('\nTransforming games to database format...');
  const transformed: TransformedGame[] = transformGames(games);

  // Generate review queue
  const reviewQueue: ReviewQueueEntry[] = generateReviewQueue(transformed);
  console.log(`${reviewQueue.length} games flagged for manual review`);

  // Show sample of transformed games
  console.log('\nSample games:');
  transformed.slice(0, 3).forEach((game, i) => {
    console.log(`  ${i + 1}. ${game.title}`);
    console.log(`     Event: ${game.event}`);
    console.log(`     Year: ${game.year}`);
    console.log(`     Players: ${game.white.name} vs ${game.black.name}`);
    console.log(`     Moves: ${game.moves.length}`);
    console.log(`     Difficulty: ${game.difficulty}`);
    console.log(`     Needs review: ${game.needsReview}`);
  });

  if (options.dryRun) {
    console.log('\n' + '='.repeat(60));
    console.log('DRY RUN - No changes made to database');
    console.log('='.repeat(60));

    // Save review queue for inspection
    const reviewQueuePath = path.join(path.dirname(filePath), 'reviewQueue.json');
    fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2));
    console.log(`\nReview queue saved to: ${reviewQueuePath}`);

    // Summary
    console.log('\nSummary:');
    console.log(`  Total games to import: ${transformed.length}`);
    console.log(`  Games needing review: ${reviewQueue.length}`);
    console.log(`  Ready for import: ${transformed.length - reviewQueue.length}`);

    return;
  }

  // Connect to database
  console.log('\nConnecting to database...');
  await connectToDatabase();

  const countBefore = await getGameCount();
  console.log(`Games in database before: ${countBefore}`);

  // Prepare games for insertion (remove needsReview and reviewReasons)
  const gamesToInsert: Omit<HistoricalGame, 'id'>[] = transformed.map(
    ({ needsReview, reviewReasons, ...game }) => game
  );

  // Batch insert
  console.log('\nInserting games...');
  const batchSize = 100;
  let insertedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < gamesToInsert.length; i += batchSize) {
    const batch = gamesToInsert.slice(i, i + batchSize);
    try {
      await insertManyGames(batch);
      insertedCount += batch.length;
      console.log(`  Progress: ${insertedCount}/${gamesToInsert.length}`);
    } catch (error) {
      const errorMsg = `Batch ${Math.floor(i / batchSize) + 1} failed: ${(error as Error).message}`;
      errors.push(errorMsg);
      console.error(`  Error: ${errorMsg}`);
    }
  }

  const countAfter = await getGameCount();

  // Save review queue
  const reviewQueuePath = path.join(path.dirname(filePath), 'reviewQueue.json');
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2));

  // Close database
  await closeDatabaseConnection();

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('Import Complete');
  console.log('='.repeat(60));
  console.log(`Games before: ${countBefore}`);
  console.log(`Games inserted: ${insertedCount}`);
  console.log(`Games after: ${countAfter}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Review queue saved to: ${reviewQueuePath}`);

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach((err) => console.log(`  - ${err}`));
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
