import { LEGACY_LIST } from './legacy';
import { MACHINES } from './machines';
import { RECIPES } from './recipes';
import { MILESTONE_LIST, TECH_LIST } from './tech';
import { capOf } from '../sim/rules';
import type { GameState, TickResult } from '../sim/types';
import { ITEMS } from './items';

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  /** Item whose icon stands for it */
  icon: string;
  group: string;
  /** Kept secret until unlocked */
  hidden?: boolean;
  done: (s: GameState, last: TickResult) => boolean;
  /** For counting goals: how far along the player is, and the target */
  progress?: (s: GameState) => [number, number];
}

const produced = (s: GameState, id: string) => s.stats.produced[id] ?? 0;
const machines = (s: GameState) => s.lines.reduce((n, l) => n + l.count, 0);
const has = (s: GameState, ms: string) => s.milestones.includes(ms);

const MILESTONE_ICONS: Record<string, string> = {
  blast_furnace: 'steel', power_hub: 'eu', chem_plant: 'plastic', orbital_pad: 'rocket_part',
  colony_ship: 'rocket_fuel', dyson_segment: 'dyson_swarm', stargate: 'exotic_matter',
};

/** A goal of reaching `n` on some count: done and progress from the same number */
const counter = (get: (s: GameState) => number, n: number) => ({
  done: (s: GameState) => get(s) >= n,
  progress: (s: GameState): [number, number] => [Math.min(n, get(s)), n],
});

const made = (id: string, item: string, n: number, name: string, text: string): AchievementDef => ({
  id, name, text, icon: item, group: '生產', ...counter((s) => produced(s, item), n),
});

