import { describe, expect, it } from 'vitest';
import { MACHINES } from '../data/machines';
import { PLANET_LIST, SHIP_COST, SHIP_FUEL, SHIP_RATE, routeFuel } from '../data/planets';
import { GALAXY_LIST, STAR_LIST, rollSystems, type StarSystem } from '../data/galaxies';
import { SWARM_EU } from '../data/items';
import { RECIPE_LIST, RECIPES } from '../data/recipes';
import { MILESTONES, TECHS } from '../data/tech';
import { allLines, atHome, enterPlanet, homeItems, openPlanets, planetOf, storeOf } from '../sim/planets';
import { capOf, categoryBoost, recipeFits, recipePlanet, slotsTotal } from '../sim/rules';
import { simulateOffline } from '../sim/offline';
import { tickAll } from '../sim/world';
import { exportString, importString, newGame } from './save';
import { addLine, addRoute, build, buildShip, getState, importSave, exportSave, removeRoute, switchPlanet, warp, warpChoices, warpEarnings } from './store';

function colony(patch: (s: ReturnType<typeof newGame>) => void = () => {}) {
  const s = newGame();
  s.milestones.push('colony_ship');
  s.techs.push('deuterium_extraction');
  patch(s);
  return s;
}

describe('planets', () => {
  it('opens the ice moon with the colony ship', () => {
    expect(openPlanets(newGame())).toEqual(['home']);
    expect(openPlanets(colony())).toEqual(['home', 'ice']);
  });

  it('keeps each world\'s storage and lines apart, and swaps back whole', () => {
    const s = colony((g) => { g.items.stone = 7; });
    enterPlanet(s, 'ice');
    expect(planetOf(s)).toBe('ice');
    expect(s.items.stone).toBeUndefined();
    s.items.comet_ice = 3;
    expect(homeItems(s).stone).toBe(7);
    expect(atHome(s, () => s.items.stone)).toBe(7);
    expect(planetOf(s)).toBe('ice');
    enterPlanet(s, 'home');
    expect(s.items.stone).toBe(7);
    expect(storeOf(s, 'ice')!.items.comet_ice).toBe(3);
  });

  it('opens the lava world by research, with its own recipes and power', () => {
    const s = colony();
    expect(openPlanets(s)).not.toContain('lava');
    s.techs.push('lava_expedition');
    expect(openPlanets(s)).toEqual(['home', 'ice', 'lava']);
    enterPlanet(s, 'lava');
    expect(slotsTotal(s, false)).toBe(16);
    expect(recipeFits(s, RECIPES.cast_tungsten)).toBe(true);
    expect(recipeFits(s, RECIPES.geothermal_power)).toBe(false);
    expect(recipeFits(s, RECIPES.magma_power)).toBe(true);
    s.lines = [
      { id: 1, machine: 'geothermal_well', recipe: 'magma_power', count: 1, enabled: true },
      { id: 2, machine: 'magma_pump', recipe: 'pump_magma', count: 1, enabled: true },
      { id: 3, machine: 'foundry', recipe: 'cast_iron', count: 1, enabled: true },
    ];
    enterPlanet(s, 'home');
    for (let i = 0; i < 20; i++) tickAll(s, 1);
    expect(storeOf(s, 'lava')!.items.iron_ingot).toBeGreaterThan(30);
    expect(s.items.iron_ingot ?? 0).toBe(0);
  });

  it('turns a whole lava colony into about one iridium a second, shipped home', () => {
    const s = colony((g) => { g.techs.push('colony_expansion', 'lava_expedition'); });
    enterPlanet(s, 'lava');
    s.lines = [
      { id: 1, machine: 'geothermal_well', recipe: 'magma_power', count: 4, enabled: true },
      { id: 2, machine: 'magma_pump', recipe: 'pump_magma', count: 10, enabled: true },
      { id: 3, machine: 'foundry', recipe: 'cast_iridium', count: 8, enabled: true },
    ];
    expect(s.lines.reduce((n, l) => n + l.count, 0)).toBeLessThanOrEqual(slotsTotal(s, false));
    enterPlanet(s, 'home');
    s.items.rocket_fuel = 100;
    s.routes = [{ id: 1, item: 'iridium', from: 'lava', to: 'home', ships: 1, enabled: true }];
    // 150 s: a fresh game's store holds 200
    for (let i = 0; i < 150; i++) tickAll(s, 1);
    expect(s.items.iridium / 150).toBeGreaterThan(0.9);
    expect(s.items.iridium / 150).toBeLessThan(1.05);
  });

  it('makes every world a required stop on the way to the stargate', () => {
    // Each colony has something no other world can make...
    const unique: Record<string, string> = { ice: 'comet_ice', lava: 'heat_ceramic', gas: 'metallic_hydrogen', crystal: 'resonant_crystal' };
    // No colony without one: a new world has to be added here, with something the main line needs
    expect(Object.keys(unique).sort()).toEqual(PLANET_LIST.map((p) => p.id).filter((id) => id !== 'home').sort());
    for (const [planet, item] of Object.entries(unique)) {
      const makers = RECIPE_LIST.filter((r) => r.outputs[item]);
      expect(makers.length).toBeGreaterThan(0);
      expect(makers.every((r) => recipePlanet(r) === planet)).toBe(true);
    }
    // ...and the road runs through it: fusion needs the ice moon's deuterium, the stargate the lava world's ceramic
    expect(RECIPES.fuse_dhe3.inputs.deuterium).toBeGreaterThan(0);
    expect(RECIPE_LIST.filter((r) => r.outputs.deuterium).every((r) => r.inputs.comet_ice)).toBe(true);
    expect(MILESTONES.dyson_segment.cost.heat_ceramic).toBeGreaterThan(0);
    expect(MILESTONES.stargate.cost.heat_ceramic).toBeGreaterThan(0);
    expect(MACHINES.neutronium_compressor.cost.heat_ceramic).toBeGreaterThan(0);
    expect(TECHS.neutron_compression.requires).toContain('lava_expedition');
    expect(MACHINES.particle_collider.cost.metallic_hydrogen).toBeGreaterThan(0);
    expect(MACHINES.spacetime_stabilizer.cost.resonant_crystal).toBeGreaterThan(0);
    expect(MILESTONES.stargate.cost.metallic_hydrogen).toBeGreaterThan(0);
    expect(MILESTONES.stargate.cost.resonant_crystal).toBeGreaterThan(0);
    // Every colony has a generator of its own, or nothing there could run
    for (const planet of Object.keys(unique)) expect(RECIPE_LIST.some((r) => r.outputs.eu && recipePlanet(r) === planet)).toBe(true);
  });

  it('gives a colony its own slots and no orbit', () => {
    const s = colony();
    enterPlanet(s, 'ice');
    expect(slotsTotal(s, false)).toBe(12);
    expect(slotsTotal(s, true)).toBe(0);
    s.techs.push('colony_expansion');
    expect(slotsTotal(s, false)).toBe(20);
  });

  it('only lets a recipe run on the world it belongs to', () => {
    const s = colony();
    expect(recipeFits(s, RECIPES.mine_ice)).toBe(false);
    expect(recipeFits(s, RECIPES.mine_stone)).toBe(true);
    enterPlanet(s, 'ice');
    expect(recipeFits(s, RECIPES.mine_ice)).toBe(true);
    expect(recipeFits(s, RECIPES.mine_stone)).toBe(false);
  });

  it('builds on a colony with materials from home', () => {
    const cost = MACHINES.ice_drill.cost;
    importSave(exportString(colony((g) => { for (const [k, n] of Object.entries(cost)) g.items[k] = n; })));
    expect(addLine('ice_drill', 'mine_ice')).toBeNull();
    switchPlanet('ice');
    const id = addLine('ice_drill', 'mine_ice')!;
    expect(build(id)).toBeGreaterThan(0);
    const s = getState();
    expect(s.lines[0].count).toBe(1);
    for (const k of Object.keys(cost)) expect(homeItems(s)[k] ?? 0).toBe(0);
    expect(allLines(s)).toHaveLength(1);
  });

  it('ships cargo between worlds, limited by ships, stock and room', () => {
    const s = colony();
    enterPlanet(s, 'ice');
    s.items.comet_ice = 5;
    enterPlanet(s, 'home');
    s.items.rocket_fuel = 100;
    s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 1, enabled: true }];
    let res = tickAll(s, 1);
    expect(s.items.comet_ice).toBe(SHIP_RATE);
    expect(storeOf(s, 'ice')!.items.comet_ice).toBe(5 - SHIP_RATE);
    expect(res.routes[1]).toMatchObject({ perSec: SHIP_RATE, reason: 'ok' });
    expect(res.last.rates.comet_ice).toBe(SHIP_RATE);
    tickAll(s, 1);
    res = tickAll(s, 1);
    expect(s.items.comet_ice).toBe(5);
    expect(res.routes[1].reason).toBe('empty');
    s.routes[0].enabled = false;
    expect(tickAll(s, 1).routes[1].reason).toBe('paused');
  });

  it('burns rocket fuel at home for what the ships carry, and stops without it', () => {
    const s = colony((g) => { g.items.rocket_fuel = 0.1; });
    enterPlanet(s, 'ice');
    s.items.comet_ice = 50;
    enterPlanet(s, 'home');
    s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 1, enabled: true }];
    let res = tickAll(s, 1);
    expect(s.items.comet_ice).toBeCloseTo(SHIP_RATE);
    expect(s.items.rocket_fuel).toBeCloseTo(0.1 - SHIP_RATE * SHIP_FUEL);
    expect(res.routes[1].fuel).toBeCloseTo(SHIP_RATE * SHIP_FUEL);
    expect(res.last.rates.rocket_fuel).toBeCloseTo(-SHIP_RATE * SHIP_FUEL);
    res = tickAll(s, 1);
    expect(s.items.comet_ice).toBeCloseTo(SHIP_RATE);
    expect(res.routes[1]).toMatchObject({ perSec: 0, reason: 'fuel' });
  });

  it('reports an absence across every world, whichever one is in view', () => {
    const s = colony();
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 2, enabled: true }];
    enterPlanet(s, 'ice');
    s.lines = [
      { id: 2, machine: 'geothermal_well', recipe: 'geothermal_power', count: 1, enabled: true },
      { id: 3, machine: 'ice_drill', recipe: 'mine_ice', count: 1, enabled: true },
    ];
    const report = simulateOffline(s, 60);
    expect(planetOf(s)).toBe('ice');
    expect(report.changes.comet_ice).toBeGreaterThan(30);
    expect(report.changes.stone).toBeGreaterThan(30);
  });

  it('charges more fuel the farther the trip', () => {
    expect(routeFuel('ice', 'home')).toBeCloseTo(SHIP_FUEL);
    expect(routeFuel('home', 'lava')).toBeCloseTo(SHIP_FUEL * 2);
    expect(routeFuel('ice', 'lava')).toBeCloseTo(SHIP_FUEL * 3);
    const s = colony((g) => { g.techs.push('colony_expansion', 'lava_expedition'); g.items.rocket_fuel = 10; g.items.stone = 50; });
    s.routes = [{ id: 1, item: 'stone', from: 'home', to: 'lava', ships: 1, enabled: true }];
    tickAll(s, 1);
    expect(s.items.rocket_fuel).toBeCloseTo(10 - SHIP_RATE * SHIP_FUEL * 2);
  });

  it('burns a vented item down to the level set for it', () => {
    const s = newGame();
    const cap = capOf(s, 'stone');
    s.items.stone = cap * 0.9;
    s.vent = ['stone'];
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true }];
    tickAll(s, 1);
    expect(s.items.stone).toBeGreaterThan(cap * 0.9);
    s.ventAt = { stone: 0.5 };
    const res = tickAll(s, 1);
    expect(s.items.stone).toBeCloseTo(cap * 0.5);
    expect(res.last.vented.stone).toBeGreaterThan(0);
    expect(importString(exportString(s))!.ventAt).toEqual({ stone: 0.5 });
  });

  it('keeps a reserve at the source and stops when the destination has enough', () => {
    const s = colony((g) => { g.items.rocket_fuel = 100; });
    const cap = capOf(s, 'comet_ice');
    enterPlanet(s, 'ice');
    s.items.comet_ice = cap * 0.5 + 1;
    enterPlanet(s, 'home');
    s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 5, enabled: true, keep: 0.5 }];
    let res = tickAll(s, 1);
    expect(s.items.comet_ice).toBeCloseTo(1);
    expect(storeOf(s, 'ice')!.items.comet_ice).toBeCloseTo(cap * 0.5);
    expect(res.routes[1].reason).toBe('keep');
    // A target at the destination: fill to a quarter of storage and no further
    storeOf(s, 'ice')!.items.comet_ice = cap;
    s.routes[0] = { ...s.routes[0], keep: undefined, upTo: 0.25, ships: 1000 };
    res = tickAll(s, 1);
    expect(s.items.comet_ice).toBeCloseTo(cap * 0.25);
    expect(res.routes[1].reason).toBe('enough');
  });

  it('lets a line leave part of its inputs for others', () => {
    const s = newGame();
    const cap = capOf(s, 'iron_ore');
    s.items.iron_ore = cap * 0.5 + 2;
    s.items.coal = cap;
    s.lines = [{ id: 1, machine: 'stone_furnace', recipe: 'smelt_iron', count: 50, enabled: true, reserve: 0.5 }];
    let res = tickAll(s, 10);
    expect(s.items.iron_ore).toBeCloseTo(cap * 0.5);
    expect(s.items.iron_ingot).toBeCloseTo(2);
    expect(res.last.lines[1].reason).toEqual({ kind: 'reserve', item: 'iron_ore' });
    res = tickAll(s, 10);
    expect(s.items.iron_ore).toBeCloseTo(cap * 0.5);
  });

  it('lets a galaxy change what ships carry and what they burn', () => {
    const run = (galaxy: string | null) => {
      const s = colony((g) => { g.galaxy = galaxy; g.items.rocket_fuel = 10; });
      tickAll(s, 0.001);
      storeOf(s, 'ice')!.items.comet_ice = 100;
      s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 1, enabled: true }];
      tickAll(s, 1);
      return { moved: s.items.comet_ice, burned: 10 - s.items.rocket_fuel };
    };
    const plain = run(null);
    expect(plain.moved).toBeCloseTo(SHIP_RATE);
    expect(run('low_gravity').moved).toBeCloseTo(SHIP_RATE * 1.5);
    expect(run('tight_cluster').burned).toBeCloseTo(plain.burned * 0.5);
    const far = run('far_flung');
    expect(far.moved).toBeCloseTo(SHIP_RATE * 2);
    expect(far.burned).toBeCloseTo(plain.burned * 2 * 1.5);
  });

  it('carries the colony and freight legacies into a new run', () => {
    const s = colony((g) => { g.legacy.upgrades = { colony: 2, freight: 2 }; g.items.rocket_fuel = 10; });
    tickAll(s, 0.001);
    const plain = { ...s, legacy: { ...s.legacy, upgrades: {} } };
    enterPlanet(s, 'ice');
    expect(slotsTotal(s)).toBe(slotsTotal({ ...plain, planet: 'ice' }) + 8);
    enterPlanet(s, 'home');
    expect(slotsTotal(s)).toBe(slotsTotal(plain));
    storeOf(s, 'ice')!.items.comet_ice = 100;
    s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 1, enabled: true }];
    tickAll(s, 1);
    expect(s.items.comet_ice).toBeCloseTo(SHIP_RATE * 1.5);
  });

  it('only gives galaxies traits for machines that exist', () => {
    const categories = new Set<string>(RECIPE_LIST.map((r) => r.category));
    for (const g of GALAXY_LIST) {
      for (const cat of Object.keys(g.boost)) expect(categories.has(cat), `${g.id}: ${cat}`).toBe(true);
    }
  });

  it('pays for ships at home and refunds them when the route goes', () => {
    importSave(exportString(colony((g) => { for (const [k, n] of Object.entries(SHIP_COST)) g.items[k] = n * 2; })));
    switchPlanet('ice');
    const id = addRoute('comet_ice', 'ice', 'home')!;
    expect(addRoute('comet_ice', 'ice', 'home')).toBe(id);
    expect(addRoute('comet_ice', 'ice', 'ice')).toBeNull();
    expect(buildShip(id, 3)).toBe(2);
    for (const k of Object.keys(SHIP_COST)) expect(homeItems(getState())[k]).toBe(0);
    removeRoute(id);
    for (const [k, n] of Object.entries(SHIP_COST)) expect(homeItems(getState())[k]).toBe(n * 2);
    expect(getState().routes).toEqual([]);
  });

  it('saves and loads other worlds and routes', () => {
    const s = colony((g) => { g.items.stone = 9; });
    enterPlanet(s, 'ice');
    s.items.comet_ice = 4;
    s.lines.push({ id: s.nextLineId++, machine: 'ice_drill', recipe: 'mine_ice', count: 2, enabled: true });
    s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 2, enabled: true, keep: 0.25, upTo: 0.5 }];
    s.nextRouteId = 2;
    const back = importString(exportString(s))!;
    expect(planetOf(back)).toBe('ice');
    expect(back.items.comet_ice).toBe(4);
    expect(back.lines[0].count).toBe(2);
    expect(homeItems(back).stone).toBe(9);
    expect(back.routes).toEqual(s.routes);
  });

  it('only gives stars effects on machines that exist', () => {
    const categories = new Set<string>(RECIPE_LIST.map((r) => r.category));
    for (const star of STAR_LIST) {
      for (const cat of Object.keys(star.boost ?? {})) expect(categories.has(cat), `${star.id}: ${cat}`).toBe(true);
    }
  });
});

