import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyIdToken } from "../lib/firebase-admin.js";
import {
  getUserProfile,
  getUserSessions,
  getSession,
  updateUserDisplayName,
  saveVoiceCalibration,
  getVoiceCalibration,
  VoiceCalibration,
  ensureUserExists,
} from "../services/firestoreService.js";
import { getGameById } from "../services/gameRepository.js";
import { Chess } from 'chess.js';
import { TRAINING_EXERCISES, validateTrainingAttempts } from '../services/voiceTraining.js';
import { saveVoiceTraining, voiceConfusionMap } from '../services/firestoreService.js';
import { validAudioParse, validTextParse, isRecord, spokenGuesses } from '../lib/socketRequest.js';
import { parseChessMoveWithAI } from '../services/aiMoveParser.js';
import { parseChessMoveFromAudio } from '../services/geminiAudioParser.js';
import { aiUsageLimiter } from '../services/aiUsageLimiter.js';
import { geminiAudioStatus } from '../services/geminiAudioHealth.js';
import { runGameMutation } from '../lib/gameMutationQueue.js';

// Auth middleware for Fastify
async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ uid: string; email?: string } | null> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Unauthorized - Missing or invalid token" });
    return null;
  }

  const token = authHeader.substring(7);
  const decodedToken = await verifyIdToken(token);

  if (!decodedToken) {
    reply.code(401).send({ error: "Unauthorized - Invalid token" });
    return null;
  }

  return { uid: decodedToken.uid, ...(decodedToken.email ? { email: decodedToken.email } : {}) };
}

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/user/voice-training', async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;
    reply.header('Cache-Control', 'private, no-store');
    const calibration = await getVoiceCalibration(auth.uid);
    return { exercises: TRAINING_EXERCISES, attempts: calibration?.trainingAttempts ?? [] };
  });

  // Recognition receives only the position and actual input, never a drill ID,
  // expected move or target phrase. Grading happens after this request returns.
  fastify.post('/api/user/voice-training/parse', async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;
    const data = request.body;
    if (!isRecord(data) || !['browser', 'gemini'].includes(String(data.engine)) ||
      typeof data.fen !== 'string' || data.fen.length > 120 ||
      Object.keys(data).some(key => !['engine', 'fen', 'transcript', 'rawTranscript', 'transcripts', 'audioBase64', 'mimeType'].includes(key)) ||
      !(data.engine === 'gemini' ? validAudioParse(data) : validTextParse(data))) {
      reply.code(400).send({ error: 'Invalid voice training input' }); return;
    }
    let chess: Chess;
    try { chess = new Chess(data.fen); } catch {
      reply.code(400).send({ error: 'Invalid position' }); return;
    }
    const engine = data.engine as 'browser' | 'gemini';
    if (engine === 'gemini' && !geminiAudioStatus().available) {
      reply.code(503).send({ error: 'Gemini audio is temporarily unavailable. Try browser speech.' }); return;
    }
    if (!(await aiUsageLimiter.tryConsumeParse(`user:${auth.uid}`))) {
      reply.code(429).send({ error: 'Daily voice parsing limit reached. Please try again tomorrow.' }); return;
    }
    const confusionMap = voiceConfusionMap(await getVoiceCalibration(auth.uid), engine);
    const options = { allowGuessOnUnclear: false, confusionMap };
    const guesses = engine === 'browser' ? spokenGuesses(data as unknown as { transcript: string; rawTranscript?: string; transcripts?: string[] }) : null;
    const parsed = engine === 'gemini'
      ? await parseChessMoveFromAudio(data.audioBase64 as string, data.mimeType as string, chess.fen(), chess.moves(), options)
      : await parseChessMoveWithAI(guesses!.transcript, chess.fen(), chess.moves(), { ...options, alternativeTranscripts: guesses!.alternatives });
    if (parsed.reasoning?.startsWith('AI parsing failed:') || parsed.reasoning?.startsWith('Audio parsing failed:') ||
      parsed.reasoning?.startsWith('Failed to') || parsed.reasoning === 'Invalid transcription response') {
      reply.code(502).send({ error: 'Voice processing failed. Please retry; this attempt was not scored.' }); return;
    }
    return { ...parsed, transcription: 'transcription' in parsed ? parsed.transcription : guesses!.transcript };
  });

  fastify.post('/api/user/voice-training', async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;
    const attempts = validateTrainingAttempts(isRecord(request.body) ? request.body.attempts : null);
    if (!attempts) { reply.code(400).send({ error: 'Invalid training observations' }); return; }
    await ensureUserExists(auth.uid, auth.email ?? null);
    await saveVoiceTraining(auth.uid, attempts);
    return { success: true };
  });

  // Get user profile and stats
  fastify.get("/api/user/profile", async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;

    const profile = await getUserProfile(auth.uid);

    if (!profile) {
      // Return empty profile for users without Firestore data yet
      return {
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
    }

    return {
      displayName: profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
      createdAt: profile.createdAt?.toDate?.() || null,
      stats: {
        totalSessions: profile.stats.totalSessions,
        totalMoves: profile.stats.totalMoves,
        correctMoves: profile.stats.correctMoves,
        overallAccuracy: profile.stats.overallAccuracy,
        lastPlayedAt: profile.stats.lastPlayedAt?.toDate?.() || null,
      },
      preferences: profile.preferences,
    };
  });

  // Update user profile (display name)
  fastify.put<{ Body: { displayName?: string } }>(
    "/api/user/profile",
    async (request, reply) => {
      const auth = await authenticateRequest(request, reply);
      if (!auth) return;

      const { displayName } = request.body || {};

      if (!displayName || typeof displayName !== "string") {
        reply.code(400).send({ error: "displayName is required" });
        return;
      }

      const sanitizedName = displayName.trim().slice(0, 20);
      if (!sanitizedName) {
        reply.code(400).send({ error: "displayName cannot be empty" });
        return;
      }

      // Validate characters: allow alphanumeric, spaces, hyphens, underscores, periods
      const validNamePattern = /^[\w\s.\-]+$/;
      if (!validNamePattern.test(sanitizedName)) {
        reply
          .code(400)
          .send({ error: "displayName contains invalid characters" });
        return;
      }

      await updateUserDisplayName(auth.uid, sanitizedName);
      return { success: true, displayName: sanitizedName };
    },
  );

  // Get user's practice history
  fastify.get<{ Querystring: { limit?: string } }>(
    "/api/user/sessions",
    async (request, reply) => {
      const auth = await authenticateRequest(request, reply);
      if (!auth) return;

      const limit = parseInt(request.query.limit || "20", 10);
      const sessions = await getUserSessions(auth.uid, Math.min(limit, 100));

      return sessions.map((session) => ({
        id: session.id,
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        mode: session.mode,
        playerColor: session.playerColor,
        status: session.status,
        startedAt: session.startedAt?.toDate?.() || null,
        completedAt: session.completedAt?.toDate?.() || null,
        summary: session.summary,
      }));
    },
  );

  // Get a specific session with full move history
  fastify.get<{ Params: { sessionId: string } }>(
    "/api/user/sessions/:sessionId",
    async (request, reply) => {
      const auth = await authenticateRequest(request, reply);
      if (!auth) return;

      const session = await getSession(auth.uid, request.params.sessionId);

      if (!session) {
        reply.code(404).send({ error: "Session not found" });
        return;
      }

      // The historical game's moves let the client replay the session on a board.
      // A missing game or unavailable catalog still returns the session itself.
      const game = await getGameById(session.gameId).catch(() => null);

      return {
        id: session.id,
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        mode: session.mode,
        playerColor: session.playerColor,
        status: session.status,
        startedAt: session.startedAt?.toDate?.() || null,
        completedAt: session.completedAt?.toDate?.() || null,
        moves: session.moves,
        summary: session.summary,
        game: game
          ? {
              id: game.id,
              title: game.title,
              event: game.event,
              year: game.year,
              white: game.white,
              black: game.black,
              result: game.result,
              moves: game.moves,
            }
          : null,
      };
    },
  );

  // Save voice calibration data
  fastify.put<{
    Body: {
      entries?: unknown[];
      confusionMap?: Record<string, string[]>;
      calibratedAt?: number;
    };
  }>("/api/user/voice-calibration", async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;

    const { entries, confusionMap, calibratedAt } = request.body || {};

    if (
      !Array.isArray(entries) ||
      !confusionMap ||
      typeof calibratedAt !== "number"
    ) {
      reply.code(400).send({ error: "Invalid calibration data" });
      return;
    }

    // Validate entries structure and limit size
    if (entries.length > 50) {
      reply.code(400).send({ error: "Too many calibration entries (max 50)" });
      return;
    }

    const validatedEntries = entries.map((e: unknown) => {
      const entry = e as Record<string, unknown>;
      return {
        target: String(entry.target || "").slice(0, 100),
        heard: String(entry.heard || "").slice(0, 100),
        timestamp:
          typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
      };
    });

    // Limit confusion map size
    const validatedMap: Record<string, string[]> = {};
    const mapKeys = Object.keys(confusionMap).slice(0, 100);
    for (const key of mapKeys) {
      const safeKey = key.slice(0, 100);
      const values = confusionMap[key];
      if (Array.isArray(values)) {
        validatedMap[safeKey] = values
          .slice(0, 10)
          .map((v) => String(v).slice(0, 100));
      }
    }

    const calibration: VoiceCalibration = {
      entries: validatedEntries,
      confusionMap: validatedMap,
      calibratedAt,
    };

    await runGameMutation(`voice-training:${auth.uid}`, async () => {
      const previous = await getVoiceCalibration(auth.uid);
      await saveVoiceCalibration(auth.uid, { ...previous, ...calibration });
    });
    return { success: true };
  });

  // Get voice calibration data
  fastify.get("/api/user/voice-calibration", async (request, reply) => {
    const auth = await authenticateRequest(request, reply);
    if (!auth) return;

    const calibration = await getVoiceCalibration(auth.uid);
    return { calibration };
  });
}
