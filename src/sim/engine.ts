import { DECAYING_ITEMS, ITEMS, POWER_ORDER, SWARM_EU, SWARM_ITEM, isPower } from '../data/items';
import { MACHINES, MAINTENANCE_ITEM } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { capOf, categoryBoost, overclock } from './rules';
import type { GameState, Line, LineStatus, PowerStatus, Reason, TickResult } from './types';

/** A fully worn machine runs at this fraction of its speed */
export const WORN_SPEED = 0.5;
/** Seconds of unmaintained work to go from new to fully worn */
export const WEAR_TIME = 600;
/** Seconds of maintained work to repair full wear */
export const REPAIR_TIME = 60;
/** Seconds for a lit reactor with no fuel (or paused) to go fully cold */
export const COOL_TIME = 20;

interface Active {
  line: Line;
  /** Crafts possible this tick at full speed with no wear */
  nominal: number;
  /** Crafts possible this tick at the speed wear allows */
  potential: number;
  /** Maintenance kits per craft-fraction of work: kits this tick at 100% efficiency */
  upkeep: number;
  /** Efficiency allowed by stored inputs and output space, before power */
  f: number;
  reason: Reason;
  /** Power item the machine draws, and how much per second at 100% */
  powerItem?: string;
  powerDraw: number;
  /** Power item this line's recipe generates */
  gen?: string;
  /** Power items the recipe consumes per craft (e.g. a turbine eating steam) */
  powerIn: [string, number][];
  /** A generator with no inputs at all (solar): always runs, never throttles */
  free: boolean;
}

/**
 * Advance the factory by dt seconds, mutating state.items.
 *
 * Shared inputs and output space are split proportionally between lines, so the
 * result does not depend on line order. Power is solved after material limits,
 * over networks in POWER_ORDER: a generator on one network may consume power from
 * a later one (turbines turn steam into EU, the space elevator turns EU into lift). Demand flows down that chain first,
 * so fuel generators only burn what is needed; then supply flows back up.
 */
