// Getting at the worlds of a game: the one in view lives in state.items / lines / vent, the rest in state.others
import { HOME, PLANET_LIST, PLANETS } from '../data/planets';
import type { GameState, Line, PlanetStore } from './types';

export { HOME };

export const planetOf = (s: GameState) => s.planet ?? HOME;

/** Worlds the player can go to, the home world first */
export function openPlanets(s: GameState): string[] {
  return PLANET_LIST.filter((p) => !p.unlockMilestone || s.milestones.includes(p.unlockMilestone)).map((p) => p.id);
}

const emptyStore = (): PlanetStore => ({ items: {}, lines: [], vent: [] });

/** The storage, lines and venting of one world, wherever it is kept right now; null if nothing is there yet */
export function storeOf(s: GameState, planet: string): PlanetStore | null {
  if (planet === planetOf(s)) return s;
  return s.others?.[planet] ?? null;
}

/** Give every open world a place to keep things, so ships can land before the player has ever been there */
export function ensurePlanets(s: GameState): void {
  for (const p of openPlanets(s)) {
    if (p !== planetOf(s) && !s.others?.[p]) (s.others ??= {})[p] = emptyStore();
  }
}

/** The same game seen from another world: read it, tick it, but don't assign its top-level fields */
export function viewOf(s: GameState, planet: string): GameState {
  if (planet === planetOf(s)) return s;
  const o = s.others?.[planet] ?? emptyStore();
  return { ...s, planet, items: o.items, lines: o.lines, vent: o.vent };
}

/** The home world's storage: what research, megastructures and machines are paid from */
export const homeItems = (s: GameState): Record<string, number> => storeOf(s, HOME)?.items ?? {};

/** The game seen from home, for checks against the home storage */
export const homeView = (s: GameState): GameState => viewOf(s, HOME);

/** Every line on every world */
export function allLines(s: GameState): Line[] {
  if (!s.others) return s.lines;
  return [...s.lines, ...Object.values(s.others).flatMap((o) => o.lines)];
}

/** The world a line is on, or null if there is no such line */
export function planetOfLine(s: GameState, lineId: number): string | null {
  if (s.lines.some((l) => l.id === lineId)) return planetOf(s);
  for (const [p, o] of Object.entries(s.others ?? {})) if (o.lines.some((l) => l.id === lineId)) return p;
  return null;
}

/** Put another world in view: the current one is set aside whole, the other takes its place */
export function enterPlanet(s: GameState, planet: string): void {
  const now = planetOf(s);
  if (planet === now || !PLANETS[planet]) return;
  const others = (s.others ??= {});
  others[now] = { items: s.items, lines: s.lines, vent: s.vent };
  const next = others[planet] ?? emptyStore();
  delete others[planet];
  s.items = next.items;
  s.lines = next.lines;
  s.vent = next.vent;
  s.planet = planet;
}

/** Do something that belongs to the home world (spend, research, reward) from wherever the player is */
export function atHome<T>(s: GameState, fn: () => T): T {
  const was = planetOf(s);
  if (was === HOME) return fn();
  enterPlanet(s, HOME);
  try {
    return fn();
  } finally {
    enterPlanet(s, was);
  }
}
