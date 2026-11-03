import type { GameState } from '../sim/types';

export interface Objective {
  /** Shown in the objective bar; also the key that marks it claimed in the save */
  text: string;
  done: (s: GameState) => boolean;
  /** Tutorial steps before the research station pay only a token reward, so the first research still needs one */
  minor?: boolean;
  /** What the step is about, so the objective bar can take the player there */
  go?: { tech?: string; milestone?: string; machine?: string; recipe?: string };
}

const has = (s: GameState, machine: string, recipe?: string) =>
  s.lines.some((l) => l.machine === machine && l.count > 0 && (!recipe || l.recipe === recipe));

export const OBJECTIVES: Objective[] = [
  { text: '手動採集 10 個石頭', done: (s) => (s.items.stone ?? 0) >= 10 || s.lines.length > 0, minor: true },
  { text: '新增「石爐」生產線並建造一座', done: (s) => has(s, 'stone_furnace'), minor: true, go: { machine: 'stone_furnace' } },
  { text: '採集鐵礦與煤，讓石爐冶煉出 5 個鐵錠', done: (s) => (s.items.iron_ingot ?? 0) >= 5 || has(s, 'basic_drill'), minor: true },
  { text: '建造簡易鑽機，讓採礦自動化', done: (s) => has(s, 'basic_drill'), minor: true, go: { machine: 'basic_drill' } },
  { text: '建造組裝台，生產齒輪與銅線', done: (s) => has(s, 'workbench'), minor: true, go: { machine: 'workbench' } },
  { text: '組裝紅色科研包，並建造研究站分析它', done: (s) => has(s, 'research_station'), go: { machine: 'research_station' } },
  { text: '在「研究」分頁研究「蒸汽動力」', done: (s) => s.techs.includes('steam_power'), go: { tech: 'steam_power' } },
  { text: '建造蒸汽鍋爐，再用蒸汽鑽機加速採礦', done: (s) => has(s, 'steam_drill'), go: { machine: 'steam_drill' } },
  { text: '研究「壓縮技術」開始煉鋼（小心爐渣塞滿）', done: (s) => has(s, 'steam_press', 'press_steel'), go: { machine: 'steam_press', recipe: 'press_steel' } },
  { text: '研究「高爐」', done: (s) => s.techs.includes('blast_furnace'), go: { tech: 'blast_furnace' } },
  { text: '在「巨構」分頁建成高爐', done: (s) => s.milestones.includes('blast_furnace'), go: { milestone: 'blast_furnace' } },
  { text: '研究「電力學」與「煉焦」', done: (s) => s.techs.includes('electricity') && s.techs.includes('coking'), go: { tech: 'coking' } },
  { text: '蓋蒸汽渦輪供電、焦爐產焦炭，讓高爐開始煉鋼', done: (s) => has(s, 'steam_turbine') && has(s, 'coke_oven'), go: { machine: 'steam_turbine' } },
  { text: '研究「礦物處理」與「電解」，開始生產鋁', done: (s) => has(s, 'lv_electrolyzer'), go: { machine: 'lv_electrolyzer' } },
  { text: '用 LV 混合機把煤焦油和氧氣合成橡膠', done: (s) => has(s, 'lv_mixer'), go: { machine: 'lv_mixer' } },
  { text: '研究「基礎電路」，用 LV 組裝機做出綠色科研包', done: (s) => has(s, 'lv_assembler', 'craft_green_pack'), go: { machine: 'lv_assembler', recipe: 'craft_green_pack' } },
  { text: '研究「電力網中樞」', done: (s) => s.techs.includes('power_hub'), go: { tech: 'power_hub' } },
  { text: '在「巨構」分頁建成電力網中樞', done: (s) => s.milestones.includes('power_hub'), go: { milestone: 'power_hub' } },
  { text: '研究「MV 機械」，用電動鑽機開採鉻鐵礦', done: (s) => has(s, 'electric_drill', 'mine_chromite'), go: { machine: 'electric_drill', recipe: 'mine_chromite' } },
  { text: '用 MV 電解槽電解鉻鐵粉得到鉻', done: (s) => has(s, 'mv_electrolyzer', 'electrolyze_chromite'), go: { machine: 'mv_electrolyzer', recipe: 'electrolyze_chromite' } },
  { text: '研究「不鏽鋼」，用電弧爐冶煉不鏽鋼', done: (s) => has(s, 'arc_furnace', 'arc_stainless'), go: { machine: 'arc_furnace', recipe: 'arc_stainless' } },
  { text: '研究「石油探勘」，蓋抽油機和分餾塔', done: (s) => has(s, 'distillation_tower'), go: { machine: 'distillation_tower' } },
  { text: '研究「石油化工」，用化學反應器做塑膠', done: (s) => has(s, 'chem_reactor', 'make_plastic'), go: { machine: 'chem_reactor', recipe: 'make_plastic' } },
  { text: '研究「硫酸」與「進階電路」，做出藍色科研包', done: (s) => has(s, 'mv_assembler', 'craft_blue_pack'), go: { machine: 'mv_assembler', recipe: 'craft_blue_pack' } },
  { text: '研究「化工廠」', done: (s) => s.techs.includes('chem_plant'), go: { tech: 'chem_plant' } },
  { text: '在「巨構」分頁建成化工廠', done: (s) => s.milestones.includes('chem_plant'), go: { milestone: 'chem_plant' } },
  { text: '研究「HV 機械」，用化學反應器把重油調成潤滑油', done: (s) => s.lines.some((l) => l.recipe === 'make_lubricant' && l.count > 0), go: { recipe: 'make_lubricant' } },
  { text: '組裝維護套件：HV 機器沒有它會慢慢磨損', done: (s) => s.lines.some((l) => l.recipe === 'craft_kit' && l.count > 0), go: { recipe: 'craft_kit' } },
  { text: '研究「鈦冶金」，電解鹽得到鈉和氯氣', done: (s) => s.lines.some((l) => l.recipe === 'electrolyze_salt' && l.count > 0), go: { recipe: 'electrolyze_salt' } },
  { text: '用 HV 化學反應器氯化金紅石', done: (s) => has(s, 'hv_chem_reactor', 'chlorinate_rutile'), go: { machine: 'hv_chem_reactor', recipe: 'chlorinate_rutile' } },
  { text: '用真空爐把四氯化鈦還原成熱鈦錠', done: (s) => has(s, 'vacuum_furnace', 'reduce_titanium'), go: { machine: 'vacuum_furnace', recipe: 'reduce_titanium' } },
  { text: '研究「低溫技術」，用真空冷凍機冷卻熱鈦錠', done: (s) => has(s, 'vacuum_freezer', 'freeze_titanium'), go: { machine: 'vacuum_freezer', recipe: 'freeze_titanium' } },
  { text: '蓋冷卻塔回收熱冷卻液', done: (s) => has(s, 'cooling_tower'), go: { machine: 'cooling_tower' } },
  { text: '研究「鎢冶金」，煉出鎢錠', done: (s) => has(s, 'vacuum_freezer', 'freeze_tungsten'), go: { machine: 'vacuum_freezer', recipe: 'freeze_tungsten' } },
  { text: '研究「精密電路」，做出紫色科研包', done: (s) => has(s, 'hv_assembler', 'craft_purple_pack'), go: { machine: 'hv_assembler', recipe: 'craft_purple_pack' } },
  { text: '研究「軌道發射台」', done: (s) => s.techs.includes('orbital_pad'), go: { tech: 'orbital_pad' } },
  { text: '在「巨構」分頁建成軌道發射台', done: (s) => s.milestones.includes('orbital_pad'), go: { milestone: 'orbital_pad' } },
  { text: '研究「補給火箭」，調配火箭燃料、組裝火箭零件', done: (s) => s.lines.some((l) => l.recipe === 'craft_rocket_part' && l.count > 0), go: { recipe: 'craft_rocket_part' } },
  { text: '蓋發射台：火箭提供軌道運力', done: (s) => has(s, 'launch_pad'), go: { machine: 'launch_pad' } },
  { text: '研究「軌道站」，在軌道上蓋太陽風收集器收集氦-3', done: (s) => has(s, 'solar_wind_collector'), go: { machine: 'solar_wind_collector' } },
  { text: '研究「EV 機械」與「小行星採礦」，蓋小行星採礦機', done: (s) => has(s, 'asteroid_miner'), go: { machine: 'asteroid_miner' } },
  { text: '用電漿電弧爐冶煉銥', done: (s) => has(s, 'plasma_arc_furnace', 'smelt_iridium'), go: { machine: 'plasma_arc_furnace', recipe: 'smelt_iridium' } },
  { text: '研究「微重力製造」，在軌道上培育微重力晶體', done: (s) => has(s, 'orbital_fab', 'grow_crystal'), go: { machine: 'orbital_fab', recipe: 'grow_crystal' } },
  { text: '研究「軌道科學」，用 EV 組裝機做出黃色科研包', done: (s) => has(s, 'ev_assembler', 'craft_yellow_pack'), go: { machine: 'ev_assembler', recipe: 'craft_yellow_pack' } },
  { text: '紡製奈米碳管，研究並蓋起太空電梯', done: (s) => has(s, 'space_elevator'), go: { machine: 'space_elevator' } },
  { text: '研究「殖民船」', done: (s) => s.techs.includes('colony_ship'), go: { tech: 'colony_ship' } },
  { text: '在「巨構」分頁建成殖民船', done: (s) => s.milestones.includes('colony_ship'), go: { milestone: 'colony_ship' } },
  { text: '研究「IV 機械」，把 EV 組裝機升級成 IV（完美超頻）', done: (s) => has(s, 'iv_assembler'), go: { machine: 'iv_assembler' } },
  { text: '研究「液氦」，在軌道上收集氦氣', done: (s) => has(s, 'solar_wind_collector', 'collect_helium'), go: { machine: 'solar_wind_collector', recipe: 'collect_helium' } },
  { text: '用真空冷凍機把氦氣液化', done: (s) => has(s, 'vacuum_freezer', 'liquefy_helium'), go: { machine: 'vacuum_freezer', recipe: 'liquefy_helium' } },
  { text: '研究「超導體」，用 IV 組裝機組裝超導線', done: (s) => has(s, 'iv_assembler', 'craft_superconductor'), go: { machine: 'iv_assembler', recipe: 'craft_superconductor' } },
  { text: '研究「氘」，開採彗星冰並電解出氘', done: (s) => s.lines.some((l) => l.recipe === 'electrolyze_ice' && l.count > 0), go: { recipe: 'electrolyze_ice' } },
  { text: '研究「聚變」，蓋聚變反應爐', done: (s) => has(s, 'fusion_reactor'), go: { machine: 'fusion_reactor' } },
  { text: '點燃聚變反應爐：點火要先灌入大量電力', done: (s) => s.lines.some((l) => l.machine === 'fusion_reactor' && (l.heat ?? 0) >= 1), go: { machine: 'fusion_reactor' } },
  { text: '研究「中子素」，蓋中子素壓縮機', done: (s) => has(s, 'neutronium_compressor'), go: { machine: 'neutronium_compressor' } },
  { text: '研究「戴森群」，在軌道上製造戴森板', done: (s) => has(s, 'orbital_fab', 'fab_dyson_panel'), go: { machine: 'orbital_fab', recipe: 'fab_dyson_panel' } },
  { text: '在「巨構」分頁建成戴森群第一段', done: (s) => s.milestones.includes('dyson_segment'), go: { milestone: 'dyson_segment' } },
  { text: '研究「戴森群部署」，在軌道上蓋戴森群發射器', done: (s) => has(s, 'swarm_launcher'), go: { machine: 'swarm_launcher' } },
  { text: '把戴森群擴大到 300 片：每片永久提供 20 電力/秒', done: (s) => (s.items.dyson_swarm ?? 0) >= 300, go: { machine: 'swarm_launcher' } },
  { text: '研究「粒子對撞」，把中子素撞成奇異物質', done: (s) => has(s, 'particle_collider'), go: { machine: 'particle_collider' } },
  { text: '研究「時空穩定」，趕在奇異物質衰變前把它穩定下來', done: (s) => has(s, 'spacetime_stabilizer'), go: { machine: 'spacetime_stabilizer' } },
  { text: '研究「星際科學」，組裝白色科研包', done: (s) => has(s, 'iv_assembler', 'craft_white_pack'), go: { machine: 'iv_assembler', recipe: 'craft_white_pack' } },
  { text: '研究「星門」', done: (s) => s.techs.includes('stargate'), go: { tech: 'stargate' } },
  { text: '把戴森群擴大到 600 片', done: (s) => (s.items.dyson_swarm ?? 0) >= 600, go: { machine: 'swarm_launcher' } },
  { text: '在「巨構」分頁建成星門', done: (s) => s.milestones.includes('stargate'), go: { milestone: 'stargate' } },
];

/** Index of the step to show: the first unfinished one after the furthest finished, so skipped early steps don't hold it back */
export function currentObjective(s: GameState): number {
  const furthest = OBJECTIVES.reduce((hi, st, i) => (st.done(s) ? i : hi), -1);
  return OBJECTIVES.findIndex((st, i) => i > furthest && !st.done(s));
}

/** Finished steps whose reward hasn't been collected */
export function unclaimedObjectives(s: GameState): number[] {
  return OBJECTIVES.flatMap((o, i) => (o.done(s) && !s.claimed.includes(o.text) ? [i] : []));
}
