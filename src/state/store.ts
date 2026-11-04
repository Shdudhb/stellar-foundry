import { ACHIEVEMENT_LIST } from '../data/achievements';
import { GALAXIES, rollGalaxy } from '../data/galaxies';
import { INCIDENT_INTERVAL, eligibleIncidents } from '../data/incidents';
import { ITEMS, SWARM_ITEM, canVent, isPower } from '../data/items';
import { BOOST_TIME, KIT_LEVELS, LEGACY, SIGNAL_INTERVAL, SIGNAL_LIFETIME, legacyCost, warpPoints } from '../data/legacy';
import { OBJECTIVES, unclaimedObjectives } from '../data/objectives';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECH_LIST, TECHS } from '../data/tech';
import { tick } from '../sim/engine';
import { simulateOffline, type OfflineReport } from '../sim/offline';
import { learn, queueNext, toggleQueued } from '../sim/research';
import {
  AMOUNT_EPSILON, activeIncident, canAfford, canBuildMilestone, hasAmount, canRun, capOf, currentTier, isMachineUnlocked, offlineCap, simSpeed, techCost, isRecipeUnlocked, milestoneUnlocked, slotsTotal, slotsUsed, techAvailable,
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
  /** A line to bring into view on the production tab (just created, or picked in the item window) */
  focusLine: number | null;
  /** The new-line picker is open, starting with this search */
  picker: boolean;
  pickerQuery: string;
  /** A research or megastructure card to bring into view on its tab */
  goto: { tab: 'research' | 'milestones'; id: string } | null;
  /** The line whose recipe is being switched */
  recipeLine: number | null;
  toasts: Toast[];
  /** Recent notable happenings, newest first */
  log: LogEntry[];
}

const emptyTick = (): TickResult => ({ lines: {}, power: {}, rates: {}, vented: {}, decayed: {} });

