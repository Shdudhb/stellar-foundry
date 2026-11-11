import type { StarSystem } from '../data/galaxies';
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
  /** Stop making the main output once its stock reaches this fraction of storage (0..1); unset = no limit */
  limit?: number;
  /** Leave this fraction of storage of each input untouched, for other lines and for ships (0..1); unset = use it all */
  reserve?: number;
}

/** What a world other than the one in view holds while the player is elsewhere */
export interface PlanetStore {
  items: Record<string, number>;
  lines: Line[];
  vent: string[];
}

/** A cargo route: its ships carry one item from one world's storage to another's */
export interface Route {
  id: number;
  item: string;
  from: string;
  to: string;
  ships: number;
  enabled: boolean;
  /** Only carry what the source holds above this fraction of its storage (0..1); unset = take everything */
  keep?: number;
  /** Stop once the destination holds this fraction of its storage (0..1); unset = fill it up */
  upTo?: number;
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
  /** The star system this run is in (none in the first): its star and how rich its worlds are */
  system?: StarSystem | null;
  /** Systems the stargate can reach, rolled once it stands so reloading can't reroll them */
  warpChoices?: StarSystem[];
  /** The world event happening now, if any */
  incident: Incident | null;
  /** playTime when the next world event starts */
  nextIncident: number;
  /** Seconds of simulated play, including offline catch-up */
  playTime: number;
  /** Epoch ms of the last save */
  savedAt: number;
  /** Techs lined up to research in order as data comes in */
  queue?: string[];
  /** The player paused the game: no factory time passes, live or while away */
  paused?: boolean;
  /**
   * The world in view (unset = the home world). `items`, `lines` and `vent` above are always that world's;
   * the others wait in `others`, and are swapped in when the player goes there.
   */
  planet?: string;
  others?: Record<string, PlanetStore>;
  routes?: Route[];
  nextRouteId?: number;
  /** For vented items: burn down to this fraction of storage instead of only the overflow (0..1); unset = only when full */
  ventAt?: Record<string, number>;
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
  /** Held back by the line's own stock limit on its main output */
  | { kind: 'limit'; item: string }
  /** Held back by the line's own reserve on one of its inputs */
  | { kind: 'reserve'; item: string }
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

export interface RouteStatus {
  /** Items per second actually carried */
  perSec: number;
  /** Items per second the ships could carry */
  capacity: number;
  /** Why it carries less than it could */
  reason: 'ok' | 'paused' | 'idle' | 'empty' | 'full' | 'keep' | 'enough' | 'fuel';
  /** Rocket fuel burned per second, out of the home storage */
  fuel: number;
}
