import { ITEMS, SWARM_ITEM } from '../data/items';
import { BOOST_TIME, KIT_LEVELS, LEGACY, SIGNAL_INTERVAL, SIGNAL_LIFETIME, legacyCost, warpPoints } from '../data/legacy';
import { OBJECTIVES, unclaimedObjectives } from '../data/objectives';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECH_LIST, TECHS } from '../data/tech';
import { tick } from '../sim/engine';
import { simulateOffline, type OfflineReport } from '../sim/offline';
import {
  canAfford, canBuildMilestone, canRun, capOf, currentTier, isMachineUnlocked, offlineCap, simSpeed, techCost, isRecipeUnlocked, milestoneUnlocked, slotsTotal, slotsUsed, techAvailable,
  upgradeCost, upgradeTarget,
} from '../sim/rules';
import type { GameState, TickResult } from '../sim/types';
import { clearLocal, exportString, importString, loadLocal, newGame, saveLocal } from './save';

const TICK = 0.1;
const UI_INTERVAL = 250;
const AUTOSAVE_INTERVAL = 10_000;
/** Gaps longer than this (sleep, background tab) are caught up as offline time */
const CATCH_UP_THRESHOLD = 5;
/** Only bother the player with a report for longer absences */
const REPORT_THRESHOLD = 60;

export interface UiState {
  lookupItem: string | null;
  offlineReport: OfflineReport | null;
  /** Milestone whose celebration popup is open */
  milestoneModal: string | null;
  /** The relic signal choice is open */
  signalOpen: boolean;
  toast: string | null;
}

const emptyTick = (): TickResult => ({ lines: {}, power: {}, rates: {}, vented: {}, decayed: {} });

let state: GameState = newGame();
let last: TickResult = emptyTick();
const smoothRates: Record<string, number> = {};
const ui: UiState = { lookupItem: null, offlineReport: null, milestoneModal: null, signalOpen: false, toast: null };
const listeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const getState = () => state;
export const getLast = () => last;
export const getRates = () => smoothRates;
export const getUi = () => ui;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

function toast(msg: string) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    notify();
  }, 2500);
  notify();
}

function step(dt: number) {
  last = tick(state, dt * simSpeed(state));
  state.playTime += dt;
  updateSignal();
  const alpha = 0.05;
  for (const item of Object.keys(ITEMS)) {
    const r = last.rates[item] ?? 0;
    smoothRates[item] = (smoothRates[item] ?? 0) + (r - (smoothRates[item] ?? 0)) * alpha;
  }
}

function catchUp(seconds: number) {
  // Relic boosts are for live play; legacy speed applies offline too
  const speed = simSpeed({ ...state, boostUntil: 0 });
  const report = simulateOffline(state, seconds, speed, offlineCap(state));
  if (report.last) last = report.last;
  if (seconds >= REPORT_THRESHOLD) ui.offlineReport = report;
}

// ---------- lifecycle ----------

let started = false;

export function start() {
  if (started) return;
  started = true;
  const saved = loadLocal();
  if (saved) {
    state = saved;
    catchUp((Date.now() - saved.savedAt) / 1000);
  }

  let prev = performance.now();
  let acc = 0;
  setInterval(() => {
    const now = performance.now();
    const elapsed = (now - prev) / 1000;
    prev = now;
    if (elapsed > CATCH_UP_THRESHOLD) {
      catchUp(elapsed);
      acc = 0;
      notify();
      return;
    }
    acc += elapsed;
    while (acc >= TICK) {
      step(TICK);
      acc -= TICK;
    }
  }, TICK * 1000);

  setInterval(notify, UI_INTERVAL);
  setInterval(() => saveLocal(state), AUTOSAVE_INTERVAL);
  const flush = () => saveLocal(state);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  notify();
}

// ---------- actions ----------

function pay(cost: Record<string, number>) {
  for (const [item, n] of Object.entries(cost)) state.items[item] = (state.items[item] ?? 0) - n;
}

function refund(cost: Record<string, number>, times: number) {
  for (const [item, n] of Object.entries(cost)) {
    state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) + n * times);
  }
}

export function gather(item: string) {
  if (!ITEMS[item]?.manual) return;
  const cap = capOf(state, item);
  if ((state.items[item] ?? 0) >= cap) return toast(`${ITEMS[item].name} 倉庫已滿`);
  state.items[item] = Math.min(cap, (state.items[item] ?? 0) + 1);
  notify();
}

export function addLine(machineId: string, recipeId: string) {
  const m = MACHINES[machineId];
  const r = RECIPES[recipeId];
  if (!m || !r || !canRun(m, r)) return;
  if (!isMachineUnlocked(state, machineId) || !isRecipeUnlocked(state, recipeId)) return;
  state.lines.push({ id: state.nextLineId++, machine: machineId, recipe: recipeId, count: 0, enabled: true });
  notify();
}