let state: GameState = newGame();
let last: TickResult = emptyTick();
const smoothRates: Record<string, number> = {};
const ui: UiState = {
  lookupItem: null, offlineReport: null, milestoneModal: null, signalOpen: false, tradeOpen: false, intro: false, focusLine: null, picker: false, pickerQuery: '', goto: null, recipeLine: null,
  toasts: [], log: [],
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
  // The same message again (tapping a button that can't work) refreshes it instead of stacking copies
  const others = ui.toasts.filter((x) => x.text !== text || x.title !== title);
  ui.toasts = [...others.slice(-3), { id, text, tone, icon, title }];
  if (log) addLog(title ? `${title}：${text}` : text, tone, icon);
  if (sound) emit(sound);
  else if (tone === 'bad') emit('error');
  // Longer warnings (with a hint) stay up long enough to read
  setTimeout(() => dismissToast(id), tone === 'achievement' ? 5000 : tone === 'bad' ? Math.max(2200, text.length * 110) : Math.max(3200, text.length * 90));
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
  for (let id = queueNext(state); id; id = queueNext(state)) {
    const cost = techCost(state, id);
    learn(state, id);
    announceTech(id, cost, true);
  }
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
let acc = 0;

/** Wall-clock seconds since the last call: run the factory, or catch up a long gap as offline time */
export function advance(elapsed: number) {
  if (state.paused) {
    acc = 0;
    return;
  }
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
}

/** Stop or restart factory time. Building, research and every other action still work while paused. */
export function togglePause() {
  state.paused = !state.paused;
  acc = 0;
  emit('click');
  saveLocal(state);
  notify();
}

export function start() {
  if (started) return;
  started = true;
  const saved = loadLocal();
  if (saved) {
    state = saved;
    checkAchievements(true);
    // A paused game stays as it was left: nothing to catch up
    if (!saved.paused) catchUp((Date.now() - saved.savedAt) / 1000);
  } else {
    ui.intro = true;
  }

  let prev = performance.now();
  setInterval(() => {
    const now = performance.now();
    advance((now - prev) / 1000);
    prev = now;
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

/** "缺 鐵錠 5、齒輪 2": what a cost still needs */
function shortText(cost: Record<string, number>): string {
  const short = Object.entries(cost)
    .map(([item, n]) => [item, Math.ceil(n - (state.items[item] ?? 0) - AMOUNT_EPSILON)] as const)
    .filter(([, n]) => n > 0)
    .map(([item, n]) => `${ITEMS[item]?.name ?? item} ${n}`);
  return short.length ? `缺 ${short.slice(0, 3).join('、')}${short.length > 3 ? ' 等' : ''}` : '';
}

/** A running line that eats this item, so the player knows what to pause to save some up */
function consumerOf(item: string): string | null {
  const line = state.lines.find((l) => l.enabled && l.count > 0 && item in (RECIPES[l.recipe]?.inputs ?? {}));
  return line ? `${MACHINES[line.machine].name}·${RECIPES[line.recipe].name}` : null;
}

function lacking(cost: Record<string, number>, what = '材料不足') {
  const short = Object.keys(cost).find((i) => !hasAmount(state.items[i] ?? 0, cost[i]));
  const user = short && consumerOf(short);
  const hint = user ? `。「${user}」正在用掉${ITEMS[short].name}，可以先暫停它` : '';
  toast(shortText(cost) + hint, { tone: 'bad', title: what, icon: short });
}

function pay(cost: Record<string, number>) {
  // Never below zero: paying 10 from 9.999999999999998 (float drift) leaves nothing, not -2e-15
  for (const [item, n] of Object.entries(cost)) state.items[item] = Math.max(0, (state.items[item] ?? 0) - n);
}

/** Adds up to the storage cap; a pile already over it (a megastructure's grant) is never cut back. Returns what fit */
function addItem(item: string, n: number): number {
  const have = state.items[item] ?? 0;
  const next = Math.max(have, Math.min(capOf(state, item), have + n));
  state.items[item] = next;
  return next - have;
}

/** Gives materials back up to storage capacity; returns the names of those that didn't all fit */
function refund(cost: Record<string, number>, times: number): string[] {
  const lost: string[] = [];
  for (const [item, n] of Object.entries(cost)) {
    if (addItem(item, n * times) < n * times - 1e-9) lost.push(ITEMS[item].name);
  }
  return lost;
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

/** Adds an empty line; returns its id, or null if that machine can't run that recipe yet */
export function addLine(machineId: string, recipeId: string): number | null {
  const m = MACHINES[machineId];
  const r = RECIPES[recipeId];
  if (!m || !r || !canRun(m, r)) return null;
  if (!isMachineUnlocked(state, machineId) || !isRecipeUnlocked(state, recipeId)) return null;
  const id = state.nextLineId++;
  state.lines.push({ id, machine: machineId, recipe: recipeId, count: 0, enabled: true });
  emit('click');
  notify();
  return id;
}

/** Show this line on the production tab, closing the window it was picked from */
export function focusLine(id: number | null) {
  ui.focusLine = id;
  if (id !== null) {
    ui.lookupItem = null;
    ui.picker = false;
  }
  notify();
}

export function openPicker(open: boolean, query = '') {
  ui.picker = open;
  ui.pickerQuery = query;
  notify();
}

/** Take the player to a research or megastructure card; null once it's been shown */
export function goTo(target: UiState['goto']) {
  ui.goto = target;
  notify();
}

/** Add a line, put the first machine in it when that's affordable, and take the player to it */
export function createLine(machineId: string, recipeId: string) {
  const id = addLine(machineId, recipeId);
  if (id === null) return;
  const m = MACHINES[machineId];
  const orbit = !!m.orbital;
  if (canAfford(state, m.cost) && slotsUsed(state, orbit) + m.slots <= slotsTotal(state, orbit)) build(id);
  focusLine(id);
}

/** Returns how many were built; `quiet` leaves the explaining to the caller */
export function build(lineId: number, times = 1, quiet = false): number {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return 0;
  const m = MACHINES[line.machine];
  const orbit = !!m.orbital;
  let built = 0;
  for (let i = 0; i < times; i++) {
    if (slotsUsed(state, orbit) + m.slots > slotsTotal(state, orbit)) {
      if (!quiet || built === 0) toast(orbit ? '軌道槽位不足' : '區域槽位不足', { tone: 'bad' });
      break;
    }
    if (!canAfford(state, m.cost)) {
      if (built === 0) lacking(m.cost);
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
  return built;
}

/** Build up to `n` to close a shortage; when materials run out part way, say how far it got and what's missing */
export function buildUpTo(lineId: number, n: number): number {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line || n <= 0) return 0;
  const built = build(lineId, n, true);
  if (built > 0 && built < n) {
    const m = MACHINES[line.machine];
    const why = slotsUsed(state, !!m.orbital) + m.slots > slotsTotal(state, !!m.orbital) ? '槽位不夠' : shortText(m.cost);
    toast(`${m.name} 蓋了 ${built}/${n} 台，${why}`, { tone: 'bad', title: '沒有全部補足', icon: Object.keys(RECIPES[line.recipe].outputs)[0] });
  }
  return built;
}

export function openRecipeSwitch(lineId: number | null) {
  ui.recipeLine = lineId;
  notify();
}

/** Returns how many were taken down */
export function demolish(lineId: number, times = 1): number {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return 0;
  const n = Math.min(times, line.count);
  line.count -= n;
  const lost = refund(MACHINES[line.machine].cost, n);
  if (lost.length > 0) toast(`倉庫放不下，部分${lost.join('、')}沒退回`, { tone: 'bad' });
  else if (n > 0) emit('demolish');
  notify();
  return n;
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
  if (!canAfford(state, pays)) return lacking(pays);
  pay(pays);
  const lost = refund(Object.fromEntries(Object.entries(net).filter(([, n]) => n < 0).map(([i, n]) => [i, -n])), 1);
  const fromName = MACHINES[line.machine].name;
  line.machine = to.id;
  // Every machine in the line is new: no wear carried over, and a reactor starts cold
  line.wear = to.upkeep ? 0 : undefined;
  line.heat = to.ignition ? 0 : undefined;
  toast(`${fromName} × ${line.count} 已升級為 ${to.name}`, { tone: 'good', sound: 'build', log: true });
  if (lost.length > 0) toast(`倉庫放不下，部分${lost.join('、')}沒退回`, { tone: 'bad' });
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
  ui.recipeLine = null;
  emit('click');
  notify();
}

export function toggleLine(lineId: number) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  line.enabled = !line.enabled;
  emit('click');
  notify();
}

/** Stock limit for a line's main output, as a fraction of storage; undefined lifts it */
export function setLineLimit(lineId: number, limit: number | undefined) {
  const line = state.lines.find((l) => l.id === lineId);
  if (!line) return;
  if (limit === undefined || !(limit > 0 && limit < 1)) delete line.limit;
  else line.limit = limit;
  emit('click');
  notify();
}

export function research(techId: string) {
  const t = TECHS[techId];
  if (!t || !techAvailable(state, techId)) return;
  const cost = techCost(state, techId);
  if (!canAfford(state, cost)) return lacking(cost, '研究數據不足');
  learn(state, techId);
  announceTech(techId, cost);
  checkAchievements();
}

/** Say what a finished tech opened up, so the player knows what to go and build */
function announceTech(techId: string, cost: Record<string, number>, queued = false) {
  const t = TECHS[techId];
  const opened = [
    ...(t.unlockMachines ?? []).map((m) => MACHINES[m].name),
    ...(t.unlockRecipes ?? []).map((r) => RECIPES[r].name),
    ...(t.unlockMilestone ? [`巨構「${MILESTONES[t.unlockMilestone].name}」`] : []),
  ];
  const more = opened.length > 3 ? ` 等 ${opened.length} 項` : '';
  toast(opened.length ? `${t.name} · 解鎖 ${opened.slice(0, 3).join('、')}${more}` : t.name, {
    tone: 'good', title: queued ? '排程研究完成' : '研究完成', icon: Object.keys(cost)[0], log: true, sound: 'research',
  });
}

/** Line a tech up for research (with what it needs first), or take it off the queue */
export function queueTech(techId: string) {
  toggleQueued(state, techId);
  emit('click');
  notify();
}

export function clearQueue() {
  state.queue = [];
  emit('click');
  notify();
}

export function buildMilestone(id: string) {
  const ms = MILESTONES[id];
  if (!ms || state.milestones.includes(id) || !milestoneUnlocked(state, id)) return;
  if (!canBuildMilestone(state, id)) return lacking(ms.cost);
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

/** When on, a full store destroys overflow instead of stalling producers */
export function toggleVent(item: string) {
  if (!canVent(item)) return;
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

/** Token reward for the first tutorial steps: together they stay short of the first research */
export const MINOR_REWARD = 5;

/** Reward for these objectives: 2.5% of the tier's research each, a token for the tutorial steps */
export function objectiveReward(s: GameState, steps: number[]): Record<string, number> {
  const { item, n } = share(s, 0.025);
  return { [item]: steps.reduce((sum, i) => sum + (OBJECTIVES[i]?.minor ? MINOR_REWARD : n), 0) };
}

export function claimObjectives() {
  const pending = unclaimedObjectives(state);
  if (pending.length === 0) return;
  const reward = objectiveReward(state, pending);
  for (const [item, n] of Object.entries(reward)) addItem(item, n);
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
    for (const [item, n] of Object.entries(reward)) addItem(item, n);
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
      addItem(item, n);
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
  acc = 0;
  for (const k of Object.keys(smoothRates)) smoothRates[k] = 0;
  Object.assign(ui, { intro: false, lookupItem: null, picker: false, focusLine: null, goto: null, recipeLine: null, offlineReport: null, milestoneModal: null, signalOpen: false, tradeOpen: false });
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
      addItem(item, Math.ceil(capOf(state, item) * 0.25));
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
  for (const [item, n] of Object.entries(offer.pay)) addItem(item, n);
  state.stats.trades++;
  state.incident = { ...state.incident!, until: state.playTime };
  ui.tradeOpen = false;
  toast(
    `${ITEMS[offer.item].name} −${offer.n} → ${Object.entries(offer.pay).map(([i, n]) => `${ITEMS[i].name} +${n}`).join('、')}`,
    { tone: 'good', title: '交易完成', icon: Object.keys(offer.pay)[0], sound: 'reward', log: true },
  );
}
