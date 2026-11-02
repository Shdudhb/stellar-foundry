import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, exportString, importString, newGame, parseSave } from './save';

describe('save', () => {
  it('round-trips through the export string, including Chinese text', () => {
    const s = newGame();
    s.items.stone = 42;
    s.techs.push('steam_power');
    const back = importString(exportString(s))!;
    expect(back.items.stone).toBe(42);
    expect(back.techs).toEqual(['steam_power']);
  });

  it('puts the Dyson segment\'s 100 panels into the swarm for v2 saves', () => {
    const old = { ...newGame(), version: 2, milestones: ['dyson_segment'] };
    expect(parseSave(JSON.stringify(old))!.items.dyson_swarm).toBe(100);
    const fresh = { ...newGame(), version: 2 };
    expect(parseSave(JSON.stringify(fresh))!.items.dyson_swarm).toBeUndefined();
  });

  it('turns maintenance on for saves from before it existed', () => {
    const { maintenance, ...old } = newGame();
    const s = parseSave(JSON.stringify(old))!;
    expect(s.maintenance).toBe(true);
  });

  it('migrates a v1 save that already built the blast furnace', () => {
    const v1 = { ...newGame(), version: 1, milestones: ['blast_furnace'], nextLineId: 5 };
    const s = parseSave(JSON.stringify(v1))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.lines).toEqual([{ id: 5, machine: 'blast_furnace', recipe: 'bf_steel', count: 1, enabled: true }]);
    expect(s.nextLineId).toBe(6);
  });

  it('rejects garbage', () => {
    expect(parseSave('not json')).toBeNull();
    expect(importString('%%%')).toBeNull();
  });
});
