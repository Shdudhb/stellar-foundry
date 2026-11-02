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
}

export const GALAXY_LIST: GalaxyDef[] = [
  {
    id: 'rich_ore', name: '富礦帶', icon: 'iron_ore',
    text: '地殼淺層滿是礦脈。採礦與小行星採礦 ×1.5，但研究站 ×0.8。',
    boost: { mining: 1.5, asteroid: 1.5, research: 0.8 },
  },
  {
    id: 'active_star', name: '活躍恆星', icon: 'eu',
    text: '恆星輻射強烈。太陽能、太陽風與戴森群發射 ×2，燃燒類發電 ×0.8。',
    boost: { solar: 2, solar_wind: 2, swarm: 2, burning: 0.8, combustion: 0.8 },
  },
  {
    id: 'frozen', name: '冰封星球', icon: 'comet_ice',
    text: '永凍的地表天然散熱。冷卻、冷凍、真空爐 ×1.5，冶煉與高爐 ×0.8。',
    boost: { cooling: 1.5, freezing: 1.5, vacuum: 1.5, smelting: 0.8, blasting: 0.8 },
  },
  {
    id: 'hot_core', name: '炙熱地核', icon: 'coal',
    text: '地熱源源不絕。冶煉、高爐、電弧爐、焦爐 ×1.5，冷卻與冷凍 ×0.7。',
    boost: { smelting: 1.5, blasting: 1.5, arc: 1.5, coking: 1.5, cooling: 0.7, freezing: 0.7 },
  },
  {
    id: 'oil_world', name: '油田星球', icon: 'crude_oil',
    text: '地底是一整片油海。抽油、分餾、化學反應 ×1.5，電解 ×0.8。',
    boost: { pumping: 1.5, distilling: 1.5, chemistry: 1.5, electrolysis: 0.8 },
  },
  {
    id: 'low_gravity', name: '低重力', icon: 'rocket_part',
    text: '重力只有一半，升空輕而易舉。發射台、太空電梯、微重力工廠 ×1.5，鑽探 ×0.8。',
    boost: { launch: 1.5, elevator: 1.5, microgravity: 1.5, mining: 0.8 },
  },
  {
    id: 'ruins', name: '古文明遺跡', icon: 'exotic_matter',
    text: '地表散落著前人的遺物。遺物訊號的數據 ×2，組裝 ×0.9。',
    boost: { assembling: 0.9 }, signalMult: 2,
  },
  {
    id: 'machine_world', name: '機械荒原', icon: 'gear',
    text: '前人留下的自動工廠廢墟還能拆零件。組裝、製作 ×1.4，粉碎 ×0.8。',
    boost: { assembling: 1.4, crafting: 1.4, crushing: 0.8 },
  },
];

export const GALAXIES: Record<string, GalaxyDef> = Object.fromEntries(GALAXY_LIST.map((g) => [g.id, g]));

/** A trait for the next galaxy, never the same as the current one */
export function rollGalaxy(current: string | null, rand = Math.random): string {
  const pool = GALAXY_LIST.filter((g) => g.id !== current);
  return pool[Math.floor(rand() * pool.length)].id;
}
