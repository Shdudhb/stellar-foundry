import { beforeEach, describe, expect, it } from 'vitest';
import { capOf, slotsUsed } from '../sim/rules';
import { build, buildMilestone, closeMilestoneModal, demolish, getState, getUi, importSave, upgradeLine } from './store';
import { exportString, newGame } from './save';

function load(items: Record<string, number>, techs: string[]) {
  const s = newGame();
  s.items = items;
  s.techs = techs;
  s.milestones = ['blast_furnace', 'power_hub'];
  s.lines = [{ id: 1, machine: 'lv_electrolyzer', recipe: 'electrolyze_bauxite', count: 3, enabled: true }];
  s.nextLineId = 2;
  importSave(exportString(s));
}

describe('orbital slots', () => {
  function loadOrbit(techs: string[]) {
    const s = newGame();
    s.items = { titanium: 1000, tungsten: 1000, precision_circuit: 100 };
    s.techs = techs;
    s.lines = [{ id: 1, machine: 'asteroid_miner', recipe: 'mine_asteroid', count: 0, enabled: true }];
    s.nextLineId = 2;
    importSave(exportString(s));
  }

  it('cannot build in orbit before the orbital station', () => {
    loadOrbit([]);
    build(1, 5);
    expect(getState().lines[0].count).toBe(0);
  });

  it('fills orbital slots without touching ground slots', () => {
    loadOrbit(['orbital_station']);
    build(1, 10);
    expect(getState().lines[0].count).toBe(6);
    expect(slotsUsed(getState(), true)).toBe(6);
    expect(slotsUsed(getState())).toBe(0);
  });
});

describe('fusion reactors', () => {
  it('shares a lit line\'s heat with each reactor built into it', () => {
    const s = newGame();
    s.items = { superconductor: 1000, iridium: 1000, tungsten: 1000, zg_crystal: 1000 };
    s.lines = [{ id: 1, machine: 'fusion_reactor', recipe: 'fuse_dhe3', count: 1, enabled: true, heat: 1 }];
    s.nextLineId = 2;
    importSave(exportString(s));
    build(1);
    expect(getState().lines[0].heat).toBeCloseTo(0.5);
  });
});

describe('swarm milestones', () => {
  function loadGate(swarm: number) {
    const s = newGame();
    s.techs = ['stargate', 'dyson'];
    s.items = { stable_exotic: 100, neutronium: 160, superconductor: 500, dyson_panel: 300, rocket_part: 80, heat_ceramic: 450, dyson_swarm: swarm };
    importSave(exportString(s));
  }

  it('deploys the Dyson segment\'s panels into the swarm', () => {
    loadGate(0);
    buildMilestone('dyson_segment');
    closeMilestoneModal();
    expect(getState().milestones).toContain('dyson_segment');
    expect(getState().items.dyson_swarm).toBe(200);
  });

  it('needs a 600-panel swarm for the stargate, without spending it', () => {
    loadGate(599);
    buildMilestone('stargate');
    expect(getState().milestones).not.toContain('stargate');

    loadGate(600);
    buildMilestone('stargate');
    closeMilestoneModal();
    expect(getState().milestones).toContain('stargate');
    expect(getState().items.dyson_swarm).toBe(600);
    expect(getState().items.stable_exotic).toBe(0);
  });
});

describe('upgradeLine', () => {
  beforeEach(() => load({ aluminum: 60, steel: 0, circuit: 12, cable: 60, gear: 0, copper_wire: 0 }, ['mv_tech']));

  it('swaps every machine and pays only the difference', () => {
    upgradeLine(1);
    const s = getState();
    expect(s.lines[0].machine).toBe('mv_electrolyzer');
    expect(s.lines[0].count).toBe(3);
    // MV: aluminum 20, steel 20, circuit 4, cable 20; LV refunds steel 20, gear 10, copper wire 40
    expect(s.items.aluminum).toBe(0);
    expect(s.items.circuit).toBe(0);
    expect(s.items.cable).toBe(0);
    expect(s.items.steel).toBe(0);
    expect(s.items.gear).toBe(30);
    expect(s.items.copper_wire).toBe(120);
  });

  it('does nothing when the materials are short', () => {
    getState().items.circuit = 11;
    upgradeLine(1);
    expect(getState().lines[0].machine).toBe('lv_electrolyzer');
    expect(getState().items.aluminum).toBe(60);
  });

  it('does nothing before the MV machine is researched', () => {
    load({ aluminum: 60, circuit: 12, cable: 60 }, []);
    upgradeLine(1);
    expect(getState().lines[0].machine).toBe('lv_electrolyzer');
  });
});

describe('toasts', () => {
  it('a repeated failure refreshes one toast instead of stacking copies', () => {
    const s = newGame();
    s.lines = [{ id: 1, machine: 'stone_furnace', recipe: 'smelt_iron', count: 0, enabled: true }];
    s.nextLineId = 2;
    importSave(exportString(s));
    getUi().toasts = [];
    for (let i = 0; i < 5; i++) build(1);
    expect(getUi().toasts.filter((t) => t.title === '材料不足')).toHaveLength(1);
    expect(getUi().toasts.at(-1)!.text).toBe('缺 石頭 10');
  });

  it('says when demolished materials do not fit back in storage', () => {
    const s = newGame();
    s.items = { stone: capOf(s, 'stone') };
    s.lines = [{ id: 1, machine: 'stone_furnace', recipe: 'smelt_iron', count: 2, enabled: true }];
    s.nextLineId = 2;
    importSave(exportString(s));
    demolish(1);
    expect(getUi().toasts.some((t) => t.text.includes('沒退回'))).toBe(true);
  });
});
