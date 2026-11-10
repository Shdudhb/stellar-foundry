// One step of the whole colony: every world's factory, then the cargo ships between them
import { SHIP_FUEL_ITEM, SHIP_RATE, routeFuel } from '../data/planets';
import { tick } from './engine';
import { HOME, ensurePlanets, openPlanets, planetOf, storeOf, viewOf } from './planets';
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

  // Ships carry what the source can spare into the room the destination wants filled, in the order the routes
  // were made, and burn rocket fuel from the home storage for every item they move
  const routes: Record<number, RouteStatus> = {};
  const home = storeOf(state, HOME);
  for (const r of state.routes ?? []) {
    const capacity = r.ships * SHIP_RATE;
    const from = storeOf(state, r.from);
    const to = storeOf(state, r.to);
    if (!r.enabled || r.ships <= 0 || !from || !to || !home || !byPlanet[r.from] || !byPlanet[r.to]) {
      routes[r.id] = { perSec: 0, capacity, reason: !r.enabled ? 'paused' : 'idle', fuel: 0 };
      continue;
    }
    const cap = capOf(state, r.item);
    const stock = from.items[r.item] ?? 0;
    const have = Math.max(0, stock - (r.keep ?? 0) * cap);
    const room = Math.max(0, (r.upTo ?? 1) * cap - (to.items[r.item] ?? 0));
    const per = routeFuel(r.from, r.to);
    const fuelled = (home.items[SHIP_FUEL_ITEM] ?? 0) / per;
    const want = capacity * dt;
    const n = Math.max(0, Math.min(want, have, room, fuelled));
    if (n > 0) {
      from.items[r.item] = stock - n;
      to.items[r.item] = (to.items[r.item] ?? 0) + n;
      home.items[SHIP_FUEL_ITEM] = Math.max(0, (home.items[SHIP_FUEL_ITEM] ?? 0) - n * per);
      const out = byPlanet[r.from].rates;
      const into = byPlanet[r.to].rates;
      const burn = byPlanet[HOME].rates;
      out[r.item] = (out[r.item] ?? 0) - n / dt;
      into[r.item] = (into[r.item] ?? 0) + n / dt;
      burn[SHIP_FUEL_ITEM] = (burn[SHIP_FUEL_ITEM] ?? 0) - (n * per) / dt;
    }
    // The tightest of the things that held it back names the reason
    const least = Math.min(have, room, fuelled);
    const reason = n >= want * 0.999 ? 'ok'
      : least === fuelled ? 'fuel'
      : least === room ? ((r.upTo ?? 1) < 1 ? 'enough' : 'full')
      : (r.keep ?? 0) > 0 && stock > 1e-9 ? 'keep' : 'empty';
    routes[r.id] = { perSec: n / dt, capacity, reason, fuel: (n * per) / dt };
  }

  const here = byPlanet[planetOf(state)] ?? { lines: {}, power: {}, rates: {}, vented: {}, decayed: {} };
  return { last: { ...here, lines }, byPlanet, routes };
}
