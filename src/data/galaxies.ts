/**
 * Every galaxy after the first has a trait: a few kinds of machine run faster, a few slower.
 * It nudges each run toward different lines without changing what has to be built.
 */
export interface GalaxyDef {
  id: string;
  name: string;
  text: string;
  /** Item whose icon stands for it */
  icon: string;
  /** Speed multiplier by recipe category */
  boost: Record<string, number>;
  /** Relic signals give this much more data */
  signalMult?: number;
  /** Each cargo ship carries this much more */
  shipMult?: number;
  /** Rocket fuel the cargo routes burn, as a multiple of the usual */
  fuelMult?: number;
}

export const GALAXY_LIST: GalaxyDef[] = [
  {
    id: 'rich_ore', name: '富礦帶', icon: 'iron_ore',
    text: '採礦、小行星採礦與晶簇切割 ×1.5，研究站 ×0.8。',
    boost: { mining: 1.5, asteroid: 1.5, crystal_mining: 1.5, research: 0.8 },
  },
  {
    id: 'active_star', name: '活躍恆星', icon: 'eu',
    text: '太陽能、太陽風、聚光陣列與戴森群發射 ×2，燃燒類發電 ×0.8。',
    boost: { solar: 2, solar_wind: 2, stellar: 2, swarm: 2, burning: 0.8, combustion: 0.8 },
  },
  {
    id: 'frozen', name: '冰封星球', icon: 'comet_ice',
    text: '冷卻、冷凍、真空爐與鑽冰 ×1.5，冶煉、高爐與鑄造 ×0.8。',
    boost: { cooling: 1.5, freezing: 1.5, vacuum: 1.5, ice_mining: 1.5, smelting: 0.8, blasting: 0.8, casting: 0.8 },
  },
  {
    id: 'hot_core', name: '炙熱地核', icon: 'coal',
    text: '冶煉、高爐、電弧爐、焦爐、地熱與岩漿鑄造 ×1.5，冷卻、冷凍與鑽冰 ×0.7。',
    boost: {
      smelting: 1.5, blasting: 1.5, arc: 1.5, coking: 1.5, geothermal: 1.5, magma: 1.5, casting: 1.5,
      cooling: 0.7, freezing: 0.7, ice_mining: 0.7,
    },
  },
  {
    id: 'oil_world', name: '油田星球', icon: 'crude_oil',
    text: '抽油、分餾、化學反應 ×1.5，電解 ×0.8。',
    boost: { pumping: 1.5, distilling: 1.5, chemistry: 1.5, electrolysis: 0.8 },
  },
  {
    id: 'low_gravity', name: '低重力', icon: 'rocket_part',
    text: '發射台、太空電梯、微重力工廠 ×1.5，貨運船載量 ×1.5，鑽探 ×0.8。',
    boost: { launch: 1.5, elevator: 1.5, microgravity: 1.5, mining: 0.8 }, shipMult: 1.5,
  },
  {
    id: 'ruins', name: '古文明遺跡', icon: 'exotic_matter',
    text: '遺物訊號的數據 ×2，組裝 ×0.9。',
    boost: { assembling: 0.9 }, signalMult: 2,
  },
  {
    id: 'machine_world', name: '機械荒原', icon: 'gear',
    text: '組裝、製作 ×1.4，粉碎 ×0.8。',
    boost: { assembling: 1.4, crafting: 1.4, crushing: 0.8 },
  },
  {
    id: 'storm_belt', name: '風暴帶', icon: 'metallic_hydrogen',
    text: '風暴渦輪與大氣採集 ×1.5，太陽能與聚光陣列 ×0.8。',
    boost: { wind: 1.5, atmo: 1.5, solar: 0.8, stellar: 0.8 },
  },
  {
    id: 'crystal_nebula', name: '晶簇星雲', icon: 'resonant_crystal',
    text: '晶簇切割與共振窯 ×1.5，化學反應 ×0.9。',
    boost: { crystal_mining: 1.5, crystal_growth: 1.5, chemistry: 0.9 },
  },
  {
    id: 'tight_cluster', name: '緊密星團', icon: 'rocket_fuel',
    text: '星球靠得近：航線的燃料只要一半。發射台 ×0.8。',
    boost: { launch: 0.8 }, fuelMult: 0.5,
  },
  {
    id: 'far_flung', name: '疏散星域', icon: 'dyson_panel',
    text: '星球離得遠：航線的燃料 ×1.5，但每艘貨運船載量 ×2。',
    boost: {}, shipMult: 2, fuelMult: 1.5,
  },
];

export const GALAXIES: Record<string, GalaxyDef> = Object.fromEntries(GALAXY_LIST.map((g) => [g.id, g]));

/** A trait for the next galaxy, never the same as the current one */
export function rollGalaxy(current: string | null, rand = Math.random): string {
  const pool = GALAXY_LIST.filter((g) => g.id !== current);
  return pool[Math.floor(rand() * pool.length)].id;
}

// ---------- star systems ----------
// Past the first gate, the next stop is chosen from a star map: each system has a star whose light sets what
// solar power and the Dyson swarm are worth, a trait from the list above, and worlds richer or poorer than usual.

