export function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

export function hasText(data: unknown, key: string, max = 128): boolean {
  return isRecord(data) && typeof data[key] === 'string' &&
    data[key].trim().length > 0 && data[key].length <= max;
}

export function validTextParse(data: unknown): boolean {
  return hasText(data, 'transcript', 2000) && isRecord(data) &&
    (data.rawTranscript === undefined || hasText(data, 'rawTranscript', 2000)) &&
    (data.transcripts === undefined || (Array.isArray(data.transcripts) && data.transcripts.length <= 5 &&
      data.transcripts.every(text => typeof text === 'string' && text.trim().length > 0 && text.length <= 2000)));
}

/** The recognizer's guesses from a validated text-parse payload: the primary text, then the other guesses. */
export function spokenGuesses(data: { transcript: string; rawTranscript?: string; transcripts?: string[] }): {
  transcript: string; alternatives: string[];
} {
  // rawTranscript carries the words heard; transcript may be the client's own parse of them.
  const transcript = (data.rawTranscript || data.transcript).trim();
  const alternatives: string[] = [];
  for (const text of data.transcripts ?? []) {
    const guess = text.trim();
    if (guess && guess !== transcript && !alternatives.includes(guess)) alternatives.push(guess);
  }
  return { transcript, alternatives: alternatives.slice(0, 4) };
}

export function validAudioParse(data: unknown): boolean {
  return hasText(data, 'audioBase64', 900_000) && isRecord(data) &&
    typeof data.mimeType === 'string' &&
    /^audio\/(webm|ogg|wav|mp4|mpeg|x-wav|aac|flac)(;codecs=[\w.,-]+)?$/i.test(data.mimeType);
}

export function validPracticeOptions(data: unknown): boolean {
  return isRecord(data) && hasText(data, 'playerName') &&
    (data.gameId === undefined || hasText(data, 'gameId')) &&
    (data.mode === undefined || data.mode === 'both-sides' || data.mode === 'one-side') &&
    (data.playerColor == null || data.playerColor === 'white' || data.playerColor === 'black') &&
    (data.mode !== 'one-side' || data.playerColor === 'white' || data.playerColor === 'black');
}

export function validTimeControl(value: unknown, allowAny = false): boolean {
  return value === null || (allowAny && value === 'any') ||
    (isRecord(value) && typeof value.initialTimeMs === 'number' &&
      Number.isFinite(value.initialTimeMs) && value.initialTimeMs > 0 && value.initialTimeMs <= 86_400_000 &&
      typeof value.incrementMs === 'number' && Number.isFinite(value.incrementMs) &&
      value.incrementMs >= 0 && value.incrementMs <= 60_000);
}

/** Socket.io ignores listener promises, so every boundary must catch failures. */
export function guardSocketRequest<T>(
  handler: (data: T) => void | Promise<void>,
  valid: (data: unknown) => boolean,
  report: (message: string) => void,
): (data?: T) => Promise<void> {
  return async data => {
    try {
      if (!valid(data)) { report('Invalid request'); return; }
      await handler(data as T);
    } catch (error) {
      console.error('[Socket] Request failed:', error);
      report('Unable to process request. Please try again.');
    }
  };
}