export function build(lineId: number, times = 1) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  const m = MACHINES[line.machine];
  const orbit = !!m.orbital;
  let built = 0;
  for (let i = 0; i < times; i++) {
    if (slotsUsed(state, orbit) + m.slots > slotsTotal(state, orbit)) {
      toast(orbit ? '軌道槽位不足' : '區域槽位不足');
      break;
    }
    if (!canAfford(state, m.cost)) {
      if (built === 0) toast('材料不足');
      break;
    }
    pay(m.cost);
    line.count++;
    built++;
    // A new reactor joins cold: the line's heat is shared, so lighting one and building ten isn't free
    if (m.ignition && line.heat) line.heat *= (line.count - 1) / line.count;
  }
  notify();
}

export function demolish(lineId: number, times = 1) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  const n = Math.min(times, line.count);
  line.count -= n;
  refund(MACHINES[line.machine].cost, n);
  notify();
}

/** Swap every machine in a line for its upgrade, paying the difference */
export function upgradeLine(lineId: number) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  const to = upgradeTarget(state, line);
  if (!to) return;
  const extraSlots = (to.slots - MACHINES[line.machine].slots) * line.count;
  const orbit = !!to.orbital;
  if (extraSlots > 0 && slotsUsed(state, orbit) + extraSlots > slotsTotal(state, orbit)) {
    return toast(orbit ? '軌道槽位不足' : '區域槽位不足');
  }
  const net = upgradeCost(line, to);
  const pays = Object.fromEntries(Object.entries(net).filter(([, n]) => n > 0));
  if (!canAfford(state, pays)) return toast('材料不足');
  pay(pays);
  for (const [item, n] of Object.entries(net)) {
    if (n < 0) state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) - n);
  }
  const fromName = MACHINES[line.machine].name;
  line.machine = to.id;
  toast(`${fromName} × ${line.count} 已升級為 ${to.name}`);
}

export function removeLine(lineId: number) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  demolish(lineId, line.count);
  state.lines = state.lines.filter((l) => l.id !== lineId);
  notify();
}

export function setRecipe(lineId: number, recipeId: string) {
  const line = state.lines.find((l) => l.id === lineId);
  const r = RECIPES[recipeId];
  if (!line || !r || !canRun(MACHINES[line.machine], r) || !isRecipeUnlocked(state, recipeId)) return;
  line.recipe = recipeId;
  notify();
}

export function toggleLine(lineId: number) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  line.enabled = !line.enabled;
  notify();
}

export function research(techId: string) {
  const t = TECHS[techId];
  if (!t || !techAvailable(state, techId)) return;
  const cost = techCost(state, techId);
  if (!canAfford(state, cost)) return toast('研究數據不足');
  pay(cost);
  state.techs.push(techId);
  toast(`研究完成：${t.name}`);
}

export function buildMilestone(id: string) {
  const ms = MILESTONES[id];
  if (!ms || state.milestones.includes(id) || !milestoneUnlocked(state, id)) return;
  if (!canBuildMilestone(state, id)) return toast('材料不足');
  pay(ms.cost);
  state.milestones.push(id);
  for (const [item, n] of Object.entries(ms.grantsItems ?? {})) state.items[item] = (state.items[item] ?? 0) + n;
  if (ms.grantsLine) {
    state.lines.push({ id: state.nextLineId++, ...ms.grantsLine, count: 1, enabled: true });
  }
  ui.milestoneModal = id;
  saveLocal(state);
  notify();
}

export function trash(item: string) {
  state.items[item] = 0;
  notify();
}

export function openLookup(item: string | null) {
  ui.lookupItem = item;
  notify();
}

/** Byproducts only: when on, a full store destroys overflow instead of stalling producers */
export function toggleVent(item: string) {
  if (ITEMS[item]?.kind !== 'byproduct') return;
  state.vent = state.vent.includes(item) ? state.vent.filter((i) => i !== item) : [...state.vent, item];
  notify();
}

export function toggleMaintenance() {
  state.maintenance = !state.maintenance;
  notify();
}

// ---------- rewards: objectives and relic signals pay in the data the current tier researches with ----------

/** The data item the current tier spends most on, and how much its research costs in total */
function tierData(s: GameState): { item: string; total: number } {
  const tier = Math.max(1, currentTier(s));
  const totals: Record<string, number> = {};
  for (const t of TECH_LIST.filter((x) => x.tier === tier)) {
    for (const [i, n] of Object.entries(techCost(s, t.id))) totals[i] = (totals[i] ?? 0) + n;
  }
  const [item, total] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return { item, total };
}

