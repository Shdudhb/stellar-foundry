import { describe, expect, it } from 'vitest';
import { ITEM_ORDER } from '../data/items';
import { LEGACY_LIST } from '../data/legacy';
import { MACHINE_LIST, MACHINES } from '../data/machines';
import { RECIPE_LIST, RECIPES } from '../data/recipes';
import { MILESTONE_LIST, TECH_LIST } from '../data/tech';
import { exportString, importString, newGame } from '../state/save';
import * as store from '../state/store';
import { tick } from './engine';
import { canRun, capOf, slotsTotal, slotsUsed } from './rules';
import type { GameState } from './types';

/** Small seeded generator so a failure can be replayed */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;
const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

function randomState(r: Rand): GameState {
  const s = newGame();
  s.techs = TECH_LIST.filter(() => r() < 0.7).map((t) => t.id);
  s.milestones = MILESTONE_LIST.filter(() => r() < 0.3).map((m) => m.id);
  s.maintenance = r() < 0.5;
  s.legacy.upgrades = r() < 0.3 ? { storage: Math.floor(r() * 3) } : {};
  for (const id of ITEM_ORDER) {
    if (r() < 0.6) s.items[id] = Math.floor(r() * capOf(s, id) * (r() < 0.1 ? 1 : 0.8));
  }
  s.vent = ITEM_ORDER.filter(() => r() < 0.1);
  const lineCount = 1 + Math.floor(r() * 25);
  for (let i = 0; i < lineCount; i++) {
    const machine = pick(r, MACHINE_LIST);
    const recipes = RECIPE_LIST.filter((rc) => canRun(machine, rc));
    if (recipes.length === 0) continue;
    s.lines.push({
      id: s.nextLineId++,
      machine: machine.id,
      recipe: pick(r, recipes).id,
      count: Math.floor(r() * 12),
      enabled: r() < 0.9,
      wear: machine.upkeep ? r() : undefined,
      heat: machine.ignition ? (r() < 0.5 ? 1 : r()) : undefined,
    });
  }
  return s;
}

/** Throws only on failure, so the many passing checks stay cheap */
function check(ok: boolean, msg: () => string) {
  if (!ok) throw new Error(msg());
}

function checkState(s: GameState, where: string) {
  for (const [id, n] of Object.entries(s.items)) {
    check(Number.isFinite(n) && n >= -1e-6, () => `${where}: ${id} = ${n}`);
  }
  for (const l of s.lines) {
    if (l.wear !== undefined) check(l.wear >= 0 && l.wear <= 1, () => `${where}: wear ${l.wear}`);
    if (l.heat !== undefined) check(l.heat >= 0 && l.heat <= 1, () => `${where}: heat ${l.heat}`);
    check(Number.isInteger(l.count) && l.count >= 0, () => `${where}: count ${l.count}`);
    check(canRun(MACHINES[l.machine], RECIPES[l.recipe]), () => `${where}: ${l.machine} runs ${l.recipe}`);
  }
}

describe('engine fuzz', () => {
  it('keeps items finite, non-negative and within caps across random factories', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const s = randomState(r);
      // Items that start over the cap (from the random fill) may only go down
      const startOver = new Set(Object.keys(s.items).filter((id) => s.items[id] > capOf(s, id)));
      for (let step = 0; step < 40; step++) {
        const dt = r() < 0.8 ? 0.1 : r() * 60;
        const res = tick(s, dt);
        const where = `seed ${seed} step ${step}`;
        checkState(s, where);
        for (const [id, n] of Object.entries(s.items)) {
          if (!startOver.has(id)) check(n <= capOf(s, id) + 1e-6, () => `${where}: ${id} ${n} over cap ${capOf(s, id)}`);
        }
        for (const [id, st] of Object.entries(res.lines)) {
          check(st.efficiency >= 0 && st.efficiency <= 1 + 1e-9, () => `${where}: line ${id} eff ${st.efficiency}`);
          check(Number.isFinite(st.craftsPerSec), () => `${where}: line ${id} crafts ${st.craftsPerSec}`);
        }
        for (const [item, p] of Object.entries(res.power)) {
          check([p.supply, p.capacity, p.demand, p.satisfaction].every(Number.isFinite), () => `${where}: power ${item} ${JSON.stringify(p)}`);
          check(p.satisfaction >= 0 && p.satisfaction <= 1 + 1e-9, () => `${where}: ${item} sat ${p.satisfaction}`);
        }
        for (const [id, v] of Object.entries(res.rates)) check(Number.isFinite(v), () => `${where}: rate ${id} ${v}`);
      }
    }
  }, 30_000);
});

