export type ItemKind = 'raw' | 'intermediate' | 'byproduct' | 'science' | 'data' | 'power' | 'structure';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** Stack cap before storage research; omitted = default */
  capBase?: number;
  /** Can be clicked for manual gathering */
  manual?: boolean;
  /** Fraction of the stored amount lost per second */
  decay?: number;
}

export const DEFAULT_CAP = 200;

const list: ItemDef[] = [
  // T0
  { id: 'stone', name: '石頭', kind: 'raw', manual: true },
  { id: 'iron_ore', name: '鐵礦', kind: 'raw', manual: true },
  { id: 'copper_ore', name: '銅礦', kind: 'raw', manual: true },
  { id: 'coal', name: '煤', kind: 'raw', manual: true },
  { id: 'iron_ingot', name: '鐵錠', kind: 'intermediate' },
  { id: 'copper_ingot', name: '銅錠', kind: 'intermediate' },
  { id: 'stone_brick', name: '石磚', kind: 'intermediate' },
  { id: 'gear', name: '齒輪', kind: 'intermediate' },
  { id: 'copper_wire', name: '銅線', kind: 'intermediate' },
  // T1
  { id: 'steel', name: '鋼', kind: 'intermediate' },
  { id: 'slag', name: '爐渣', kind: 'byproduct', capBase: 100 },
  // T2
  { id: 'bauxite', name: '鋁土礦', kind: 'raw' },
  { id: 'coke', name: '焦炭', kind: 'intermediate' },
  { id: 'coal_tar', name: '煤焦油', kind: 'byproduct', capBase: 100 },
  { id: 'sand', name: '石英砂', kind: 'intermediate' },
  { id: 'bauxite_dust', name: '鋁土粉', kind: 'intermediate' },
  { id: 'aluminum_dust', name: '鋁粉', kind: 'intermediate' },
  { id: 'oxygen', name: '氧氣', kind: 'byproduct', capBase: 100 },
  { id: 'iron_oxide', name: '氧化鐵粉', kind: 'byproduct', capBase: 100 },
  { id: 'aluminum', name: '鋁錠', kind: 'intermediate' },
  { id: 'silicon', name: '矽', kind: 'intermediate' },
  { id: 'rubber', name: '橡膠', kind: 'intermediate' },
  { id: 'cable', name: '絕緣線', kind: 'intermediate' },
  { id: 'circuit', name: '基礎電路', kind: 'intermediate' },
  // T3
  { id: 'chromite', name: '鉻鐵礦', kind: 'raw' },
  { id: 'chromite_dust', name: '鉻鐵粉', kind: 'intermediate' },
  { id: 'chromium', name: '鉻', kind: 'intermediate' },
  { id: 'stainless', name: '不鏽鋼', kind: 'intermediate' },
  { id: 'crude_oil', name: '原油', kind: 'raw' },
  { id: 'heavy_oil', name: '重油', kind: 'byproduct', capBase: 100 },
  { id: 'light_oil', name: '輕油', kind: 'intermediate' },
  { id: 'refinery_gas', name: '煉廠氣', kind: 'byproduct', capBase: 100 },
  { id: 'sulfur', name: '硫', kind: 'byproduct', capBase: 100 },
  { id: 'ethylene', name: '乙烯', kind: 'intermediate' },
  { id: 'plastic', name: '塑膠', kind: 'intermediate' },
  { id: 'sulfuric_acid', name: '硫酸', kind: 'intermediate' },
  { id: 'pcb', name: '電路板', kind: 'intermediate' },
  { id: 'adv_circuit', name: '進階電路', kind: 'intermediate' },
  // T4
  { id: 'lubricant', name: '潤滑油', kind: 'intermediate' },
  { id: 'maintenance_kit', name: '維護套件', kind: 'intermediate' },
  { id: 'rutile', name: '金紅石礦', kind: 'raw' },
  { id: 'rutile_dust', name: '金紅石粉', kind: 'intermediate' },
  { id: 'salt', name: '鹽', kind: 'raw' },
  { id: 'sodium', name: '鈉', kind: 'intermediate' },
  { id: 'chlorine', name: '氯氣', kind: 'byproduct', capBase: 100 },
  { id: 'ticl4', name: '四氯化鈦', kind: 'intermediate' },
  { id: 'carbon_monoxide', name: '一氧化碳', kind: 'byproduct', capBase: 100 },
  { id: 'hot_titanium', name: '熱鈦錠', kind: 'intermediate', capBase: 50 },
  { id: 'titanium', name: '鈦錠', kind: 'intermediate' },
  { id: 'coolant', name: '冷卻液', kind: 'intermediate' },
  { id: 'hot_coolant', name: '熱冷卻液', kind: 'byproduct', capBase: 100 },
  { id: 'wolframite', name: '黑鎢礦', kind: 'raw' },
  { id: 'wolframite_dust', name: '黑鎢粉', kind: 'intermediate' },
  { id: 'sodium_tungstate', name: '鎢酸鈉', kind: 'intermediate' },
  { id: 'tungstic_acid', name: '鎢酸', kind: 'intermediate' },
  { id: 'hot_tungsten', name: '熱鎢錠', kind: 'intermediate', capBase: 50 },
  { id: 'tungsten', name: '鎢錠', kind: 'intermediate' },
  { id: 'wafer', name: '矽晶圓', kind: 'intermediate' },
  { id: 'precision_circuit', name: '精密電路', kind: 'intermediate' },
  // T5
  { id: 'rocket_fuel', name: '火箭燃料', kind: 'intermediate' },
  { id: 'rocket_part', name: '火箭零件', kind: 'intermediate' },
  { id: 'meteor_ore', name: '隕石礦', kind: 'raw' },
  { id: 'meteor_dust', name: '隕石粉', kind: 'intermediate' },
  { id: 'iridium_chloride', name: '氯化銥', kind: 'intermediate' },
  { id: 'iridium', name: '銥錠', kind: 'intermediate' },
  { id: 'helium_3', name: '氦-3', kind: 'raw' },
  { id: 'zg_crystal', name: '微重力晶體', kind: 'intermediate' },
  { id: 'nanotube', name: '奈米碳管', kind: 'intermediate' },
  // T6
  { id: 'comet_ice', name: '彗星冰', kind: 'raw' },
  { id: 'deuterium', name: '氘', kind: 'intermediate' },
  { id: 'helium', name: '氦氣', kind: 'byproduct', capBase: 100 },
  { id: 'liquid_helium', name: '液氦', kind: 'intermediate' },
  { id: 'superconductor', name: '超導線', kind: 'intermediate' },
  { id: 'neutronium', name: '中子素', kind: 'intermediate' },
  { id: 'dyson_panel', name: '戴森板', kind: 'intermediate' },
  { id: 'magma', name: '岩漿', kind: 'raw' },
  // T7
  { id: 'dyson_swarm', name: '戴森群', kind: 'structure', capBase: 1e9 },
  // Decays by 2% of the stored amount per second (half-life ~35 s): stabilize it as it is made.
  { id: 'exotic_matter', name: '奇異物質', kind: 'intermediate', decay: 0.02 },
  { id: 'stable_exotic', name: '穩定奇異物質', kind: 'intermediate' },
  // science
  { id: 'red_pack', name: '紅色科研包', kind: 'science' },
  { id: 'green_pack', name: '綠色科研包', kind: 'science' },
  { id: 'blue_pack', name: '藍色科研包', kind: 'science' },
  { id: 'purple_pack', name: '紫色科研包', kind: 'science' },
  { id: 'yellow_pack', name: '黃色科研包', kind: 'science' },
  { id: 'white_pack', name: '白色科研包', kind: 'science' },
  { id: 'data', name: '紅色數據', kind: 'data', capBase: 10000 },
  { id: 'data_green', name: '綠色數據', kind: 'data', capBase: 10000 },
  { id: 'data_blue', name: '藍色數據', kind: 'data', capBase: 10000 },
  { id: 'data_purple', name: '紫色數據', kind: 'data', capBase: 10000 },
  { id: 'data_yellow', name: '黃色數據', kind: 'data', capBase: 10000 },
  { id: 'data_white', name: '白色數據', kind: 'data', capBase: 10000 },
  // Power carriers: produced and consumed in the same tick, never stored.
  // Lift is cargo capacity to orbit: orbital machines draw it the way ground machines draw EU.
  { id: 'lift', name: '軌道運力', kind: 'power' },
  { id: 'eu', name: '電力', kind: 'power' },
  { id: 'steam', name: '蒸汽', kind: 'power' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
export const DECAYING_ITEMS = list.filter((i) => i.decay).map((i) => i.id);

/** Panels deployed in the Dyson swarm: a structure, not cargo. Each one beams down free EU. */
export const SWARM_ITEM = 'dyson_swarm';
export const SWARM_EU = 20;
export const ITEM_ORDER = list.map((i) => i.id);

/**
 * Power networks, solved in this order. A generator on one network may only
 * consume power from a network listed after it (EU turbines eat steam, the space elevator eats EU).
 */
export const POWER_ORDER = ['lift', 'eu', 'steam'];

/**
 * Can be set to vent: a full store then destroys overflow instead of stalling what makes it.
 * Not just byproducts: co-products such as aluminium dust (electrolysis also makes the oxygen everything
 * needs), sodium (salt electrolysis also makes chlorine) and returned salt fill up and lock a whole chain.
 */
export function canVent(id: string): boolean {
  return ['raw', 'intermediate', 'byproduct'].includes(ITEMS[id]?.kind ?? '');
}

export function isPower(id: string): boolean {
  return ITEMS[id]?.kind === 'power';
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}
