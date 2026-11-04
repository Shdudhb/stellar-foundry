import { TECHS } from '../data/tech';
import { canAfford, techAvailable, techCost } from './rules';
import type { GameState } from './types';

/**
 * Research queue: techs the player lined up, researched in order as data comes in, live and while away.
 * The first one that can be researched is waited for, so a cheap tech further down never eats the data
 * saved up for it; one still locked behind a megastructure is passed over until it opens.
 */

/** Unresearched prerequisites of a tech, deepest first, ending with the tech itself */
function withPrereqs(state: GameState, id: string, out: string[] = [], seen = new Set<string>()): string[] {
  if (seen.has(id) || state.techs.includes(id) || !TECHS[id]) return out;
  seen.add(id);
  for (const r of TECHS[id].requires) withPrereqs(state, r, out, seen);
  out.push(id);
  return out;
}

/** Add a tech to the end of the queue with what it needs first, or take it (and what only it needed) back out */
export function toggleQueued(state: GameState, id: string): void {
  const queue = state.queue ?? [];
  if (queue.includes(id)) {
    state.queue = queue.filter((q) => q !== id);
    return;
  }
  if (state.techs.includes(id) || !TECHS[id]) return;
  state.queue = [...queue, ...withPrereqs(state, id).filter((q) => !queue.includes(q))];
}

/** The queued tech to research right now, if any; drops entries that are done or no longer exist */
export function queueNext(state: GameState): string | null {
  if (!state.queue?.length) return null;
  state.queue = state.queue.filter((q) => TECHS[q] && !state.techs.includes(q));
  for (const id of state.queue) {
    if (!techAvailable(state, id)) continue;
    return canAfford(state, techCost(state, id)) ? id : null;
  }
  return null;
}

/** Pay for and learn a tech; the caller has checked it is available and affordable */
export function learn(state: GameState, id: string): void {
  for (const [item, n] of Object.entries(techCost(state, id))) state.items[item] = Math.max(0, (state.items[item] ?? 0) - n);
  state.techs.push(id);
  if (state.queue) state.queue = state.queue.filter((q) => q !== id);
}

/** Research everything in the queue that can be afforded now, in order; returns what was learned */
export function runQueue(state: GameState): string[] {
  const done: string[] = [];
  for (let id = queueNext(state); id; id = queueNext(state)) {
    learn(state, id);
    done.push(id);
  }
  return done;
}