export interface StarDef {
  id: string;
  name: string;
  /** Spectral class, for the label */
  cls: string;
  /** Multiplies solar panels, solar wind, light arrays and what each Dyson panel gives */
  lum: number;
  /** Machines this kind of star speeds up */
  boost?: Record<string, number>;
  /** The same, in words */
  effect?: string;
  /** Extra legacy points for its dim light, on top of what the system's machine time earns (see systemBonus) */
  bonus: number;
  /** How often it turns up on the map */
  weight: number;
  color: string;
  text: string;
}

export const STAR_LIST: StarDef[] = [
  { id: 'red_dwarf', name: '紅矮星', cls: 'M', lum: 0.7, bonus: 0, weight: 5, color: '#e0664a', text: '又小又暗，到處都是。' },
  { id: 'orange_dwarf', name: '橙矮星', cls: 'K', lum: 0.85, bonus: 0, weight: 4, color: '#f0a04b', text: '比母星的太陽暗一點。' },
  { id: 'yellow_dwarf', name: '黃矮星', cls: 'G', lum: 1, bonus: 0, weight: 4, color: '#f5d76e', text: '和出發時的太陽一樣。' },
  { id: 'white_star', name: '白主序星', cls: 'A', lum: 1.3, bonus: 0, weight: 3, color: '#e8f0ff', text: '明亮穩定，適合鋪太陽能。' },
  { id: 'red_giant', name: '紅巨星', cls: 'M 巨星', lum: 1.5, bonus: 0, weight: 1, color: '#ff7a59', text: '垂死的恆星，膨脹得很大。' },
  { id: 'blue_giant', name: '藍巨星', cls: 'O', lum: 2, bonus: 0, weight: 1, color: '#7fb4ff', text: '星域裡最亮的恆星，戴森群的首選。' },
  {
    id: 'white_dwarf', name: '白矮星', cls: 'D', lum: 0.8, bonus: 0, weight: 1, color: '#cfd8e6',
    text: '恆星的餘燼，周圍的氦與氘特別純。', boost: { fusion: 1.3 }, effect: '聚變反應 ×1.3',
  },
  {
    id: 'neutron_star', name: '中子星', cls: 'N', lum: 0.6, bonus: 1, weight: 1, color: '#9fe8ff',
    text: '幾乎不發光，但中子物質隨手可得。', boost: { neutron: 1.5 }, effect: '中子壓縮 ×1.5',
  },
  {
    id: 'black_hole', name: '黑洞', cls: 'X', lum: 0.4, bonus: 2, weight: 1, color: '#8f7ae6',
    text: '只有吸積盤的微光。扭曲的時空讓對撞機和穩定器事半功倍。', boost: { collider: 1.5, stabilizer: 1.5 }, effect: '粒子對撞機、時空穩定器 ×1.5',
  },
];
export const STARS: Record<string, StarDef> = Object.fromEntries(STAR_LIST.map((s) => [s.id, s]));

/** What starlight drives */
export const LIGHT_CATEGORIES = ['solar', 'solar_wind', 'stellar'];

/** What each world's richness speeds up: the machines that take its resource out of the ground or the sky */
export const VEINS: Record<string, { category: string; what: string }> = {
  home: { category: 'mining', what: '礦脈' },
  ice: { category: 'ice_mining', what: '冰層' },
  lava: { category: 'magma', what: '岩漿' },
  gas: { category: 'atmo', what: '大氣' },
  crystal: { category: 'crystal_mining', what: '晶簇' },
};
const RICHNESS = [0.7, 0.85, 1, 1, 1.25, 1.5];

export interface StarSystem {
  name: string;
  star: string;
  /** A galaxy trait id */
  trait: string | null;
  /** Richness by world; 1 when not listed */
  rich: Record<string, number>;
}

const NAMES = ['織女', '天狼', '參宿', '心宿', '北落', '河鼓', '角宿', '畢宿', '軒轅', '南門', '大陵', '天津', '五車', '老人', '婁宿', '昴宿'];
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ'];

function pickWeighted<T extends { weight: number }>(list: T[], rand: () => number): T {
  let r = rand() * list.reduce((n, x) => n + x.weight, 0);
  for (const x of list) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

/** Systems in reach of the gate: different traits, none the current one, and different names */
export function rollSystems(current: string | null, n = 3, rand = Math.random): StarSystem[] {
  const traits = GALAXY_LIST.filter((g) => g.id !== current).map((g) => g.id);
  const names = [...NAMES];
  const out: StarSystem[] = [];
  for (let i = 0; i < n && traits.length > 0; i++) {
    const trait = traits.splice(Math.floor(rand() * traits.length), 1)[0];
    const name = `${names.splice(Math.floor(rand() * names.length), 1)[0]} ${GREEK[Math.floor(rand() * GREEK.length)]}-${100 + Math.floor(rand() * 900)}`;
    const rich: Record<string, number> = {};
    for (const p of Object.keys(VEINS)) rich[p] = RICHNESS[Math.floor(rand() * RICHNESS.length)];
    out.push({ name, star: pickWeighted(STAR_LIST, rand).id, trait, rich });
  }
  return out;
}

/** Speed the star and the worlds of a system give a recipe category, before its trait */
export function systemBoost(sys: StarSystem | null | undefined, category: string): number {
  if (!sys) return 1;
  const star = STARS[sys.star];
  let k = (LIGHT_CATEGORIES.includes(category) ? star?.lum ?? 1 : 1) * (star?.boost?.[category] ?? 1);
  for (const [p, v] of Object.entries(VEINS)) if (v.category === category) k *= sys.rich[p] ?? 1;
  return k;
}
