import { describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENT_LIST } from '../data/achievements';
import { INCIDENTS, eligibleIncidents } from '../data/incidents';
import { MILESTONES } from '../data/tech';
import { tick } from '../sim/engine';
import { capOf, categoryBoost, simSpeed, slotsTotal, techCost } from '../sim/rules';
import { exportString, importString, newGame, parseSave } from './save';
import {
  acceptTrade, advance, answerSignal, build, buildMilestone, checkAchievements, createLine, focusLine, gather, getState, getUi, importSave, openLookup, toggleVent, togglePause, traderOffer, signalData, warp, addLine, openPicker,
} from './store';

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

describe('pause', () => {
  it('stops factory time while paused, live and for long gaps, and keeps actions working', () => {
    load((s) => {
      s.items = { stone: 100, iron_ingot: 100 };
      s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
      s.nextLineId = 2;
    });
    advance(1);
    const t = getState().playTime;
    expect(t).toBeGreaterThan(0);
    togglePause();
    expect(getState().paused).toBe(true);
    const stone = getState().items.stone;
    advance(1);
    // A long gap (tab in the background) is not caught up either
    advance(3600);
    expect(getState().playTime).toBe(t);
    expect(getState().items.stone).toBe(stone);
    // Building still works
    build(1);
    expect(getState().lines[0].count).toBe(2);
    togglePause();
    advance(1);
    expect(getState().playTime).toBeGreaterThan(t);
  });

  it('is kept in the save', () => {
    load((s) => {
      s.paused = true;
    });
    expect(getState().paused).toBe(true);
    expect(importString(exportString(getState()))!.paused).toBe(true);
  });
});

describe('venting co-products', () => {
  it('lets a full intermediate vent, so the line keeps making the oxygen next to it', () => {
    load((s) => {
      s.techs = ['electricity', 'mineral_processing', 'electrolysis'];
      s.milestones = ['blast_furnace'];
      s.items = { bauxite_dust: 1000, aluminum_dust: capOf(s, 'aluminum_dust') };
      s.lines = [{ id: 1, machine: 'lv_electrolyzer', recipe: 'electrolyze_bauxite', count: 1, enabled: true }];
    });
    const s = getState();
    // Electrolysis needs EU: hand it a free supply for the test
    s.items.dyson_swarm = 10;
    expect(tick(s, 1).lines[1].reason.kind).toBe('output');
    toggleVent('aluminum_dust');
    expect(s.vent).toContain('aluminum_dust');
    const before = s.items.oxygen ?? 0;
    tick(s, 10);
    expect(s.items.oxygen ?? 0).toBeGreaterThan(before);
    expect(s.items.aluminum_dust).toBe(capOf(s, 'aluminum_dust'));
  });

  it('still refuses data and power', () => {
    load(() => {});
    toggleVent('data');
    toggleVent('eu');
    expect(getState().vent).toEqual([]);
  });
});

describe('float drift in stock counts', () => {
  it('builds with 9.999999999999998 of a 10 cost, as the UI shows 10/10, and leaves zero', () => {
    load((s) => {
      s.items = { stone: 9.999999999999998 };
      s.lines = [{ id: 1, machine: 'stone_furnace', recipe: 'fire_brick', count: 0, enabled: true }];
      s.nextLineId = 2;
    });
    build(1);
    expect(getState().lines[0].count).toBe(1);
    expect(getState().items.stone).toBe(0);
  });
});

describe('building from the item window', () => {
  it('adds the line, closes the window and asks the production tab to show it', () => {
    load(() => {});
    openLookup('stone');
    createLine('basic_drill', 'mine_stone');
    const line = getState().lines.at(-1)!;
    expect(line).toMatchObject({ machine: 'basic_drill', recipe: 'mine_stone', count: 0 });
    expect(getUi().lookupItem).toBeNull();
    expect(getUi().focusLine).toBe(line.id);
    focusLine(null);
    expect(getUi().focusLine).toBeNull();
  });

  it('puts the first machine in when it is affordable, and closes the new-line window', () => {
    load((s) => {
      s.items = { stone: 50 };
    });
    openPicker(true);
    createLine('stone_furnace', 'smelt_iron');
    const line = getState().lines.at(-1)!;
    expect(line.count).toBe(1);
    expect(getState().items.stone).toBeLessThan(50);
    expect(getUi().picker).toBe(false);
    expect(getUi().focusLine).toBe(line.id);
    focusLine(null);
  });

  it('adds nothing for a locked machine', () => {
    load(() => {});
    createLine('steam_drill', 'mine_stone');
    expect(getState().lines).toEqual([]);
    expect(getUi().focusLine).toBeNull();
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
    const { GALAXIES, systemBoost } = await import('../data/galaxies');
    load((s) => {
      s.milestones = ['stargate'];
    });
    warp();
    const first = getState().galaxy!;
    expect(GALAXIES[first]).toBeDefined();
    for (const [cat, k] of Object.entries(GALAXIES[first].boost)) expect(categoryBoost(getState(), cat)).toBeCloseTo(k * systemBoost(getState().system, cat));
    expect(getState().system?.trait).toBe(first);
    getState().milestones.push('stargate');
    warp();
    expect(getState().galaxy).not.toBe(first);
  });
});

