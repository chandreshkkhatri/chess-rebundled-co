/**
 * Reject a promise if it doesn't settle within `ms` milliseconds.
 *
 * Used to guard external API calls (e.g. Gemini) that have no built-in
 * timeout. Without this, a hung request leaves the caller awaiting forever —
 * which in the practice flow leaves the frontend stuck on "Processing..." and
 * blocks all subsequent voice input.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}
