import { KIT_LEVELS, FIRST_SIGNAL } from '../data/legacy';
import { OBJECTIVES } from '../data/objectives';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import type { GameState } from '../sim/types';

export const SAVE_KEY = 'stellar-foundry-save';
export const SAVE_VERSION = 4;

/** A fresh run; pass the legacy to carry it (and its starting kit) through a warp */
export function newGame(legacy: GameState['legacy'] = { points: 0, warps: 0, upgrades: {} }): GameState {
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
    playTime: 0,
    savedAt: Date.now(),
  };
}

/** Upgrade an older save shape to the current version. Add a case per version bump. */
function migrate(raw: any): GameState {
  const base = newGame();
  const s: GameState = { ...base, ...raw, items: { ...raw.items } };
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
  // A line whose machine or recipe was renamed or removed would break the game; drop it
  s.lines = s.lines.filter((l) => MACHINES[l.machine] && RECIPES[l.recipe]);
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

export function loadLocal(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    return json ? parseSave(json) : null;
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
