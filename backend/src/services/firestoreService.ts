import { firestore } from '../lib/firebase-admin.js';
import { Timestamp } from 'firebase-admin/firestore';
import { PracticeSession, PracticeCompletedData, PracticeMoveResult, PracticeMode, UserGamification, Achievement, GamificationResult } from '../types/index.js';
import { calculateSessionXP, calculateXpToNextLevel, createDefaultGamification } from './gamificationService.js';
import { checkAchievements, calculateAchievementXpReward } from './achievementService.js';
import { updateStreak, getTodayInTimezone } from './streakService.js';

// Firestore document types
export interface FirestoreUser {
  email: string | null;
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  stats: {
    totalSessions: number;
    totalMoves: number;
    correctMoves: number;
    overallAccuracy: number;
    lastPlayedAt: Timestamp | null;
  };
  preferences: {
    voiceParsingMode: 'webspeech-haiku' | 'gemini-audio';
    defaultPracticeMode: 'both-sides' | 'one-side';
  };
  gamification?: UserGamification;
}

export interface FirestoreSessionMove {
  moveIndex: number;
  expectedMove: string;
  submittedMove: string;
  isCorrect: boolean;
  timeSpent: number;
  side: 'white' | 'black';
}

export interface FirestoreSession {
  id?: string; // Document ID, populated when reading from Firestore
  gameId: string;
  gameTitle: string;
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null;
  status: 'playing' | 'completed' | 'abandoned';
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  moves: FirestoreSessionMove[];
  summary: {
    totalMoves: number;
    correctMoves: number;
    accuracy: number;
    totalTimeMs: number;
    averageTimePerMove: number;
  } | null;
}

// App configuration stored in Firestore
export interface AppConfig {
  discordInviteUrl: string | null;
}

/**
 * Get public app configuration from Firestore.
 * Returns default values if document doesn't exist.
 */
export async function getAppConfig(): Promise<AppConfig> {
  if (!firestore) {
    console.warn('[Firestore] Firestore not initialized, returning default config');
    return { discordInviteUrl: null };
  }

  const doc = await firestore.collection('appConfig').doc('settings').get();
  if (!doc.exists) {
    return { discordInviteUrl: null };
  }

  const data = doc.data();
  return {
    discordInviteUrl: data?.discordInviteUrl || null,
  };
}

/**
 * Ensure a user document exists in Firestore.
 * Creates a default user profile if it doesn't exist.
 */
export async function ensureUserExists(
  uid: string,
  email: string | null
): Promise<void> {
  if (!firestore) {
    console.warn('[Firestore] Firestore not initialized, skipping user creation');
    return;
  }

  const userRef = firestore.collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    const newUser: FirestoreUser = {
      email,
      displayName: email?.split('@')[0] || 'Player',
      photoURL: null,
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now(),
      stats: {
        totalSessions: 0,
        totalMoves: 0,
        correctMoves: 0,
        overallAccuracy: 0,
        lastPlayedAt: null,
      },
      preferences: {
        voiceParsingMode: 'gemini-audio',
        defaultPracticeMode: 'both-sides',
      },
      gamification: createDefaultGamification(),
    };

    await userRef.set(newUser);
    console.log(`[Firestore] Created user document for ${uid}`);
  } else {
    // Update lastLoginAt
    await userRef.update({
      lastLoginAt: Timestamp.now(),
    });
  }
}

/**
 * Save a completed practice session to Firestore.
 */
export async function saveCompletedSession(
  uid: string,
  session: PracticeSession,
  completedData: PracticeCompletedData
): Promise<string | null> {
  if (!firestore) {
    console.warn('[Firestore] Firestore not initialized, skipping session save');
    return null;
  }

  try {
    const sessionRef = firestore
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .doc(session.id);

    const firestoreSession: FirestoreSession = {
      gameId: session.historicalGame.id,
      gameTitle: session.historicalGame.title,
      mode: session.mode,
      playerColor: session.playerColor,
      status: 'completed',
      startedAt: Timestamp.fromMillis(session.startedAt),
      completedAt: Timestamp.now(),
      moves: session.moveResults.map((r) => ({
        moveIndex: r.moveIndex,
        expectedMove: r.expectedMove,
        submittedMove: r.submittedMove,
        isCorrect: r.isCorrect,
        timeSpent: r.timeSpent,
        side: r.side,
      })),
      summary: {
        totalMoves: completedData.totalMoves,
        correctMoves: completedData.correctMoves,
        accuracy: completedData.accuracy,
        totalTimeMs: completedData.totalTimeMs,
        averageTimePerMove: completedData.averageTimePerMove,
      },
    };

    await sessionRef.set(firestoreSession);

    // Update user stats
    await updateUserStats(uid, completedData);

    console.log(`[Firestore] Saved session ${session.id} for user ${uid}`);
    return session.id;
  } catch (error) {
    console.error('[Firestore] Error saving session:', error);
    return null;
  }
}

/**
 * Update user aggregate stats after a session completes.
 */
