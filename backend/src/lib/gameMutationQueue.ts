// All services in one backend process share this queue. Callers namespace keys
// by mode so a read/modify/write cannot overwrite another mutation of that game.
const pending = new Map<string, Promise<void>>();

export async function runGameMutation<T>(gameId: string, action: () => Promise<T>): Promise<T> {
  const previous = pending.get(gameId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  pending.set(gameId, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (pending.get(gameId) === current) pending.delete(gameId);
  }
}
