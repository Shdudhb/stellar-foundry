import { GALAXIES } from '../data/galaxies';
import { FIRST_INCIDENT, INCIDENTS } from '../data/incidents';
import { KIT_LEVELS, FIRST_SIGNAL, LEGACY } from '../data/legacy';
import { OBJECTIVES } from '../data/objectives';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { TECHS } from '../data/tech';
import type { GameState, Line, Stats } from '../sim/types';

export const SAVE_KEY = 'stellar-foundry-save';
export const SAVE_VERSION = 5;

export const newStats = (): Stats => ({ produced: {}, gathered: 0, built: 0, signals: 0, incidents: 0, trades: 0 });

/**
 * A fresh run. Pass the legacy to carry it (and its starting kit) through a warp,
 * and the achievements and lifetime stats, which every run keeps.
 */
export function newGame(
  legacy: GameState['legacy'] = { points: 0, warps: 0, upgrades: {} },
  keep: Pick<GameState, 'achievements' | 'stats'> = { achievements: [], stats: newStats() },
): GameState {
  const items: Record<string, number> = {};
  for (const kit of KIT_LEVELS.slice(0, legacy.upgrades.kit ?? 0)) {
    for (const [i, n] of Object.entries(kit)) items[i] = (items[i] ?? 0) + n;
  }
  return {
    version: SAVE_VERSION,
    items,
    lines: [],
    nextLineId: 1,
    techs: [],
    milestones: [],
    vent: [],
    maintenance: true,
    claimed: [],
    signal: null,
    nextSignal: FIRST_SIGNAL,
    boostUntil: 0,
    legacy: { points: legacy.points, warps: legacy.warps, upgrades: { ...legacy.upgrades } },
    achievements: [...keep.achievements],
    stats: { ...keep.stats, produced: { ...keep.stats.produced } },
    galaxy: null,
    incident: null,
    nextIncident: FIRST_INCIDENT,
    playTime: 0,
    savedAt: Date.now(),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, fallback: number, min = 0) => (isNum(v) ? Math.max(min, v) : fallback);
const strings = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** Only the entries that are real, non-negative amounts */
const amounts = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(record(v)).filter((e): e is [string, number] => isNum(e[1]) && e[1] >= 0));

/**
 * Put every field into the shape the game relies on. A save that was edited by hand, cut short, or written
 * by a broken build would otherwise crash the game on every load, with no way back in for the player.
 */
function sanitize(s: GameState, base: GameState): void {
  s.items = amounts(s.items);
  s.techs = strings(s.techs);
  s.milestones = strings(s.milestones);
  s.vent = strings(s.vent);
  s.claimed = strings(s.claimed);
  s.achievements = strings(s.achievements);
  s.maintenance = s.maintenance !== false;
  s.playTime = num(s.playTime, 0);
  s.boostUntil = num(s.boostUntil, 0);
  s.nextSignal = num(s.nextSignal, s.playTime + FIRST_SIGNAL);
  s.nextIncident = num(s.nextIncident, s.playTime + FIRST_INCIDENT);
  s.savedAt = num(s.savedAt, base.savedAt);
  s.signal = isNum(s.signal) ? s.signal : null;
  s.galaxy = typeof s.galaxy === 'string' && GALAXIES[s.galaxy] ? s.galaxy : null;
  const inc = s.incident;
  s.incident = inc && typeof inc === 'object' && INCIDENTS[inc.id] && isNum(inc.until) ? inc : null;
  const offer = s.incident?.offer;
  if (offer && !(typeof offer.item === 'string' && isNum(offer.n) && offer.n > 0 && Object.keys(amounts(offer.pay)).length > 0)) {
    delete s.incident!.offer;
  }

  const legacy = record(s.legacy);
  const upgrades: Record<string, number> = {};
  for (const [id, level] of Object.entries(amounts(legacy.upgrades))) {
    if (LEGACY[id]) upgrades[id] = Math.min(LEGACY[id].max, Math.floor(level));
  }
  s.legacy = { points: Math.floor(num(legacy.points, 0)), warps: Math.floor(num(legacy.warps, 0)), upgrades };

  const stats = record(s.stats);
  const fresh = newStats();
  s.stats = {
    produced: amounts(stats.produced),
    gathered: num(stats.gathered, fresh.gathered),
    built: num(stats.built, fresh.built),
    signals: num(stats.signals, fresh.signals),
    incidents: num(stats.incidents, fresh.incidents),
    trades: num(stats.trades, fresh.trades),
    ...(isNum(stats.bestGate) && stats.bestGate > 0 ? { bestGate: stats.bestGate } : {}),
  };

  // Lines: whole machines only, and every id its own, or building on one line would act on another
  const seen = new Set<number>();
  const lines: Line[] = [];
  for (const l of Array.isArray(s.lines) ? s.lines : []) {
    if (!l || typeof l !== 'object' || !Number.isInteger(l.id) || seen.has(l.id)) continue;
    seen.add(l.id);
    l.count = Math.floor(num(l.count, 0));
    l.enabled = l.enabled !== false;
    if (l.wear !== undefined) l.wear = Math.min(1, num(l.wear, 0));
    if (l.heat !== undefined) l.heat = Math.min(1, num(l.heat, 0));
    lines.push(l);
  }
  s.lines = lines;
  s.nextLineId = Math.max(Math.floor(num(s.nextLineId, 1, 1)), ...lines.map((l) => l.id + 1));
  if (s.paused !== undefined) s.paused = s.paused === true;
}

