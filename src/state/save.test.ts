import { describe, expect, it } from 'vitest';
import { RECIPES } from '../data/recipes';
import { SAVE_VERSION, exportString, importString, newGame, newStats, parseSave } from './save';

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

  it('drops lines whose machine or recipe no longer exists', () => {
    const s = newGame();
    s.lines = [
      { id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true },
      { id: 2, machine: 'basic_drill', recipe: 'no_such_recipe', count: 1, enabled: true },
      { id: 3, machine: 'no_such_machine', recipe: 'mine_stone', count: 1, enabled: true },
    ];
    expect(parseSave(JSON.stringify(s))!.lines.map((l) => l.id)).toEqual([1]);
  });

  it('repairs a damaged save instead of loading something that crashes the game', () => {
    const s = parseSave(JSON.stringify({
      version: 5,
      items: { stone: 12, iron_ore: -4, coal: null, gear: 'many', steel: 1e999 },
      lines: [
        { id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 2.7, enabled: true },
        { id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true },
        { id: 7, machine: 'basic_drill', recipe: 'mine_stone', count: -3 },
        null,
      ],
      nextLineId: 2,
      techs: 'steam_power',
      milestones: ['blast_furnace', 'blast_furnace', 4],
      legacy: { points: 'lots', upgrades: { speed: 99, nonsense: 3 } },
      stats: null,
      playTime: 'soon',
      savedAt: null,
      signal: 'now',
      incident: { id: 'no_such_event', until: 50 },
      galaxy: 'nowhere',
    }))!;
    expect(s.items).toEqual({ stone: 12 });
    expect(s.lines).toEqual([
      { id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 2, enabled: true },
      { id: 7, machine: 'basic_drill', recipe: 'mine_stone', count: 0, enabled: true },
    ]);
    // A new line must not take an id that is already in use
    expect(s.nextLineId).toBe(8);
    expect(s.techs).toEqual([]);
    expect(s.milestones).toEqual(['blast_furnace']);
    expect(s.legacy).toEqual({ points: 0, warps: 0, upgrades: { speed: 10 } });
    expect(s.stats).toEqual(newStats());
    expect(s.playTime).toBe(0);
    expect(Number.isFinite(s.savedAt)).toBe(true);
    expect(s.signal).toBeNull();
    expect(s.incident).toBeNull();
    expect(s.galaxy).toBeNull();
  });

  it('leaves a healthy save exactly as it was', () => {
    const s = newGame({ points: 3, warps: 1, upgrades: { kit: 2 } });
    s.lines = [{ id: 4, machine: 'fusion_reactor', recipe: Object.keys(RECIPES).find((r) => RECIPES[r].category === 'fusion')!, count: 2, enabled: false, heat: 0.5, limit: 0.25 }];
    s.nextLineId = 5;
    s.incident = { id: 'trader', until: 90, offer: { item: 'stone', n: 40, pay: { data: 15 } } };
    s.galaxy = 'frozen';
    s.signal = 120;
    s.stats.bestGate = 9000;
    s.queue = ['steam_power'];
    s.paused = true;
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });

  it('rejects garbage', () => {
    expect(parseSave('not json')).toBeNull();
    expect(importString('%%%')).toBeNull();
  });
});
