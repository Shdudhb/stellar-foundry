export interface Line {
  id: number;
  machine: string;
  recipe: string;
  count: number;
  enabled: boolean;
  /** 0 = like new, 1 = fully worn (machines with upkeep only) */
  wear?: number;
  /** 0 = cold, 1 = lit (machines with ignition only) */
  heat?: number;
}

export interface GameState {
  version: number;
  items: Record<string, number>;
  lines: Line[];
  nextLineId: number;
  techs: string[];
  milestones: string[];
  /** Byproducts whose overflow is destroyed instead of stalling their producers */
  vent: string[];
  /** Machines with upkeep wear down without maintenance kits; off = no wear at all */
  maintenance: boolean;
  /** Objective texts whose reward has been collected */
  claimed: string[];
  /** A relic signal waiting to be answered, until this playTime */
  signal: number | null;
  /** playTime when the next relic signal appears */
  nextSignal: number;
  /** playTime until which the factory runs at double speed */
  boostUntil: number;
  /** Survives warps: points to spend and upgrade levels */
  legacy: { points: number; warps: number; upgrades: Record<string, number> };
  /** Unlocked achievement ids; survive warps and resets */
  achievements: string[];
  /** Lifetime counters; survive warps and resets */
  stats: Stats;
  /** Trait of the current galaxy (none in the first) */
  galaxy: string | null;
  /** The world event happening now, if any */
  incident: Incident | null;
  /** playTime when the next world event starts */
  nextIncident: number;
  /** Seconds of simulated play, including offline catch-up */
  playTime: number;
  /** Epoch ms of the last save */
  savedAt: number;
}

export interface Stats {
  /** Amounts made by machines, by item */
  produced: Record<string, number>;
  gathered: number;
  /** Machines built */
  built: number;
  signals: number;
  incidents: number;
  trades: number;
  /** Fastest play time from a fresh run to the stargate, in seconds */
  bestGate?: number;
}

export interface Incident {
  id: string;
  /** playTime when it ends */
  until: number;
  /** The trader's offer: take `n` of `item`, pay `pay` */
  offer?: { item: string; n: number; pay: Record<string, number> };
}

export type Reason =
  | { kind: 'ok' }
  | { kind: 'idle' }
  | { kind: 'paused' }
  | { kind: 'input'; item: string }
  | { kind: 'output'; item: string }
  | { kind: 'power'; item: string }
  | { kind: 'load' }
  | { kind: 'wear' }
  | { kind: 'igniting' };

export interface LineStatus {
  /** Fraction of full speed actually achieved this tick (0..1) */
  efficiency: number;
  reason: Reason;
  /** Crafts per second actually done */
  craftsPerSec: number;
  /** Crafts per second at 100% efficiency */
  maxCraftsPerSec: number;
  /** Power per second by power item: positive = produced, negative = consumed */
  power: Record<string, number>;
  /** Maintenance kits wanted per second for the work done, and the fraction that was supplied */
  upkeep?: { need: number; supplied: number };
}

export interface PowerStatus {
  /** Power actually produced per second */
  supply: number;
  /** Most the generators could produce per second with their current fuel */
  capacity: number;
  demand: number;
  /** Fraction of demand that was met */
  satisfaction: number;
}

export interface TickResult {
  lines: Record<number, LineStatus>;
  power: Record<string, PowerStatus>;
  /** Net change per second for each stored item */
  rates: Record<string, number>;
  /** Overflow destroyed per second, for vented items */
  vented: Record<string, number>;
  /** Amount lost per second to decay */
  decayed: Record<string, number>;
}
