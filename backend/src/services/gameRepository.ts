import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from './database.js';
import { HistoricalGame } from '../types/index.js';

// MongoDB document type (with _id)
interface GameDocument extends Omit<HistoricalGame, 'id'> {
  _id?: ObjectId;
}

let gamesCollection: Collection<GameDocument> | null = null;

function getCollection(): Collection<GameDocument> {
  if (!gamesCollection) {
    const db = getDatabase();
    gamesCollection = db.collection<GameDocument>('games');
  }
  return gamesCollection;
}

// Convert MongoDB document to HistoricalGame
function toHistoricalGame(doc: GameDocument & { _id: ObjectId }): HistoricalGame {
  const { _id, ...rest } = doc;
  return {
    id: _id.toHexString(),
    ...rest,
  };
}

export async function getRandomGame(): Promise<HistoricalGame | null> {
  const collection = getCollection();

  // Use aggregation with $sample for random selection
  const results = await collection.aggregate<GameDocument & { _id: ObjectId }>([
    { $sample: { size: 1 } },
  ]).toArray();

  if (results.length === 0) {
    return null;
  }

  return toHistoricalGame(results[0]);
}

export async function getGameById(id: string): Promise<HistoricalGame | null> {
  const collection = getCollection();

  try {
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return null;
    }
    return toHistoricalGame(doc as GameDocument & { _id: ObjectId });
  } catch {
    // Invalid ObjectId format
    return null;
  }
}

export async function getAllGames(): Promise<HistoricalGame[]> {
  const collection = getCollection();
  const docs = await collection.find({}).toArray();
  return docs.map((doc) => toHistoricalGame(doc as GameDocument & { _id: ObjectId }));
}

export async function getGameCount(): Promise<number> {
  const collection = getCollection();
  return collection.countDocuments();
}

export async function insertGame(game: Omit<HistoricalGame, 'id'>): Promise<string> {
  const collection = getCollection();
  const result = await collection.insertOne(game as GameDocument);
  return result.insertedId.toHexString();
}

export async function insertManyGames(games: Omit<HistoricalGame, 'id'>[]): Promise<string[]> {
  const collection = getCollection();
  const result = await collection.insertMany(games as GameDocument[]);
  return Object.values(result.insertedIds).map((id) => id.toHexString());
}

