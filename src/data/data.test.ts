import { describe, expect, it } from 'vitest';
import { ITEMS, POWER_ORDER, isPower } from './items';
import { MACHINE_LIST, MACHINES } from './machines';
import { RECIPE_LIST, RECIPES } from './recipes';
import { MILESTONE_LIST, TECH_LIST, TECHS } from './tech';
import { canRun } from '../sim/rules';

describe('game data', () => {
  it('only references items that exist', () => {
    const refs = [
      ...RECIPE_LIST.flatMap((r) => [...Object.keys(r.inputs), ...Object.keys(r.outputs)]),
      ...MACHINE_LIST.flatMap((m) => [...Object.keys(m.cost), ...(m.power ? [m.power.item] : [])]),
      ...TECH_LIST.flatMap((t) => Object.keys(t.cost)),
      ...MILESTONE_LIST.flatMap((m) => Object.keys(m.cost)),
    ];
    expect(refs.filter((id) => !ITEMS[id])).toEqual([]);
  });

  it('has a machine for every recipe', () => {
    expect(RECIPE_LIST.filter((r) => !MACHINE_LIST.some((m) => canRun(m, r))).map((r) => r.id)).toEqual([]);
  });

  it('only references techs, machines, recipes and milestones that exist', () => {
    for (const t of TECH_LIST) {
      for (const r of t.requires) expect(TECHS[r], `${t.id} requires ${r}`).toBeDefined();
      for (const m of t.unlockMachines ?? []) expect(MACHINES[m], `${t.id} unlocks ${m}`).toBeDefined();
      for (const r of t.unlockRecipes ?? []) expect(RECIPES[r], `${t.id} unlocks ${r}`).toBeDefined();
    }
    for (const m of MILESTONE_LIST) {
      if (m.grantsLine) {
        expect(MACHINES[m.grantsLine.machine]).toBeDefined();
        expect(canRun(MACHINES[m.grantsLine.machine], RECIPES[m.grantsLine.recipe])).toBe(true);
      }
    }
  });

  it('only upgrades machines into a higher tier that runs everything the old one did', () => {
    for (const m of MACHINE_LIST) {
      if (!m.upgradesTo) continue;
      const to = MACHINES[m.upgradesTo];
      expect(to, m.id).toBeDefined();
      expect(to.tier).toBeGreaterThan(m.tier);
      expect(m.categories.every((c) => to.categories.includes(c)), m.id).toBe(true);
    }
  });

  it('lists every power item in POWER_ORDER, with generators only eating later networks', () => {
    const power = Object.keys(ITEMS).filter(isPower);
    expect([...POWER_ORDER].sort()).toEqual(power.sort());
    for (const r of RECIPE_LIST) {
      const out = Object.keys(r.outputs).find(isPower);
      if (!out) continue;
      for (const inp of Object.keys(r.inputs).filter(isPower)) {
        expect(POWER_ORDER.indexOf(inp), `${r.id}`).toBeGreaterThan(POWER_ORDER.indexOf(out));
      }
    }
  });

  it('runs orbital machines, and only them, on lift', () => {
    for (const m of MACHINE_LIST) {
      expect(m.power?.item === 'lift', m.id).toBe(!!m.orbital);
    }
  });

  it('only gives ignition to generators that draw no power of their own', () => {
    for (const m of MACHINE_LIST.filter((mm) => mm.ignition)) {
      expect(m.power, m.id).toBeUndefined();
      const recipes = RECIPE_LIST.filter((r) => canRun(m, r));
      expect(recipes.every((r) => Object.keys(r.outputs).some(isPower)), m.id).toBe(true);
    }
  });

  it('can reach every tech in order', () => {
    const done = new Set<string>();
    const built = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const t of TECH_LIST) {
        if (done.has(t.id)) continue;
        if (t.requiresMilestone && !built.has(t.requiresMilestone)) continue;
        if (!t.requires.every((r) => done.has(r))) continue;
        done.add(t.id);
        if (t.unlockMilestone) built.add(t.unlockMilestone);
        progress = true;
      }
    }
    expect(TECH_LIST.filter((t) => !done.has(t.id)).map((t) => t.id)).toEqual([]);
  });
});

describe('lore', () => {
  it('has a line for every item and nothing else', async () => {
    const { ITEM_LORE } = await import('./lore');
    const { ITEMS } = await import('./items');
    expect(Object.keys(ITEM_LORE).sort()).toEqual(Object.keys(ITEMS).sort());
  });
});