export const ACHIEVEMENT_LIST: AchievementDef[] = [
  // 開拓
  { id: 'gather_1', name: '第一塊石頭', text: '手動採集 1 次。', icon: 'stone', group: '開拓', ...counter((s) => s.stats.gathered, 1) },
  { id: 'gather_100', name: '勤勞的雙手', text: '手動採集 100 次。', icon: 'iron_ore', group: '開拓', ...counter((s) => s.stats.gathered, 100) },
  { id: 'gather_1000', name: '人力礦場', text: '手動採集 1,000 次。', icon: 'coal', group: '開拓', ...counter((s) => s.stats.gathered, 1000) },
  { id: 'build_1', name: '第一台機器', text: '建造 1 台機器。', icon: 'gear', group: '開拓', ...counter((s) => s.stats.built, 1) },
  { id: 'build_25', name: '小型工坊', text: '累計建造 25 台機器。', icon: 'iron_ingot', group: '開拓', ...counter((s) => s.stats.built, 25) },
  { id: 'build_100', name: '工業區', text: '累計建造 100 台機器。', icon: 'steel', group: '開拓', ...counter((s) => s.stats.built, 100) },
  { id: 'build_500', name: '機械之海', text: '累計建造 500 台機器。', icon: 'stainless', group: '開拓', ...counter((s) => s.stats.built, 500) },
  { id: 'lines_10', name: '生產網', text: '同時擁有 10 條生產線。', icon: 'copper_wire', group: '開拓', ...counter((s) => s.lines.length, 10) },
  { id: 'lines_25', name: '複雜系統', text: '同時擁有 25 條生產線。', icon: 'cable', group: '開拓', ...counter((s) => s.lines.length, 25) },
  { id: 'machines_100', name: '百機齊鳴', text: '同時運轉 100 台機器。', icon: 'circuit', group: '開拓', ...counter((s) => machines(s), 100) },
  { id: 'lines_50', name: '龐然巨物', text: '同時擁有 50 條生產線。', icon: 'pcb', group: '開拓', ...counter((s) => s.lines.length, 50) },
  { id: 'machines_300', name: '千軍萬馬', text: '同時運轉 300 台機器。', icon: 'adv_circuit', group: '開拓', ...counter((s) => machines(s), 300) },

  // 生產
  made('iron_1k', 'iron_ingot', 1000, '鐵器時代', '累計生產 1,000 鐵錠。'),
  made('steel_10k', 'steel', 10000, '鋼鐵洪流', '累計生產 10,000 鋼。'),
  made('circuit_1k', 'circuit', 1000, '電路之心', '累計生產 1,000 基礎電路。'),
  made('plastic_5k', 'plastic', 5000, '塑膠星球', '累計生產 5,000 塑膠。'),
  made('titanium_1k', 'titanium', 1000, '輕而堅固', '累計生產 1,000 鈦錠。'),
  made('precision_500', 'precision_circuit', 500, '精密工藝', '累計生產 500 精密電路。'),
  made('rocket_100', 'rocket_part', 100, '升空準備', '累計生產 100 火箭零件。'),
  made('super_500', 'superconductor', 500, '零電阻', '累計生產 500 超導線。'),
  made('dyson_1k', 'dyson_panel', 1000, '遮蔽恆星', '累計生產 1,000 戴森板。'),
  made('exotic_100', 'stable_exotic', 100, '不該存在的物質', '累計生產 100 穩定奇異物質。'),

  // 科技
  { id: 'research_1', name: '求知', text: '完成 1 項研究。', icon: 'red_pack', group: '科技', ...counter((s) => s.techs.length, 1) },
  { id: 'research_10', name: '實驗室日常', text: '完成 10 項研究。', icon: 'green_pack', group: '科技', ...counter((s) => s.techs.length, 10) },
  { id: 'research_40', name: '科技樹過半', text: '完成 40 項研究。', icon: 'blue_pack', group: '科技', ...counter((s) => s.techs.length, 40) },
  {
    id: 'research_all', name: '全知', text: '在同一輪完成所有研究。', icon: 'white_pack', group: '科技',
    ...counter((s) => s.techs.length, TECH_LIST.length),
  },
  {
    id: 'overclock', name: '超頻玩家', text: '讓一條生產線超頻 ×4 以上。', icon: 'eu', group: '科技',
    done: (s) => s.lines.some((l) => l.count > 0 && MACHINES[l.machine] && RECIPES[l.recipe] && MACHINES[l.machine].tier - RECIPES[l.recipe].tier >= 2),
  },
  {
    id: 'perfect', name: '完美超頻', text: '建造一台具備完美超頻的機器。', icon: 'neutronium', group: '科技',
    done: (s) => s.lines.some((l) => l.count > 0 && MACHINES[l.machine]?.perfectOC),
  },
  {
    id: 'power_1k', name: '點亮殖民地', text: '電網供應達到 1,000 EU/s，且滿足所有需求。', icon: 'eu', group: '科技',
    done: (_s, last) => (last.power.eu?.supply ?? 0) >= 1000 && (last.power.eu?.satisfaction ?? 0) >= 0.999,
  },

  // 巨構
  ...MILESTONE_LIST.map((m) => ({
    id: `ms_${m.id}`, name: `建成${m.name}`, text: `建造巨構「${m.name}」。`, icon: MILESTONE_ICONS[m.id] ?? 'stone_brick', group: '巨構',
    done: (s: GameState) => has(s, m.id),
  })),
  {
    id: 'fast_furnace', name: '急行軍', text: '開局 45 分鐘內建成高爐。', icon: 'steel', group: '巨構', hidden: true,
    done: (s) => has(s, 'blast_furnace') && s.playTime < 2700,
  },
  {
    id: 'fast_gate', name: '光速文明', text: '開局 8 小時內建成星門。', icon: 'exotic_matter', group: '巨構', hidden: true,
    done: (s) => has(s, 'stargate') && s.playTime < 8 * 3600,
  },

  // 星海
  { id: 'signal_1', name: '第一次接觸', text: '回應 1 次遺物訊號。', icon: 'exotic_matter', group: '星海', ...counter((s) => s.stats.signals, 1) },
  { id: 'signal_10', name: '遺物獵人', text: '回應 10 次遺物訊號。', icon: 'stable_exotic', group: '星海', ...counter((s) => s.stats.signals, 10) },
  { id: 'incident_10', name: '見過世面', text: '經歷 10 次星球事件。', icon: 'meteor_ore', group: '星海', ...counter((s) => s.stats.incidents, 10) },
  { id: 'signal_50', name: '解謎者', text: '回應 50 次遺物訊號。', icon: 'zg_crystal', group: '星海', ...counter((s) => s.stats.signals, 50) },
  { id: 'incident_50', name: '風雨無阻', text: '經歷 50 次星球事件。', icon: 'comet_ice', group: '星海', ...counter((s) => s.stats.incidents, 50) },
  { id: 'swarm_1000', name: '恆星的冠冕', text: '把戴森群擴大到 1,000 片。', icon: 'dyson_swarm', group: '星海', ...counter((s) => s.items.dyson_swarm ?? 0, 1000) },
  { id: 'trade_5', name: '星際商人', text: '與商隊交易 5 次。', icon: 'rocket_part', group: '星海', ...counter((s) => s.stats.trades, 5) },
  { id: 'warp_1', name: '越過地平線', text: '躍遷 1 次。', icon: 'dyson_swarm', group: '星海', ...counter((s) => s.legacy.warps, 1) },
  { id: 'warp_5', name: '星系旅人', text: '躍遷 5 次。', icon: 'dyson_panel', group: '星海', ...counter((s) => s.legacy.warps, 5) },
  { id: 'warp_10', name: '銀河漫遊者', text: '躍遷 10 次。', icon: 'stable_exotic', group: '星海', ...counter((s) => s.legacy.warps, 10) },
  {
    id: 'legacy_max', name: '傳承大師', text: '把任一項星際遺產升到滿級。', icon: 'white_pack', group: '星海',
    done: (s) => LEGACY_LIST.some((l) => (s.legacy.upgrades[l.id] ?? 0) >= l.max),
  },
  {
    id: 'hoarder', name: '囤積狂', text: '把一種中間產物堆滿倉庫。', icon: 'iron_ingot', group: '星海', hidden: true,
    done: (s) => Object.entries(s.items).some(([id, n]) => ITEMS[id]?.kind === 'intermediate' && n >= capOf(s, id) - 1e-6),
  },
];

export const ACHIEVEMENTS: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENT_LIST.map((a) => [a.id, a]));