describe('coming back', () => {
  const drill = (s: ReturnType<typeof newGame>) => {
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
    s.nextLineId = 2;
  };

  it('tells a background tab\'s many short catch-ups as one absence', () => {
    load(drill);
    // A hidden tab is woken about once a minute: each wake-up is its own catch-up
    advance(60);
    advance(60);
    advance(60);
    const report = getUi().offlineReport!;
    expect(report.away).toBe(180);
    expect(report.simulated).toBe(180);
    expect(report.changes.stone).toBeCloseTo(getState().items.stone);
    expect(getState().playTime).toBe(180);
  });

  it('does not report a short hiccup, but adds it to a report still unread', () => {
    load(drill);
    advance(10);
    expect(getUi().offlineReport).toBeNull();
    advance(90);
    advance(10);
    expect(getUi().offlineReport!.away).toBe(100);
  });

  it('closes windows that point into the old run on a reset or a warp', () => {
    load((s) => {
      drill(s);
      s.milestones = ['stargate'];
    });
    openLookup('stone');
    openPicker(true, '石');
    warp();
    expect(getUi().lookupItem).toBeNull();
    expect(getUi().picker).toBe(false);
    expect(getUi().pickerQuery).toBe('');
  });

  it('says what is missing when a megastructure waits on something to hold, not to spend', () => {
    load((s) => {
      s.techs = ['stargate'];
      for (const [item, n] of Object.entries(MILESTONES.stargate.cost)) s.items[item] = n;
      s.items.dyson_swarm = 100;
    });
    buildMilestone('stargate');
    expect(getState().milestones).toEqual([]);
    const said = getUi().toasts[getUi().toasts.length - 1];
    expect(said.text).toContain('戴森群');
    expect(said.text).toContain('500');
  });
});

describe('newer events and legacies', () => {
  it('tops up the intermediates in stock when a container drifts by', () => {
    load((s) => {
      s.items = { gear: 10, iron_ingot: 5, copper_wire: 1, steel: 0.2 };
      s.nextIncident = 1;
      s.nextSignal = 1e9;
    });
    // The last of the events that can happen with no lines at all
    const roll = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    advance(1.2);
    roll.mockRestore();
    const s = getState();
    expect(s.incident?.id).toBe('salvage');
    expect(s.items.gear).toBe(10 + Math.ceil(capOf(s, 'gear') * 0.1));
    expect(s.items.copper_wire).toBe(1 + Math.ceil(capOf(s, 'copper_wire') * 0.1));
    // Not one the player has only a trace of
    expect(s.items.steel).toBe(0.2);
  });

  it('widens the orbit only once there is a station', () => {
    const s = newGame({ points: 0, warps: 1, upgrades: { orbit: 2 } });
    expect(slotsTotal(s, true)).toBe(0);
    s.techs = ['orbital_station'];
    const plain = slotsTotal({ ...s, legacy: { ...s.legacy, upgrades: {} } }, true);
    expect(plain).toBeGreaterThan(0);
    expect(slotsTotal(s, true)).toBe(plain + 8);
  });

  it('makes relics give more data and a longer boost', () => {
    load((s) => {
      s.techs = ['steam_power'];
    });
    const plain = signalData(getState()).data;
    load((s) => {
      s.techs = ['steam_power'];
      s.legacy.upgrades = { relic: 4 };
      s.signal = 100;
    });
    expect(signalData(getState()).data).toBeGreaterThan(plain * 1.8);
    answerSignal('boost');
    expect(getState().boostUntil).toBe(120 + 4 * 30);
  });
});

