import { ITEMS } from './items';
/**
 * Worlds the colony works on. Each has its own storage, its own lines, its own slots and its own power
 * grid; nothing moves between them except what cargo ships carry. Research, megastructures and building
 * materials all come out of the home world's storage.
 */
export interface PlanetDef {
  id: string;
  name: string;
  /** Item whose icon stands for it */
  icon: string;
  text: string;
  /** Megastructure that opens it; the home world needs none */
  unlockMilestone?: string;
  /** Slots it starts with (the home world has its own rule) */
  slots: number;
  /** What the top bar shows there; the home world picks by tier instead */
  keyItems: string[];
}

export const HOME = 'home';

export const PLANET_LIST: PlanetDef[] = [
  {
    id: HOME, name: '母星', icon: 'stone', slots: 0, keyItems: [],
    text: '迫降的那顆岩石行星。研究、巨構和所有建造材料都從這裡的倉庫出。',
  },
  {
    id: 'ice', name: '冰衛星', icon: 'comet_ice', unlockMilestone: 'colony_ship', slots: 12,
    keyItems: ['comet_ice', 'deuterium', 'oxygen', 'maintenance_kit'],
    text: '殖民船抵達的冰封衛星。冰層底下全是彗星冰，地熱是唯一的電力來源。它有自己的倉庫和電網，東西要靠貨運船來回。',
  },
];

export const PLANETS: Record<string, PlanetDef> = Object.fromEntries(PLANET_LIST.map((p) => [p.id, p]));

/** Cargo ships: what one costs (paid at home), and what it carries per second on its route */
export const SHIP_COST: Record<string, number> = { rocket_part: 10, titanium: 40, precision_circuit: 4 };
/** What a ship can carry: goods, not power, megastructure parts or research data (data is only ever spent at home) */
export const shippable = (item: string): boolean => {
  const def = ITEMS[item];
  return !!def && !['power', 'structure', 'data'].includes(def.kind);
};

export const SHIP_RATE = 2;
