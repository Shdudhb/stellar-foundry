import { describe, expect, it } from 'vitest';
import { fuelLines, tick } from './engine';
import { simulateOffline } from './offline';
import { capOf } from './rules';
import type { GameState, Line } from './types';

function game(items: Record<string, number>, lines: Omit<Line, 'id' | 'enabled'>[], techs: string[] = []): GameState {
  return {
    version: 1,
    items: { ...items },
    lines: lines.map((l, i) => ({ ...l, id: i + 1, enabled: true })),
    nextLineId: lines.length + 1,
    techs,
    milestones: [],
    vent: [],
    maintenance: true,
    claimed: [],
    signal: null,
    nextSignal: 1e9,
    boostUntil: 0,
    legacy: { points: 0, warps: 0, upgrades: {} },
    achievements: [],
    stats: { produced: {}, gathered: 0, built: 0, signals: 0, incidents: 0, trades: 0 },
    galaxy: null,
    incident: null,
    nextIncident: 1e9,
    playTime: 0,
    savedAt: 0,
  };
}

function run(state: GameState, seconds: number, dt = 0.1) {
  let last = tick(state, dt);
  for (let t = dt; t < seconds - 1e-9; t += dt) last = tick(state, dt);
  return last;
}

describe('tick', () => {
  it('runs a line at full speed when inputs are plentiful', () => {
    const s = game({ iron_ore: 100, coal: 100 }, [{ machine: 'stone_furnace', recipe: 'smelt_iron', count: 2 }]);
    const r = tick(s, 1);
    // 2 furnaces x 2 ingots / 4s = 1 ingot/s
    expect(r.lines[1].efficiency).toBeCloseTo(1);
    expect(s.items.iron_ingot).toBeCloseTo(1);
    expect(s.items.iron_ore).toBeCloseTo(99);
    expect(s.items.coal).toBeCloseTo(99.5);
  });

  it('slows down and names the missing input', () => {
    const s = game({ iron_ore: 100, coal: 0.25 }, [{ machine: 'stone_furnace', recipe: 'smelt_iron', count: 2 }]);
    const r = tick(s, 1);
    expect(r.lines[1].efficiency).toBeCloseTo(0.5);
    expect(r.lines[1].reason).toEqual({ kind: 'input', item: 'coal' });
    expect(s.items.coal).toBeCloseTo(0);
  });

  it('splits a scarce input proportionally regardless of line order', () => {
    const s = game({ iron_ingot: 2 }, [
      { machine: 'workbench', recipe: 'craft_gear', count: 1 },
      { machine: 'workbench', recipe: 'craft_gear', count: 3 },
    ]);
    // demand: 4 benches x 2 ingots / 2s x 1s = 4 ingots, only 2 available
    const r = tick(s, 1);
    expect(r.lines[1].efficiency).toBeCloseTo(0.5);
    expect(r.lines[2].efficiency).toBeCloseTo(0.5);
    expect(s.items.iron_ingot).toBeCloseTo(0);
    expect(s.items.gear).toBeCloseTo(1);
  });

  it('stops a line whose byproduct storage is full', () => {
    const s = game({ iron_ingot: 100, coal: 100, slag: 0 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 1 },
      { machine: 'steam_press', recipe: 'press_steel', count: 1 },
    ]);
    s.items.slag = capOf(s, 'slag');
    const r = tick(s, 1);
    expect(r.lines[2].efficiency).toBe(0);
    expect(r.lines[2].reason).toEqual({ kind: 'output', item: 'slag' });
  });

  it('overclocks a tier-1 drill on a tier-0 recipe: 2x speed, 4x steam', () => {
    const s = game({ coal: 100 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 1 },
      { machine: 'steam_drill', recipe: 'mine_stone', count: 1 },
    ]);
    const r = tick(s, 1);
    expect(r.lines[2].craftsPerSec).toBeCloseTo(1);
    expect(r.power.steam.demand).toBeCloseTo(4);
    expect(r.power.steam.capacity).toBeCloseTo(10);
    expect(r.power.steam.supply).toBeCloseTo(4);
    expect(r.power.steam.satisfaction).toBe(1);
    // boiler burns only what is needed: 4/10 load of 0.5 coal/s
    expect(s.items.coal).toBeCloseTo(100 - 0.2);
    expect(r.lines[1].reason).toEqual({ kind: 'load' });
  });

  it('slows every steam machine evenly when steam runs short', () => {
    const s = game({ coal: 100 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 1 },
      { machine: 'steam_drill', recipe: 'mine_stone', count: 5 },
    ]);
    const r = tick(s, 1);
    // supply 10, demand 20
    expect(r.power.steam.satisfaction).toBeCloseTo(0.5);
    expect(r.lines[2].efficiency).toBeCloseTo(0.5);
    expect(r.lines[2].reason).toEqual({ kind: 'power', item: 'steam' });
  });

  it('stops steam machines when the boiler has no fuel', () => {
    const s = game({ coal: 0 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 2 },
      { machine: 'steam_drill', recipe: 'mine_iron', count: 1 },
    ]);
    const r = tick(s, 1);
    expect(r.power.steam.supply).toBe(0);
    expect(r.lines[2].efficiency).toBe(0);
    expect(r.lines[2].reason).toEqual({ kind: 'power', item: 'steam' });
  });

  it('chains EU demand through turbines down to boiler coal', () => {
    const s = game({ coal: 100, sand: 100, coke: 100 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 4 },
      { machine: 'steam_turbine', recipe: 'turbine_eu', count: 2 },
      { machine: 'blast_furnace', recipe: 'bf_silicon', count: 1 },
    ]);
    const r = tick(s, 1);
    // furnace wants 16 EU; turbines can make 20 -> run at 80% -> eat 32 steam of 40
    expect(r.power.eu.demand).toBeCloseTo(16);
    expect(r.power.eu.satisfaction).toBe(1);
    expect(r.power.steam.demand).toBeCloseTo(32);
    expect(r.lines[2].power).toMatchObject({ eu: expect.closeTo(16), steam: expect.closeTo(-32) });
    expect(r.lines[3].efficiency).toBeCloseTo(1);
    // boilers burn 32/40 of 2 coal/s
    expect(s.items.coal).toBeCloseTo(100 - 1.6);
  });

  it('passes a steam shortage up into an EU shortage', () => {
    const s = game({ coal: 100, sand: 100, coke: 100 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 1 },
      { machine: 'steam_turbine', recipe: 'turbine_eu', count: 2 },
      { machine: 'blast_furnace', recipe: 'bf_silicon', count: 1 },
    ]);
    const r = tick(s, 1);
    // turbines need 32 steam, boiler gives 10 -> EU supply 5 of 16
    expect(r.power.steam.satisfaction).toBeCloseTo(10 / 32);
    expect(r.power.eu.supply).toBeCloseTo(5);
    expect(r.lines[2].reason).toEqual({ kind: 'power', item: 'steam' });
    expect(r.lines[3].efficiency).toBeCloseTo(5 / 16);
    expect(r.lines[3].reason).toEqual({ kind: 'power', item: 'eu' });
  });

  it('uses free solar power before burning fuel', () => {
    const s = game({ coal: 100, sand: 100, coke: 100 }, [
      { machine: 'solar_panel', recipe: 'solar_eu', count: 5 },
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 2 },
      { machine: 'steam_turbine', recipe: 'turbine_eu', count: 1 },
      { machine: 'blast_furnace', recipe: 'bf_silicon', count: 1 },
    ]);
    const r = tick(s, 1);
    // 10 EU from solar, turbine covers the other 6 -> 60% load -> 12 steam
    expect(r.lines[1].efficiency).toBeCloseTo(1);
    expect(r.lines[3].power.eu).toBeCloseTo(6);
    expect(r.power.steam.demand).toBeCloseTo(12);
    expect(s.items.coal).toBeCloseTo(100 - 0.6);
  });

  it('leaves turbines and boilers idle when nothing needs power', () => {
    const s = game({ coal: 100 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 1 },
      { machine: 'steam_turbine', recipe: 'turbine_eu', count: 1 },
    ]);
    const r = tick(s, 1);
    expect(r.lines[1].reason).toEqual({ kind: 'load' });
    expect(r.lines[2].reason).toEqual({ kind: 'load' });
    expect(s.items.coal).toBe(100);
  });

  it('stops the distillation tower when any one of its four outputs is full', () => {
    const s = game({ crude_oil: 1000, coal: 100 }, [
      { machine: 'steam_boiler', recipe: 'burn_coal', count: 10 },
      { machine: 'steam_turbine', recipe: 'turbine_eu', count: 5 },
      { machine: 'distillation_tower', recipe: 'distill_crude', count: 1 },
    ]);
    expect(tick(s, 1).lines[3].efficiency).toBeCloseTo(1);
    s.items.sulfur = capOf(s, 'sulfur');
    const r = tick(s, 1);
    expect(r.lines[3].efficiency).toBe(0);
    expect(r.lines[3].reason).toEqual({ kind: 'output', item: 'sulfur' });
  });

  it('breaks a byproduct deadlock when the byproduct is vented', () => {
    // Oxygen is full, so chromite electrolysis (which makes oxygen) stalls, so there is no
    // chromium, so the arc furnace (which would eat the oxygen) cannot run either.
    const setup = () => {
      const s = game({ chromite_dust: 300, steel: 300, light_oil: 100 }, [
        { machine: 'combustion_gen', recipe: 'burn_light_oil', count: 2 },
        { machine: 'mv_electrolyzer', recipe: 'electrolyze_chromite', count: 3 },
        { machine: 'arc_furnace', recipe: 'arc_stainless', count: 1 },
      ]);
      s.items.oxygen = capOf(s, 'oxygen');
      return s;
    };
    const stuck = setup();
    run(stuck, 20);
    expect(stuck.items.stainless ?? 0).toBe(0);

    const vented = setup();
    vented.vent = ['oxygen'];
    const r = run(vented, 20);
    expect(vented.items.stainless).toBeGreaterThan(0);
    expect(vented.items.oxygen).toBeLessThanOrEqual(capOf(vented, 'oxygen'));
    expect(r.lines[2].reason).toEqual({ kind: 'ok' });
  });

  it('applies the large-facility speed multiplier on top of power draw', () => {
    const s = game({ ethylene: 100, oxygen: 100, light_oil: 100 }, [
      { machine: 'combustion_gen', recipe: 'burn_light_oil', count: 2 },
      { machine: 'large_chem_plant', recipe: 'make_plastic', count: 1 },
    ]);
    const r = tick(s, 1);
    // 4x speed: 4 crafts / 4s = 1 craft/s -> 2 plastic/s, drawing 64 EU of the 100 available
    expect(r.lines[2].craftsPerSec).toBeCloseTo(1);
    expect(s.items.plastic).toBeCloseTo(2);
    expect(r.power.eu.demand).toBeCloseTo(64);
    // combustion generators burn only for demand: 64/100 load of 1 light oil/s
    expect(s.items.light_oil).toBeCloseTo(100 - 0.64);
  });

  it('overclocks an MV electrolyzer on the LV bauxite recipe', () => {
    const s = game({ bauxite_dust: 100, light_oil: 100 }, [
      { machine: 'combustion_gen', recipe: 'burn_light_oil', count: 1 },
      { machine: 'mv_electrolyzer', recipe: 'electrolyze_bauxite', count: 1 },
    ]);
    const r = tick(s, 1);
    expect(r.lines[2].craftsPerSec).toBeCloseTo(2 / 6);
    expect(r.power.eu.demand).toBeCloseTo(32);
  });

  // One HV electrolyzer on salt (tier 3: 2x speed, 32 EU) powered by solar, 1 kit/min at full speed
  function hvSalt(items: Record<string, number>, wear: number) {
    const s = game(items, [
      { machine: 'hv_electrolyzer', recipe: 'electrolyze_salt', count: 1, wear },
      { machine: 'solar_panel', recipe: 'solar_eu', count: 20 },
    ], ['storage_1', 'storage_2', 'storage_3']);
    s.vent = ['chlorine'];
    return s;
  }

  it('slows a fully worn machine to half speed and blames wear', () => {
    const s = hvSalt({ salt: 1000 }, 1);
    const r = tick(s, 0.1);
    expect(r.lines[1].efficiency).toBeCloseTo(0.5);
    expect(r.lines[1].reason).toEqual({ kind: 'wear' });
    // A slower machine draws proportionally less power
    expect(r.power.eu.demand).toBeCloseTo(16);
  });

  it('wears a machine down while it works without maintenance kits', () => {
    const s = hvSalt({ salt: 1000 }, 0);
    const r = run(s, 60);
    // dw/dt = speed / 600, speed starting at 1
    expect(s.lines[0].wear).toBeGreaterThan(0.09);
    expect(s.lines[0].wear).toBeLessThan(0.1);
    expect(r.lines[1].upkeep?.supplied).toBe(0);
  });

  it('repairs wear and consumes kits in proportion to the work done', () => {
    const s = hvSalt({ salt: 1000, maintenance_kit: 10 }, 1);
    run(s, 60);
    // From w=1, dw/dt = -(1 - w/2)/60  =>  w = 2 - e^(t/120); kits = (e^0.5 - 1) * 1 kit/min * 1 min
    expect(s.lines[0].wear).toBeCloseTo(2 - Math.exp(0.5), 1);
    expect(10 - s.items.maintenance_kit).toBeCloseTo(Math.exp(0.5) - 1, 1);
  });

  it('ignores wear and uses no kits with maintenance turned off', () => {
    const s = hvSalt({ salt: 1000, maintenance_kit: 10 }, 1);
    s.maintenance = false;
    const r = run(s, 10);
    expect(r.lines[1].efficiency).toBeCloseTo(1);
    expect(s.items.maintenance_kit).toBe(10);
    expect(s.lines[0].wear).toBe(1);
  });

  it('runs the titanium salt loop on one fresh salt per ingot', () => {
    const s = game({ salt: 400, rutile_dust: 400, coke: 400, coolant: 200, maintenance_kit: 100 }, [
      { machine: 'mv_electrolyzer', recipe: 'electrolyze_salt', count: 1 },
      { machine: 'hv_chem_reactor', recipe: 'chlorinate_rutile', count: 1 },
      { machine: 'vacuum_furnace', recipe: 'reduce_titanium', count: 1 },
      { machine: 'vacuum_freezer', recipe: 'freeze_titanium', count: 1 },
      { machine: 'cooling_tower', recipe: 'cool_coolant', count: 1 },
      { machine: 'solar_panel', recipe: 'solar_eu', count: 80 },
    ], ['storage_1', 'storage_2', 'storage_3']);
    s.vent = ['carbon_monoxide'];
    run(s, 600, 0.5);
    const ti = s.items.titanium;
    // The furnace caps the line at 1/8 ingot per second; sodium has to build up first
    expect(ti).toBeGreaterThan(60);
    expect(ti).toBeLessThanOrEqual(75);
    // Salt in flight sits in the sodium/chlorine/TiCl4 buffers, so allow a little slack
    const saltUsed = 400 - s.items.salt;
    expect(saltUsed).toBeGreaterThanOrEqual(ti - 1e-6);
    expect(saltUsed).toBeLessThan(ti + 15);
    expect(s.lines.every((l) => (l.wear ?? 0) === 0)).toBe(true);
  });

  // Two asteroid miners (6 lift each) and a solar wind collector (2): 14 lift/s wanted in orbit
  const orbit = [
    { machine: 'asteroid_miner', recipe: 'mine_asteroid', count: 2 },
    { machine: 'solar_wind_collector', recipe: 'collect_he3', count: 1 },
  ];

  it('launches rockets only for the lift that orbit needs', () => {
    const s = game({ rocket_fuel: 100, rocket_part: 10 }, [...orbit, { machine: 'launch_pad', recipe: 'launch_rocket', count: 1 }]);
    const r = tick(s, 1);
    expect(r.lines[1].efficiency).toBeCloseTo(1);
    expect(r.lines[2].efficiency).toBeCloseTo(1);
    // One pad can lift 20/s; 14/20 of a rocket every 60 s
    expect(r.power.lift.capacity).toBeCloseTo(20);
    expect(r.lines[3].reason).toEqual({ kind: 'load' });
    expect(100 - s.items.rocket_fuel).toBeCloseTo((20 / 60) * 0.7);
  });

  it('slows every orbital machine evenly when lift runs short', () => {
    // Enough parts for 52.5% of a pad: 10.5 of the 14 lift wanted
    const s = game({ rocket_fuel: 100, rocket_part: 0.00875 }, [...orbit, { machine: 'launch_pad', recipe: 'launch_rocket', count: 1 }]);
    const r = tick(s, 1);
    expect(r.power.lift.satisfaction).toBeCloseTo(0.75);
    expect(r.lines[1].efficiency).toBeCloseTo(0.75);
    expect(r.lines[2].efficiency).toBeCloseTo(0.75);
    expect(r.lines[1].reason).toEqual({ kind: 'power', item: 'lift' });
  });

  it('chains lift demand through the space elevator into EU', () => {
    const s = game({}, [
      ...orbit,
      { machine: 'space_elevator', recipe: 'elevator_lift', count: 1 },
      { machine: 'solar_panel', recipe: 'solar_eu', count: 20 },
    ]);
    const r = tick(s, 1);
    // 14 of the elevator's 100 lift: 14% of its 256 EU
    expect(r.power.eu.demand).toBeCloseTo(256 * 0.14);
    expect(r.lines[1].efficiency).toBeCloseTo(1);

    // Half the solar: the EU shortage becomes a lift shortage
    s.lines[3].count = 10;
    const r2 = tick(s, 1);
    expect(r2.power.lift.satisfaction).toBeCloseTo(20 / 35.84);
    expect(r2.lines[1].efficiency).toBeCloseTo(20 / 35.84);
    expect(r2.lines[1].reason).toEqual({ kind: 'power', item: 'lift' });
  });

  it('runs the iridium chlorine loop on one fresh chlorine per ingot', () => {
    const s = game({ chlorine: 300, maintenance_kit: 100, rocket_fuel: 200, rocket_part: 20 }, [
      { machine: 'asteroid_miner', recipe: 'mine_asteroid', count: 1 },
      { machine: 'launch_pad', recipe: 'launch_rocket', count: 1 },
      { machine: 'lv_crusher', recipe: 'crush_meteor', count: 1 },
      { machine: 'hv_chem_reactor', recipe: 'leach_meteor', count: 2 },
      { machine: 'plasma_arc_furnace', recipe: 'smelt_iridium', count: 3 },
      { machine: 'solar_panel', recipe: 'solar_eu', count: 70 },
    ], ['storage_1', 'storage_2', 'storage_3']);
    s.vent = ['iron_oxide'];
    run(s, 600, 0.5);
    const ir = s.items.iridium;
    // Two reactors leach 0.25 chloride/s, minus the time the first ore takes to arrive
    expect(ir).toBeGreaterThan(130);
    expect(ir).toBeLessThanOrEqual(150);
    const chlorineUsed = 300 - s.items.chlorine;
    // Chlorine in flight sits in the chloride buffer
    expect(chlorineUsed).toBeGreaterThanOrEqual(ir - 1e-6);
    expect(chlorineUsed).toBeLessThan(ir + 10);
  });

  it('overclocks an IV machine perfectly: 4x speed per tier, same power per product', () => {
    const s = game({ ethylene: 1000, oxygen: 1000, maintenance_kit: 10 }, [
      { machine: 'iv_chem_reactor', recipe: 'make_plastic', count: 1 },
      { machine: 'solar_panel', recipe: 'solar_eu', count: 600 },
    ], ['storage_1', 'storage_2', 'storage_3']);
    const r = tick(s, 0.1);
    // Three tiers above the MV recipe: 4^3 = 64x speed and 64x power
    expect(r.lines[1].maxCraftsPerSec).toBeCloseTo(64 / 4);
    expect(r.power.eu.demand).toBeCloseTo(16 * 64);
    expect(r.lines[1].efficiency).toBeCloseTo(1);
    // 64 EU per plastic craft, exactly what the MV reactor pays (16 EU/s at 1 craft per 4 s)
    expect(r.power.eu.demand / r.lines[1].craftsPerSec).toBeCloseTo(16 * 4);
  });

  function fusion(items: Record<string, number>, heat: number, solar: number) {
    return game({ maintenance_kit: 100, ...items }, [
      { machine: 'fusion_reactor', recipe: 'fuse_dhe3', count: 1, heat },
      { machine: 'solar_panel', recipe: 'solar_eu', count: solar },
    ]);
  }

  it('draws ignition power until the reactor is lit, then generates', () => {
    const s = fusion({ deuterium: 100, helium_3: 100 }, 0, 600);
    const r = tick(s, 1);
    expect(r.lines[1].reason).toEqual({ kind: 'igniting' });
    expect(r.power.eu.demand).toBeCloseTo(1000);
    expect(s.lines[0].heat).toBeCloseTo(1 / 30);
    // Ignition burns no fuel
    expect(s.items.deuterium).toBe(100);

    run(s, 29, 1);
    expect(s.lines[0].heat).toBe(1);
    const lit = tick(s, 1);
    // Lit and nothing to power: it idles without burning fuel or going cold
    expect(lit.power.eu.capacity).toBeCloseTo(1200 + 2000);
    expect(lit.lines[1].reason).toEqual({ kind: 'load' });
    expect(s.items.deuterium).toBe(100);
    expect(s.lines[0].heat).toBe(1);
  });

  it('ignites more slowly and browns out the grid when EU is short', () => {
    const s = fusion({ deuterium: 100, helium_3: 100 }, 0, 250);
    const r = tick(s, 1);
    expect(r.power.eu.satisfaction).toBeCloseTo(0.5);
    expect(s.lines[0].heat).toBeCloseTo(0.5 / 30);
  });

  it('goes cold without fuel and has to be lit again', () => {
    const s = fusion({ deuterium: 0, helium_3: 100 }, 1, 600);
    run(s, 5, 1);
    expect(s.lines[0].heat).toBeCloseTo(1 - 5 / 20);
    const r = tick(s, 1);
    expect(r.lines[1].reason).toEqual({ kind: 'input', item: 'deuterium' });
    expect(r.power.eu.demand).toBe(0);

    // Refuelled after a short outage: only the lost heat has to be put back
    s.items.deuterium = 100;
    run(s, 0.3 * 30, 1);
    expect(s.lines[0].heat).toBe(1);
  });

  it('decays exotic matter exponentially while it sits in storage', () => {
    const s = game({ exotic_matter: 100 }, []);
    const r = run(s, 10, 1);
    expect(s.items.exotic_matter).toBeCloseTo(100 * Math.exp(-0.2));
    expect(r.decayed.exotic_matter).toBeGreaterThan(0);
    expect(r.rates.exotic_matter).toBeCloseTo(-r.decayed.exotic_matter);
  });

  it('powers machines from the Dyson swarm, 20 EU per panel', () => {
    const s = game({ dyson_swarm: 100 }, []);
    expect(tick(s, 1).power.eu.capacity).toBeCloseTo(2000);
  });

  it('grows the swarm as panels are deployed, and the swarm can lift its own launcher', () => {
    const s = game({ dyson_swarm: 10, dyson_panel: 10 }, [
      { machine: 'swarm_launcher', recipe: 'deploy_swarm', count: 1 },
      { machine: 'space_elevator', recipe: 'elevator_lift', count: 1 },
    ]);
    run(s, 20, 1);
    expect(s.items.dyson_swarm).toBeCloseTo(12);
    expect(s.items.dyson_panel).toBeCloseTo(8);
  });

  function exotic(stabilizers: number) {
    return game({ neutronium: 100, superconductor: 100, maintenance_kit: 100, dyson_swarm: 300 }, [
      { machine: 'particle_collider', recipe: 'collide_neutronium', count: 1 },
      { machine: 'spacetime_stabilizer', recipe: 'stabilize_exotic', count: stabilizers },
    ]);
  }

  it('loses almost no exotic matter when stabilizers keep up with the collider', () => {
    const s = exotic(1);
    run(s, 300, 0.5);
    // 0.4 exotic/s in, 2 per stable: 60 stable over 300 s if nothing decays
    expect(s.items.stable_exotic).toBeGreaterThan(57);
    expect(s.items.exotic_matter).toBeLessThan(1);
  });

  it('settles at production / decay when nothing uses the exotic matter', () => {
    const s = exotic(0);
    run(s, 300, 0.5);
    // dN/dt = 0.4 - 0.02 N  =>  N -> 20
    expect(s.items.exotic_matter).toBeCloseTo(20, 0);
  });

  it('never exceeds storage caps', () => {
    const s = game({}, [{ machine: 'basic_drill', recipe: 'mine_stone', count: 10 }]);
    run(s, 200);
    expect(s.items.stone).toBeCloseTo(capOf(s, 'stone'));
  });
});