const share = (s: GameState, fraction: number) => {
  const { item, total } = tierData(s);
  return { item, n: Math.max(5, Math.round((total * fraction) / 5) * 5) };
};

/** Reward for `count` objectives: 2.5% of the tier's research each */
export function objectiveReward(s: GameState, count: number): Record<string, number> {
  const { item, n } = share(s, 0.025);
  return { [item]: n * count };
}

export function claimObjectives() {
  const pending = unclaimedObjectives(state);
  if (pending.length === 0) return;
  const reward = objectiveReward(state, pending.length);
  for (const [item, n] of Object.entries(reward)) state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) + n);
  state.claimed.push(...pending.map((i) => OBJECTIVES[i].text));
  toast(`獎勵：${Object.entries(reward).map(([i, n]) => `${ITEMS[i].name} +${n}`).join('、')}`);
}

function scheduleSignal() {
  const [lo, hi] = SIGNAL_INTERVAL;
  state.nextSignal = state.playTime + lo + Math.random() * (hi - lo);
}

function updateSignal() {
  if (state.signal !== null && state.playTime > state.signal) {
    state.signal = null;
    ui.signalOpen = false;
    scheduleSignal();
  }
  if (state.signal === null && state.playTime >= state.nextSignal) {
    state.signal = state.playTime + SIGNAL_LIFETIME;
    toast('偵測到遺物訊號！');
  }
}

/** Data a relic gives when analyzed: 4% of the tier's research */
export function signalData(s: GameState): Record<string, number> {
  const { item, n } = share(s, 0.04);
  return { [item]: n };
}

export function openSignal(open: boolean) {
  ui.signalOpen = open && state.signal !== null;
  notify();
}

export function answerSignal(choice: 'data' | 'boost') {
  if (state.signal === null) return;
  if (choice === 'data') {
    const reward = signalData(state);
    for (const [item, n] of Object.entries(reward)) state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) + n);
    toast(`解析遺物：${Object.entries(reward).map(([i, n]) => `${ITEMS[i].name} +${n}`).join('、')}`);
  } else {
    state.boostUntil = Math.max(state.boostUntil, state.playTime) + BOOST_TIME;
    toast(`時間加速 ×2，持續 ${BOOST_TIME} 秒`);
  }
  state.signal = null;
  ui.signalOpen = false;
  scheduleSignal();
}

// ---------- warp (prestige) ----------

export function buyLegacy(id: string) {
  const def = LEGACY[id];
  const level = state.legacy.upgrades[id] ?? 0;
  if (!def || level >= def.max) return;
  const cost = legacyCost(id, level);
  if (state.legacy.points < cost) return toast('遺產點數不足');
  state.legacy.points -= cost;
  state.legacy.upgrades[id] = level + 1;
  if (id === 'kit') {
    // The new kit level also arrives in the current run, so buying it right after a warp pays off at once
    for (const [item, n] of Object.entries(KIT_LEVELS[level])) {
      state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) + n);
    }
  }
  toast(`${def.name} 升到 ${level + 1} 級`);
}

/** Through the stargate: a fresh run that keeps the legacy, plus points for this one */
export function warp() {
  if (!state.milestones.includes('stargate')) return;
  const earned = warpPoints(state.items[SWARM_ITEM] ?? 0);
  const legacy = { ...state.legacy, points: state.legacy.points + earned, warps: state.legacy.warps + 1 };
  const maintenance = state.maintenance;
  state = newGame(legacy);
  state.maintenance = maintenance;
  last = emptyTick();
  for (const k of Object.keys(smoothRates)) smoothRates[k] = 0;
  ui.milestoneModal = null;
  ui.signalOpen = false;
  saveLocal(state);
  toast(`躍遷完成：抵達第 ${legacy.warps + 1} 個星系，獲得 ${earned} 遺產點`);
}

export function closeOfflineReport() {
  ui.offlineReport = null;
  notify();
}

export function closeMilestoneModal() {
  ui.milestoneModal = null;
  notify();
}

export function exportSave(): string {
  return exportString(state);
}

export function importSave(text: string): boolean {
  const s = importString(text);
  if (!s) return false;
  state = s;
  last = emptyTick();
  saveLocal(state);
  toast('已匯入存檔');
  return true;
}

/** Start this run over; the legacy from earlier warps is kept */
export function resetGame() {
  clearLocal();
  state = newGame(state.legacy);
  last = emptyTick();
  for (const k of Object.keys(smoothRates)) smoothRates[k] = 0;
  saveLocal(state);
  toast('已重新開始');
}
