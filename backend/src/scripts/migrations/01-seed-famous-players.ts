#!/usr/bin/env npx tsx

/**
 * Migration 01: Seed database with games from famous chess players
 *
 * Downloads PGN files from PGN Mentor for world champions and historical legends,
 * parses them, and imports them to the database.
 *
 * Usage:
 *   npx tsx src/scripts/migrations/01-seed-famous-players.ts
 *   npm run migrate:01
 */

import 'dotenv/config';
import { connectToDatabase, closeDatabaseConnection } from '../../services/database.js';
import { insertManyGames, getGameCount } from '../../services/gameRepository.js';
import { isMigrationComplete, recordMigration } from '../../services/migrationRepository.js';
import { parsePgnFile, filterGames } from '../pgnBulkParser.js';
import { transformGames, TransformedGame } from '../gameTransformer.js';
import { downloadPlayerPgn, DownloadResult } from './helpers/downloadPgn.js';
import { HistoricalGame } from '../../types/index.js';

const MIGRATION_NAME = '01-seed-famous-players';

// Famous players to download from PGN Mentor
// Comprehensive list: World Champions, Historical Legends, Elite GMs, Women Champions
const PLAYERS = [
  // World Champions (16)
  'Steinitz', 'Lasker', 'Capablanca', 'Alekhine', 'Euwe', 'Botvinnik',
  'Smyslov', 'Tal', 'Petrosian', 'Spassky', 'Fischer', 'Karpov',
  'Kasparov', 'Kramnik', 'Anand', 'Carlsen',
  // Historical Legends (10)
  'Morphy', 'Anderssen', 'Pillsbury', 'Chigorin', 'Tarrasch',
  'Rubinstein', 'Nimzowitsch', 'Tartakower', 'Reti', 'Maroczy',
  // WC Challengers & Legends (10)
  'Bronstein', 'Keres', 'Korchnoi', 'Geller', 'Portisch',
  'Larsen', 'Najdorf', 'Reshevsky', 'Fine', 'Bogoljubov',
  // Contemporary Elite (12)
  'Nakamura', 'Caruana', 'Aronian', 'Firouzja', 'Ding',
  'Topalov', 'Ivanchuk', 'Shirov', 'Gelfand', 'Grischuk',
  'Mamedyarov', 'So',
  // Women Champions (5)
  'Polgar', 'Hou', 'Kosteniuk', 'Muzychuk', 'Koneru',
];

// Filters for game quality
const FILTER_OPTIONS = {
  minMoves: 15, // Skip very short games
  minYear: 1800, // Historical focus
  maxYear: 2024,
};

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log(`Migration: ${MIGRATION_NAME}`);
  console.log('='.repeat(60));

  // Connect to database
  console.log('\nConnecting to database...');
  await connectToDatabase();

  // Check if migration already ran
  const alreadyRan = await isMigrationComplete(MIGRATION_NAME);
  if (alreadyRan) {
    console.log('\nMigration already completed. Skipping.');
    await closeDatabaseConnection();
    return;
  }

  const countBefore = await getGameCount();
  console.log(`Games in database before: ${countBefore}`);

  // Download and process each player
  let totalGamesAdded = 0;
  const playerStats: { player: string; gamesAdded: number }[] = [];

  console.log(`\nProcessing ${PLAYERS.length} players...`);

  for (const playerName of PLAYERS) {
    console.log(`\n--- ${playerName} ---`);

    try {
      // Download PGN
      const downloadResult = await downloadPlayerPgn(playerName);

      // Parse PGN
      console.log('  Parsing games...');
      let games = parsePgnFile(downloadResult.pgnContent);
      console.log(`  Parsed ${games.length} games`);

      // Filter games
      console.log('  Filtering...');
      games = filterGames(games, FILTER_OPTIONS);
      console.log(`  ${games.length} games after filtering`);

      if (games.length === 0) {
        console.log('  No games to import for this player');
        playerStats.push({ player: playerName, gamesAdded: 0 });
        continue;
      }

      // Transform games
      console.log('  Transforming...');
      const transformed: TransformedGame[] = transformGames(games);

      // Prepare for insertion (remove needsReview flags)
      const gamesToInsert: Omit<HistoricalGame, 'id'>[] = transformed.map(
        ({ needsReview, reviewReasons, ...game }) => game
      );

      // Batch insert
      console.log('  Inserting to database...');
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < gamesToInsert.length; i += batchSize) {
        const batch = gamesToInsert.slice(i, i + batchSize);
        try {
          await insertManyGames(batch);
          insertedCount += batch.length;
        } catch (error) {
          console.error(`  Batch insert error: ${(error as Error).message}`);
        }
      }

      console.log(`  Inserted ${insertedCount} games`);
      totalGamesAdded += insertedCount;
      playerStats.push({ player: playerName, gamesAdded: insertedCount });

      // Small delay between players to be respectful
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  Error processing ${playerName}: ${(error as Error).message}`);
      playerStats.push({ player: playerName, gamesAdded: 0 });
    }
  }

  // Record migration
  await recordMigration(MIGRATION_NAME, totalGamesAdded);

  const countAfter = await getGameCount();

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Complete');
  console.log('='.repeat(60));
  console.log(`Games before: ${countBefore}`);
  console.log(`Games added: ${totalGamesAdded}`);
  console.log(`Games after: ${countAfter}`);
  console.log('\nGames per player:');
  playerStats
    .sort((a, b) => b.gamesAdded - a.gamesAdded)
    .forEach(({ player, gamesAdded }) => {
      console.log(`  ${player}: ${gamesAdded}`);
    });

  await closeDatabaseConnection();
}

// Run the migration
main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
