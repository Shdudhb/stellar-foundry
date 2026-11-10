// One step of the whole colony: every world's factory, then the cargo ships between them
import { SHIP_RATE } from '../data/planets';
import { tick } from './engine';
import { ensurePlanets, openPlanets, planetOf, storeOf, viewOf } from './planets';
import { capOf } from './rules';
import type { GameState, RouteStatus, TickResult } from './types';

export interface WorldResult {
  /** The world in view, with every world's lines in `lines` (line ids are unique across worlds) */
  last: TickResult;
  byPlanet: Record<string, TickResult>;
  routes: Record<number, RouteStatus>;
}

export function tickAll(state: GameState, dt: number): WorldResult {
  ensurePlanets(state);
  const byPlanet: Record<string, TickResult> = {};
  const lines: TickResult['lines'] = {};
  for (const p of openPlanets(state)) {
    const res = tick(viewOf(state, p), dt);
    byPlanet[p] = res;
    Object.assign(lines, res.lines);
  }

  // Ships carry what the source has into the room the destination has left, in the order the routes were made
  const routes: Record<number, RouteStatus> = {};
  for (const r of state.routes ?? []) {
    const capacity = r.ships * SHIP_RATE;
    const from = storeOf(state, r.from);
    const to = storeOf(state, r.to);
    if (!r.enabled || r.ships <= 0 || !from || !to || !byPlanet[r.from] || !byPlanet[r.to]) {
      routes[r.id] = { perSec: 0, capacity, reason: !r.enabled ? 'paused' : 'idle' };
      continue;
    }
    const have = from.items[r.item] ?? 0;
    const room = Math.max(0, capOf(state, r.item) - (to.items[r.item] ?? 0));
    const want = capacity * dt;
    const n = Math.max(0, Math.min(want, have, room));
    if (n > 0) {
      from.items[r.item] = have - n;
      to.items[r.item] = (to.items[r.item] ?? 0) + n;
      const out = byPlanet[r.from].rates;
      const into = byPlanet[r.to].rates;
      out[r.item] = (out[r.item] ?? 0) - n / dt;
      into[r.item] = (into[r.item] ?? 0) + n / dt;
    }
    routes[r.id] = { perSec: n / dt, capacity, reason: n >= want * 0.999 ? 'ok' : room <= have ? 'full' : 'empty' };
  }

  const here = byPlanet[planetOf(state)] ?? { lines: {}, power: {}, rates: {}, vented: {}, decayed: {} };
  return { last: { ...here, lines }, byPlanet, routes };
}
