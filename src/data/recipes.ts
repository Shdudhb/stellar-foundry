export type Category =
  | 'mining' | 'smelting' | 'crafting' | 'compressing' | 'research' | 'burning'
  | 'coking' | 'turbine' | 'solar' | 'blasting' | 'crushing' | 'electrolysis' | 'mixing' | 'assembling'
  | 'arc' | 'pumping' | 'distilling' | 'combustion' | 'chemistry'
  | 'vacuum' | 'freezing' | 'cooling'
  | 'launch' | 'elevator' | 'asteroid' | 'solar_wind' | 'microgravity'
  | 'fusion' | 'neutron'
  | 'swarm' | 'collider' | 'stabilizer'
  | 'ice_mining' | 'geothermal' | 'magma' | 'casting';

export interface RecipeDef {
  id: string;
  name: string;
  category: Category;
  /** Minimum machine tier; higher-tier machines overclock it */
  tier: number;
  /** Seconds per craft at 1x speed */
  time: number;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  /** Only this world has what it needs (its ore, its heat). Unset: see `recipePlanet` in the rules */
  planet?: string;
}

const list: RecipeDef[] = [
  // ---- T0 ----
  { id: 'mine_stone', name: '開採石頭', category: 'mining', tier: 0, time: 2, inputs: {}, outputs: { stone: 1 } },
  { id: 'mine_iron', name: '開採鐵礦', category: 'mining', tier: 0, time: 2, inputs: {}, outputs: { iron_ore: 1 } },
  { id: 'mine_copper', name: '開採銅礦', category: 'mining', tier: 0, time: 2, inputs: {}, outputs: { copper_ore: 1 } },
  { id: 'mine_coal', name: '開採煤', category: 'mining', tier: 0, time: 2, inputs: {}, outputs: { coal: 1 } },

  { id: 'smelt_iron', name: '冶煉鐵錠', category: 'smelting', tier: 0, time: 4, inputs: { iron_ore: 2, coal: 1 }, outputs: { iron_ingot: 2 } },
  { id: 'smelt_copper', name: '冶煉銅錠', category: 'smelting', tier: 0, time: 4, inputs: { copper_ore: 2, coal: 1 }, outputs: { copper_ingot: 2 } },
  { id: 'fire_brick', name: '燒製石磚', category: 'smelting', tier: 0, time: 4, inputs: { stone: 4, coal: 1 }, outputs: { stone_brick: 2 } },

  { id: 'craft_gear', name: '齒輪', category: 'crafting', tier: 0, time: 2, inputs: { iron_ingot: 2 }, outputs: { gear: 1 } },
  { id: 'craft_wire', name: '銅線', category: 'crafting', tier: 0, time: 2, inputs: { copper_ingot: 1 }, outputs: { copper_wire: 2 } },
  { id: 'craft_red_pack', name: '紅色科研包', category: 'crafting', tier: 0, time: 5, inputs: { gear: 1, copper_wire: 2 }, outputs: { red_pack: 1 } },
  { id: 'slag_brick', name: '爐渣製磚', category: 'crafting', tier: 0, time: 2, inputs: { slag: 2 }, outputs: { stone_brick: 1 } },

  { id: 'analyze_red', name: '分析紅色科研包', category: 'research', tier: 0, time: 5, inputs: { red_pack: 1 }, outputs: { data: 10 } },

  // ---- T1 ----
  { id: 'burn_coal', name: '燒煤產蒸汽', category: 'burning', tier: 1, time: 2, inputs: { coal: 1 }, outputs: { steam: 20 } },
  // Byproduct showcase: steel leaves slag behind, which blocks the line when storage fills.
  { id: 'press_steel', name: '壓製鋼', category: 'compressing', tier: 1, time: 4, inputs: { iron_ingot: 2, coal: 1 }, outputs: { steel: 1, slag: 1 } },
  { id: 'press_gear', name: '壓製齒輪', category: 'compressing', tier: 0, time: 2, inputs: { iron_ingot: 2 }, outputs: { gear: 1 } },

  // ---- T2: power ----
  { id: 'turbine_eu', name: '蒸汽發電', category: 'turbine', tier: 1, time: 1, inputs: { steam: 20 }, outputs: { eu: 10 } },
  { id: 'solar_eu', name: '太陽能發電', category: 'solar', tier: 2, time: 1, inputs: {}, outputs: { eu: 2 } },

  // ---- T2: coke and the blast furnace ----
  { id: 'make_coke', name: '煉焦', category: 'coking', tier: 1, time: 2, inputs: { coal: 2 }, outputs: { coke: 1, coal_tar: 1 } },
  // 3x the steam per boiler slot of coal, and 60 vs 40 steam per 2 coal: worth it once slots run out.
  { id: 'burn_coke', name: '燒焦炭產蒸汽', category: 'burning', tier: 1, time: 2, inputs: { coke: 1 }, outputs: { steam: 60 } },
  { id: 'mine_bauxite', name: '開採鋁土礦', category: 'mining', tier: 1, time: 2, inputs: {}, outputs: { bauxite: 1 } },
  { id: 'bf_steel', name: '高爐煉鋼', category: 'blasting', tier: 2, time: 4, inputs: { iron_ingot: 4, coke: 1 }, outputs: { steel: 4, slag: 1 } },
  { id: 'bf_steel_oxygen', name: '吹氧煉鋼', category: 'blasting', tier: 2, time: 4, inputs: { iron_ingot: 4, coke: 1, oxygen: 2 }, outputs: { steel: 6, slag: 1 } },
  { id: 'bf_aluminum', name: '還原鋁錠', category: 'blasting', tier: 2, time: 4, inputs: { aluminum_dust: 2, coke: 1 }, outputs: { aluminum: 2 } },
  { id: 'bf_silicon', name: '冶煉矽', category: 'blasting', tier: 2, time: 6, inputs: { sand: 4, coke: 2 }, outputs: { silicon: 2, slag: 1 } },

  // ---- T2: ore processing ----
  { id: 'crush_bauxite', name: '粉碎鋁土礦', category: 'crushing', tier: 2, time: 2, inputs: { bauxite: 1 }, outputs: { bauxite_dust: 2 } },
  { id: 'crush_stone', name: '粉碎石頭', category: 'crushing', tier: 2, time: 1, inputs: { stone: 2 }, outputs: { sand: 2 } },
  { id: 'crush_slag', name: '粉碎爐渣', category: 'crushing', tier: 2, time: 2, inputs: { slag: 2 }, outputs: { sand: 1, iron_oxide: 1 } },
  {
    id: 'electrolyze_bauxite', name: '電解鋁土粉', category: 'electrolysis', tier: 2, time: 6,
    inputs: { bauxite_dust: 4 }, outputs: { aluminum_dust: 2, oxygen: 3, iron_oxide: 1 },
  },
  { id: 'smelt_iron_oxide', name: '回收氧化鐵', category: 'smelting', tier: 0, time: 4, inputs: { iron_oxide: 2, coal: 1 }, outputs: { iron_ingot: 2 } },

  // ---- T2: rubber and circuits ----
  { id: 'make_rubber', name: '合成橡膠', category: 'mixing', tier: 2, time: 3, inputs: { coal_tar: 2, oxygen: 1 }, outputs: { rubber: 1 } },
  { id: 'craft_cable', name: '絕緣線', category: 'assembling', tier: 2, time: 2, inputs: { copper_wire: 2, rubber: 1 }, outputs: { cable: 2 } },
  { id: 'craft_circuit', name: '基礎電路', category: 'assembling', tier: 2, time: 4, inputs: { silicon: 1, cable: 2, steel: 1 }, outputs: { circuit: 1 } },
  { id: 'craft_green_pack', name: '綠色科研包', category: 'assembling', tier: 2, time: 8, inputs: { circuit: 1, aluminum: 1 }, outputs: { green_pack: 1 } },
  { id: 'analyze_green', name: '分析綠色科研包', category: 'research', tier: 0, time: 5, inputs: { green_pack: 1 }, outputs: { data_green: 10 } },

  // ---- T3: chromium and stainless steel ----
  { id: 'mine_chromite', name: '開採鉻鐵礦', category: 'mining', tier: 2, time: 2, inputs: {}, outputs: { chromite: 1 } },
  { id: 'crush_chromite', name: '粉碎鉻鐵礦', category: 'crushing', tier: 2, time: 2, inputs: { chromite: 1 }, outputs: { chromite_dust: 2 } },
  {
    id: 'electrolyze_chromite', name: '電解鉻鐵粉', category: 'electrolysis', tier: 3, time: 6,
    inputs: { chromite_dust: 3 }, outputs: { chromium: 1, iron_oxide: 2, oxygen: 1 },
  },
  { id: 'arc_stainless', name: '冶煉不鏽鋼', category: 'arc', tier: 3, time: 4, inputs: { steel: 3, chromium: 1, oxygen: 1 }, outputs: { stainless: 4 } },
  { id: 'arc_iron_oxide', name: '氧化鐵還原煉鋼', category: 'arc', tier: 3, time: 4, inputs: { iron_oxide: 4, coke: 1 }, outputs: { steel: 2 } },

  // ---- T3: oil ----
  { id: 'pump_oil', name: '抽取原油', category: 'pumping', tier: 3, time: 1, inputs: {}, outputs: { crude_oil: 2 } },
  // Four outputs: if any one of them backs up, the whole tower stops.
  {
    id: 'distill_crude', name: '分餾原油', category: 'distilling', tier: 3, time: 5,
    inputs: { crude_oil: 10 }, outputs: { heavy_oil: 2, light_oil: 4, refinery_gas: 4, sulfur: 1 },
  },
  { id: 'burn_heavy_oil', name: '燒重油產蒸汽', category: 'burning', tier: 1, time: 2, inputs: { heavy_oil: 1 }, outputs: { steam: 40 } },
  { id: 'burn_light_oil', name: '燃油發電', category: 'combustion', tier: 3, time: 2, inputs: { light_oil: 1 }, outputs: { eu: 100 } },
  { id: 'burn_gas', name: '燃氣發電', category: 'combustion', tier: 3, time: 2, inputs: { refinery_gas: 2 }, outputs: { eu: 60 } },

  // ---- T3: chemistry ----
  { id: 'crack_heavy', name: '重油裂解', category: 'chemistry', tier: 3, time: 3, inputs: { heavy_oil: 3 }, outputs: { light_oil: 2 } },
  { id: 'make_ethylene', name: '煉廠氣製乙烯', category: 'chemistry', tier: 3, time: 3, inputs: { refinery_gas: 4 }, outputs: { ethylene: 3 } },
  { id: 'make_plastic', name: '聚合塑膠', category: 'chemistry', tier: 3, time: 4, inputs: { ethylene: 2, oxygen: 1 }, outputs: { plastic: 2 } },
  { id: 'make_acid', name: '製造硫酸', category: 'chemistry', tier: 3, time: 3, inputs: { sulfur: 1, oxygen: 2 }, outputs: { sulfuric_acid: 2 } },
  { id: 'etch_pcb', name: '蝕刻電路板', category: 'chemistry', tier: 3, time: 4, inputs: { plastic: 1, copper_ingot: 2, sulfuric_acid: 1 }, outputs: { pcb: 1 } },
  { id: 'craft_adv_circuit', name: '進階電路', category: 'assembling', tier: 3, time: 6, inputs: { pcb: 1, circuit: 2, silicon: 1 }, outputs: { adv_circuit: 1 } },
  { id: 'craft_blue_pack', name: '藍色科研包', category: 'assembling', tier: 3, time: 10, inputs: { adv_circuit: 1, stainless: 2, plastic: 1 }, outputs: { blue_pack: 1 } },
  { id: 'analyze_blue', name: '分析藍色科研包', category: 'research', tier: 0, time: 5, inputs: { blue_pack: 1 }, outputs: { data_blue: 10 } },

  // ---- T4: maintenance ----
  { id: 'make_lubricant', name: '調製潤滑油', category: 'chemistry', tier: 3, time: 3, inputs: { heavy_oil: 2 }, outputs: { lubricant: 1 } },
  { id: 'craft_kit', name: '維護套件', category: 'assembling', tier: 3, time: 6, inputs: { steel: 2, rubber: 1, lubricant: 1 }, outputs: { maintenance_kit: 2 } },

  // ---- T4: titanium (Hunter process) ----
  // Sodium and chlorine both come from salt, and reduction gives most of the salt back:
  // one fresh salt per titanium closes the loop exactly.
  { id: 'mine_rutile', name: '開採金紅石礦', category: 'mining', tier: 2, time: 3, inputs: {}, outputs: { rutile: 1 } },
  { id: 'mine_salt', name: '開採鹽', category: 'mining', tier: 1, time: 2, inputs: {}, outputs: { salt: 1 } },
  { id: 'crush_rutile', name: '粉碎金紅石礦', category: 'crushing', tier: 2, time: 2, inputs: { rutile: 1 }, outputs: { rutile_dust: 2 } },
  { id: 'electrolyze_salt', name: '電解鹽', category: 'electrolysis', tier: 3, time: 4, inputs: { salt: 2 }, outputs: { sodium: 2, chlorine: 1 } },
  {
    id: 'chlorinate_rutile', name: '氯化金紅石', category: 'chemistry', tier: 4, time: 6,
    inputs: { rutile_dust: 2, coke: 1, chlorine: 4 }, outputs: { ticl4: 2, carbon_monoxide: 2 },
  },
  { id: 'reduce_titanium', name: '鈉還原鈦', category: 'vacuum', tier: 4, time: 8, inputs: { ticl4: 1, sodium: 4 }, outputs: { hot_titanium: 1, salt: 3 } },
  { id: 'burn_co', name: '一氧化碳發電', category: 'combustion', tier: 3, time: 2, inputs: { carbon_monoxide: 2 }, outputs: { eu: 50 } },

  // ---- T4: cryogenics. Hot ingots must be frozen; coolant runs in a lossy loop. ----
  { id: 'make_coolant', name: '調配冷卻液', category: 'mixing', tier: 2, time: 4, inputs: { ethylene: 1, salt: 1 }, outputs: { coolant: 4 } },
  { id: 'freeze_titanium', name: '冷卻鈦錠', category: 'freezing', tier: 4, time: 4, inputs: { hot_titanium: 1, coolant: 2 }, outputs: { titanium: 1, hot_coolant: 2 } },
  { id: 'cool_coolant', name: '冷卻塔散熱', category: 'cooling', tier: 3, time: 4, inputs: { hot_coolant: 10 }, outputs: { coolant: 9 } },

  // ---- T4: tungsten ----
  { id: 'mine_wolframite', name: '開採黑鎢礦', category: 'mining', tier: 2, time: 3, inputs: {}, outputs: { wolframite: 1 } },
  { id: 'crush_wolframite', name: '粉碎黑鎢礦', category: 'crushing', tier: 2, time: 2, inputs: { wolframite: 1 }, outputs: { wolframite_dust: 2 } },
  {
    id: 'leach_wolframite', name: '鹼浸黑鎢粉', category: 'chemistry', tier: 4, time: 6,
    inputs: { wolframite_dust: 2, sodium: 2 }, outputs: { sodium_tungstate: 2, iron_oxide: 1 },
  },
  {
    id: 'acidify_tungstate', name: '酸化鎢酸鈉', category: 'chemistry', tier: 3, time: 4,
    inputs: { sodium_tungstate: 1, sulfuric_acid: 1 }, outputs: { tungstic_acid: 1, salt: 1 },
  },
  {
    id: 'reduce_tungsten', name: '碳還原鎢', category: 'vacuum', tier: 4, time: 10,
    inputs: { tungstic_acid: 2, coke: 2 }, outputs: { hot_tungsten: 1, carbon_monoxide: 2 },
  },
  { id: 'freeze_tungsten', name: '冷卻鎢錠', category: 'freezing', tier: 4, time: 6, inputs: { hot_tungsten: 1, coolant: 4 }, outputs: { tungsten: 1, hot_coolant: 4 } },

  // ---- T4: precision circuits and purple science ----
  { id: 'grow_wafer', name: '提純矽晶圓', category: 'vacuum', tier: 4, time: 8, inputs: { silicon: 3, chlorine: 1 }, outputs: { wafer: 1 } },
  {
    id: 'craft_precision', name: '精密電路', category: 'assembling', tier: 4, time: 10,
    inputs: { adv_circuit: 2, wafer: 1, tungsten: 1 }, outputs: { precision_circuit: 1 },
  },
  {
    id: 'craft_purple_pack', name: '紫色科研包', category: 'assembling', tier: 4, time: 15,
    inputs: { precision_circuit: 1, titanium: 3, tungsten: 1 }, outputs: { purple_pack: 2 },
  },
  { id: 'analyze_purple', name: '分析紫色科研包', category: 'research', tier: 0, time: 5, inputs: { purple_pack: 1 }, outputs: { data_purple: 10 } },

  // ---- T5: lift. Rockets burn fuel and parts; the space elevator later turns EU into lift. ----
  { id: 'mix_rocket_fuel', name: '調配火箭燃料', category: 'chemistry', tier: 4, time: 4, inputs: { light_oil: 2, oxygen: 3 }, outputs: { rocket_fuel: 4 } },
  {
    id: 'craft_rocket_part', name: '火箭零件', category: 'assembling', tier: 4, time: 10,
    inputs: { titanium: 4, stainless: 4, adv_circuit: 1 }, outputs: { rocket_part: 1 },
  },
  { id: 'launch_rocket', name: '發射補給火箭', category: 'launch', tier: 5, time: 60, inputs: { rocket_fuel: 20, rocket_part: 1 }, outputs: { lift: 1200 } },
  { id: 'elevator_lift', name: '電梯運貨', category: 'elevator', tier: 5, time: 1, inputs: { eu: 256 }, outputs: { lift: 100 } },

  // ---- T5: orbit. Every orbital machine runs on lift instead of EU. ----
  { id: 'mine_asteroid', name: '小行星採礦', category: 'asteroid', tier: 5, time: 4, inputs: {}, outputs: { meteor_ore: 2 } },
  { id: 'collect_he3', name: '收集氦-3', category: 'solar_wind', tier: 5, time: 10, inputs: {}, outputs: { helium_3: 1 } },
  { id: 'grow_crystal', name: '培育微重力晶體', category: 'microgravity', tier: 5, time: 12, inputs: { wafer: 1, iridium: 1 }, outputs: { zg_crystal: 1 } },
  { id: 'spin_nanotube', name: '紡製奈米碳管', category: 'microgravity', tier: 5, time: 8, inputs: { ethylene: 4 }, outputs: { nanotube: 2 } },

  // ---- T5: iridium. Chlorine leaches it out of meteor dust; the plasma furnace gives most of it back. ----
  { id: 'crush_meteor', name: '粉碎隕石礦', category: 'crushing', tier: 2, time: 2, inputs: { meteor_ore: 1 }, outputs: { meteor_dust: 2 } },
  {
    id: 'leach_meteor', name: '氯化浸出隕石粉', category: 'chemistry', tier: 4, time: 8,
    inputs: { meteor_dust: 4, chlorine: 3 }, outputs: { iridium_chloride: 1, iron_oxide: 2 },
  },
  { id: 'smelt_iridium', name: '電漿冶煉銥', category: 'arc', tier: 5, time: 10, inputs: { iridium_chloride: 1 }, outputs: { iridium: 1, chlorine: 2 } },

  // ---- T5: yellow science ----
  {
    id: 'craft_yellow_pack', name: '黃色科研包', category: 'assembling', tier: 5, time: 20,
    inputs: { zg_crystal: 1, iridium: 2, helium_3: 1 }, outputs: { yellow_pack: 1 },
  },
  { id: 'analyze_yellow', name: '分析黃色科研包', category: 'research', tier: 0, time: 5, inputs: { yellow_pack: 1 }, outputs: { data_yellow: 10 } },

  // ---- T6: helium. Liquid helium cools superconductors; fusion makes plenty of helium later. ----
  { id: 'collect_helium', name: '收集氦氣', category: 'solar_wind', tier: 5, time: 5, inputs: {}, outputs: { helium: 4 } },
  {
    id: 'liquefy_helium', name: '液化氦氣', category: 'freezing', tier: 4, time: 4,
    inputs: { helium: 4, coolant: 2 }, outputs: { liquid_helium: 1, hot_coolant: 2 },
  },
  {
    id: 'craft_superconductor', name: '超導線', category: 'assembling', tier: 6, time: 10,
    inputs: { nanotube: 2, iridium: 1, liquid_helium: 2 }, outputs: { superconductor: 2 },
  },

  // ---- T6: fusion. Deuterium from comet ice, helium-3 from the solar wind. ----
  // ---- the ice moon: its own ore and its own power; everything else there is shipped in or out ----
  { id: 'mine_ice', name: '開採彗星冰', category: 'ice_mining', tier: 5, time: 2, inputs: {}, outputs: { comet_ice: 2 }, planet: 'ice' },
  { id: 'geothermal_power', name: '地熱發電', category: 'geothermal', tier: 5, time: 1, inputs: {}, outputs: { eu: 160 }, planet: 'ice' },
  // The lava world: magma comes up ready to pour, so ingots skip the ore, the coal and the tungsten chemistry
  { id: 'pump_magma', name: '抽取岩漿', category: 'magma', tier: 6, time: 1, inputs: {}, outputs: { magma: 4 }, planet: 'lava' },
  { id: 'magma_power', name: '岩漿發電', category: 'geothermal', tier: 5, time: 1, inputs: {}, outputs: { eu: 240 }, planet: 'lava' },
  { id: 'cast_iron', name: '岩漿鑄鐵', category: 'casting', tier: 6, time: 1, inputs: { magma: 4 }, outputs: { iron_ingot: 2 }, planet: 'lava' },
  { id: 'cast_copper', name: '岩漿鑄銅', category: 'casting', tier: 6, time: 1, inputs: { magma: 4 }, outputs: { copper_ingot: 2 }, planet: 'lava' },
  { id: 'cast_tungsten', name: '岩漿提鎢', category: 'casting', tier: 6, time: 8, inputs: { magma: 40 }, outputs: { tungsten: 1 }, planet: 'lava' },
  // The one thing only the lava world makes: the compressor and both late megastructures are lined with it
  { id: 'cast_ceramic', name: '燒結耐熱陶瓷', category: 'casting', tier: 6, time: 4, inputs: { magma: 20 }, outputs: { heat_ceramic: 1 }, planet: 'lava' },
  { id: 'cast_iridium', name: '岩漿提銥', category: 'casting', tier: 6, time: 8, inputs: { magma: 40 }, outputs: { iridium: 1 }, planet: 'lava' },
  { id: 'electrolyze_ice', name: '電解彗星冰', category: 'electrolysis', tier: 4, time: 4, inputs: { comet_ice: 2 }, outputs: { deuterium: 1, oxygen: 2 } },
  // Helium is a byproduct: if it backs up, fusion stops and the reactor goes cold.
  { id: 'fuse_dhe3', name: '氘-氦3 聚變', category: 'fusion', tier: 6, time: 4, inputs: { deuterium: 1, helium_3: 1 }, outputs: { eu: 8000, helium: 2 } },

  // ---- T6: neutronium and the Dyson swarm ----
  { id: 'compress_neutronium', name: '壓縮中子素', category: 'neutron', tier: 6, time: 20, inputs: { iridium: 4, superconductor: 1 }, outputs: { neutronium: 1 } },
  {
    id: 'fab_dyson_panel', name: '戴森板', category: 'microgravity', tier: 5, time: 15,
    inputs: { superconductor: 1, zg_crystal: 1, titanium: 2 }, outputs: { dyson_panel: 1 },
  },

  // ---- T7: the swarm grows one panel at a time; each deployed panel is permanent free EU ----
  { id: 'deploy_swarm', name: '部署戴森板', category: 'swarm', tier: 7, time: 10, inputs: { dyson_panel: 1 }, outputs: { dyson_swarm: 1 } },

  // ---- T7: exotic matter decays in storage, so the stabilizers have to keep up with the collider ----
  { id: 'collide_neutronium', name: '對撞中子素', category: 'collider', tier: 7, time: 10, inputs: { neutronium: 1 }, outputs: { exotic_matter: 4 } },
  {
    id: 'stabilize_exotic', name: '穩定奇異物質', category: 'stabilizer', tier: 7, time: 5,
    inputs: { exotic_matter: 2, superconductor: 1 }, outputs: { stable_exotic: 1 },
  },
  {
    id: 'craft_white_pack', name: '白色科研包', category: 'assembling', tier: 6, time: 30,
    inputs: { stable_exotic: 1, neutronium: 1, superconductor: 2 }, outputs: { white_pack: 1 },
  },
  { id: 'analyze_white', name: '分析白色科研包', category: 'research', tier: 0, time: 5, inputs: { white_pack: 1 }, outputs: { data_white: 10 } },
];

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(list.map((r) => [r.id, r]));
export const RECIPE_LIST = list;
