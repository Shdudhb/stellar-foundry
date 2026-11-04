import { describe, expect, it } from 'vitest';
import { newGame } from '../state/save';
import { tick } from './engine';
import { shortfall } from './supply';

function factory(drills: number, furnaces: number) {
  const s = newGame();
  s.items = { iron_ore: 0, coal: 200 };
  s.lines = [
    { id: 1, machine: 'basic_drill', recipe: 'mine_iron', count: drills, enabled: true },
    { id: 2, machine: 'stone_furnace', recipe: 'smelt_iron', count: furnaces, enabled: true },
  ];
  return { s, last: tick(s, 0.1) };
}

describe('shortfall', () => {
  it('says how many machines on the making line close the gap', () => {
    const { s, last } = factory(1, 4);
    // Four furnaces want 2 ore/s; one basic drill digs 0.5/s
    const f = shortfall(s, last, 'iron_ore')!;
    expect(f.demand).toBeCloseTo(2);
    expect(f.capacity).toBeCloseTo(0.5);
    expect(f.line?.id).toBe(1);
    expect(f.machines).toBe(3);
  });

  it('is null once capacity covers demand', () => {
    const { s, last } = factory(4, 4);
    expect(shortfall(s, last, 'iron_ore')).toBeNull();
  });

  it('has no line to grow when nothing makes the item', () => {
    const { s, last } = factory(0, 2);
    s.lines = s.lines.filter((l) => l.id !== 1);
    const f = shortfall(s, last, 'iron_ore')!;
    expect(f.line).toBeUndefined();
    expect(f.gap).toBeCloseTo(1);
  });

  it('ignores paused consumers', () => {
    const { s, last } = factory(1, 4);
    s.lines[1].enabled = false;
    expect(shortfall(s, last, 'iron_ore')).toBeNull();
  });

  it('names what a starved maker is waiting for, and prefers a maker that could run flat out', () => {
    const s = newGame();
    s.items = { iron_ore: 0, coal: 0, iron_ingot: 0 };
    s.lines = [
      { id: 1, machine: 'stone_furnace', recipe: 'smelt_iron', count: 3, enabled: true },
      { id: 2, machine: 'workbench', recipe: 'craft_gear', count: 6, enabled: true },
    ];
    const last = tick(s, 0.1);
    // The furnaces can't keep up with the gears, and they have no ore or coal either
    const f = shortfall(s, last, 'iron_ingot')!;
    expect(f.line?.id).toBe(1);
    expect(['iron_ore', 'coal']).toContain(f.blocked);
  });
});
