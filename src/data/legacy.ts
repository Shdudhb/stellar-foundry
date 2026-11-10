/** Permanent upgrades bought with legacy points earned by warping through the stargate */
export interface LegacyDef {
  id: string;
  name: string;
  description: string;
  max: number;
  /** Points for the first level; each further level costs one more step of this */
  base: number;
}

export const LEGACY_LIST: LegacyDef[] = [
  { id: 'speed', name: '工業傳承', description: '整座工廠的時間流速 +20%：機器、發電、研究全部變快。', max: 10, base: 5 },
  { id: 'research', name: '研究傳承', description: '所有研究成本 −10%。', max: 5, base: 4 },
  { id: 'slots', name: '區域傳承', description: '區域槽位 +10。', max: 10, base: 3 },
  { id: 'storage', name: '倉儲傳承', description: '所有物品容量 ×1.5。', max: 5, base: 4 },
  { id: 'kit', name: '開局補給', description: '每次開局帶著物資，等級越高帶越多、越後期。升級時這一輪也立刻拿到新的一份。', max: 5, base: 2 },
  { id: 'offline', name: '離線延長', description: '離線補算上限 +6 小時。', max: 4, base: 3 },
  { id: 'relic', name: '遺物共鳴', description: '解析遺物得到的數據 +25%，啟動遺物的時間加速多 30 秒。', max: 4, base: 3 },
  { id: 'orbit', name: '軌道傳承', description: '軌道槽位 +4（研究出軌道站之後生效）。', max: 5, base: 4 },
];

export const LEGACY: Record<string, LegacyDef> = Object.fromEntries(LEGACY_LIST.map((l) => [l.id, l]));

export function legacyCost(id: string, level: number): number {
  return LEGACY[id].base * (level + 1);
}

/** What each level of 開局補給 adds to a new run (cumulative) */
export const KIT_LEVELS: Record<string, number>[] = [
  { stone: 50, iron_ore: 50, copper_ore: 50, coal: 50 },
  { iron_ingot: 50, copper_ingot: 50, stone_brick: 50, gear: 20 },
  { data: 150, steel: 50 },
  { data: 300, data_green: 100, aluminum: 50, circuit: 20 },
  { data_green: 300, data_blue: 100, stainless: 100 },
];

/** Legacy points for warping now: 10 for the gate, plus 1 per 50 swarm panels beyond the 600 it needs */
export function warpPoints(swarm: number): number {
  return 10 + Math.max(0, Math.floor((swarm - 600) / 50));
}

/** Seconds of signal-free play between relic signals */
export const SIGNAL_INTERVAL: [number, number] = [300, 600];
/** The first signal comes early, to show the player what they are */
export const FIRST_SIGNAL = 180;
/** How long a signal waits to be answered */
export const SIGNAL_LIFETIME = 90;
/** Time-warp from a relic: x2 for this many seconds */
export const BOOST_TIME = 120;
/** With the 遺物共鳴 legacy: seconds a relic's time-warp lasts */
export const boostTime = (upgrades: Record<string, number>) => BOOST_TIME + 30 * (upgrades.relic ?? 0);
