import { GALAXIES, STARS, systemBoost } from '../data/galaxies';
import { INCIDENTS } from '../data/incidents';
import { DEFAULT_CAP, ITEMS } from '../data/items';
import { MACHINES, type MachineDef } from '../data/machines';
import { HOME, PLANETS, SHIP_RATE, routeFuel } from '../data/planets';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../data/recipes';
import { MILESTONE_LIST, TECHS, TECH_LOCKED_MACHINES, TECH_LOCKED_RECIPES } from '../data/tech';
import type { GameState, Line } from './types';

export const BASE_SLOTS = 20;
/** Each achievement speeds the whole factory up by this much, forever */
export const ACHIEVEMENT_BONUS = 0.01;

const legacyLevel = (state: GameState, id: string) => state.legacy?.upgrades[id] ?? 0;

export function storageMult(state: GameState): number {
  return state.techs.reduce((m, id) => m * (TECHS[id]?.storageMult ?? 1), 1.5 ** legacyLevel(state, 'storage'));
}

/** How fast factory time runs: legacy speed and achievements, doubled while a relic boost lasts */
export function simSpeed(state: GameState): number {
  const boost = state.boostUntil > state.playTime ? 2 : 1;
  return (1 + 0.2 * legacyLevel(state, 'speed') + ACHIEVEMENT_BONUS * (state.achievements?.length ?? 0)) * boost;
}

/** The world event in effect right now, if any */
export function activeIncident(state: GameState) {
  const inc = state.incident;
  return inc && inc.until > state.playTime ? INCIDENTS[inc.id] ?? null : null;
}

/** Speed multiplier the current world event and galaxy trait give lines of this recipe category */
export function categoryBoost(state: GameState, category: string): number {
  const galaxy = state.galaxy ? GALAXIES[state.galaxy]?.boost[category] ?? 1 : 1;
  return (activeIncident(state)?.boost?.[category] ?? 1) * galaxy * systemBoost(state.system, category);
}

/** How bright this system's star is next to the first one: what a Dyson panel gives is multiplied by it */
export function starLum(state: GameState): number {
  return STARS[state.system?.star ?? '']?.lum ?? 1;
}

/** Items one cargo ship carries per second in this galaxy */
export function shipRate(state: GameState): number {
  return SHIP_RATE * (1 + 0.25 * legacyLevel(state, 'freight')) * ((state.galaxy && GALAXIES[state.galaxy]?.shipMult) || 1);
}

/** Rocket fuel a route between these worlds burns for each item it moves, in this galaxy */
export function shipFuel(state: GameState, from: string, to: string): number {
  return routeFuel(from, to) * ((state.galaxy && GALAXIES[state.galaxy]?.fuelMult) || 1);
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
  const planet = state.planet ?? HOME;
  if (planet !== HOME) {
    // Other worlds have ground only, and grow by their own research
    if (orbit) return 0;
    return state.techs.reduce((s, id) => s + (TECHS[id]?.planetSlots?.[planet] ?? 0), (PLANETS[planet]?.slots ?? 0) + 4 * legacyLevel(state, 'colony'));
  }
  if (orbit) {
    const built = state.techs.reduce((s, id) => s + (TECHS[id]?.orbitSlotBonus ?? 0), 0);
    // The legacy widens a station that exists; it doesn't put one in orbit
    return built > 0 ? built + 4 * legacyLevel(state, 'orbit') : 0;
  }
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

/** Crafts per second one machine of this kind does of this recipe at full speed, with overclock and the current boosts */
export function craftsPerMachine(state: GameState, machine: MachineDef, recipe: RecipeDef): number {
  return (overclock(machine, recipe).speed * (machine.speed ?? 1) * categoryBoost(state, recipe.category)) / recipe.time;
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

/** Work tied to the home world: its ores and wells, its orbit, its launch sites, and the labs the data is spent from */
const HOME_CATEGORIES = new Set(['mining', 'pumping', 'asteroid', 'solar_wind', 'microgravity', 'launch', 'elevator', 'swarm', 'research']);

/** The only world a recipe can run on, or undefined when any will do */
export function recipePlanet(recipe: RecipeDef): string | undefined {
  return recipe.planet ?? (HOME_CATEGORIES.has(recipe.category) ? HOME : undefined);
}

/** This recipe can be set up on the world in view */
export function recipeFits(state: GameState, recipe: RecipeDef): boolean {
  const only = recipePlanet(recipe);
  return !only || only === (state.planet ?? HOME);
}

export function canRun(machine: MachineDef, recipe: RecipeDef): boolean {
  return machine.categories.includes(recipe.category) && machine.tier >= recipe.tier;
}

export function recipesFor(state: GameState, machineId: string): RecipeDef[] {
  const m = MACHINES[machineId];
  if (!m) return [];
  return RECIPE_LIST.filter((r) => canRun(m, r) && isRecipeUnlocked(state, r.id) && recipeFits(state, r));
}

export function machinesFor(recipeId: string): MachineDef[] {
  const r = RECIPES[recipeId];
  return Object.values(MACHINES).filter((m) => canRun(m, r));
}

/** Stock counts drift by float error (9.999999999999998 bricks); this much short still counts as enough */
export const AMOUNT_EPSILON = 1e-6;

/** Has at least `n`, allowing for float drift: the UI shows 9.999999999999998 as 10, so the check must agree */
export const hasAmount = (have: number, n: number) => have + AMOUNT_EPSILON >= n;

export function canAfford(state: GameState, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([item, n]) => hasAmount(state.items[item] ?? 0, n));
}

/** The machine a line can upgrade to right now, if any */
/** The best unlocked machine up the line's upgrade chain, skipping steps already outgrown (basic drill → electric drill) */
export function upgradeTarget(state: GameState, line: Line): MachineDef | null {
  let best: MachineDef | null = null;
  const seen = new Set<string>();
  for (let to = MACHINES[MACHINES[line.machine]?.upgradesTo ?? '']; to && !seen.has(to.id); to = MACHINES[to.upgradesTo ?? '']) {
    seen.add(to.id);
    if (isMachineUnlocked(state, to.id) && canRun(to, RECIPES[line.recipe])) best = to;
  }
  return best;
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
  const k = (1 - 0.1 * legacyLevel(state, 'research')) * (activeIncident(state)?.researchMult ?? 1);
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
  if ((state.items[id] ?? 0) > 0 || (ITEMS[id]?.manual && (state.planet ?? HOME) === HOME)) return true;
  return RECIPE_LIST.some(
    (r) => id in r.outputs && isRecipeUnlocked(state, r.id) && recipeFits(state, r) && machinesFor(r.id).some((m) => isMachineUnlocked(state, m.id)),
  );
}
