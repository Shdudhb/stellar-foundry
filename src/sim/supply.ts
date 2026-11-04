// Supply against demand for one item, at full speed: is there enough capacity to make it, and if not,
// how many more machines on which line would close the gap
import { isPower } from '../data/items';
import { MACHINES, MAINTENANCE_ITEM } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { craftsPerMachine } from './rules';
import type { GameState, Line, TickResult } from './types';

export interface Shortfall {
  /** Per second wanted by every running consumer at full speed */
  demand: number;
  /** Per second every running maker could produce at full speed */
  capacity: number;
  /** demand − capacity, above zero */
  gap: number;
  /** The line to add machines to; absent when nothing makes the item yet */
  line?: Line;
  /** What one more machine on that line makes per second */
  perMachine: number;
  /** Machines to add to close the gap */
  machines: number;
  /** That line is itself short of this (fuel, ore, power): more of its machines won't help until that's fixed */
  blocked?: string;
}

/**
 * Null when capacity already covers demand. Counting capacity at full speed, not what is made now, is the
 * point: makers that are slow for their own reasons (no ore, no power) don't need company, they need
 * their own fix, and the player finds it by following their status instead.
 */
export function shortfall(s: GameState, last: TickResult, item: string): Shortfall | null {
  let demand = 0;
  let capacity = 0;
  const makers: { line: Line; per: number; blocked?: string }[] = [];
  for (const line of s.lines) {
    const r = RECIPES[line.recipe];
    const m = MACHINES[line.machine];
    if (!r || !m || !line.enabled) continue;
    const st = last.lines[line.id];
    const made = r.outputs[item] ?? 0;
    if (made > 0) {
      const per = made * craftsPerMachine(s, m, r);
      const why = st?.reason;
      const starved = line.count > 0 && st && st.efficiency < 0.999 && why && (why.kind === 'input' || why.kind === 'power');
      makers.push({ line, per, blocked: starved ? (why as { item: string }).item : why?.kind === 'wear' ? MAINTENANCE_ITEM : undefined });
      if (line.count > 0) capacity += made * (st?.maxCraftsPerSec ?? 0);
    }
    if (line.count === 0 || !st) continue;
    if (!isPower(item)) demand += (r.inputs[item] ?? 0) * st.maxCraftsPerSec;
    if (item === MAINTENANCE_ITEM && st.upkeep) demand += st.upkeep.need;
  }
  // Power: the grid already adds up what every machine draws to run
  if (isPower(item)) demand = last.power[item]?.demand ?? 0;
  const gap = demand - capacity;
  if (gap <= Math.max(1e-6, demand * 1e-3)) return null;
  // The main maker gets the machines: the one with the most already, else one still empty
  // Makers that could run flat out go first; then the one with the most machines already, else one still empty
  const best = makers
    .filter((x) => x.per > 0)
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.line.count - a.line.count || b.per - a.per)[0];
  if (!best) return { demand, capacity, gap, perMachine: 0, machines: 0 };
  return { demand, capacity, gap, line: best.line, perMachine: best.per, machines: Math.ceil(gap / best.per - 1e-9), blocked: best.blocked };
}
