/** Things that happen in the game that the UI may want to react to (sound, effects) */
export type GameEvent =
  | 'gather'
  | 'build'
  | 'demolish'
  | 'research'
  | 'milestone'
  | 'signal'
  | 'reward'
  | 'error'
  | 'achievement'
  | 'incident'
  | 'warp'
  | 'click';

const subs = new Set<(e: GameEvent) => void>();

export function onGameEvent(fn: (e: GameEvent) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function emit(e: GameEvent) {
  for (const fn of subs) fn(e);
}
