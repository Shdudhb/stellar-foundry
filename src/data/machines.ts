import type { Category } from './recipes';

export interface MachineDef {
  id: string;
  name: string;
  tier: number;
  categories: Category[];
  /** Power draw per machine at base speed (before overclock) */
  power?: { item: string; amount: number };
  slots: number;
  cost: Record<string, number>;
  /** Only buildable after this milestone is built */
  requiresMilestone?: string;
  /** Speed multiplier on top of overclocking (large facilities) */
  speed?: number;
  /** A line of this machine can be upgraded in place to that machine */
  upgradesTo?: string;
  /** Maintenance kits per machine per minute of full-speed work; without them it wears down */
  upkeep?: number;
  /** Built in orbit: takes orbital slots instead of ground slots, and draws lift instead of EU */
  orbital?: boolean;
  /** Perfect overclock: each tier above the recipe gives 4x speed instead of 2x, still for 4x power */
  perfectOC?: boolean;
  /** Must be lit before it produces: draws this much EU per machine for `time` seconds at full power */
  ignition?: { power: number; time: number };
  description: string;
}

export const MAINTENANCE_ITEM = 'maintenance_kit';

const list: MachineDef[] = [
  // ---- T0 ----
  {
    id: 'basic_drill', name: '簡易鑽機', tier: 0, categories: ['mining'], slots: 1, upgradesTo: 'steam_drill',
    cost: { stone: 5, iron_ingot: 5 },
    description: '不耗能，慢慢地鑽。',
  },
  {
    id: 'stone_furnace', name: '石爐', tier: 0, categories: ['smelting'], slots: 1,
    cost: { stone: 10 },
    description: '燒煤冶煉礦石與石磚。',
  },
  {
    id: 'workbench', name: '組裝台', tier: 0, categories: ['crafting'], slots: 1,
    cost: { stone: 10, iron_ingot: 10 },
    description: '手工組裝零件。',
  },
  {
    id: 'research_station', name: '研究站', tier: 0, categories: ['research'], slots: 1,
    cost: { stone_brick: 10, iron_ingot: 10, copper_ingot: 10 },
    description: '把科研包分析成研究數據。',
  },
  // ---- T1 ----
  {
    id: 'steam_boiler', name: '蒸汽鍋爐', tier: 1, categories: ['burning'], slots: 1,
    cost: { stone_brick: 10, iron_ingot: 20 },
    description: '燒煤產生蒸汽，只燒需要的量。',
  },
  {
    id: 'steam_drill', name: '蒸汽鑽機', tier: 1, categories: ['mining'], power: { item: 'steam', amount: 1 }, slots: 1, upgradesTo: 'electric_drill',
    cost: { gear: 10, iron_ingot: 10, stone_brick: 5 },
    description: '跑 T0 開採配方會超頻：速度 ×2、耗汽 ×4。',
  },
  {
    id: 'steam_press', name: '蒸汽壓縮機', tier: 1, categories: ['compressing'], power: { item: 'steam', amount: 3 }, slots: 1,
    cost: { gear: 20, copper_wire: 20, stone_brick: 10 },
    description: '壓製鋼（產生爐渣），也能超頻壓齒輪。',
  },
  {
    id: 'coke_oven', name: '焦爐', tier: 1, categories: ['coking'], slots: 1,
    cost: { stone_brick: 40 },
    description: '把煤煉成焦炭，留下煤焦油。',
  },
  // ---- T2 ----
  {
    id: 'steam_turbine', name: '蒸汽渦輪', tier: 1, categories: ['turbine'], slots: 1,
    cost: { steel: 10, gear: 10, copper_wire: 20 },
    description: '每秒吃 20 蒸汽發 10 電力。只依需求運轉。',
  },
  {
    id: 'solar_panel', name: '太陽能板', tier: 2, categories: ['solar'], slots: 1,
    cost: { silicon: 8, circuit: 2, aluminum: 4 },
    description: '免燃料、永遠滿載，但每塊都佔一個槽位。',
  },
  {
    id: 'blast_furnace', name: '高爐', tier: 2, categories: ['blasting'], power: { item: 'eu', amount: 16 }, slots: 1,
    cost: { steel: 100, stone_brick: 200, gear: 50 },
    requiresMilestone: 'blast_furnace',
    description: '大型設施：一座抵好幾台壓縮機。燒焦炭、吃電。',
  },
  {
    id: 'lv_crusher', name: 'LV 粉碎機', tier: 2, categories: ['crushing'], power: { item: 'eu', amount: 4 }, slots: 1,
    upgradesTo: 'mv_crusher',
    cost: { steel: 15, gear: 10, copper_wire: 10 },
    description: '把礦石、石頭和爐渣打成粉。',
  },
  {
    id: 'lv_electrolyzer', name: 'LV 電解槽', tier: 2, categories: ['electrolysis'], power: { item: 'eu', amount: 8 }, slots: 1,
    upgradesTo: 'mv_electrolyzer',
    cost: { steel: 20, gear: 10, copper_wire: 40 },
    description: '電解鋁土粉。副產物很多。',
  },
  {
    id: 'lv_mixer', name: 'LV 混合機', tier: 2, categories: ['mixing'], power: { item: 'eu', amount: 4 }, slots: 1,
    cost: { steel: 15, gear: 10, copper_wire: 10 },
    description: '用煤焦油和氧氣合成橡膠。',
  },
  {
    id: 'lv_assembler', name: 'LV 組裝機', tier: 2, categories: ['assembling'], power: { item: 'eu', amount: 4 }, slots: 1,
    upgradesTo: 'mv_assembler',
    cost: { steel: 20, gear: 20, copper_wire: 20 },
    description: '組裝絕緣線、電路與綠色科研包。',
  },
  {
    // Base draw is low on purpose: x16 overclock on T0 ore must still beat the coal it burns.
    id: 'electric_drill', name: '電動鑽機', tier: 2, categories: ['mining'], power: { item: 'eu', amount: 0.5 }, slots: 1,
    cost: { steel: 10, gear: 10, circuit: 2 },
    description: 'T0 礦 ×4 速、耗電 8/s；鋁土礦 ×2 速、耗電 2/s。',
  },
  // ---- T3 ----
  // MV machines keep their LV base draw, so on an LV recipe they follow the plain overclock rule:
  // twice the output per slot for four times the power.
  {
    id: 'mv_crusher', name: 'MV 粉碎機', tier: 3, categories: ['crushing'], power: { item: 'eu', amount: 4 }, slots: 1,
    cost: { aluminum: 10, steel: 20, circuit: 2, gear: 10 },
    description: '在 LV 配方上超頻：速度 ×2、耗電 ×4。',
  },
  {
    id: 'mv_electrolyzer', name: 'MV 電解槽', tier: 3, categories: ['electrolysis'], power: { item: 'eu', amount: 8 }, slots: 1,
    upgradesTo: 'hv_electrolyzer',
    cost: { aluminum: 20, steel: 20, circuit: 4, cable: 20 },
    description: '能電解鉻鐵粉；跑 LV 配方會超頻。',
  },
  {
    id: 'mv_assembler', name: 'MV 組裝機', tier: 3, categories: ['assembling'], power: { item: 'eu', amount: 4 }, slots: 1,
    upgradesTo: 'hv_assembler',
    cost: { aluminum: 20, steel: 20, circuit: 4, cable: 10 },
    description: '組裝進階電路與藍色科研包；跑 LV 配方會超頻。',
  },
  {
    id: 'arc_furnace', name: '電弧爐', tier: 3, categories: ['arc'], power: { item: 'eu', amount: 32 }, slots: 1,
    upgradesTo: 'plasma_arc_furnace',
    cost: { aluminum: 30, steel: 40, circuit: 6, cable: 30 },
    description: '冶煉不鏽鋼，也能把氧化鐵粉直接煉成鋼。',
  },
  {
    id: 'oil_pump', name: 'MV 抽油機', tier: 3, categories: ['pumping'], power: { item: 'eu', amount: 8 }, slots: 1,
    cost: { stainless: 20, aluminum: 20, circuit: 4, gear: 20 },
    description: '每秒抽 2 原油。',
  },
  {
    id: 'distillation_tower', name: '分餾塔', tier: 3, categories: ['distilling'], power: { item: 'eu', amount: 16 }, slots: 1,
    cost: { stainless: 60, aluminum: 40, circuit: 10, cable: 40 },
    description: '大型設施：原油一次分出四種產物，任何一種塞滿整座塔就停。',
  },
  {
    id: 'combustion_gen', name: '燃燒發電機', tier: 3, categories: ['combustion'], slots: 1, upgradesTo: 'large_combustion_engine',
    cost: { stainless: 10, aluminum: 10, circuit: 2, gear: 10 },
    description: '燒輕油或煉廠氣發電，只依需求燃燒。',
  },
  {
    id: 'chem_reactor', name: 'MV 化學反應器', tier: 3, categories: ['chemistry'], power: { item: 'eu', amount: 16 }, slots: 1,
    upgradesTo: 'hv_chem_reactor',
    cost: { stainless: 20, aluminum: 20, circuit: 4, cable: 20 },
    description: '裂解、乙烯、塑膠、硫酸、蝕刻電路板。',
  },
  {
    id: 'large_chem_plant', name: '大型化工廠', tier: 3, categories: ['chemistry'], power: { item: 'eu', amount: 64 }, slots: 1,
    speed: 4,
    cost: { stainless: 100, plastic: 100, adv_circuit: 20, pcb: 40 },
    requiresMilestone: 'chem_plant',
    description: '大型設施：一座抵四台化學反應器，只佔一格。',
  },
  // ---- T4: HV machines wear down and need maintenance kits ----
  // They are built from T3 materials, so titanium can be bootstrapped without titanium.
  {
    id: 'hv_assembler', name: 'HV 組裝機', tier: 4, categories: ['assembling'], power: { item: 'eu', amount: 4 }, slots: 1,
    upkeep: 1, upgradesTo: 'ev_assembler',
    cost: { stainless: 30, adv_circuit: 4, cable: 20, plastic: 20 },
    description: '組裝精密電路與紫色科研包；跑低階配方會超頻。需要維護。',
  },
  {
    id: 'hv_electrolyzer', name: 'HV 電解槽', tier: 4, categories: ['electrolysis'], power: { item: 'eu', amount: 8 }, slots: 1,
    upkeep: 1,
    cost: { stainless: 30, adv_circuit: 4, cable: 30 },
    description: '跑低階電解配方會超頻。需要維護。',
  },
  {
    id: 'hv_chem_reactor', name: 'HV 化學反應器', tier: 4, categories: ['chemistry'], power: { item: 'eu', amount: 16 }, slots: 1,
    upkeep: 1, upgradesTo: 'iv_chem_reactor',
    cost: { stainless: 30, adv_circuit: 4, plastic: 30 },
    description: '氯化金紅石、鹼浸黑鎢粉；跑 MV 配方會超頻。需要維護。',
  },
  {
    id: 'vacuum_furnace', name: '真空爐', tier: 4, categories: ['vacuum'], power: { item: 'eu', amount: 64 }, slots: 1,
    upkeep: 2,
    cost: { stainless: 80, adv_circuit: 8, pcb: 10, aluminum: 40 },
    description: '還原鈦與鎢、提純晶圓。產出的熱錠要送進真空冷凍機。需要維護。',
  },
  {
    id: 'vacuum_freezer', name: '真空冷凍機', tier: 4, categories: ['freezing'], power: { item: 'eu', amount: 32 }, slots: 1,
    upkeep: 2,
    cost: { stainless: 60, adv_circuit: 6, aluminum: 60 },
    description: '用冷卻液把熱錠冷卻成錠，冷卻液變成熱冷卻液。需要維護。',
  },
  {
    id: 'cooling_tower', name: '冷卻塔', tier: 3, categories: ['cooling'], power: { item: 'eu', amount: 8 }, slots: 1,
    cost: { stainless: 20, aluminum: 30, gear: 20 },
    description: '熱冷卻液散熱後回收，每輪損耗一成。',
  },
  {
    id: 'large_combustion_engine', name: '大型燃燒引擎', tier: 4, categories: ['combustion'], slots: 1,
    speed: 4, upkeep: 2,
    cost: { titanium: 40, tungsten: 10, stainless: 40, precision_circuit: 2 },
    description: '大型設施：超頻再 ×4，一座抵八台燃燒發電機。需要維護。',
  },
  // ---- T5: EV machines on the ground ----
  {
    id: 'ev_assembler', name: 'EV 組裝機', tier: 5, categories: ['assembling'], power: { item: 'eu', amount: 4 }, slots: 1,
    upkeep: 1, upgradesTo: 'iv_assembler',
    cost: { titanium: 20, tungsten: 10, precision_circuit: 2 },
    description: '組裝黃色科研包；跑低階配方會超頻。需要維護。',
  },
  {
    id: 'plasma_arc_furnace', name: '電漿電弧爐', tier: 5, categories: ['arc'], power: { item: 'eu', amount: 32 }, slots: 1,
    upkeep: 2,
    cost: { titanium: 40, tungsten: 20, precision_circuit: 4 },
    description: '冶煉銥，氯氣大半會回來；跑不鏽鋼會超頻 ×4、耗電 ×16。需要維護。',
  },
  {
    id: 'launch_pad', name: '發射台', tier: 5, categories: ['launch'], slots: 1,
    cost: { titanium: 100, tungsten: 40, stainless: 200, precision_circuit: 10 },
    requiresMilestone: 'orbital_pad',
    description: '每 60 秒發射一枚補給火箭，提供 20 軌道運力/秒。只依軌道上的需求發射。',
  },
  {
    id: 'space_elevator', name: '太空電梯', tier: 5, categories: ['elevator'], slots: 1,
    cost: { nanotube: 200, titanium: 200, zg_crystal: 20, precision_circuit: 20 },
    description: '大型設施：每秒吃 256 電力，提供 100 軌道運力，不再燒火箭。',
  },
  // ---- T5: orbital machines. They take orbital slots and run on lift. ----
  {
    id: 'asteroid_miner', name: '小行星採礦機', tier: 5, categories: ['asteroid'], power: { item: 'lift', amount: 6 }, slots: 1,
    orbital: true,
    cost: { titanium: 30, tungsten: 10, precision_circuit: 2 },
    description: '在軌道上開採隕石礦，礦石用運力送回地面。',
  },
  {
    id: 'solar_wind_collector', name: '太陽風收集器', tier: 5, categories: ['solar_wind'], power: { item: 'lift', amount: 2 }, slots: 1,
    orbital: true,
    cost: { titanium: 20, aluminum: 40, precision_circuit: 2 },
    description: '從太陽風裡慢慢收集氦-3。',
  },
  {
    id: 'orbital_fab', name: '微重力工廠', tier: 5, categories: ['microgravity'], power: { item: 'lift', amount: 10 }, slots: 1,
    orbital: true,
    cost: { titanium: 40, tungsten: 20, precision_circuit: 4 },
    description: '只有失重環境才做得出的東西：微重力晶體、奈米碳管。原料要用運力送上去。',
  },
  // ---- T6: IV machines overclock perfectly: 4x speed per tier for 4x power ----
  {
    id: 'iv_assembler', name: 'IV 組裝機', tier: 6, categories: ['assembling'], power: { item: 'eu', amount: 4 }, slots: 1,
    upkeep: 1, perfectOC: true,
    cost: { iridium: 20, tungsten: 20, zg_crystal: 4 },
    description: '組裝超導線。完美超頻：每高一階速度 ×4、耗電 ×4。需要維護。',
  },
  {
    id: 'iv_chem_reactor', name: 'IV 化學反應器', tier: 6, categories: ['chemistry'], power: { item: 'eu', amount: 16 }, slots: 1,
    upkeep: 1, perfectOC: true,
    cost: { iridium: 20, titanium: 40, zg_crystal: 4 },
    description: '完美超頻：跑 MV 配方速度 ×64、耗電 ×64，一格抵六十四台。需要維護。',
  },
  {
    id: 'fusion_reactor', name: '聚變反應爐', tier: 6, categories: ['fusion'], slots: 1,
    upkeep: 4, ignition: { power: 1000, time: 30 },
    cost: { superconductor: 100, iridium: 100, tungsten: 200, zg_crystal: 50 },
    description: '大型設施：點燃後每秒最多 2000 電力。點火要先灌入大量電力；斷料就會冷掉，得重新點火。需要維護。',
  },
  {
    id: 'neutronium_compressor', name: '中子素壓縮機', tier: 6, categories: ['neutron'], power: { item: 'eu', amount: 512 }, slots: 1,
    upkeep: 2,
    cost: { superconductor: 20, iridium: 40, tungsten: 100 },
    description: '把銥壓縮成中子素，非常耗電。需要維護。',
  },
  // ---- T7 ----
  {
    id: 'swarm_launcher', name: '戴森群發射器', tier: 7, categories: ['swarm'], power: { item: 'lift', amount: 20 }, slots: 1,
    orbital: true,
    cost: { neutronium: 10, superconductor: 40, titanium: 100 },
    description: '把戴森板部署進戴森群。每片部署好的板永久提供 20 電力/秒。',
  },
  {
    id: 'particle_collider', name: '粒子對撞機', tier: 7, categories: ['collider'], power: { item: 'eu', amount: 4096 }, slots: 1,
    upkeep: 4,
    cost: { neutronium: 50, superconductor: 200, iridium: 200, zg_crystal: 100 },
    description: '大型設施：把中子素撞成奇異物質，每秒吃 4096 電力。奇異物質放著會衰變。需要維護。',
  },
  {
    id: 'spacetime_stabilizer', name: '時空穩定器', tier: 7, categories: ['stabilizer'], power: { item: 'eu', amount: 1024 }, slots: 1,
    upkeep: 2,
    cost: { neutronium: 20, superconductor: 100, zg_crystal: 50 },
    description: '在奇異物質衰變前把它穩定下來。需要維護。',
  },
];

export const MACHINES: Record<string, MachineDef> = Object.fromEntries(list.map((m) => [m.id, m]));
export const MACHINE_LIST = list;
