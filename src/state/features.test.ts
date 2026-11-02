import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_LIST } from '../data/achievements';
import { INCIDENTS, eligibleIncidents } from '../data/incidents';
import { tick } from '../sim/engine';
import { capOf, categoryBoost, simSpeed, techCost } from '../sim/rules';
import { exportString, newGame, parseSave } from './save';
import { acceptTrade, build, checkAchievements, gather, getState, importSave, traderOffer, warp, addLine } from './store';

function load(patch: (s: ReturnType<typeof newGame>) => void) {
  const s = newGame();
  patch(s);
  importSave(exportString(s));
}

describe('world events', () => {
  it('speeds up only the boosted categories while the event lasts', () => {
    const s = newGame();
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
    const base = tick(structuredClone(s), 1).lines[1].craftsPerSec;
    s.incident = { id: 'rich_vein', until: 100 };
    expect(categoryBoost(s, 'mining')).toBe(2);
    expect(categoryBoost(s, 'smelting')).toBe(1);
    expect(tick(structuredClone(s), 1).lines[1].craftsPerSec).toBeCloseTo(base * 2);
    s.playTime = 100;
    expect(categoryBoost(s, 'mining')).toBe(1);
  });

  it('discounts research during a eureka', () => {
    const s = newGame();
    const full = techCost(s, 'steam_power').data;
    s.incident = { id: 'eureka', until: 50 };
    expect(techCost(s, 'steam_power').data).toBe(Math.ceil(full * INCIDENTS.eureka.researchMult!));
  });

  it('only offers events that would affect something', () => {
    const s = newGame();
    const ids = eligibleIncidents(s).map((d) => d.id);
    expect(ids).toContain('meteor');
    expect(ids).not.toContain('rich_vein');
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
    expect(eligibleIncidents(s).map((d) => d.id)).toContain('rich_vein');
  });

  it('trades half of the fullest pile for research data', () => {
    load((s) => {
      s.items.iron_ingot = capOf(s, 'iron_ingot') * 0.8;
      s.items.stone = 10;
    });
    const offer = traderOffer(getState())!;
    expect(offer.item).toBe('iron_ingot');
    expect(offer.n).toBe(Math.floor(getState().items.iron_ingot / 2));
    getState().incident = { id: 'trader', until: getState().playTime + 60, offer };
    const before = getState().items.iron_ingot;
    acceptTrade();
    expect(getState().items.iron_ingot).toBe(before - offer.n);
    const [payItem, payN] = Object.entries(offer.pay)[0];
    expect(getState().items[payItem]).toBe(payN);
    expect(getState().stats.trades).toBe(1);
    // One trade per caravan
    acceptTrade();
    expect(getState().stats.trades).toBe(1);
  });

  it('has no offer when nothing is piling up', () => {
    expect(traderOffer(newGame())).toBeNull();
  });
});

describe('achievements', () => {
  it('unlock from lifetime stats, speed the factory up and survive a warp', () => {
    load((s) => {
      s.items = { stone: 50, iron_ingot: 50 };
    });
    gather('stone');
    addLine('basic_drill', 'mine_stone');
    build(getState().lines[0].id);
    checkAchievements();
    expect(getState().achievements).toEqual(expect.arrayContaining(['gather_1', 'build_1']));
    const n = getState().achievements.length;
    expect(simSpeed(getState())).toBeCloseTo(1 + 0.01 * n);

    getState().milestones.push('stargate');
    warp();
    expect(getState().achievements.length).toBeGreaterThanOrEqual(n);
    expect(getState().stats.gathered).toBe(1);
    expect(getState().stats.built).toBe(1);
    expect(getState().lines).toEqual([]);
  });

  it('have unique ids and every one can be checked on a fresh game', () => {
    const ids = ACHIEVEMENT_LIST.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const s = newGame();
    const last = tick(s, 0.1);
    for (const a of ACHIEVEMENT_LIST) expect(a.done(s, last)).toBe(false);
  });
});

describe('save v5', () => {
  it('adds stats and event timing to an older save', () => {
    const old: any = { ...newGame(), version: 4, playTime: 1000 };
    delete old.stats;
    delete old.achievements;
    delete old.incident;
    const s = parseSave(JSON.stringify(old))!;
    expect(s.stats.gathered).toBe(0);
    expect(s.achievements).toEqual([]);
    expect(s.incident).toBeNull();
    expect(s.nextIncident).toBeGreaterThan(1000);
  });
});

describe('galaxy traits', () => {
  it('rolls a new trait on every warp and applies its speeds', async () => {
    const { GALAXIES } = await import('../data/galaxies');
    load((s) => {
      s.milestones = ['stargate'];
    });
    warp();
    const first = getState().galaxy!;
    expect(GALAXIES[first]).toBeDefined();
    for (const [cat, k] of Object.entries(GALAXIES[first].boost)) expect(categoryBoost(getState(), cat)).toBeCloseTo(k);
    getState().milestones.push('stargate');
    warp();
    expect(getState().galaxy).not.toBe(first);
  });
});
