import { describe, expect, it } from 'vitest';
import { OBJECTIVES, unclaimedObjectives } from '../data/objectives';
import { simulateOffline } from '../sim/offline';
import { capOf, simSpeed, slotsTotal, techCost } from '../sim/rules';
import { exportString, newGame, parseSave } from './save';
import { answerSignal, buyLegacy, claimObjectives, getState, importSave, objectiveReward, warp } from './store';

function load(patch: (s: ReturnType<typeof newGame>) => void) {
  const s = newGame();
  patch(s);
  importSave(exportString(s));
}

describe('objective rewards', () => {
  it('pays every finished objective once, in the current tier\'s data', () => {
    load((s) => {
      s.items.stone = 10;
    });
    expect(unclaimedObjectives(getState())).toEqual([0]);
    const reward = objectiveReward(getState(), 1);
    // T1 research spends red data: 2.5% of it, rounded to 5
    expect(Object.keys(reward)).toEqual(['data']);
    claimObjectives();
    expect(getState().items.data).toBe(reward.data);
    expect(getState().claimed).toEqual([OBJECTIVES[0].text]);
    claimObjectives();
    expect(getState().items.data).toBe(reward.data);
  });

  it('counts objectives finished before rewards existed as already collected', () => {
    const old = { ...newGame(), version: 3, items: { stone: 50 }, claimed: undefined };
    const s = parseSave(JSON.stringify(old))!;
    expect(s.claimed).toContain(OBJECTIVES[0].text);
    expect(unclaimedObjectives(s)).toEqual([]);
  });
});

describe('relic signals', () => {
  it('gives data or a double-speed boost, and only while the signal is up', () => {
    load((s) => {
      s.signal = 90;
      s.playTime = 10;
    });
    answerSignal('boost');
    expect(getState().signal).toBeNull();
    expect(simSpeed(getState())).toBe(2);
    expect(getState().nextSignal).toBeGreaterThanOrEqual(10 + 300);

    answerSignal('data');
    expect(getState().items.data ?? 0).toBe(0);
  });
});

describe('warp', () => {
  it('starts a new run, keeps the legacy and adds points for the gate and extra swarm', () => {
    load((s) => {
      s.milestones = ['stargate'];
      s.items = { dyson_swarm: 720, data: 999 };
      s.legacy = { points: 3, warps: 1, upgrades: { kit: 1 } };
      s.maintenance = false;
    });
    warp();
    const s = getState();
    // 10 for the gate + 2 for 120 panels over 600
    expect(s.legacy).toEqual({ points: 15, warps: 2, upgrades: { kit: 1 } });
    expect(s.milestones).toEqual([]);
    expect(s.items.data).toBeUndefined();
    expect(s.items.stone).toBe(50);
    expect(s.maintenance).toBe(false);
  });

  it('refuses before the stargate is built', () => {
    load((s) => {
      s.items = { dyson_swarm: 900 };
    });
    warp();
    expect(getState().legacy.warps).toBe(0);
  });

  it('buys upgrades that change the run at once', () => {
    load((s) => {
      s.legacy = { points: 30, warps: 1, upgrades: {} };
    });
    buyLegacy('research');
    buyLegacy('research');
    buyLegacy('slots');
    buyLegacy('speed');
    const s = getState();
    // 4 + 8 + 3 + 5
    expect(s.legacy.points).toBe(10);
    expect(techCost(s, 'steam_power')).toEqual({ data: 24 });
    expect(slotsTotal(s)).toBe(30);
    // warps: 1 unlocks 越過地平線, worth +1% on top of the legacy +20%
    expect(s.achievements).toEqual(['warp_1']);
    expect(simSpeed(s)).toBeCloseTo(1.21);
    buyLegacy('speed');
    buyLegacy('speed');
    // 10 more for level 2, then 15 for level 3 is too much
    expect(s.legacy.upgrades.speed).toBe(2);
    expect(s.legacy.points).toBe(0);
  });

  it('delivers a newly bought kit level to the current run too', () => {
    load((s) => {
      s.legacy = { points: 2, warps: 1, upgrades: {} };
      s.items = { stone: 10 };
    });
    buyLegacy('kit');
    expect(getState().items.stone).toBe(60);
    expect(getState().items.coal).toBe(50);
  });

  it('scales storage by 1.5 per storage level', () => {
    const s = newGame({ points: 0, warps: 1, upgrades: { storage: 2 } });
    expect(capOf(s, 'stone')).toBe(200 * 2.25);
  });
});

describe('legacy speed offline', () => {
  it('runs offline catch-up at the legacy speed', () => {
    const s = newGame({ points: 0, warps: 1, upgrades: { speed: 5 } });
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
    simulateOffline(s, 100, 2);
    // 1 stone per 2 s, at double speed for 100 s
    expect(s.items.stone).toBeCloseTo(100);
    expect(s.playTime).toBe(100);
  });
});
