import { ACHIEVEMENT_LIST } from '../data/achievements';
import { GALAXIES, rollGalaxy } from '../data/galaxies';
import { INCIDENT_INTERVAL, eligibleIncidents } from '../data/incidents';
import { ITEMS, SWARM_ITEM, isPower } from '../data/items';
import { BOOST_TIME, KIT_LEVELS, LEGACY, SIGNAL_INTERVAL, SIGNAL_LIFETIME, legacyCost, warpPoints } from '../data/legacy';
import { OBJECTIVES, unclaimedObjectives } from '../data/objectives';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECH_LIST, TECHS } from '../data/tech';
import { tick } from '../sim/engine';
import { simulateOffline, type OfflineReport } from '../sim/offline';
import {
  activeIncident, canAfford, canBuildMilestone, canRun, capOf, currentTier, isMachineUnlocked, offlineCap, simSpeed, techCost, isRecipeUnlocked, milestoneUnlocked, slotsTotal, slotsUsed, techAvailable,
  upgradeCost, upgradeTarget,
} from '../sim/rules';
import type { GameState, TickResult } from '../sim/types';
import { emit, type GameEvent } from './events';
import { clearLocal, exportString, importString, loadLocal, newGame, saveLocal } from './save';

const TICK = 0.1;
const UI_INTERVAL = 250;
const AUTOSAVE_INTERVAL = 10_000;
/** Gaps longer than this (sleep, background tab) are caught up as offline time */
const CATCH_UP_THRESHOLD = 5;
/** Only bother the player with a report for longer absences */
const REPORT_THRESHOLD = 60;
/** Seconds of play between samples of the production history */
const HISTORY_STEP = 5;
/** Samples kept: 15 minutes */
const HISTORY_LENGTH = 180;
const LOG_LENGTH = 60;

export type ToastTone = 'info' | 'good' | 'bad' | 'achievement';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** Item whose icon goes with it */
  icon?: string;
  /** Small heading above the text */
  title?: string;
}

export interface LogEntry {
  /** playTime when it happened */
  t: number;
  text: string;
  icon?: string;
  tone: ToastTone;
}

export interface HistorySample {
  t: number;
  rates: Record<string, number>;
  power: Record<string, { supply: number; demand: number }>;
}

export interface UiState {
  lookupItem: string | null;
  offlineReport: OfflineReport | null;
  /** Milestone whose celebration popup is open */
  milestoneModal: string | null;
  /** The relic signal choice is open */
  signalOpen: boolean;
  /** The current world event's window is open (with the trader's offer, if it is one) */
  tradeOpen: boolean;
  /** First launch: the crash-landing story */
  intro: boolean;
  toasts: Toast[];
  /** Recent notable happenings, newest first */
  log: LogEntry[];
}

const emptyTick = (): TickResult => ({ lines: {}, power: {}, rates: {}, vented: {}, decayed: {} });

let state: GameState = newGame();
let last: TickResult = emptyTick();
const smoothRates: Record<string, number> = {};
const ui: UiState = {
  lookupItem: null, offlineReport: null, milestoneModal: null, signalOpen: false, tradeOpen: false, intro: false, toasts: [], log: [],
};
const listeners = new Set<() => void>();
const history: HistorySample[] = [];
let nextToastId = 1;
let historyAcc = 0;
let achievementAcc = 0;

export const getState = () => state;
export const getLast = () => last;
export const getRates = () => smoothRates;
export const getUi = () => ui;
export const getHistory = () => history;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

interface ToastOpts {
  tone?: ToastTone;
  icon?: string;
  title?: string;
  /** Also keep it in the log */
  log?: boolean;
  sound?: GameEvent;
}

function toast(text: string, { tone = 'info', icon, title, log, sound }: ToastOpts = {}) {
  const id = nextToastId++;
  ui.toasts = [...ui.toasts.slice(-3), { id, text, tone, icon, title }];
  if (log) addLog(title ? `${title}：${text}` : text, tone, icon);
  if (sound) emit(sound);
  else if (tone === 'bad') emit('error');
  setTimeout(() => dismissToast(id), tone === 'achievement' ? 5000 : tone === 'bad' ? 2200 : 3200);
  notify();
}

export function dismissToast(id: number) {
  ui.toasts = ui.toasts.filter((x) => x.id !== id);
  notify();
}

function addLog(text: string, tone: ToastTone = 'info', icon?: string) {
  ui.log = [{ t: state.playTime, text, icon, tone }, ...ui.log].slice(0, LOG_LENGTH);
}

