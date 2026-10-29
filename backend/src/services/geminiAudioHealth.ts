import { GEMINI_CONFIGURED } from "../lib/genaiClient.js";

// Whether Gemini audio parsing can be offered to players right now. Clients
// fall back to browser speech while it is unavailable. Only provider failures
// count (request errors, timeouts, unreadable replies); a reply that simply
// heard no move is a working service.

const FAILURES_BEFORE_PAUSE = 3;
export const GEMINI_AUDIO_PAUSE_MS = 5 * 60 * 1000;

let consecutiveFailures = 0;
let pausedUntil = 0;

export function recordGeminiAudioResult(ok: boolean, now = Date.now()): void {
  if (ok) {
    consecutiveFailures = 0;
    pausedUntil = 0;
    return;
  }
  consecutiveFailures++;
  // After the pause, real requests probe the service again; another failure
  // pauses it again straight away.
  if (consecutiveFailures >= FAILURES_BEFORE_PAUSE) pausedUntil = now + GEMINI_AUDIO_PAUSE_MS;
}

export interface GeminiAudioStatus {
  available: boolean;
  // Player-facing explanation when unavailable. Provider error details stay in
  // the server log: this endpoint is public.
  reason: string | null;
}

export function geminiAudioStatus(now = Date.now(), configured = GEMINI_CONFIGURED): GeminiAudioStatus {
  if (!configured) return { available: false, reason: "Gemini audio is not set up on this server." };
  if (now < pausedUntil) return { available: false, reason: "Gemini audio is failing right now." };
  return { available: true, reason: null };
}

/** Test helper: forget recorded results. */
export function resetGeminiAudioHealth(): void {
  consecutiveFailures = 0;
  pausedUntil = 0;
}
