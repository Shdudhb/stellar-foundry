import { describe, expect, it } from 'vitest';
import { TECHS } from '../data/tech';
import { newGame } from '../state/save';
import { upgradeCost, upgradeTarget } from './rules';
import type { Line } from './types';

const unlocking = (machine: string) => Object.keys(TECHS).find((t) => TECHS[t].unlockMachines?.includes(machine))!;

describe('line upgrades', () => {
  const line: Line = { id: 1, machine: 'basic_drill', recipe: 'mine_coal', count: 3, enabled: true };

  it('take basic drills up to the best drill unlocked, skipping the steam one once electric is out', () => {
    const s = newGame();
    expect(upgradeTarget(s, line)).toBeNull();
    s.techs.push(unlocking('steam_drill'));
    expect(upgradeTarget(s, line)?.id).toBe('steam_drill');
    s.techs.push(unlocking('electric_drill'));
    expect(upgradeTarget(s, line)?.id).toBe('electric_drill');
  });

  it('charge the new machines and give back the old ones', () => {
    const s = newGame();
    s.techs.push(unlocking('steam_drill'), unlocking('electric_drill'));
    const net = upgradeCost(line, upgradeTarget(s, line)!);
    // Electric drills cost steel, gears and circuits; the basic drills' stone and iron come back
    expect(net).toMatchObject({ steel: 30, gear: 30, circuit: 6, stone: -15, iron_ingot: -15 });
  });
});

describe('upgrading a worn line', () => {
  it('replaces every machine, so the new ones start unworn', async () => {
    const store = await import('../state/store');
    const { exportString } = await import('../state/save');
    const s = newGame();
    s.techs = Object.keys(TECHS);
    s.maintenance = true;
    s.lines = [{ id: 1, machine: 'hv_assembler', recipe: 'craft_cable', count: 2, enabled: true, wear: 0.8 }];
    // Exactly what the upgrade asks for
    s.items = Object.fromEntries(Object.entries(upgradeCost(s.lines[0], upgradeTarget(s, s.lines[0])!)).filter(([, n]) => n > 0));
    store.importSave(exportString(s));
    const before = store.getState().lines[0];
    expect(upgradeTarget(store.getState(), before)).not.toBeNull();
    store.upgradeLine(1);
    const after = store.getState().lines[0];
    expect(after.machine).not.toBe('hv_assembler');
    expect(after.wear ?? 0).toBe(0);
  });
});

describe('taking a machine down', () => {
  it('never cuts back a pile that is already over its cap', async () => {
    const store = await import('../state/store');
    const { exportString } = await import('../state/save');
    const { capOf } = await import('./rules');
    const s = newGame();
    const over = capOf(s, 'stone') + 500;
    s.items = { stone: over, iron_ingot: 0 };
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
    store.importSave(exportString(s));
    store.demolish(1);
    expect(store.getState().items.stone).toBe(over);
    expect(store.getState().items.iron_ingot).toBe(5);
  });
});
