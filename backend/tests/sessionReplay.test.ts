import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Collection, MongoClient, ObjectId } from 'mongodb';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'session-replay-tests' });
const auth = getAuth();
const firestore = getFirestore();
const { userRoutes } = await import('../src/routes/userRoutes.js');
const { connectToDatabase, closeDatabaseConnection } = await import('../src/services/database.js');

const gameId = new ObjectId().toHexString();
const storedSession = {
  gameId, gameTitle: 'Opera Game', mode: 'both-sides', playerColor: null, status: 'completed',
  startedAt: null, completedAt: null,
  moves: [{ moveIndex: 0, expectedMove: 'e4', submittedMove: 'd4', isCorrect: false, timeSpent: 900, side: 'white' }],
  summary: { totalMoves: 1, correctMoves: 0, accuracy: 0, totalTimeMs: 900, averageTimePerMove: 900 },
};

function mockSessionStore() {
  return mock.method(firestore, 'collection', () => ({
    doc: () => ({ collection: () => ({ doc: (id: string) => ({ get: async () => ({ id, exists: true, data: () => storedSession }) }) }) }),
  }) as any);
}

test('session detail includes the historical game moves for board replay', async () => {
  const token = mock.method(auth, 'verifyIdToken', async () => ({ uid: 'player' }) as any);
  const collection = mockSessionStore();
  const connect = mock.method(MongoClient.prototype, 'connect', async function (this: MongoClient) { return this; });
  const close = mock.method(MongoClient.prototype, 'close', async () => {});
  const findOne = mock.method(Collection.prototype, 'findOne', async () => ({
    _id: new ObjectId(gameId), title: 'Opera Game', event: 'Paris', year: 1858,
    white: { name: 'Paul Morphy', shortName: 'Morphy' }, black: { name: 'Allies', shortName: 'Allies' },
    result: '1-0', pgn: '1. e4 e5', moves: ['e4', 'e5'], difficulty: 'beginner', trivia: ['fact'],
  }) as any);
  await connectToDatabase();
  const app = Fastify();
  try {
    await app.register(userRoutes);
    const response = await app.inject({ url: '/api/user/sessions/s1', headers: { authorization: 'Bearer local-token' } });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.id, 's1');
    assert.deepEqual(body.moves, storedSession.moves);
    assert.deepEqual(body.game, {
      id: gameId, title: 'Opera Game', event: 'Paris', year: 1858,
      white: { name: 'Paul Morphy', shortName: 'Morphy' }, black: { name: 'Allies', shortName: 'Allies' },
      result: '1-0', moves: ['e4', 'e5'],
    });
  } finally {
    await app.close(); await closeDatabaseConnection();
    token.mock.restore(); collection.mock.restore(); connect.mock.restore(); close.mock.restore(); findOne.mock.restore();
  }
});

test('session detail still loads when the game catalog is unavailable', async () => {
  const token = mock.method(auth, 'verifyIdToken', async () => ({ uid: 'player' }) as any);
  const collection = mockSessionStore();
  const app = Fastify();
  try {
    await app.register(userRoutes);
    const response = await app.inject({ url: '/api/user/sessions/s1', headers: { authorization: 'Bearer local-token' } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().game, null);
    assert.equal(response.json().gameTitle, 'Opera Game');
  } finally { await app.close(); token.mock.restore(); collection.mock.restore(); }
});