function step(dt: number) {
  const simDt = dt * simSpeed(state);
  last = tick(state, simDt);
  state.playTime += dt;
  countProduced(last, simDt);
  updateSignal();
  updateIncident();
  const alpha = 0.05;
  for (const item of Object.keys(ITEMS)) {
    const r = last.rates[item] ?? 0;
    smoothRates[item] = (smoothRates[item] ?? 0) + (r - (smoothRates[item] ?? 0)) * alpha;
  }
  historyAcc += dt;
  if (historyAcc >= HISTORY_STEP) {
    historyAcc = 0;
    sampleHistory();
  }
  achievementAcc += dt;
  if (achievementAcc >= 1) {
    achievementAcc = 0;
    checkAchievements();
  }
}

/** Lifetime production: what machines made this tick */
function countProduced(res: TickResult, simDt: number) {
  const produced = state.stats.produced;
  for (const l of state.lines) {
    const st = res.lines[l.id];
    if (!st || st.craftsPerSec <= 0) continue;
    for (const [item, n] of Object.entries(RECIPES[l.recipe]?.outputs ?? {})) {
      if (!isPower(item)) produced[item] = (produced[item] ?? 0) + st.craftsPerSec * simDt * n;
    }
  }
}

function sampleHistory() {
  const rates: Record<string, number> = {};
  for (const [item, r] of Object.entries(smoothRates)) if (Math.abs(r) >= 0.005) rates[item] = r;
  const power: HistorySample['power'] = {};
  for (const [item, p] of Object.entries(last.power)) power[item] = { supply: p.supply, demand: p.demand };
  history.push({ t: state.playTime, rates, power });
  if (history.length > HISTORY_LENGTH) history.shift();
}

/** Unlock what has been earned; `quiet` grants without fanfare (loading a save that already earned them) */
export function checkAchievements(quiet = false) {
  for (const a of ACHIEVEMENT_LIST) {
    if (state.achievements.includes(a.id) || !a.done(state, last)) continue;
    state.achievements.push(a.id);
    if (!quiet) toast(a.name, { tone: 'achievement', icon: a.icon, title: '成就解鎖', log: true, sound: 'achievement' });
  }
}

function catchUp(seconds: number) {
  // Relic boosts are for live play; legacy speed applies offline too
  const speed = simSpeed({ ...state, boostUntil: 0 });
  const report = simulateOffline(state, seconds, speed, offlineCap(state));
  if (report.last) last = report.last;
  for (const [item, d] of Object.entries(report.changes)) {
    if (d > 0 && !isPower(item)) state.stats.produced[item] = (state.stats.produced[item] ?? 0) + d;
  }
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
    checkAchievements(true);
    catchUp((Date.now() - saved.savedAt) / 1000);
  } else {
    ui.intro = true;
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
  if ((state.items[item] ?? 0) >= cap) return toast(`${ITEMS[item].name} 倉庫已滿`, { tone: 'bad', icon: item });
  state.items[item] = Math.min(cap, (state.items[item] ?? 0) + 1);
  state.stats.gathered++;
  emit('gather');
  notify();
}

export function addLine(machineId: string, recipeId: string) {
  const m = MACHINES[machineId];
  const r = RECIPES[recipeId];
  if (!m || !r || !canRun(m, r)) return;
  if (!isMachineUnlocked(state, machineId) || !isRecipeUnlocked(state, recipeId)) return;
  state.lines.push({ id: state.nextLineId++, machine: machineId, recipe: recipeId, count: 0, enabled: true });
  emit('click');
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
      toast(orbit ? '軌道槽位不足' : '區域槽位不足', { tone: 'bad' });
      break;
    }
    if (!canAfford(state, m.cost)) {
      if (built === 0) toast('材料不足', { tone: 'bad' });
      break;
    }
    pay(m.cost);
    line.count++;
    built++;
    // A new reactor joins cold: the line's heat is shared, so lighting one and building ten isn't free
    if (m.ignition && line.heat) line.heat *= (line.count - 1) / line.count;
  }
  state.stats.built += built;
  if (built > 0) emit('build');
  notify();
}

