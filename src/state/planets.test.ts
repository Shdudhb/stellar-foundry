import { describe, expect, it } from 'vitest';
import { MACHINES } from '../data/machines';
import { SHIP_COST, SHIP_RATE } from '../data/planets';
import { RECIPES } from '../data/recipes';
import { allLines, atHome, enterPlanet, homeItems, openPlanets, planetOf, storeOf } from '../sim/planets';
import { recipeFits, slotsTotal } from '../sim/rules';
import { tickAll } from '../sim/world';
import { exportString, importString, newGame } from './save';
import { addLine, addRoute, build, buildShip, getState, importSave, removeRoute, switchPlanet } from './store';

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
    s.routes = [{ id: 1, item: 'comet_ice', from: 'ice', to: 'home', ships: 2, enabled: true }];
    s.nextRouteId = 2;
    const back = importString(exportString(s))!;
    expect(planetOf(back)).toBe('ice');
    expect(back.items.comet_ice).toBe(4);
    expect(back.lines[0].count).toBe(2);
    expect(homeItems(back).stone).toBe(9);
    expect(back.routes).toEqual(s.routes);
  });
});
