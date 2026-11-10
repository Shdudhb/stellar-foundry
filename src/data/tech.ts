export interface TechDef {
  id: string;
  name: string;
  tier: number;
  description: string;
  /** Cost in research data items */
  cost: Record<string, number>;
  requires: string[];
  /** Milestone that must be built before this can be researched */
  requiresMilestone?: string;
  unlockMachines?: string[];
  unlockRecipes?: string[];
  storageMult?: number;
  slotBonus?: number;
  /** Extra orbital slots */
  orbitSlotBonus?: number;
  /** Extra slots on other worlds, by planet id */
  planetSlots?: Record<string, number>;
  unlockMilestone?: string;
}

const list: TechDef[] = [
  // ---- T1 ----
  {
    id: 'steam_power', name: '蒸汽動力', tier: 1, cost: { data: 30 }, requires: [],
    description: '解鎖蒸汽鍋爐。',
    unlockMachines: ['steam_boiler'],
  },
  {
    id: 'storage_1', name: '倉儲擴充 I', tier: 1, cost: { data: 40 }, requires: [],
    description: '所有物品容量 ×2。',
    storageMult: 2,
  },
  {
    id: 'zoning_1', name: '區域規劃', tier: 1, cost: { data: 50 }, requires: [],
    description: '區域槽位 +10。',
    slotBonus: 10,
  },
  {
    id: 'steam_mining', name: '蒸汽採礦', tier: 1, cost: { data: 60 }, requires: ['steam_power'],
    description: '解鎖蒸汽鑽機。簡易鑽機的生產線可以一鍵升級。',
    unlockMachines: ['steam_drill'],
  },
  {
    id: 'compression', name: '壓縮技術', tier: 1, cost: { data: 80 }, requires: ['steam_power'],
    description: '解鎖蒸汽壓縮機與鋼。煉鋼會產生爐渣。',
    unlockMachines: ['steam_press'],
    unlockRecipes: ['press_steel', 'press_gear'],
  },
  {
    id: 'slag_recycling', name: '爐渣回收', tier: 1, cost: { data: 60 }, requires: ['compression'],
    description: '組裝台可以把爐渣做成石磚。',
    unlockRecipes: ['slag_brick'],
  },
  {
    id: 'storage_2', name: '倉儲擴充 II', tier: 1, cost: { data: 150 }, requires: ['storage_1', 'compression'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'zoning_2', name: '區域規劃 II', tier: 1, cost: { data: 120 }, requires: ['zoning_1', 'steam_mining'],
    description: '區域槽位再 +15。',
    slotBonus: 15,
  },
  {
    id: 'blast_furnace', name: '高爐', tier: 1, cost: { data: 300 }, requires: ['slag_recycling', 'steam_mining', 'zoning_1'],
    description: '解鎖第一座大型設施：高爐。建成即通往 LV 電力時代。',
    unlockMilestone: 'blast_furnace',
  },

  // ---- T2: everything here needs the blast furnace milestone ----
  {
    id: 'electricity', name: '電力學', tier: 2, cost: { data: 120 }, requires: [], requiresMilestone: 'blast_furnace',
    description: '蒸汽渦輪把蒸汽變成電力。高爐要靠它才能運轉。',
    unlockMachines: ['steam_turbine'],
  },
  {
    id: 'coking', name: '煉焦', tier: 2, cost: { data: 100 }, requires: [], requiresMilestone: 'blast_furnace',
    description: '焦爐把煤煉成焦炭，副產煤焦油。高爐可以煉鋼；鍋爐燒焦炭產汽是燒煤的三倍。',
    unlockMachines: ['coke_oven'],
    unlockRecipes: ['make_coke', 'bf_steel', 'burn_coke'],
  },
  {
    id: 'ore_processing', name: '礦物處理', tier: 2, cost: { data: 150 }, requires: ['electricity'],
    description: '發現鋁土礦。LV 粉碎機能打碎礦石、石頭與爐渣。',
    unlockMachines: ['lv_crusher'],
    unlockRecipes: ['mine_bauxite', 'crush_bauxite', 'crush_stone', 'crush_slag'],
  },
  {
    id: 'electrolysis', name: '電解', tier: 2, cost: { data: 200 }, requires: ['ore_processing', 'coking'],
    description: '電解鋁土粉得到鋁粉，副產氧氣與氧化鐵粉。高爐能還原鋁錠，石爐能回收氧化鐵。',
    unlockMachines: ['lv_electrolyzer'],
    unlockRecipes: ['electrolyze_bauxite', 'bf_aluminum', 'smelt_iron_oxide', 'bf_steel_oxygen'],
  },
  {
    id: 'rubber', name: '合成橡膠', tier: 2, cost: { data: 150 }, requires: ['electrolysis'],
    description: '煤焦油 + 氧氣 → 橡膠。兩種副產物一次消化。LV 組裝機做絕緣線。',
    unlockMachines: ['lv_mixer', 'lv_assembler'],
    unlockRecipes: ['make_rubber', 'craft_cable'],
  },
  {
    id: 'silicon', name: '矽冶煉', tier: 2, cost: { data: 150 }, requires: ['ore_processing', 'coking'],
    description: '高爐把石英砂冶煉成矽。',
    unlockRecipes: ['bf_silicon'],
  },
  {
    id: 'circuits', name: '基礎電路', tier: 2, cost: { data: 250 }, requires: ['rubber', 'silicon'],
    description: '矽 + 絕緣線 + 鋼 → 基礎電路。開始生產綠色科研包。',
    unlockRecipes: ['craft_circuit', 'craft_green_pack', 'analyze_green'],
  },
  {
    id: 'electric_mining', name: '電動採礦', tier: 2, cost: { data: 100, data_green: 50 }, requires: ['circuits'],
    description: '解鎖電動鑽機，開採 T0 礦是簡易鑽機的 4 倍快。舊鑽機的生產線可以一鍵升級。',
    unlockMachines: ['electric_drill'],
  },
  {
    id: 'solar', name: '太陽能', tier: 2, cost: { data_green: 80 }, requires: ['circuits'],
    description: '解鎖太陽能板：免燃料，但吃槽位。',
    unlockMachines: ['solar_panel'],
  },
  {
    id: 'zoning_3', name: '區域規劃 III', tier: 2, cost: { data: 200 }, requires: ['electricity'],
    description: '區域槽位再 +20。',
    slotBonus: 20,
  },
  {
    id: 'storage_3', name: '倉儲擴充 III', tier: 2, cost: { data_green: 100 }, requires: ['circuits', 'storage_2'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'power_hub', name: '電力網中樞', tier: 2, cost: { data_green: 200 }, requires: ['electric_mining', 'solar'],
    description: '解鎖 T2 里程碑：電力網中樞。',
    unlockMilestone: 'power_hub',
  },

  // ---- T3: everything here needs the power hub ----
  {
    id: 'mv_tech', name: 'MV 機械', tier: 3, cost: { data_green: 150 }, requires: [], requiresMilestone: 'power_hub',
    description: '解鎖 MV 機器，LV 生產線可以一鍵升級到 MV。發現鉻鐵礦（電動鑽機開採）。',
    unlockMachines: ['mv_crusher', 'mv_electrolyzer', 'mv_assembler'],
    unlockRecipes: ['mine_chromite', 'crush_chromite', 'electrolyze_chromite'],
  },
  {
    id: 'zoning_4', name: '區域規劃 IV', tier: 3, cost: { data_green: 200 }, requires: ['mv_tech'],
    description: '區域槽位再 +25。',
    slotBonus: 25,
  },
  {
    id: 'stainless', name: '不鏽鋼', tier: 3, cost: { data_green: 150 }, requires: ['mv_tech'],
    description: '電弧爐：鋼 + 鉻 + 氧氣 → 不鏽鋼。也能把氧化鐵粉直接煉成鋼。',
    unlockMachines: ['arc_furnace'],
    unlockRecipes: ['arc_stainless', 'arc_iron_oxide'],
  },
  {
    id: 'petroleum', name: '石油探勘', tier: 3, cost: { data_green: 200 }, requires: ['stainless'],
    description: '抽油機與分餾塔。原油分出重油、輕油、煉廠氣與硫。鍋爐能燒重油。',
    unlockMachines: ['oil_pump', 'distillation_tower'],
    unlockRecipes: ['pump_oil', 'distill_crude', 'burn_heavy_oil'],
  },
  {
    id: 'combustion', name: '內燃發電', tier: 3, cost: { data_green: 150 }, requires: ['petroleum'],
    description: '燃燒發電機：輕油或煉廠氣直接發電。',
    unlockMachines: ['combustion_gen'],
    unlockRecipes: ['burn_light_oil', 'burn_gas'],
  },
  {
    id: 'petrochem', name: '石油化工', tier: 3, cost: { data_green: 250 }, requires: ['petroleum'],
    description: '化學反應器：重油裂解、煉廠氣製乙烯、乙烯 + 氧氣 → 塑膠。',
    unlockMachines: ['chem_reactor'],
    unlockRecipes: ['crack_heavy', 'make_ethylene', 'make_plastic'],
  },
  {
    id: 'acid', name: '硫酸', tier: 3, cost: { data_green: 150 }, requires: ['petrochem'],
    description: '硫 + 氧氣 → 硫酸。分餾塔的硫終於有出路。',
    unlockRecipes: ['make_acid'],
  },
  {
    id: 'adv_circuits', name: '進階電路', tier: 3, cost: { data_green: 300 }, requires: ['acid'],
    description: '蝕刻電路板、組裝進階電路，開始生產藍色科研包。',
    unlockRecipes: ['etch_pcb', 'craft_adv_circuit', 'craft_blue_pack', 'analyze_blue'],
  },
  {
    id: 'storage_4', name: '倉儲擴充 IV', tier: 3, cost: { data_blue: 80 }, requires: ['adv_circuits', 'storage_3'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'zoning_5', name: '區域規劃 V', tier: 3, cost: { data_blue: 100 }, requires: ['adv_circuits', 'zoning_4'],
    description: '區域槽位再 +25。',
    slotBonus: 25,
  },
  {
    id: 'chem_plant', name: '化工廠', tier: 3, cost: { data_blue: 250 }, requires: ['adv_circuits'],
    description: '解鎖 T3 里程碑：化工廠。',
    unlockMilestone: 'chem_plant',
  },

  // ---- T4: everything here needs the chemical plant ----
  {
    id: 'hv_tech', name: 'HV 機械', tier: 4, cost: { data_blue: 150 }, requires: [], requiresMilestone: 'chem_plant',
    description: '解鎖 HV 機器，MV 生產線可以一鍵升級。HV 機器會磨損：用重油調潤滑油，再組裝維護套件。',
    unlockMachines: ['hv_assembler', 'hv_electrolyzer', 'hv_chem_reactor'],
    unlockRecipes: ['make_lubricant', 'craft_kit'],
  },
  {
    id: 'zoning_6', name: '區域規劃 VI', tier: 4, cost: { data_blue: 150 }, requires: ['hv_tech'],
    description: '區域槽位再 +30。',
    slotBonus: 30,
  },
  {
    id: 'titanium', name: '鈦冶金', tier: 4, cost: { data_blue: 200 }, requires: ['hv_tech'],
    description: '發現金紅石礦與鹽。電解鹽得到鈉和氯氣；氯化金紅石，再用鈉在真空爐還原出熱鈦錠，大部分鹽會回來。一氧化碳可以發電。',
    unlockMachines: ['vacuum_furnace'],
    unlockRecipes: ['mine_rutile', 'mine_salt', 'crush_rutile', 'electrolyze_salt', 'chlorinate_rutile', 'reduce_titanium', 'burn_co'],
  },
  {
    id: 'cryogenics', name: '低溫技術', tier: 4, cost: { data_blue: 150 }, requires: ['titanium'],
    description: '真空冷凍機把熱錠冷卻成錠。冷卻液用乙烯和鹽調配，冷卻塔回收熱冷卻液（損耗一成）。',
    unlockMachines: ['vacuum_freezer', 'cooling_tower'],
    unlockRecipes: ['make_coolant', 'freeze_titanium', 'cool_coolant'],
  },
  {
    id: 'tungsten', name: '鎢冶金', tier: 4, cost: { data_blue: 250 }, requires: ['cryogenics'],
    description: '發現黑鎢礦。鈉鹼浸、硫酸酸化（鹽會回來）、真空爐碳還原，再冷卻成鎢錠。',
    unlockRecipes: ['mine_wolframite', 'crush_wolframite', 'leach_wolframite', 'acidify_tungstate', 'reduce_tungsten', 'freeze_tungsten'],
  },
  {
    id: 'precision', name: '精密電路', tier: 4, cost: { data_blue: 300 }, requires: ['tungsten'],
    description: '提純矽晶圓、組裝精密電路，開始生產紫色科研包。',
    unlockRecipes: ['grow_wafer', 'craft_precision', 'craft_purple_pack', 'analyze_purple'],
  },
  {
    id: 'storage_5', name: '倉儲擴充 V', tier: 4, cost: { data_purple: 80 }, requires: ['precision', 'storage_4'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'large_combustion', name: '大型燃燒引擎', tier: 4, cost: { data_purple: 100 }, requires: ['precision'],
    description: '一座抵八台燃燒發電機的大型設施。燃燒發電機的生產線可以一鍵升級。',
    unlockMachines: ['large_combustion_engine'],
  },
  {
    id: 'orbital_pad', name: '軌道發射台', tier: 4, cost: { data_purple: 250 }, requires: ['precision'],
    description: '解鎖 T4 里程碑：軌道發射台。',
    unlockMilestone: 'orbital_pad',
  },
  // ---- T5 ----
  {
    id: 'orbital_launch', name: '補給火箭', tier: 5, cost: { data_purple: 150 }, requires: [], requiresMilestone: 'orbital_pad',
    description: '發射台燒火箭燃料和火箭零件，產生軌道運力。軌道上的機器都靠運力運轉。',
    unlockMachines: ['launch_pad'],
    unlockRecipes: ['mix_rocket_fuel', 'craft_rocket_part', 'launch_rocket'],
  },
  {
    id: 'ev_tech', name: 'EV 機械', tier: 5, cost: { data_purple: 200 }, requires: ['orbital_launch'],
    description: 'HV 組裝機與電弧爐可以升級成 EV。',
    unlockMachines: ['ev_assembler', 'plasma_arc_furnace'],
  },
  {
    id: 'orbital_station', name: '軌道站', tier: 5, cost: { data_purple: 200 }, requires: ['orbital_launch'],
    description: '軌道槽位 +6。軌道機器不佔地面槽位，但要靠運力。',
    orbitSlotBonus: 6,
  },
  {
    id: 'zoning_7', name: '區域規劃 VII', tier: 5, cost: { data_purple: 200 }, requires: ['ev_tech'],
    description: '區域槽位再 +30。',
    slotBonus: 30,
  },
  {
    id: 'he3_collection', name: '氦-3 收集', tier: 5, cost: { data_purple: 200 }, requires: ['orbital_station'],
    description: '在軌道上用太陽風收集器收集氦-3。',
    unlockMachines: ['solar_wind_collector'],
    unlockRecipes: ['collect_he3'],
  },
  {
    id: 'asteroid_mining', name: '小行星採礦', tier: 5, cost: { data_purple: 300 }, requires: ['orbital_station', 'ev_tech'],
    description: '在軌道上開採隕石礦。粉碎、用氯氣浸出氯化銥，再用電漿電弧爐冶煉成銥（氯氣大半會回來）。',
    unlockMachines: ['asteroid_miner'],
    unlockRecipes: ['mine_asteroid', 'crush_meteor', 'leach_meteor', 'smelt_iridium'],
  },
  {
    id: 'microgravity', name: '微重力製造', tier: 5, cost: { data_purple: 300 }, requires: ['asteroid_mining'],
    description: '軌道上的微重力工廠：晶圓加銥培育微重力晶體，乙烯紡成奈米碳管。',
    unlockMachines: ['orbital_fab'],
    unlockRecipes: ['grow_crystal', 'spin_nanotube'],
  },
  {
    id: 'yellow_science', name: '軌道科學', tier: 5, cost: { data_purple: 400 }, requires: ['microgravity', 'he3_collection'],
    description: '用微重力晶體、銥和氦-3 組裝黃色科研包（需要 EV 組裝機）。',
    unlockRecipes: ['craft_yellow_pack', 'analyze_yellow'],
  },
  {
    id: 'storage_6', name: '倉儲擴充 VI', tier: 5, cost: { data_yellow: 80 }, requires: ['yellow_science', 'storage_5'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'station_expansion', name: '軌道站擴建', tier: 5, cost: { data_yellow: 100 }, requires: ['yellow_science'],
    description: '軌道槽位再 +6。',
    orbitSlotBonus: 6,
  },
  {
    id: 'space_elevator', name: '太空電梯', tier: 5, cost: { data_yellow: 200 }, requires: ['yellow_science'],
    description: '奈米碳管纜繩直通軌道：用電力產生大量運力，不再燒火箭。',
    unlockMachines: ['space_elevator'],
    unlockRecipes: ['elevator_lift'],
  },
  {
    id: 'colony_ship', name: '殖民船', tier: 5, cost: { data_yellow: 300 }, requires: ['space_elevator'],
    description: '解鎖 T5 里程碑：殖民船。',
    unlockMilestone: 'colony_ship',
  },
  // ---- T6 ----
  {
    id: 'iv_tech', name: 'IV 機械', tier: 6, cost: { data_yellow: 300 }, requires: [], requiresMilestone: 'colony_ship',
    description: 'EV 組裝機與 HV 化學反應器可以升級成 IV。IV 機器完美超頻：每高一階速度 ×4、耗電 ×4，每個產品的耗電不變。',
    unlockMachines: ['iv_assembler', 'iv_chem_reactor'],
  },
  {
    id: 'zoning_8', name: '區域規劃 VIII', tier: 6, cost: { data_yellow: 300 }, requires: ['iv_tech'],
    description: '區域槽位再 +40。',
    slotBonus: 40,
  },
  {
    id: 'cryo_helium', name: '液氦', tier: 6, cost: { data_yellow: 300 }, requires: ['iv_tech'],
    description: '太陽風收集器也能收集氦氣；真空冷凍機把氦氣液化。',
    unlockRecipes: ['collect_helium', 'liquefy_helium'],
  },
  {
    id: 'superconductors', name: '超導體', tier: 6, cost: { data_yellow: 450 }, requires: ['cryo_helium'],
    description: '奈米碳管 + 銥，用液氦冷卻，組裝成超導線（需要 IV 組裝機）。',
    unlockRecipes: ['craft_superconductor'],
  },
  {
    id: 'deuterium_extraction', name: '氘', tier: 6, cost: { data_yellow: 300 }, requires: ['iv_tech'],
    description: '冰衛星的冰層鑽機開採彗星冰，地熱井供電；電解彗星冰得到氘和氧氣，再用貨運船運回母星。',
    unlockMachines: ['ice_drill', 'geothermal_well'],
    unlockRecipes: ['mine_ice', 'geothermal_power', 'electrolyze_ice'],
  },
  {
    id: 'colony_expansion', name: '殖民地擴建', tier: 6, cost: { data_yellow: 400 }, requires: ['deuterium_extraction'],
    description: '每個殖民地槽位 +8。',
    planetSlots: { ice: 8, lava: 8 },
  },
  {
    id: 'lava_expedition', name: '熔岩星探勘', tier: 6, cost: { data_yellow: 500 }, requires: ['colony_expansion'],
    description: '開放第二個殖民地「熔岩星」：岩漿泵抽岩漿，熔鑄廠直接鑄成鐵錠、銅錠和鎢錠，地熱井在那裡每秒發 240 電力。',
    unlockMachines: ['magma_pump', 'foundry'],
    unlockRecipes: ['pump_magma', 'magma_power', 'cast_iron', 'cast_copper', 'cast_tungsten'],
  },
  {
    id: 'fusion', name: '聚變', tier: 6, cost: { data_yellow: 750 }, requires: ['superconductors', 'deuterium_extraction'],
    description: '聚變反應爐：氘 + 氦-3 → 大量電力與氦氣。點火要先灌入每座 1000 電力/秒、持續 30 秒；斷料會冷掉。',
    unlockMachines: ['fusion_reactor'],
    unlockRecipes: ['fuse_dhe3'],
  },
  {
    id: 'storage_7', name: '倉儲擴充 VII', tier: 6, cost: { data_yellow: 300 }, requires: ['fusion', 'storage_6'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'station_expansion_2', name: '軌道站擴建 II', tier: 6, cost: { data_yellow: 350 }, requires: ['fusion', 'station_expansion'],
    description: '軌道槽位再 +12。',
    orbitSlotBonus: 12,
  },
  {
    id: 'neutron_compression', name: '中子素', tier: 6, cost: { data_yellow: 900 }, requires: ['fusion'],
    description: '中子素壓縮機：4 銥 + 1 超導線 → 中子素，每台吃 512 電力/秒。',
    unlockMachines: ['neutronium_compressor'],
    unlockRecipes: ['compress_neutronium'],
  },
  {
    id: 'dyson', name: '戴森群', tier: 6, cost: { data_yellow: 1200 }, requires: ['neutron_compression'],
    description: '微重力工廠製造戴森板。解鎖 T6 里程碑：戴森群第一段。',
    unlockRecipes: ['fab_dyson_panel'],
    unlockMilestone: 'dyson_segment',
  },
  // ---- T7 ----
  {
    id: 'swarm_deployment', name: '戴森群部署', tier: 7, cost: { data_yellow: 600 }, requires: [], requiresMilestone: 'dyson_segment',
    description: '軌道上的戴森群發射器把戴森板部署進戴森群。每片板永久提供 20 電力/秒，不佔槽位、不用燃料。',
    unlockMachines: ['swarm_launcher'],
    unlockRecipes: ['deploy_swarm'],
  },
  {
    id: 'particle_physics', name: '粒子對撞', tier: 7, cost: { data_yellow: 800 }, requires: ['swarm_deployment'],
    description: '粒子對撞機把中子素撞成奇異物質。奇異物質每秒衰變 2%，不能囤。',
    unlockMachines: ['particle_collider'],
    unlockRecipes: ['collide_neutronium'],
  },
  {
    id: 'spacetime', name: '時空穩定', tier: 7, cost: { data_yellow: 800 }, requires: ['particle_physics'],
    description: '時空穩定器：奇異物質 + 超導線 → 穩定奇異物質，不再衰變。',
    unlockMachines: ['spacetime_stabilizer'],
    unlockRecipes: ['stabilize_exotic'],
  },
  {
    id: 'white_science', name: '星際科學', tier: 7, cost: { data_yellow: 1000 }, requires: ['spacetime'],
    description: '用穩定奇異物質、中子素和超導線組裝白色科研包（IV 組裝機）。',
    unlockRecipes: ['craft_white_pack', 'analyze_white'],
  },
  {
    id: 'zoning_9', name: '區域規劃 IX', tier: 7, cost: { data_white: 200 }, requires: ['white_science'],
    description: '區域槽位再 +50。',
    slotBonus: 50,
  },
  {
    id: 'station_expansion_3', name: '軌道站擴建 III', tier: 7, cost: { data_white: 250 }, requires: ['white_science', 'station_expansion_2'],
    description: '軌道槽位再 +24。',
    orbitSlotBonus: 24,
  },
  {
    id: 'colony_expansion_2', name: '殖民地擴建 II', tier: 7, cost: { data_white: 200 }, requires: ['white_science', 'colony_expansion'],
    description: '每個殖民地槽位再 +12。',
    planetSlots: { ice: 12, lava: 12 },
  },
  {
    id: 'storage_8', name: '倉儲擴充 VIII', tier: 7, cost: { data_white: 200 }, requires: ['white_science', 'storage_7'],
    description: '所有物品容量再 ×2。',
    storageMult: 2,
  },
  {
    id: 'stargate', name: '星門', tier: 7, cost: { data_white: 800 }, requires: ['white_science'],
    description: '解鎖最終里程碑：星門。開啟它需要一個至少 600 片的戴森群。',
    unlockMilestone: 'stargate',
  },
];

export const TECHS: Record<string, TechDef> = Object.fromEntries(list.map((t) => [t.id, t]));
export const TECH_LIST = list;

/** What each tier is called in the UI */
export const TIER_NAMES = ['墜毀營地', '蒸汽時代', 'LV 電力時代', 'MV 石化時代', 'HV 冶金時代', 'EV 軌道時代', 'IV 聚變時代', '星際時代'];

export interface MilestoneDef {
  id: string;
  name: string;
  tier: number;
  description: string;
  cost: Record<string, number>;
  /** Building it also places one of this machine as a new line */
  grantsLine?: { machine: string; recipe: string };
  /** Building it also adds these items */
  grantsItems?: Record<string, number>;
  /** Must be held to build it, but is not spent */
  holds?: Record<string, number>;
  /** Shown in the celebration popup; `last` = end of the content so far, `ending` = the game is won */
  victory: { title: string; text: string; last?: boolean; ending?: boolean };
}

export const MILESTONE_LIST: MilestoneDef[] = [
  {
    id: 'blast_furnace',
    name: '高爐',
    tier: 1,
    description: '建成後送一座高爐生產線，之後也能再蓋。',
    cost: { steel: 100, stone_brick: 200, gear: 50 },
    grantsLine: { machine: 'blast_furnace', recipe: 'bf_steel' },
    victory: {
      title: '高爐點燃了',
      text: '進入 LV 電力時代。下一步：研究「電力學」與「煉焦」，高爐才能運轉。',
    },
  },
  {
    id: 'power_hub',
    name: '電力網中樞',
    tier: 2,
    description: '',
    cost: { circuit: 50, aluminum: 100, cable: 100, steel: 200 },
    victory: {
      title: '電網上線',
      text: '進入 MV 石化時代。下一步：研究「MV 機械」，再往不鏽鋼與石油前進。',
    },
  },
  {
    id: 'chem_plant',
    name: '化工廠',
    tier: 3,
    description: '建成後送一座大型化工廠（一座抵四台化學反應器）。',
    cost: { stainless: 200, plastic: 200, adv_circuit: 50, pcb: 100 },
    grantsLine: { machine: 'large_chem_plant', recipe: 'make_plastic' },
    victory: {
      title: '化工廠落成',
      text: '進入 HV 冶金時代。下一步：研究「HV 機械」。HV 機器會磨損，要準備維護套件。',
    },
  },
  {
    id: 'orbital_pad',
    name: '軌道發射台',
    tier: 4,
    description: '',
    cost: { titanium: 300, tungsten: 150, precision_circuit: 50, stainless: 400 },
    victory: {
      title: '火箭升空',
      text: '進入 EV 軌道時代。下一步：研究「補給火箭」，蓋發射台產生軌道運力，再建軌道站。',
    },
  },
  {
    id: 'colony_ship',
    name: '殖民船',
    tier: 5,
    description: '',
    cost: { nanotube: 400, iridium: 400, zg_crystal: 200, helium_3: 200, rocket_part: 80 },
    victory: {
      title: '殖民船啟航',
      text: '進入 IV 聚變時代。下一步：研究「IV 機械」。聚變爐用氘和氦-3，點火要先灌入大量電力。',
    },
  },
  {
    id: 'dyson_segment',
    name: '戴森群第一段',
    tier: 6,
    description: '建成後送 200 片戴森群，每片每秒提供 20 電力。',
    cost: { dyson_panel: 200, neutronium: 60, superconductor: 200, rocket_part: 80 },
    grantsItems: { dyson_swarm: 200 },
    victory: {
      title: '戴森群展開',
      text: '進入星際時代。200 片戴森群每秒提供 4000 電力，不用燃料。下一步：研究「戴森群部署」，把戴森群擴大到 600 片。',
    },
  },
  {
    id: 'stargate',
    name: '星門',
    tier: 7,
    description: '建成即通關，之後可以在「星系」分頁躍遷到新星系。',
    cost: { stable_exotic: 100, neutronium: 100, superconductor: 300, dyson_panel: 100 },
    holds: { dyson_swarm: 600 },
    victory: {
      title: '星門開啟',
      text: '從墜毀營地到星門，殖民地完成了。',
      last: true,
      ending: true,
    },
  },
];

export const MILESTONES: Record<string, MilestoneDef> = Object.fromEntries(MILESTONE_LIST.map((m) => [m.id, m]));

// Recipes and machines that some tech unlocks are locked until researched; everything else starts available.
export const TECH_LOCKED_RECIPES = new Set(list.flatMap((t) => t.unlockRecipes ?? []));
export const TECH_LOCKED_MACHINES = new Set(list.flatMap((t) => t.unlockMachines ?? []));