describe('power priority for the fuel chain', () => {
  // Oil power: the pump and tower run on the EU their own light oil makes, and drills ask for far more
  function oilGrid(drills: number) {
    // One pump keeps one tower fed exactly; everything else vents, so only power can slow a line
    const s = game({ crude_oil: 50, light_oil: 5 }, [
      { machine: 'oil_pump', recipe: 'pump_oil', count: 1 },
      { machine: 'distillation_tower', recipe: 'distill_crude', count: 1 },
      { machine: 'combustion_gen', recipe: 'burn_light_oil', count: 2 },
      { machine: 'electric_drill', recipe: 'mine_stone', count: drills },
    ]);
    s.vent = ['heavy_oil', 'refinery_gas', 'sulfur', 'stone'];
    return s;
  }

  it('finds the lines that feed a running generator, through every step of its fuel', () => {
    const s = oilGrid(1);
    expect([...fuelLines(s)].sort()).toEqual([1, 2]);
  });

  it('keeps the fuel chain at full power in a brownout, so generation does not collapse', () => {
    const s = oilGrid(40);
    const last = run(s, 300, 1);
    // The pumps and the tower get their power first and run flat out...
    expect(last.lines[1].efficiency).toBeCloseTo(1);
    expect(last.lines[2].efficiency).toBeCloseTo(1);
    // ...so the generators burn all the oil the tower makes (0.8/s → 80 EU), while the drills share what is left
    expect(last.power.eu.supply).toBeGreaterThan(75);
    expect(last.lines[4].efficiency).toBeLessThan(0.5);
    expect(last.lines[4].reason.kind).toBe('power');
  });

  it('changes nothing while there is enough power', () => {
    const s = oilGrid(0);
    const last = run(s, 60, 1);
    expect(last.power.eu.satisfaction).toBe(1);
    expect(last.lines[2].efficiency).toBeCloseTo(1);
  });
});