// Seed data - sample games to insert if database is empty
export const SEED_GAMES: Omit<HistoricalGame, 'id'>[] = [
  {
    title: 'The Immortal Game',
    event: 'London Tournament (Casual)',
    year: 1851,
    white: { name: 'Adolf Anderssen', shortName: 'Anderssen' },
    black: { name: 'Lionel Kieseritzky', shortName: 'Kieseritzky' },
    result: '1-0',
    pgn: `1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5 9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6 16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6 21.Nxg7+ Kd8 22.Qf6+ Nxf6 23.Be7# 1-0`,
    moves: [
      'e4', 'e5', 'f4', 'exf4', 'Bc4', 'Qh4+', 'Kf1', 'b5', 'Bxb5', 'Nf6',
      'Nf3', 'Qh6', 'd3', 'Nh5', 'Nh4', 'Qg5', 'Nf5', 'c6', 'g4', 'Nf6',
      'Rg1', 'cxb5', 'h4', 'Qg6', 'h5', 'Qg5', 'Qf3', 'Ng8', 'Bxf4', 'Qf6',
      'Nc3', 'Bc5', 'Nd5', 'Qxb2', 'Bd6', 'Bxg1', 'e5', 'Qxa1+', 'Ke2', 'Na6',
      'Nxg7+', 'Kd8', 'Qf6+', 'Nxf6', 'Be7#',
    ],
    difficulty: 'advanced',
    trivia: [
      'Named "The Immortal Game" by Ernst Falkbeer in 1855.',
      'Anderssen sacrificed a bishop, both rooks, and his queen to deliver checkmate.',
      'Kieseritzky only lost three pawns during the entire game!',
    ],
  },
  {
    title: 'The Opera Game',
    event: 'Paris Opera House (Casual)',
    year: 1858,
    white: { name: 'Paul Morphy', shortName: 'Morphy' },
    black: { name: 'Duke of Brunswick & Count Isouard', shortName: 'Duke & Count' },
    result: '1-0',
    pgn: `1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`,
    moves: [
      'e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5',
      'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bg5', 'b5', 'Nxb5', 'cxb5',
      'Bxb5+', 'Nbd7', 'O-O-O', 'Rd8', 'Rxd7', 'Rxd7', 'Rd1', 'Qe6', 'Bxd7+', 'Nxd7',
      'Qb8+', 'Nxb8', 'Rd8#',
    ],
    difficulty: 'intermediate',
    trivia: [
      'Played during a performance of "The Barber of Seville" at the Paris Opera.',
      'Morphy played against two allied opponents while watching the opera.',
      'Features the famous "Opera Mate" checkmating pattern.',
    ],
  },
  {
    title: 'The Game of the Century',
    event: 'Rosenwald Memorial Tournament',
    year: 1956,
    white: { name: 'Donald Byrne', shortName: 'Byrne' },
    black: { name: 'Bobby Fischer', shortName: 'Fischer' },
    result: '0-1',
    pgn: `1.Nf3 Nf6 2.c4 g6 3.Nc3 Bg7 4.d4 O-O 5.Bf4 d5 6.Qb3 dxc4 7.Qxc4 c6 8.e4 Nbd7 9.Rd1 Nb6 10.Qc5 Bg4 11.Bg5 Na4 12.Qa3 Nxc3 13.bxc3 Nxe4 14.Bxe7 Qb6 15.Bc4 Nxc3 16.Bc5 Rfe8+ 17.Kf1 Be6 18.Bxb6 Bxc4+ 19.Kg1 Ne2+ 20.Kf1 Nxd4+ 21.Kg1 Ne2+ 22.Kf1 Nc3+ 23.Kg1 axb6 24.Qb4 Ra4 25.Qxb6 Nxd1 26.h3 Rxa2 27.Kh2 Nxf2 28.Re1 Rxe1 29.Qd8+ Bf8 30.Nxe1 Bd5 31.Nf3 Ne4 32.Qb8 b5 33.h4 h5 34.Ne5 Kg7 35.Kg1 Bc5+ 36.Kf1 Ng3+ 37.Ke1 Bb4+ 38.Kd1 Bb3+ 39.Kc1 Ne2+ 40.Kb1 Nc3+ 41.Kc1 Rc2# 0-1`,
    moves: [
      'Nf3', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'd4', 'O-O', 'Bf4', 'd5',
      'Qb3', 'dxc4', 'Qxc4', 'c6', 'e4', 'Nbd7', 'Rd1', 'Nb6', 'Qc5', 'Bg4',
      'Bg5', 'Na4', 'Qa3', 'Nxc3', 'bxc3', 'Nxe4', 'Bxe7', 'Qb6', 'Bc4', 'Nxc3',
      'Bc5', 'Rfe8+', 'Kf1', 'Be6', 'Bxb6', 'Bxc4+', 'Kg1', 'Ne2+', 'Kf1', 'Nxd4+',
      'Kg1', 'Ne2+', 'Kf1', 'Nc3+', 'Kg1', 'axb6', 'Qb4', 'Ra4', 'Qxb6', 'Nxd1',
      'h3', 'Rxa2', 'Kh2', 'Nxf2', 'Re1', 'Rxe1', 'Qd8+', 'Bf8', 'Nxe1', 'Bd5',
      'Nf3', 'Ne4', 'Qb8', 'b5', 'h4', 'h5', 'Ne5', 'Kg7', 'Kg1', 'Bc5+',
      'Kf1', 'Ng3+', 'Ke1', 'Bb4+', 'Kd1', 'Bb3+', 'Kc1', 'Ne2+', 'Kb1', 'Nc3+',
      'Kc1', 'Rc2#',
    ],
    difficulty: 'advanced',
    trivia: [
      '13-year-old Bobby Fischer defeats a leading US master!',
      'Named "The Game of the Century" by Hans Kmoch.',
      'The move 17...Be6!! sacrificing the queen was legendary.',
    ],
  },
  {
    title: 'Kasparov vs Topalov',
    event: 'Wijk aan Zee',
    year: 1999,
    white: { name: 'Garry Kasparov', shortName: 'Kasparov' },
    black: { name: 'Veselin Topalov', shortName: 'Topalov' },
    result: '1-0',
    pgn: `1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6 6.f3 b5 7.Nge2 Nbd7 8.Bh6 Bxh6 9.Qxh6 Bb7 10.a3 e5 11.O-O-O Qe7 12.Kb1 a6 13.Nc1 O-O-O 14.Nb3 exd4 15.Rxd4 c5 16.Rd1 Nb6 17.g3 Kb8 18.Na5 Ba8 19.Bh3 d5 20.Qf4+ Ka7 21.Rhe1 d4 22.Nd5 Nbxd5 23.exd5 Qd6 24.Rxd4 cxd4 25.Re7+ Kb6 26.Qxd4+ Kxa5 27.b4+ Ka4 28.Qc3 Qxd5 29.Ra7 Bb7 30.Rxb7 Qc4 31.Qxf6 Kxa3 32.Qxa6+ Kxb4 33.c3+ Kxc3 34.Qa1+ Kd2 35.Qb2+ Kd1 36.Bf1 Rd2 37.Rd7 Rxd7 38.Bxc4 bxc4 39.Qxh8 Rd3 40.Qa8 c3 41.Qa4+ Ke1 42.f4 f5 43.Kc1 Rd2 44.Qa7 1-0`,
    moves: [
      'e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'Qd2', 'c6',
      'f3', 'b5', 'Nge2', 'Nbd7', 'Bh6', 'Bxh6', 'Qxh6', 'Bb7', 'a3', 'e5',
      'O-O-O', 'Qe7', 'Kb1', 'a6', 'Nc1', 'O-O-O', 'Nb3', 'exd4', 'Rxd4', 'c5',
      'Rd1', 'Nb6', 'g3', 'Kb8', 'Na5', 'Ba8', 'Bh3', 'd5', 'Qf4+', 'Ka7',
      'Rhe1', 'd4', 'Nd5', 'Nbxd5', 'exd5', 'Qd6', 'Rxd4', 'cxd4', 'Re7+', 'Kb6',
      'Qxd4+', 'Kxa5', 'b4+', 'Ka4', 'Qc3', 'Qxd5', 'Ra7', 'Bb7', 'Rxb7', 'Qc4',
      'Qxf6', 'Kxa3', 'Qxa6+', 'Kxb4', 'c3+', 'Kxc3', 'Qa1+', 'Kd2', 'Qb2+', 'Kd1',
      'Bf1', 'Rd2', 'Rd7', 'Rxd7', 'Bxc4', 'bxc4', 'Qxh8', 'Rd3', 'Qa8', 'c3',
      'Qa4+', 'Ke1', 'f4', 'f5', 'Kc1', 'Rd2', 'Qa7',
    ],
    difficulty: 'advanced',
    trivia: [
      'Often called "Kasparov\'s Immortal" for its spectacular sacrifices.',
      'Kasparov sacrificed his rook to expose the black king.',
      'The game showcases the power of coordinated pieces.',
    ],
  },
  {
    title: 'Evergreen Game',
    event: 'Berlin (Casual)',
    year: 1852,
    white: { name: 'Adolf Anderssen', shortName: 'Anderssen' },
    black: { name: 'Jean Dufresne', shortName: 'Dufresne' },
    result: '1-0',
    pgn: `1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 Bxb4 5.c3 Ba5 6.d4 exd4 7.O-O d3 8.Qb3 Qf6 9.e5 Qg6 10.Re1 Nge7 11.Ba3 b5 12.Qxb5 Rb8 13.Qa4 Bb6 14.Nbd2 Bb7 15.Ne4 Qf5 16.Bxd3 Qh5 17.Nf6+ gxf6 18.exf6 Rg8 19.Rad1 Qxf3 20.Rxe7+ Nxe7 21.Qxd7+ Kxd7 22.Bf5+ Ke8 23.Bd7+ Kf8 24.Bxe7# 1-0`,
    moves: [
      'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5',
      'd4', 'exd4', 'O-O', 'd3', 'Qb3', 'Qf6', 'e5', 'Qg6', 'Re1', 'Nge7',
      'Ba3', 'b5', 'Qxb5', 'Rb8', 'Qa4', 'Bb6', 'Nbd2', 'Bb7', 'Ne4', 'Qf5',
      'Bxd3', 'Qh5', 'Nf6+', 'gxf6', 'exf6', 'Rg8', 'Rad1', 'Qxf3', 'Rxe7+', 'Nxe7',
      'Qxd7+', 'Kxd7', 'Bf5+', 'Ke8', 'Bd7+', 'Kf8', 'Bxe7#',
    ],
    difficulty: 'intermediate',
    trivia: [
      'Named "The Evergreen Game" for its timeless beauty.',
      'Another masterpiece by Adolf Anderssen.',
      'Features a queen sacrifice leading to a brilliant checkmate.',
    ],
  },
];

export async function seedGamesIfEmpty(): Promise<void> {
  const count = await getGameCount();
  if (count === 0) {
    console.log('Seeding database with sample games...');
    await insertManyGames(SEED_GAMES);
    console.log(`Inserted ${SEED_GAMES.length} games`);
  } else {
    console.log(`Database already has ${count} games`);
  }
}
