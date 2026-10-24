// Multiplayer clocks and rooms belong to one backend process. All instances in
// that process share this queue so timers cannot overwrite player mutations.
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
