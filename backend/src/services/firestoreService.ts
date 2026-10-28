import { firestore } from "../lib/firebase-admin.js";
import { Timestamp } from "firebase-admin/firestore";
import {
  PracticeSession,
  PracticeCompletedData,
  PracticeMode,
} from "../types/index.js";
import type { AiGameState } from "../types/aiGame.js";

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
    voiceParsingMode: "webspeech-haiku" | "gemini-audio";
    defaultPracticeMode: "both-sides" | "one-side";
  };
  voiceCalibration?: VoiceCalibration;
}

export interface VoiceCalibrationEntry {
  target: string;
  heard: string;
  timestamp: number;
}

export interface VoiceCalibration {
  entries: VoiceCalibrationEntry[];
  confusionMap: Record<string, string[]>;
  calibratedAt: number;
}

export interface FirestoreSessionMove {
  moveIndex: number;
  expectedMove: string;
  submittedMove: string;
  isCorrect: boolean;
  timeSpent: number;
  side: "white" | "black";
}

export interface FirestoreSession {
  id?: string; // Document ID, populated when reading from Firestore
  gameId: string;
  gameTitle: string;
  mode: PracticeMode;
  playerColor: "white" | "black" | null;
  status: "playing" | "completed" | "abandoned";
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
    console.warn(
      "[Firestore] Firestore not initialized, returning default config",
    );
    return { discordInviteUrl: null };
  }

  const doc = await firestore.collection("appConfig").doc("settings").get();
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
  email: string | null,
): Promise<void> {
  if (!firestore) {
    console.warn(
      "[Firestore] Firestore not initialized, skipping user creation",
    );
    return;
  }

  const userRef = firestore.collection("users").doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    const newUser: FirestoreUser = {
      email,
      displayName: email?.split("@")[0] || "Player",
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
        voiceParsingMode: "gemini-audio",
        defaultPracticeMode: "both-sides",
      },
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
  completedData: PracticeCompletedData,
): Promise<string | null> {
  if (!firestore) {
    console.warn(
      "[Firestore] Firestore not initialized, skipping session save",
    );
    return null;
  }

  try {
    const sessionRef = firestore
      .collection("users")
      .doc(uid)
      .collection("sessions")
      .doc(session.id);

    const firestoreSession: FirestoreSession = {
      gameId: session.historicalGame.id,
      gameTitle: session.historicalGame.title,
      mode: session.mode,
      playerColor: session.playerColor,
      status: "completed",
      startedAt: Timestamp.fromMillis(session.startedAt),
      completedAt: Timestamp.now(),
      // The pre-submit session snapshot may not contain the final move.
      moves: completedData.moveResults.map((r) => ({
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

    const userRef = firestore.collection("users").doc(uid);
    // History and totals commit together. Retried saves of the same session
    // cannot count twice, including across backend restarts.
    await firestore.runTransaction(async (transaction) => {
      const saved = await transaction.get(sessionRef);
      if (saved.exists) return;
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User profile missing during session save");
      const stats = (userDoc.data() as FirestoreUser).stats;
      const totalMoves = stats.totalMoves + completedData.totalMoves;
      const correctMoves = stats.correctMoves + completedData.correctMoves;
      transaction.set(sessionRef, firestoreSession);
      transaction.update(userRef, {
        "stats.totalSessions": stats.totalSessions + 1,
        "stats.totalMoves": totalMoves,
        "stats.correctMoves": correctMoves,
        "stats.overallAccuracy": totalMoves > 0 ? correctMoves / totalMoves : 0,
        "stats.lastPlayedAt": Timestamp.now(),
      });
    });

    console.log(`[Firestore] Saved session ${session.id} for user ${uid}`);
    return session.id;
  } catch (error) {
    console.error("[Firestore] Error saving session:", error);
    return null;
  }
}

/**
 * Get user profile and stats from Firestore.
 */
export async function getUserProfile(
  uid: string,
): Promise<FirestoreUser | null> {
  if (!firestore) return null;

  const userDoc = await firestore.collection("users").doc(uid).get();
  if (!userDoc.exists) return null;

  return userDoc.data() as FirestoreUser;
}

/**
 * Update user's display name.
 */
export async function updateUserDisplayName(
  uid: string,
  displayName: string,
): Promise<void> {
  if (!firestore) {
    console.warn(
      "[Firestore] Firestore not initialized, skipping display name update",
    );
    return;
  }

  const userRef = firestore.collection("users").doc(uid);
  await userRef.update({ displayName });
  console.log(`[Firestore] Updated display name for user ${uid}`);
}

/**
 * Get recent sessions for a user.
 */
export async function getUserSessions(
  uid: string,
  limit: number = 20,
): Promise<FirestoreSession[]> {
  if (!firestore) return [];

  const sessionsSnapshot = await firestore
    .collection("users")
    .doc(uid)
    .collection("sessions")
    .orderBy("completedAt", "desc")
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
  sessionId: string,
): Promise<FirestoreSession | null> {
  if (!firestore) return null;

  const sessionDoc = await firestore
    .collection("users")
    .doc(uid)
    .collection("sessions")
    .doc(sessionId)
    .get();

  if (!sessionDoc.exists) return null;

  return { id: sessionDoc.id, ...(sessionDoc.data() as FirestoreSession) };
}

// One shared cache for practice, multiplayer, and AI input. A successful save
// replaces even a cached empty value immediately.
const calibrationCache = new Map<string, { data: VoiceCalibration | null; loadedAt: number }>();
const calibrationVersions = new Map<string, number>();
const CALIBRATION_TTL_MS = 30 * 60 * 1000;

export function getVoiceCalibrationVersion(uid?: string): number {
  return uid ? calibrationVersions.get(uid) ?? 0 : 0;
}

/**
 * Save voice calibration data for a user.
 */
export async function saveVoiceCalibration(
  uid: string,
  calibration: VoiceCalibration,
): Promise<void> {
  if (!firestore) {
    console.warn(
      "[Firestore] Firestore not initialized, skipping calibration save",
    );
    return;
  }

  await firestore.collection("users").doc(uid).update({
    voiceCalibration: calibration,
  });
  calibrationVersions.set(uid, getVoiceCalibrationVersion(uid) + 1);
  calibrationCache.set(uid, { data: calibration, loadedAt: Date.now() });
  console.log(
    `[Firestore] Voice calibration saved for user ${uid} (${calibration.entries.length} entries)`,
  );
}

/**
 * Get voice calibration data for a user.
 */
export async function getVoiceCalibration(
  uid: string,
): Promise<VoiceCalibration | null> {
  if (!firestore) return null;

  const cached = calibrationCache.get(uid);
  if (cached && Date.now() - cached.loadedAt < CALIBRATION_TTL_MS) return cached.data;
  const version = getVoiceCalibrationVersion(uid);
  const userDoc = await firestore.collection("users").doc(uid).get();
  // An older in-flight read must not overwrite calibration just saved by HTTP.
  if (getVoiceCalibrationVersion(uid) !== version) return calibrationCache.get(uid)?.data ?? null;
  const calibration = userDoc.exists
    ? (userDoc.data() as FirestoreUser).voiceCalibration ?? null : null;
  calibrationCache.set(uid, { data: calibration, loadedAt: Date.now() });
  return calibration;
}

/**
 * Persist a completed AI-opponent game (moves, chat, per-turn thinking) so
 * the post-game review outlives the Redis TTL.
 */
export async function saveCompletedAiGame(
  uid: string,
  state: AiGameState,
): Promise<string | null> {
  if (!firestore) {
    console.warn(
      "[Firestore] Firestore not initialized, skipping AI game save",
    );
    return null;
  }

  try {
    await firestore
      .collection("users")
      .doc(uid)
      .collection("aiGames")
      .doc(state.id)
      .set({
        ...state,
        createdAt: Timestamp.fromMillis(state.createdAt),
        completedAt: state.completedAt
          ? Timestamp.fromMillis(state.completedAt)
          : Timestamp.now(),
      });

    console.log(`[Firestore] Saved AI game ${state.id} for user ${uid}`);
    return state.id;
  } catch (error) {
    console.error("[Firestore] Error saving AI game:", error);
    return null;
  }
}

/**
 * Load a completed AI-opponent game for the review screen (fallback when it
 * has expired from Redis).
 */
export async function getAiGame(
  uid: string,
  gameId: string,
): Promise<AiGameState | null> {
  if (!firestore) return null;

  try {
    const doc = await firestore
      .collection("users")
      .doc(uid)
      .collection("aiGames")
      .doc(gameId)
      .get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      ...data,
      createdAt:
        data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : data.createdAt,
      completedAt:
        data.completedAt instanceof Timestamp
          ? data.completedAt.toMillis()
          : data.completedAt,
    } as AiGameState;
  } catch (error) {
    console.error("[Firestore] Error loading AI game:", error);
    return null;
  }
}