describe('store fuzz', () => {
  it('keeps slots, payments and saves consistent under random player actions', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 7919);
      const s = newGame();
      s.techs = TECH_LIST.filter(() => r() < 0.8).map((t) => t.id);
      for (const id of ITEM_ORDER) s.items[id] = Math.floor(r() * capOf(s, id));
      s.legacy.points = Math.floor(r() * 40);
      store.importSave(exportString(s));

      for (let step = 0; step < 150; step++) {
        const st = store.getState();
        const lineIds = st.lines.map((l) => l.id);
        const x = r();
        if (x < 0.15) {
          const m = pick(r, MACHINE_LIST);
          const recipes = RECIPE_LIST.filter((rc) => canRun(m, rc));
          if (recipes.length) store.addLine(m.id, pick(r, recipes).id);
        } else if (x < 0.4 && lineIds.length) store.build(pick(r, lineIds), 1 + Math.floor(r() * 5));
        else if (x < 0.48 && lineIds.length) store.demolish(pick(r, lineIds), 1 + Math.floor(r() * 3));
        else if (x < 0.53 && lineIds.length) store.upgradeLine(pick(r, lineIds));
        else if (x < 0.56 && lineIds.length) store.removeLine(pick(r, lineIds));
        else if (x < 0.6 && lineIds.length) store.setRecipe(pick(r, lineIds), pick(r, RECIPE_LIST).id);
        else if (x < 0.63 && lineIds.length) store.toggleLine(pick(r, lineIds));
        else if (x < 0.7) store.research(pick(r, TECH_LIST).id);
        else if (x < 0.73) store.buildMilestone(pick(r, MILESTONE_LIST).id);
        else if (x < 0.76) store.gather(pick(r, ITEM_ORDER));
        else if (x < 0.78) store.toggleVent(pick(r, ITEM_ORDER));
        else if (x < 0.8) store.claimObjectives();
        else if (x < 0.82) store.buyLegacy(pick(r, LEGACY_LIST).id);
        else if (x < 0.84) {
          st.signal = st.playTime + 10;
          store.answerSignal(r() < 0.5 ? 'data' : 'boost');
        } else {
          tick(st, r() < 0.8 ? 0.1 : r() * 30);
        }

        const now = store.getState();
        const where = `seed ${seed} step ${step}`;
        checkState(now, where);
        check(slotsUsed(now) <= slotsTotal(now), () => `${where}: ground slots ${slotsUsed(now)}/${slotsTotal(now)}`);
        check(slotsUsed(now, true) <= slotsTotal(now, true), () => `${where}: orbit slots ${slotsUsed(now, true)}/${slotsTotal(now, true)}`);
        check(now.legacy.points >= 0, () => `${where}: legacy points ${now.legacy.points}`);
        check(new Set(now.lines.map((l) => l.id)).size === now.lines.length, () => `${where}: duplicate line ids`);
      }
      const round = importString(store.exportSave());
      expect(round, `seed ${seed}: save round trip`).not.toBeNull();
      expect(round!.lines).toEqual(store.getState().lines);
      expect(round!.items).toEqual(store.getState().items);
    }
  }, 30_000);
});