describe('simulateOffline', () => {
  function chain() {
    return game({ coal: 50 }, [
      { machine: 'basic_drill', recipe: 'mine_iron', count: 4 },
      { machine: 'basic_drill', recipe: 'mine_coal', count: 3 },
      { machine: 'stone_furnace', recipe: 'smelt_iron', count: 2 },
      { machine: 'workbench', recipe: 'craft_gear', count: 1 },
    ]);
  }

  it('matches fine-grained live ticks within 2%', () => {
    const live = chain();
    run(live, 300, 0.1);
    const off = chain();
    simulateOffline(off, 300);
    for (const item of ['iron_ore', 'coal', 'iron_ingot', 'gear']) {
      const a = live.items[item] ?? 0;
      const b = off.items[item] ?? 0;
      expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(1, a * 0.02));
    }
  });

  it('caps catch-up at 12 hours and reports changes', () => {
    const s = chain();
    const report = simulateOffline(s, 48 * 3600);
    expect(report.simulated).toBe(12 * 3600);
    expect(report.changes.gear).toBeGreaterThan(0);
    expect(s.playTime).toBe(12 * 3600);
  });

  it('ends a world event on time instead of stretching it over the whole absence', () => {
    // 60 s of double-speed mining left, then 540 s at normal speed: 0.5 stone/s → 60 + 270
    const s = game({}, [{ machine: 'basic_drill', recipe: 'mine_stone', count: 1 }], ['storage_1']);
    s.playTime = 1000;
    s.incident = { id: 'rich_vein', until: 1060 };
    simulateOffline(s, 600);
    expect(s.items.stone).toBeCloseTo(330);
    expect(s.playTime).toBe(1600);
  });
});