async function updateUserStats(
  uid: string,
  completedData: PracticeCompletedData
): Promise<void> {
  if (!firestore) return;

  const userRef = firestore.collection('users').doc(uid);

  // Use a transaction to safely update aggregate stats
  await firestore.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      console.warn(`[Firestore] User ${uid} not found for stats update`);
      return;
    }

    const userData = userDoc.data() as FirestoreUser;
    const stats = userData.stats;

    const newTotalSessions = stats.totalSessions + 1;
    const newTotalMoves = stats.totalMoves + completedData.totalMoves;
    const newCorrectMoves = stats.correctMoves + completedData.correctMoves;
    const newOverallAccuracy = newTotalMoves > 0 ? newCorrectMoves / newTotalMoves : 0;

    transaction.update(userRef, {
      'stats.totalSessions': newTotalSessions,
      'stats.totalMoves': newTotalMoves,
      'stats.correctMoves': newCorrectMoves,
      'stats.overallAccuracy': newOverallAccuracy,
      'stats.lastPlayedAt': Timestamp.now(),
    });
  });

  console.log(`[Firestore] Updated stats for user ${uid}`);
}

/**
 * Get user profile and stats from Firestore.
 */
export async function getUserProfile(uid: string): Promise<FirestoreUser | null> {
  if (!firestore) return null;

  const userDoc = await firestore.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;

  return userDoc.data() as FirestoreUser;
}

/**
 * Update user's display name.
 */
export async function updateUserDisplayName(uid: string, displayName: string): Promise<void> {
  if (!firestore) {
    console.warn('[Firestore] Firestore not initialized, skipping display name update');
    return;
  }

  const userRef = firestore.collection('users').doc(uid);
  await userRef.update({ displayName });
  console.log(`[Firestore] Updated display name for user ${uid}`);
}

/**
 * Get recent sessions for a user.
 */
export async function getUserSessions(
  uid: string,
  limit: number = 20
): Promise<FirestoreSession[]> {
  if (!firestore) return [];

  const sessionsSnapshot = await firestore
    .collection('users')
    .doc(uid)
    .collection('sessions')
    .orderBy('completedAt', 'desc')
    .limit(limit)
    .get();

  return sessionsSnapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  })) as FirestoreSession[];
}

/**
 * Get a single session by ID.
 */
export async function getSession(
  uid: string,
  sessionId: string
): Promise<FirestoreSession | null> {
  if (!firestore) return null;

  const sessionDoc = await firestore
    .collection('users')
    .doc(uid)
    .collection('sessions')
    .doc(sessionId)
    .get();

  if (!sessionDoc.exists) return null;

  return sessionDoc.data() as FirestoreSession;
}

/**
 * Process gamification updates after a session completes.
 * Returns gamification result with XP earned, achievements, and streak info.
 */
export async function processGamification(
  uid: string,
  session: PracticeSession,
  completedData: PracticeCompletedData,
  timezone?: string
): Promise<GamificationResult | null> {
  if (!firestore) {
    console.warn('[Firestore] Firestore not initialized, skipping gamification');
    return null;
  }

  const userRef = firestore.collection('users').doc(uid);

  try {
    return await firestore.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        console.warn(`[Firestore] User ${uid} not found for gamification`);
        return null;
      }

      const userData = userDoc.data() as FirestoreUser;
      const gamification = userData.gamification || createDefaultGamification(timezone);

      // Ensure timezone is set
      if (timezone && gamification.streaks.timezone === 'UTC') {
        gamification.streaks.timezone = timezone;
      }

      const tz = gamification.streaks.timezone || 'UTC';
      const todayDate = getTodayInTimezone(tz);

      // 1. Update streak
      const streakResult = updateStreak(gamification.streaks);

      // 2. Calculate XP
      const xpResult = calculateSessionXP(completedData, gamification, todayDate);

      // 3. Check achievements
      const newAchievements = checkAchievements({
        gamification,
        userStats: userData.stats,
        completedData,
        newLevel: xpResult.newLevel,
        newStreak: streakResult.newStreak,
      });

      // 4. Add achievement XP bonus
      const achievementXp = calculateAchievementXpReward(newAchievements);
      const finalTotalXp = xpResult.newTotalXp + achievementXp;

      // 5. Prepare updated gamification data
      const updatedGamification: UserGamification = {
        totalXp: finalTotalXp,
        level: xpResult.newLevel,
        xpToNextLevel: calculateXpToNextLevel(finalTotalXp, xpResult.newLevel),
        streaks: {
          currentStreak: streakResult.newStreak,
          longestStreak: streakResult.longestStreak,
          lastPlayedDate: todayDate,
          streakFreezes: streakResult.freezesRemaining,
          timezone: tz,
        },
        achievements: {
          unlocked: [
            ...gamification.achievements.unlocked,
            ...newAchievements.map(a => a.id),
          ],
          progress: gamification.achievements.progress,
        },
        gamesCompleted: gamification.gamesCompleted.includes(completedData.game.id)
          ? gamification.gamesCompleted
          : [...gamification.gamesCompleted, completedData.game.id],
        dailyXpDate: todayDate,
      };

      // 6. Update Firestore
      transaction.update(userRef, {
        gamification: updatedGamification,
      });

      console.log(`[Firestore] Gamification updated for user ${uid}: +${xpResult.totalXp} XP, level ${xpResult.newLevel}, streak ${streakResult.newStreak}`);

      return {
        xp: {
          ...xpResult,
          newTotalXp: finalTotalXp,
        },
        newAchievements,
        streakUpdated: streakResult.streakIncreased,
        newStreak: streakResult.newStreak,
      };
    });
  } catch (error) {
    console.error('[Firestore] Error processing gamification:', error);
    return null;
  }
}

/**
 * Get user's gamification data
 */
export async function getUserGamification(uid: string): Promise<UserGamification | null> {
  if (!firestore) return null;

  const userDoc = await firestore.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;

  const userData = userDoc.data() as FirestoreUser;
  return userData.gamification || createDefaultGamification();
}
