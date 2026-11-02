import { MACHINES } from './machines';
import { RECIPES } from './recipes';
import type { GameState } from '../sim/types';

/**
 * World events: short spells that speed up or slow down part of the factory, a gift from the sky,
 * or a trader passing by. They give the player a reason to look up and react.
 */
export interface IncidentDef {
  id: string;
  name: string;
  text: string;
  /** Item whose icon stands for the event */
  icon: string;
  /** Seconds the event lasts */
  duration: number;
  tone: 'good' | 'bad';
  /** Speed multiplier for lines whose recipe is in these categories */
  boost?: Record<string, number>;
  /** Research costs are multiplied by this while it lasts */
  researchMult?: number;
  /** Relative chance among the events that can happen now */
  weight: number;
  /** Lines with machines in these categories must exist for the event to matter */
  needs?: string[];
}

export const INCIDENT_LIST: IncidentDef[] = [
  {
    id: 'rich_vein', name: '礦脈湧出', icon: 'iron_ore', duration: 120, tone: 'good', weight: 3,
    text: '一場小地震震開了淺層礦脈。採礦與抽取速度 ×2。',
    boost: { mining: 2, pumping: 2, asteroid: 2 }, needs: ['mining', 'pumping', 'asteroid'],
  },
  {
    id: 'meteor', name: '隕石雨', icon: 'meteor_ore', duration: 10, tone: 'good', weight: 2,
    text: '一陣小型隕石雨落在營地附近，無人機撿回了一大批礦石。',
  },
  {
    id: 'rhythm', name: '生產節奏', icon: 'gear', duration: 120, tone: 'good', weight: 2,
    text: '工程無人機找到了更順的排程。組裝與製作速度 ×1.5。',
    boost: { crafting: 1.5, assembling: 1.5 }, needs: ['crafting', 'assembling'],
  },
  {
    id: 'solar_flare', name: '太陽閃焰', icon: 'eu', duration: 120, tone: 'good', weight: 2,
    text: '恆星噴發出一道閃焰。太陽能板與太陽風收集器產出 ×2。',
    boost: { solar: 2, solar_wind: 2 }, needs: ['solar', 'solar_wind'],
  },
  {
    id: 'eureka', name: '靈感迸發', icon: 'data', duration: 90, tone: 'good', weight: 2,
    text: '研究團隊徹夜討論，想通了一個關鍵問題。這段時間研究成本 −25%。',
    researchMult: 0.75,
  },
  {
    id: 'trader', name: '星際商隊', icon: 'rocket_part', duration: 90, tone: 'good', weight: 2,
    text: '一支路過的商隊願意收購你倉庫裡堆最多的東西，用研究數據交換。',
  },
  {
    id: 'cold_snap', name: '寒流', icon: 'comet_ice', duration: 90, tone: 'good', weight: 1,
    text: '氣溫驟降，冷卻效率大增。真空冷凍機與冷卻塔速度 ×2。',
    boost: { freezing: 2, cooling: 2 }, needs: ['freezing', 'cooling'],
  },
  {
    id: 'dust_storm', name: '沙塵暴', icon: 'sand', duration: 60, tone: 'bad', weight: 1,
    text: '沙塵暴捲過地表，鑽頭頻頻卡住。採礦速度 ×0.6。',
    boost: { mining: 0.6 }, needs: ['mining'],
  },
  {
    id: 'heat_wave', name: '熱浪', icon: 'coal', duration: 60, tone: 'bad', weight: 1,
    text: '熱浪來襲，散熱跟不上。鍋爐與燃燒發電機出力 ×0.7。',
    boost: { burning: 0.7, combustion: 0.7 }, needs: ['burning', 'combustion'],
  },
];

export const INCIDENTS: Record<string, IncidentDef> = Object.fromEntries(INCIDENT_LIST.map((i) => [i.id, i]));

/** The first event comes after the player has had time to settle in */
export const FIRST_INCIDENT = 420;
/** Seconds between the end of one event and the start of the next */
export const INCIDENT_INTERVAL: [number, number] = [360, 720];

/** Recipe categories of lines that actually have machines */
export function runningCategories(s: GameState): Set<string> {
  const out = new Set<string>();
  for (const l of s.lines) {
    if (l.count > 0 && l.enabled && MACHINES[l.machine] && RECIPES[l.recipe]) out.add(RECIPES[l.recipe].category);
  }
  return out;
}

/** Events that would do something right now (the trader is checked separately: it needs a surplus) */
export function eligibleIncidents(s: GameState): IncidentDef[] {
  const cats = runningCategories(s);
  return INCIDENT_LIST.filter((d) => !d.needs || d.needs.some((c) => cats.has(c)));
}