describe('stock limit', () => {
  it('stops a line once its output reaches the limit, then makes what is used', () => {
    const s = game({ iron_ore: 1000, coal: 1000 }, [{ machine: 'stone_furnace', recipe: 'smelt_iron', count: 4 }]);
    s.lines[0].limit = 0.01;
    const target = 0.01 * capOf(s, 'iron_ingot');
    let last = run(s, 600);
    expect(s.items.iron_ingot).toBeCloseTo(target, 0);
    expect(last.lines[1].reason).toEqual({ kind: 'limit', item: 'iron_ingot' });
    expect(last.lines[1].efficiency).toBeLessThan(0.01);
    // Someone takes ingots: the line tops back up to the limit and holds there
    s.items.iron_ingot = target - 5;
    last = run(s, 30);
    expect(s.items.iron_ingot).toBeCloseTo(target, 0);
  });

  it('keeps feeding a consumer downstream while holding the stock at the limit', () => {
    const s = game({ iron_ore: 5000, coal: 5000 }, [
      { machine: 'stone_furnace', recipe: 'smelt_iron', count: 4 },
      { machine: 'workbench', recipe: 'craft_gear', count: 1 },
    ]);
    s.lines[0].limit = 0.01;
    const last = run(s, 60);
    expect(s.items.iron_ingot).toBeLessThanOrEqual(0.01 * capOf(s, 'iron_ingot') + 1e-6);
    // The gear line is never starved: the furnaces make exactly what it takes
    expect(last.lines[2].efficiency).toBeGreaterThan(0.99);
    expect(last.lines[1].reason.kind).toBe('limit');
  });
});