export function tick(state: GameState, dt: number): TickResult {
  const lines: Record<number, LineStatus> = {};
  const active: Active[] = [];
  /** Unlit reactors with fuel loaded: EU drawn per second at full power, and seconds to light */
  const igniting: { line: Line; draw: number; time: number }[] = [];
  const cool = (line: Line) => {
    if (line.heat) line.heat = Math.max(0, line.heat - dt / COOL_TIME);
  };

  for (const line of state.lines) {
    const machine = MACHINES[line.machine];
    const recipe = RECIPES[line.recipe];
    if (!machine || !recipe) continue;
    const oc = overclock(machine, recipe);
    const maxCraftsPerSec = (line.count * oc.speed * (machine.speed ?? 1) * categoryBoost(state, recipe.category)) / recipe.time;
    if (!line.enabled || line.count === 0) {
      if (machine.ignition) cool(line);
      lines[line.id] = {
        efficiency: 0,
        reason: { kind: line.enabled ? 'idle' : 'paused' },
        craftsPerSec: 0,
        maxCraftsPerSec,
        power: {},
      };
      continue;
    }
    if (machine.ignition && (line.heat ?? 0) < 1) {
      // An unlit reactor makes nothing. With fuel loaded it draws ignition power; without, it cools.
      const missing = Object.keys(recipe.inputs).find((i) => !isPower(i) && !((state.items[i] ?? 0) > 0));
      lines[line.id] = {
        efficiency: 0,
        reason: missing ? { kind: 'input', item: missing } : { kind: 'igniting' },
        craftsPerSec: 0,
        maxCraftsPerSec,
        power: {},
      };
      if (missing) cool(line);
      else igniting.push({ line, draw: line.count * machine.ignition.power, time: machine.ignition.time });
      continue;
    }
    const gen = Object.keys(recipe.outputs).find(isPower);
    const powerIn = Object.entries(recipe.inputs).filter(([item]) => isPower(item));
    // Worn machines simply run slower, and draw power for the work they actually do
    const upkeep = state.maintenance ? ((machine.upkeep ?? 0) * line.count * dt) / 60 : 0;
    const speed = upkeep > 0 ? 1 - (1 - WORN_SPEED) * (line.wear ?? 0) : 1;
    active.push({
      line,
      nominal: maxCraftsPerSec * dt,
      potential: maxCraftsPerSec * dt * speed,
      upkeep,
      f: 1,
      reason: { kind: 'ok' },
      powerItem: machine.power?.item,
      powerDraw: line.count * (machine.power?.amount ?? 0) * oc.power * speed,
      gen,
      powerIn,
      free: !!gen && Object.keys(recipe.inputs).length === 0,
    });
  }

  // ---- materials: total wanted consumption and production at full speed ----
  const want: Record<string, number> = {};
  const make: Record<string, number> = {};
  for (const a of active) {
    const r = RECIPES[a.line.recipe];
    for (const [item, n] of Object.entries(r.inputs)) {
      if (!isPower(item)) want[item] = (want[item] ?? 0) + a.potential * n;
    }
    for (const [item, n] of Object.entries(r.outputs)) {
      if (!isPower(item)) make[item] = (make[item] ?? 0) + a.potential * n;
    }
  }
  const inRatio = (item: string) => (want[item] > 0 ? Math.min(1, (state.items[item] ?? 0) / want[item]) : 1);
  const venting = new Set(state.vent);
  const outRatio = (item: string) => {
    // Vented items never block: overflow is destroyed when stored below
    if (!(make[item] > 0) || venting.has(item)) return 1;
    const space = Math.max(0, capOf(state, item) - (state.items[item] ?? 0));
    return Math.min(1, space / make[item]);
  };

  for (const a of active) {
    const r = RECIPES[a.line.recipe];
    for (const item of Object.keys(r.inputs)) {
      if (isPower(item)) continue;
      const ratio = inRatio(item);
      if (ratio < a.f) {
        a.f = ratio;
        a.reason = { kind: 'input', item };
      }
    }
    for (const item of Object.keys(r.outputs)) {
      if (isPower(item)) continue;
      const ratio = outRatio(item);
      if (ratio < a.f) {
        a.f = ratio;
        a.reason = { kind: 'output', item };
      }
    }
  }

  // ---- power, pass 1: demand flows down the chain and sets generator load ----
  const demand: Record<string, number> = {};
  const freeSupply: Record<string, number> = {};
  const fuelCapacity: Record<string, number> = {};
  const load: Record<string, number> = {};
  for (const p of POWER_ORDER) demand[p] = freeSupply[p] = fuelCapacity[p] = 0;
  // The Dyson swarm is free EU, like solar that takes no slots
  freeSupply.eu += (state.items[SWARM_ITEM] ?? 0) * SWARM_EU;
  for (const a of active) {
    if (a.powerItem) demand[a.powerItem] += a.powerDraw * a.f;
  }
  for (const g of igniting) demand.eu += g.draw;
  const genOut = (a: Active) => (a.potential * a.f * RECIPES[a.line.recipe].outputs[a.gen!]) / dt;

  for (const p of POWER_ORDER) {
    const gens = active.filter((a) => a.gen === p);
    for (const g of gens) {
      if (g.free) freeSupply[p] += genOut(g);
      else fuelCapacity[p] += genOut(g);
    }
    const residual = Math.max(0, demand[p] - freeSupply[p]);
    load[p] = fuelCapacity[p] > 0 ? Math.min(1, residual / fuelCapacity[p]) : 0;
    for (const g of gens) {
      if (g.free) continue;
      for (const [q, n] of g.powerIn) demand[q] += (g.potential * g.f * load[p] * n) / dt;
    }
  }

  // ---- power, pass 2: supply flows back up and sets satisfaction ----
  const sat: Record<string, number> = {};
  const supply: Record<string, number> = {};
  const inputSat = (a: Active) => a.powerIn.reduce((m, [q]) => Math.min(m, sat[q] ?? 1), 1);
  for (const p of [...POWER_ORDER].reverse()) {
    let s = freeSupply[p];
    for (const g of active) {
      if (g.gen === p && !g.free) s += genOut(g) * load[p] * inputSat(g);
    }
    supply[p] = s;
    sat[p] = demand[p] > 0 ? Math.min(1, s / demand[p]) : 1;
  }

  // ---- ignition: reactors heat up in proportion to the EU they actually got ----
  for (const g of igniting) {
    lines[g.line.id].power = { eu: -g.draw * sat.eu };
    const heat = (g.line.heat ?? 0) + (sat.eu * dt) / g.time;
    // Snap float drift so a reactor heated for exactly its ignition time is lit
    g.line.heat = heat > 1 - 1e-9 ? 1 : heat;
  }

  // ---- apply ----
  const delta: Record<string, number> = {};
  for (const a of active) {
    const r = RECIPES[a.line.recipe];
    let factor = 1;
    let reason = a.reason;
    if (a.gen && !a.free) {
      const inS = inputSat(a);
      factor = load[a.gen] * inS;
      if (factor < a.f) {
        if (inS <= load[a.gen]) {
          const starved = a.powerIn.reduce((lo, [q]) => ((sat[q] ?? 1) < (sat[lo] ?? 1) ? q : lo), a.powerIn[0]?.[0]);
          reason = { kind: 'power', item: starved };
        } else {
          reason = { kind: 'load' };
        }
      }
    } else if (a.powerItem) {
      factor = sat[a.powerItem];
      if (factor < a.f) reason = { kind: 'power', item: a.powerItem };
    }
    const crafts = a.potential * a.f * factor;

    const power: Record<string, number> = {};
    for (const [item, n] of Object.entries(r.inputs)) {
      if (isPower(item)) power[item] = -(crafts * n) / dt;
      else delta[item] = (delta[item] ?? 0) - crafts * n;
    }
    for (const [item, n] of Object.entries(r.outputs)) {
      if (isPower(item)) power[item] = (crafts * n) / dt;
      else delta[item] = (delta[item] ?? 0) + crafts * n;
    }
    if (a.powerItem) power[a.powerItem] = (power[a.powerItem] ?? 0) - a.powerDraw * a.f * factor;

    // A lit reactor stays lit while idling for lack of demand, but goes cold when fusion stops outright
    if (MACHINES[a.line.machine].ignition && a.f <= 1e-9) cool(a.line);

    const efficiency = a.nominal > 0 ? crafts / a.nominal : 0;
    if (efficiency < 0.999 && crafts >= a.potential * 0.999) reason = { kind: 'wear' };
    lines[a.line.id] = {
      efficiency,
      reason: efficiency >= 0.999 ? { kind: 'ok' } : reason,
      craftsPerSec: crafts / dt,
      maxCraftsPerSec: a.nominal / dt,
      power,
    };
  }

  // ---- maintenance: kits are shared proportionally; short lines wear, supplied lines repair ----
  const upkeepLines = active.filter((a) => a.upkeep > 0);
  if (upkeepLines.length > 0) {
    const need = upkeepLines.reduce((n, a) => n + a.upkeep * lines[a.line.id].efficiency, 0);
    const have = Math.max(0, (state.items[MAINTENANCE_ITEM] ?? 0) + (delta[MAINTENANCE_ITEM] ?? 0));
    const r = need > 0 ? Math.min(1, have / need) : 1;
    delta[MAINTENANCE_ITEM] = (delta[MAINTENANCE_ITEM] ?? 0) - need * r;
    for (const a of upkeepLines) {
      const st = lines[a.line.id];
      const work = st.efficiency * dt;
      const wear = (a.line.wear ?? 0) + work * ((1 - r) / WEAR_TIME - r / REPAIR_TIME);
      a.line.wear = Math.min(1, Math.max(0, wear));
      st.upkeep = { need: (a.upkeep * st.efficiency) / dt, supplied: r };
    }
  }

  const rates: Record<string, number> = {};
  const vented: Record<string, number> = {};
  const decayed: Record<string, number> = {};
  for (const [item, d] of Object.entries(delta)) {
    const before = state.items[item] ?? 0;
    const unclamped = Math.max(0, before + d);
    const after = Math.min(capOf(state, item), unclamped);
    state.items[item] = after;
    rates[item] = (after - before) / dt;
    if (unclamped - after > 1e-9) vented[item] = (unclamped - after) / dt;
  }

  // ---- decay: unstable items bleed away while they sit in storage ----
  for (const item of DECAYING_ITEMS) {
    const n = state.items[item] ?? 0;
    if (n <= 0) continue;
    const lost = n * (1 - Math.exp(-ITEMS[item].decay! * dt));
    state.items[item] = n - lost;
    rates[item] = (rates[item] ?? 0) - lost / dt;
    decayed[item] = lost / dt;
  }

  const power: Record<string, PowerStatus> = {};
  for (const p of POWER_ORDER) {
    power[p] = {
      supply: supply[p],
      capacity: freeSupply[p] + fuelCapacity[p],
      demand: demand[p],
      satisfaction: sat[p],
    };
  }
  return { lines, power, rates, vented, decayed };
}