describe('star systems', () => {
  const sys = (patch: Partial<StarSystem> = {}): StarSystem => ({ name: '測試 α-100', star: 'yellow_dwarf', trait: null, rich: {}, ...patch });

  it('rolls systems with different traits, none of them the current one', () => {
    for (let i = 0; i < 50; i++) {
      const three = rollSystems('frozen');
      expect(three).toHaveLength(3);
      expect(new Set(three.map((x) => x.trait)).size).toBe(3);
      expect(new Set(three.map((x) => x.name)).size).toBe(3);
      expect(three.some((x) => x.trait === 'frozen')).toBe(false);
    }
  });

  it('scales sunlight and the swarm by the star, and extraction by each world', () => {
    const s = colony((g) => { g.system = sys({ star: 'black_hole', rich: { ice: 1.5, home: 0.7 } }); g.items.dyson_swarm = 10; });
    expect(categoryBoost(s, 'solar')).toBeCloseTo(0.4);
    expect(categoryBoost(s, 'collider')).toBeCloseTo(1.5);
    expect(categoryBoost(s, 'ice_mining')).toBeCloseTo(1.5);
    expect(categoryBoost(s, 'mining')).toBeCloseTo(0.7);
    expect(categoryBoost(s, 'smelting')).toBe(1);
    // Nothing draws power, so read what the panels could give
    s.lines.push({ id: s.nextLineId++, machine: 'basic_drill', recipe: 'mine_stone', count: 1, enabled: true });
    const res = tickAll(s, 1);
    expect(res.last.power.eu?.capacity ?? 0).toBeCloseTo(10 * SWARM_EU * 0.4);
  });

  it('keeps the map through a reload, goes where it is told, and pays for a hard star', () => {
    importSave(exportString(colony((g) => { g.milestones.push('stargate'); g.system = sys({ star: 'black_hole' }); })));
    const map = warpChoices();
    expect(map).toHaveLength(3);
    importSave(exportSave());
    expect(warpChoices()).toEqual(map);
    const plain = warpEarnings();
    getState().system = null;
    expect(plain).toBe(warpEarnings() + 3);
    warp(2);
    expect(getState().system).toEqual(map[2]);
    expect(getState().galaxy).toBe(map[2].trait);
    expect(getState().warpChoices).toBeUndefined();
    expect(warpChoices()).toEqual([]);
  });
});
