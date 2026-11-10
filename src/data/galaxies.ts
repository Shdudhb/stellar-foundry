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
