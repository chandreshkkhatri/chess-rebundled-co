import { Collection } from 'mongodb';
import { getDatabase } from './database.js';

interface Migration {
  name: string;
  executedAt: Date;
  gamesAdded: number;
}

let migrationsCollection: Collection<Migration> | null = null;

function getCollection(): Collection<Migration> {
  if (!migrationsCollection) {
    const db = getDatabase();
    migrationsCollection = db.collection<Migration>('migrations');
  }
  return migrationsCollection;
}

export async function isMigrationComplete(name: string): Promise<boolean> {
  const collection = getCollection();
  const migration = await collection.findOne({ name });
  return migration !== null;
}

export async function recordMigration(name: string, gamesAdded: number): Promise<void> {
  const collection = getCollection();
  await collection.insertOne({
    name,
    executedAt: new Date(),
    gamesAdded,
  });
}

export async function getMigrationHistory(): Promise<Migration[]> {
  const collection = getCollection();
  return collection.find({}).sort({ executedAt: 1 }).toArray();
}
