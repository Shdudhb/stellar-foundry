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
