import { tick } from './engine';
import type { GameState, TickResult } from './types';

export const MAX_OFFLINE_SECONDS = 12 * 3600;
/** Offline steps are coarser than live ticks; 1s keeps 12h under ~50k steps */
const OFFLINE_STEP = 1;

export interface OfflineReport {
  /** Seconds that were requested (wall clock away) */
  away: number;
  /** Seconds actually simulated after the cap */
  simulated: number;
  /** item -> change over the whole period */
  changes: Record<string, number>;
  /** Status of every line at the end of the catch-up */
  last: TickResult | null;
}

/** Catch up `seconds` of absence; `speed` scales factory time (legacy upgrades) */
export function simulateOffline(state: GameState, seconds: number, speed = 1, cap = MAX_OFFLINE_SECONDS): OfflineReport {
  const simulated = Math.min(Math.max(0, seconds), cap);
  const before = { ...state.items };
  let last: TickResult | null = null;
  const start = state.playTime;
  let left = simulated;
  while (left > 1e-9) {
    const dt = Math.min(OFFLINE_STEP, left);
    last = tick(state, dt * speed);
    left -= dt;
    // Advance the clock every step, so a world event that was running when the player left ends on time
    state.playTime += dt;
  }
  state.playTime = start + simulated;

  const changes: Record<string, number> = {};
  for (const item of new Set([...Object.keys(before), ...Object.keys(state.items)])) {
    const d = (state.items[item] ?? 0) - (before[item] ?? 0);
    if (Math.abs(d) >= 0.5) changes[item] = d;
  }
  return { away: seconds, simulated, changes, last };
}
