import { DEFAULT_CAP, ITEMS } from '../data/items';
import { MACHINES, type MachineDef } from '../data/machines';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../data/recipes';
import { MILESTONE_LIST, TECHS, TECH_LOCKED_MACHINES, TECH_LOCKED_RECIPES } from '../data/tech';
import type { GameState, Line } from './types';

export const BASE_SLOTS = 20;

const legacyLevel = (state: GameState, id: string) => state.legacy?.upgrades[id] ?? 0;

export function storageMult(state: GameState): number {
  return state.techs.reduce((m, id) => m * (TECHS[id]?.storageMult ?? 1), 1.5 ** legacyLevel(state, 'storage'));
}

/** How fast factory time runs: legacy speed, doubled while a relic boost lasts */
export function simSpeed(state: GameState): number {
  const boost = state.boostUntil > state.playTime ? 2 : 1;
  return (1 + 0.2 * legacyLevel(state, 'speed')) * boost;
}

/** Longest absence that is caught up on return */
export function offlineCap(state: GameState): number {
  return (12 + 6 * legacyLevel(state, 'offline')) * 3600;
}

export function capOf(state: GameState, item: string): number {
  return (ITEMS[item]?.capBase ?? DEFAULT_CAP) * storageMult(state);
}

/** Ground and orbit are separate slot pools; orbit has none until the orbital station */
export function slotsTotal(state: GameState, orbit = false): number {
  if (orbit) return state.techs.reduce((s, id) => s + (TECHS[id]?.orbitSlotBonus ?? 0), 0);
  return state.techs.reduce((s, id) => s + (TECHS[id]?.slotBonus ?? 0), BASE_SLOTS + 10 * legacyLevel(state, 'slots'));
}

export function slotsUsed(state: GameState, orbit = false): number {
  return state.lines.reduce((s, l) => {
    const m = MACHINES[l.machine];
    return m && !!m.orbital === orbit ? s + l.count * m.slots : s;
  }, 0);
}

/** GTNH-style overclock: each tier above the recipe doubles speed (4x when perfect) and quadruples power. */
export function overclock(machine: MachineDef, recipe: RecipeDef): { speed: number; power: number } {
  const steps = Math.max(0, machine.tier - recipe.tier);
  return { speed: (machine.perfectOC ? 4 : 2) ** steps, power: 4 ** steps };
}

export function isMachineUnlocked(state: GameState, id: string): boolean {
  const ms = MACHINES[id]?.requiresMilestone;
  if (ms && !state.milestones.includes(ms)) return false;
  if (!TECH_LOCKED_MACHINES.has(id)) return true;
  return state.techs.some((t) => TECHS[t]?.unlockMachines?.includes(id));
}

export function isRecipeUnlocked(state: GameState, id: string): boolean {
  if (!TECH_LOCKED_RECIPES.has(id)) return true;
  return state.techs.some((t) => TECHS[t]?.unlockRecipes?.includes(id));
}

export function canRun(machine: MachineDef, recipe: RecipeDef): boolean {
  return machine.categories.includes(recipe.category) && machine.tier >= recipe.tier;
}

export function recipesFor(state: GameState, machineId: string): RecipeDef[] {
  const m = MACHINES[machineId];
  if (!m) return [];
  return RECIPE_LIST.filter((r) => canRun(m, r) && isRecipeUnlocked(state, r.id));
}

export function machinesFor(recipeId: string): MachineDef[] {
  const r = RECIPES[recipeId];
  return Object.values(MACHINES).filter((m) => canRun(m, r));
}

export function canAfford(state: GameState, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([item, n]) => (state.items[item] ?? 0) >= n);
}

/** The machine a line can upgrade to right now, if any */
export function upgradeTarget(state: GameState, line: Line): MachineDef | null {
  const to = MACHINES[MACHINES[line.machine]?.upgradesTo ?? ''];
  if (!to || !isMachineUnlocked(state, to.id) || !canRun(to, RECIPES[line.recipe])) return null;
  return to;
}

/** Net materials to upgrade every machine in a line: positive = pay, negative = refunded */
export function upgradeCost(line: Line, to: MachineDef): Record<string, number> {
  const net: Record<string, number> = {};
  for (const [item, n] of Object.entries(to.cost)) net[item] = (net[item] ?? 0) + n * line.count;
  for (const [item, n] of Object.entries(MACHINES[line.machine].cost)) net[item] = (net[item] ?? 0) - n * line.count;
  for (const item of Object.keys(net)) if (net[item] === 0) delete net[item];
  return net;
}

/** What a tech costs this run */
export function techCost(state: GameState, techId: string): Record<string, number> {
  const k = 1 - 0.1 * legacyLevel(state, 'research');
  return Object.fromEntries(Object.entries(TECHS[techId]?.cost ?? {}).map(([i, n]) => [i, Math.ceil(n * k)]));
}

export function techAvailable(state: GameState, techId: string): boolean {
  const t = TECHS[techId];
  if (!t || state.techs.includes(techId)) return false;
  if (t.requiresMilestone && !state.milestones.includes(t.requiresMilestone)) return false;
  return t.requires.every((r) => state.techs.includes(r));
}

export function milestoneUnlocked(state: GameState, id: string): boolean {
  return state.techs.some((t) => TECHS[t]?.unlockMilestone === id);
}

export const MAX_TIER = Math.max(...MILESTONE_LIST.map((m) => m.tier));

/** T0 until steam is researched, then one tier per milestone built, up to the last tier */
export function currentTier(state: GameState): number {
  const built = MILESTONE_LIST.filter((m) => state.milestones.includes(m.id)).reduce((t, m) => Math.max(t, m.tier + 1), 0);
  return Math.min(MAX_TIER, Math.max(built, state.techs.includes('steam_power') ? 1 : 0));
}

/** Enough materials to spend, plus everything it needs held */
export function canBuildMilestone(state: GameState, id: string): boolean {
  const ms = MILESTONE_LIST.find((m) => m.id === id);
  return !!ms && canAfford(state, ms.cost) && canAfford(state, ms.holds ?? {});
}

/** Worth showing: the player has some, can gather it, or can currently make it */
export function itemDiscovered(state: GameState, id: string): boolean {
  if ((state.items[id] ?? 0) > 0 || ITEMS[id]?.manual) return true;
  return RECIPE_LIST.some(
    (r) => id in r.outputs && isRecipeUnlocked(state, r.id) && machinesFor(r.id).some((m) => isMachineUnlocked(state, m.id)),
  );
}