/** Upgrade an older save shape to the current version. Add a case per version bump. */
function migrate(raw: any): GameState {
  const base = newGame();
  const s: GameState = { ...base, ...raw, items: { ...raw.items } };
  sanitize(s, base);
  if ((raw.version ?? 1) < 2) {
    // v2: the blast furnace milestone now also places a working blast furnace line
    if (s.milestones.includes('blast_furnace') && !s.lines.some((l) => l.machine === 'blast_furnace')) {
      s.lines = [...s.lines, { id: s.nextLineId++, machine: 'blast_furnace', recipe: 'bf_steel', count: 1, enabled: true }];
    }
  }
  if ((raw.version ?? 1) < 3) {
    // v3: the Dyson segment milestone now deploys its 100 panels into the swarm
    if (s.milestones.includes('dyson_segment')) s.items.dyson_swarm = Math.max(s.items.dyson_swarm ?? 0, 100);
  }
  if ((raw.version ?? 1) < 4) {
    // v4: objectives pay rewards; ones already finished before rewards existed count as collected
    s.claimed = OBJECTIVES.filter((o) => o.done(s)).map((o) => o.text);
    s.nextSignal = s.playTime + FIRST_SIGNAL;
  }
  if ((raw.version ?? 1) < 5) {
    // v5: achievements, lifetime stats and world events
    s.nextIncident = s.playTime + FIRST_INCIDENT;
  }
  // A line whose machine or recipe was renamed or removed would break the game; drop it
  s.lines = s.lines.filter((l) => MACHINES[l.machine] && RECIPES[l.recipe]);
  for (const l of s.lines) if (l.limit !== undefined && !(l.limit > 0 && l.limit < 1)) delete l.limit;
  if (s.queue !== undefined) s.queue = Array.isArray(s.queue) ? s.queue.filter((q) => typeof q === 'string' && TECHS[q]) : [];
  s.version = SAVE_VERSION;
  return s;
}

export function parseSave(json: string): GameState | null {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) return null;
    return migrate(raw);
  } catch {
    return null;
  }
}

/** Where a save that couldn't be read is set aside, so the fresh game that replaces it doesn't erase it */
export const UNREADABLE_KEY = `${SAVE_KEY}-unreadable`;

/** The stored game, if any. `onUnreadable` is told when there was one but it couldn't be read. */
export function loadLocal(onUnreadable?: () => void): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return null;
    const s = parseSave(json);
    if (!s) {
      localStorage.setItem(UNREADABLE_KEY, json);
      onUnreadable?.();
    }
    return s;
  } catch {
    return null;
  }
}

export function saveLocal(state: GameState): void {
  state.savedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // storage blocked or full; the game keeps running in memory
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Base64 of UTF-8 JSON, safe to paste anywhere */
export function exportString(state: GameState): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...state, savedAt: Date.now() }));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importString(text: string): GameState | null {
  try {
    const bin = atob(text.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseSave(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