export function demolish(lineId: number, times = 1) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  const n = Math.min(times, line.count);
  line.count -= n;
  refund(MACHINES[line.machine].cost, n);
  if (n > 0) emit('demolish');
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
    return toast(orbit ? '軌道槽位不足' : '區域槽位不足', { tone: 'bad' });
  }
  const net = upgradeCost(line, to);
  const pays = Object.fromEntries(Object.entries(net).filter(([, n]) => n > 0));
  if (!canAfford(state, pays)) return toast('材料不足', { tone: 'bad' });
  pay(pays);
  for (const [item, n] of Object.entries(net)) {
    if (n < 0) state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) - n);
  }
  const fromName = MACHINES[line.machine].name;
  line.machine = to.id;
  toast(`${fromName} × ${line.count} 已升級為 ${to.name}`, { tone: 'good', sound: 'build', log: true });
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
  emit('click');
  notify();
}

export function research(techId: string) {
  const t = TECHS[techId];
  if (!t || !techAvailable(state, techId)) return;
  const cost = techCost(state, techId);
  if (!canAfford(state, cost)) return toast('研究數據不足', { tone: 'bad' });
  pay(cost);
  state.techs.push(techId);
  toast(t.name, { tone: 'good', title: '研究完成', icon: Object.keys(cost)[0], log: true, sound: 'research' });
  checkAchievements();
}

export function buildMilestone(id: string) {
  const ms = MILESTONES[id];
  if (!ms || state.milestones.includes(id) || !milestoneUnlocked(state, id)) return;
  if (!canBuildMilestone(state, id)) return toast('材料不足', { tone: 'bad' });
  pay(ms.cost);
  state.milestones.push(id);
  if (id === 'stargate') state.stats.bestGate = Math.min(state.stats.bestGate ?? Infinity, state.playTime);
  addLog(`巨構建成：${ms.name}`, 'good');
  emit('milestone');
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
  emit('demolish');
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
  toast(Object.entries(reward).map(([i, n]) => `${ITEMS[i].name} +${n}`).join('、'), {
    tone: 'good', title: '目標獎勵', icon: Object.keys(reward)[0], sound: 'reward',
  });
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
    toast('點上方的「遺物訊號」回應它', { title: '偵測到遺物訊號', icon: 'exotic_matter', sound: 'signal', log: true });
  }
}

/** Data a relic gives when analyzed: 4% of the tier's research */
export function signalData(s: GameState): Record<string, number> {
  const { item, n } = share(s, 0.04 * ((s.galaxy && GALAXIES[s.galaxy]?.signalMult) || 1));
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
    toast(Object.entries(reward).map(([i, n]) => `${ITEMS[i].name} +${n}`).join('、'), {
      tone: 'good', title: '解析遺物', icon: Object.keys(reward)[0], sound: 'reward', log: true,
    });
  } else {
    state.boostUntil = Math.max(state.boostUntil, state.playTime) + BOOST_TIME;
    toast(`整座工廠 ×2，持續 ${BOOST_TIME} 秒`, { tone: 'good', title: '時間加速', icon: 'eu', sound: 'reward', log: true });
  }
  state.stats.signals++;
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
  if (state.legacy.points < cost) return toast('遺產點數不足', { tone: 'bad' });
  state.legacy.points -= cost;
  state.legacy.upgrades[id] = level + 1;
  if (id === 'kit') {
    // The new kit level also arrives in the current run, so buying it right after a warp pays off at once
    for (const [item, n] of Object.entries(KIT_LEVELS[level])) {
      state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) + n);
    }
  }
  toast(`${def.name} 升到 ${level + 1} 級`, { tone: 'good', sound: 'reward' });
  checkAchievements();
}

/** Through the stargate: a fresh run that keeps the legacy, plus points for this one */
export function warp() {
  if (!state.milestones.includes('stargate')) return;
  const earned = warpPoints(state.items[SWARM_ITEM] ?? 0);
  const legacy = { ...state.legacy, points: state.legacy.points + earned, warps: state.legacy.warps + 1 };
  const maintenance = state.maintenance;
  const galaxy = rollGalaxy(state.galaxy);
  state = newGame(legacy, state);
  state.maintenance = maintenance;
  state.galaxy = galaxy;
  history.length = 0;
  last = emptyTick();
  for (const k of Object.keys(smoothRates)) smoothRates[k] = 0;
  ui.milestoneModal = null;
  ui.signalOpen = false;
  ui.tradeOpen = false;
  saveLocal(state);
  toast(`抵達第 ${legacy.warps + 1} 個星系「${GALAXIES[galaxy].name}」，獲得 ${earned} 遺產點`, { tone: 'good', title: '躍遷完成', icon: 'dyson_swarm', sound: 'warp', log: true });
  checkAchievements();
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
  history.length = 0;
  ui.intro = false;
  checkAchievements(true);
  saveLocal(state);
  toast('已匯入存檔', { tone: 'good' });
  return true;
}

