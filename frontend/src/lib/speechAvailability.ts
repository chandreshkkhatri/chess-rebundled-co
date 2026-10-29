import { create } from 'zustand';

// Whether the server can offer Gemini audio parsing right now (GET /api/speech).
// `available: null` means not known yet; callers treat that as available so a
// slow or failed status request never blocks the player's chosen engine.

interface GeminiAudioStatus {
  available: boolean | null;
  reason: string | null;
}

export const useGeminiAudioStatus = create<GeminiAudioStatus>(() => ({ available: null, reason: null }));

// Repeated requests within this window reuse the last answer.
const MIN_REFRESH_GAP_MS = 15_000;
let lastRefresh = 0;
let inFlight: Promise<void> | null = null;

/** Fetches the server's speech status; `force` skips the refresh throttle. */
export function refreshGeminiAudioStatus({ force = false } = {}): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastRefresh < MIN_REFRESH_GAP_MS) return Promise.resolve();
  lastRefresh = Date.now();
  inFlight = (async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      const response = await fetch(`${apiUrl}/api/speech`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { geminiAudio?: { available?: unknown; reason?: unknown } };
      const status = data.geminiAudio;
      if (typeof status?.available !== 'boolean') return;
      useGeminiAudioStatus.setState({
        available: status.available,
        reason: typeof status.reason === 'string' ? status.reason : null,
      });
    } catch {
      // Keep the last known status; the next refresh tries again.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