/** Start this run over; the legacy from earlier warps is kept */
export function resetGame() {
  clearLocal();
  const galaxy = state.galaxy;
  state = newGame(state.legacy, state);
  state.galaxy = galaxy;
  last = emptyTick();
  history.length = 0;
  for (const k of Object.keys(smoothRates)) smoothRates[k] = 0;
  saveLocal(state);
  toast('已重新開始');
}

export function closeIntro() {
  ui.intro = false;
  emit('click');
  notify();
}

// ---------- world events ----------

/** The trader takes half of the fullest pile that is at least 40% full, and pays in research data */
export function traderOffer(s: GameState): NonNullable<GameState['incident']>['offer'] | null {
  let best: { item: string; fill: number } | null = null;
  for (const [item, n] of Object.entries(s.items)) {
    const def = ITEMS[item];
    if (!def || !['raw', 'intermediate', 'byproduct'].includes(def.kind) || n < 20) continue;
    const fill = n / capOf(s, item);
    if (fill >= 0.4 && (!best || fill > best.fill)) best = { item, fill };
  }
  if (!best) return null;
  const n = Math.floor((s.items[best.item] ?? 0) / 2);
  // Byproducts are worth less: the trader is doing you a favour taking them
  const { item, n: pay } = share(s, ITEMS[best.item].kind === 'byproduct' ? 0.015 : 0.03);
  return { item: best.item, n, pay: { [item]: pay } };
}

function scheduleIncident() {
  const [lo, hi] = INCIDENT_INTERVAL;
  state.nextIncident = state.playTime + lo + Math.random() * (hi - lo);
}

function startIncident() {
  const offer = traderOffer(state);
  // No research left to discount? Then a eureka is wasted
  const choices = eligibleIncidents(state).filter(
    (d) => (d.id !== 'trader' || offer) && (d.id !== 'eureka' || TECH_LIST.some((t) => !state.techs.includes(t.id))),
  );
  const total = choices.reduce((n, d) => n + d.weight, 0);
  let roll = Math.random() * total;
  const def = choices.find((d) => (roll -= d.weight) < 0) ?? choices[0];
  if (!def) return scheduleIncident();
  state.incident = { id: def.id, until: state.playTime + def.duration, ...(def.id === 'trader' && offer ? { offer } : {}) };
  state.stats.incidents++;
  if (def.id === 'meteor') {
    // A quarter of storage of every raw ore the player has met
    const got: string[] = [];
    for (const [item, d] of Object.entries(ITEMS)) {
      if (d.kind !== 'raw' || !((state.items[item] ?? 0) > 0 || d.manual)) continue;
      const cap = capOf(state, item);
      state.items[item] = Math.min(cap, (state.items[item] ?? 0) + Math.ceil(cap * 0.25));
      got.push(d.name);
    }
    toast(`${got.slice(0, 4).join('、')}${got.length > 4 ? ' 等' : ''}各補進 25% 容量`, {
      tone: 'good', title: def.name, icon: def.icon, sound: 'incident', log: true,
    });
  } else {
    toast(def.text, { tone: def.tone === 'bad' ? 'bad' : 'info', title: def.name, icon: def.icon, sound: 'incident', log: true });
  }
}

function updateIncident() {
  const inc = state.incident;
  if (inc && state.playTime >= inc.until) {
    state.incident = null;
    ui.tradeOpen = false;
    scheduleIncident();
  }
  if (!state.incident && state.playTime >= state.nextIncident) startIncident();
}

export function openTrade(open: boolean) {
  ui.tradeOpen = open && !!activeIncident(state);
  notify();
}

export function acceptTrade() {
  const offer = state.incident?.offer;
  if (!offer || !activeIncident(state)) return;
  if ((state.items[offer.item] ?? 0) < offer.n) return toast(`${ITEMS[offer.item].name} 不夠了`, { tone: 'bad' });
  state.items[offer.item] -= offer.n;
  for (const [item, n] of Object.entries(offer.pay)) state.items[item] = Math.min(capOf(state, item), (state.items[item] ?? 0) + n);
  state.stats.trades++;
  state.incident = { ...state.incident!, until: state.playTime };
  ui.tradeOpen = false;
  toast(
    `${ITEMS[offer.item].name} −${offer.n} → ${Object.entries(offer.pay).map(([i, n]) => `${ITEMS[i].name} +${n}`).join('、')}`,
    { tone: 'good', title: '交易完成', icon: Object.keys(offer.pay)[0], sound: 'reward', log: true },
  );
}
