// Automated playthrough: a bot plays a fresh game from the crash site to the stargate through the
// same store actions the UI uses, and reports how long each tier takes and where it got stuck.
// Run with `npx vite-node scripts/playthrough.ts` (add `-- --verbose` for a decision log).
//
// The bot plays like a sensible player without bonuses: it gathers by hand early on, researches
// whatever it can afford, works backwards from what the next research and megastructure need to how
// many machines of each recipe it wants, builds what it can afford, upgrades lines when slots run
// short, and vents a byproduct once it fills up. It ignores relic signals and world events, so its
// times are a no-bonus baseline.
//
// Colonies: what only another world makes (comet ice) it builds there, geothermal power first, and ships
// home; once the lava world is open it moves iron, copper and tungsten ingots to the foundries there and
// hands the home smelters' slots back when the deliveries are standing.
//
// Options (after `--`):
//   --no-lava     ignore the lava world, to compare
//   --lava-iridium  also cast iridium there (off by default: the bot stalls itself at T6 with it)
//   --explore     100 extra ground slots, to look past slot pressure at the later chains
//   --from=5      start at that tier with everything before it done and stores half full (implies --explore)
//   --item=<id>   at the end, list every line making or using that item and why it is slow
//   --verbose     log each decision; --shed  pause lines by hand in brownouts, as before the game did it
//
// Limits: it is a heuristic, not an optimal player. It misplans slots, power and basic supplies in later
// tiers, so a stall it reports may be its own; inspect with --item before blaming the game.
// Its own mistakes so far, each fixed in the bot rather than the game: switching to a generator it could not
// pay for or light (elevator, fusion) and leaving the grid at zero; planning more of an intermediate it
// already had thousands of; scrapping its only plastic line and then wanting the plant that costs plastic.
// Found with it: float drift blocking builds at "10/10"; co-products (aluminium dust, sodium, salt) locking
// whole chains when only byproducts could vent; brownouts collapsing generation by starving the fuel chain;
// T2 running out of slots (slow coke ovens, basic drills with no upgrade to electric ones); oil power that
// barely paid for its own pumps and towers.
import { ITEMS, isPower } from '../src/data/items';
import { MACHINES, MACHINE_LIST, MAINTENANCE_ITEM, type MachineDef } from '../src/data/machines';
import { OBJECTIVES, currentObjective } from '../src/data/objectives';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../src/data/recipes';
import { MILESTONE_LIST, TECH_LIST, TIER_NAMES } from '../src/data/tech';
import { fuelLines } from '../src/sim/engine';
import { SHIP_COST, SHIP_FUEL_ITEM, SHIP_RATE, routeFuel } from '../src/data/planets';
import { HOME, openPlanets, storeOf } from '../src/sim/planets';
import { tickAll } from '../src/sim/world';
import { EU_PER, primaryRecipe, price } from '../src/sim/balance';
import {
  canAfford, canRun, capOf, categoryBoost, currentTier, isMachineUnlocked, isRecipeUnlocked, milestoneUnlocked, overclock, simSpeed,
  recipePlanet, slotsTotal, slotsUsed, techAvailable, techCost, upgradeCost, upgradeTarget,
} from '../src/sim/rules';
import type { Line, TickResult } from '../src/sim/types';
import {
  addLine, addRoute, build, buildMilestone, buildShip, switchPlanet, demolish, checkAchievements, claimObjectives, gather, getState, importSave, removeLine, research, toggleLine, toggleVent,
  upgradeLine,
} from '../src/state/store';
import { exportString, newGame } from '../src/state/save';

const VERBOSE = process.argv.includes('--verbose');
const MAX_HOURS = 60;
/** Seconds of play between decisions */
const DECIDE_EVERY = 20;
/** The bot aims to cover what it still needs within this many seconds */
const HORIZON = 600;
/** Hand-gathering speed while the bot still taps */
const TAPS_PER_SEC = 4;
/** No research, megastructure or objective for this long counts as stuck */
const STALL_LIMIT = 2 * 3600;

const EXPLORE = process.argv.includes('--explore');
/** `--from=5`: start at that tier, with everything before it researched and built and stores half full */
const FROM = Number((process.argv.find((a) => a.startsWith('--from=')) ?? '--from=0').slice(7));
// Explore mode: 100 extra ground slots, to see whether later chains work at all, apart from slot pressure
const start = newGame(EXPLORE || FROM ? { points: 0, warps: 0, upgrades: { slots: 10 } } : undefined);
if (FROM > 0) {
  start.techs = TECH_LIST.filter((t) => t.tier < FROM).map((t) => t.id);
  start.milestones = MILESTONE_LIST.filter((m) => m.tier < FROM).map((m) => m.id);
  for (const m of MILESTONE_LIST.filter((x) => x.tier < FROM)) {
    for (const [i, n] of Object.entries(m.grantsItems ?? {})) start.items[i] = (start.items[i] ?? 0) + n;
  }
  // Half a store of everything the earlier tiers could make; the new tier's own items start empty
  for (const r of RECIPE_LIST) {
    if (!isRecipeUnlocked(start, r.id) || r.tier >= FROM) continue;
    for (const o of Object.keys(r.outputs)) {
      if (!isPower(o) && ITEMS[o].kind !== 'structure') start.items[o] = Math.max(start.items[o] ?? 0, capOf(start, o) / 2);
    }
  }
  start.claimed = OBJECTIVES.filter((o) => o.done(start)).map((o) => o.text);
}
importSave(exportString(start));
const s = getState;
const fmtT = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;
const log = (msg: string) => console.log(`[${fmtT(s().playTime)}] ${msg}`);

// ---------- what to make things with ----------

const unlocked = (r: RecipeDef) => isRecipeUnlocked(s(), r.id) && MACHINE_LIST.some((m) => canRun(m, r) && isMachineUnlocked(s(), m.id));
/** Ready on the home world, where the bot plans; what only a colony can make goes through `awayRecipe` */
const recipeReady = (r: RecipeDef) => unlocked(r) && (recipePlanet(r) ?? HOME) === HOME;
/** The colony recipe for something the home world cannot make at all (comet ice) */
const awayRecipe = (item: string) =>
  RECIPE_LIST.find((r) => r.outputs[item] && unlocked(r) && recipePlanet(r) !== undefined && recipePlanet(r) !== HOME && openPlanets(s()).includes(recipePlanet(r)!));
/** Crafts per second the plan wants from each colony, by recipe */
let awayCrafts: Record<string, Record<string, number>> = {};

/** What a better generator costs, while the bot keeps the old ones running and saves for it */
let saveFor: Record<string, number> = {};

/** Rough cost of one unit through a recipe: machine-seconds plus a little for EU */
function score(r: RecipeDef, item: string): number {
  let c = r.time;
  for (const [i, n] of Object.entries(r.inputs)) c += isPower(i) ? n / 50 : price(i).secs * n;
  return c / r.outputs[item];
}

/** The recipe the bot uses for an item: the mature route when it's unlocked, else the cheapest ready one */
const USE_LAVA = !process.argv.includes('--no-lava');
/** Iridium from magma only tops up what orbit mines. The bot plans it badly (it thrashes the home lines it
 *  thinks it can drop), so it leaves it alone unless asked with `--lava-iridium` */
const NO_EXTRA = !process.argv.includes('--lava-iridium');
const LAVA_EXTRA = new Set(['iridium']);
const lavaRecipe = (item: string) =>
  USE_LAVA && !isPower(item) && openPlanets(s()).includes('lava') && !(NO_EXTRA && LAVA_EXTRA.has(item))
    ? RECIPE_LIST.find((r) => r.outputs[item] && recipePlanet(r) === 'lava' && Object.keys(r.inputs).length > 0 && unlocked(r))
    : undefined;
const lavaStanding = (r: RecipeDef) => {
  const o = storeOf(s(), 'lava');
  const route = (s().routes ?? []).some((x) => x.from === 'lava' && x.ships > 0 && r.outputs[x.item]);
  return !!o && route && o.lines.some((l) => l.recipe === r.id && l.count > 0) && o.lines.some((l) => l.count > 0 && RECIPES[l.recipe].outputs.eu);
};
/** `--no-lava`: play as if the lava world weren't there, to compare */
function recipeFor(item: string): RecipeDef | undefined {
  // Ingots the lava world pours straight from magma: once it is open, the bot moves them there
  // ...but only once the foundry there is standing and delivering; until then home keeps making them
  const lr = lavaRecipe(item);
  if (lr && lavaStanding(lr) && !LAVA_EXTRA.has(item)) return undefined;
  const ready = RECIPE_LIST.filter((r) => r.outputs[item] && recipeReady(r));
  // A route whose power network has no generators yet can't bootstrap itself (the blast furnace needs EU,
  // the turbine that makes EU needs steel): keep the old route until the network exists
  const live = ready.filter(powered);
  const pool = live.length ? live : ready;
  // Power: the most output per generator slot whose fuel the factory can make (combustion beats turbines,
  // coke beats coal); slots, not fuel, are what runs out
  if (isPower(item)) {
    const fuelOk = (r: RecipeDef) => Object.keys(r.inputs).every((i) => isPower(i) || RECIPE_LIST.some((x) => x.outputs[i] && recipeReady(x)));
    // Slots per unit of output for the generator *and* the machines that make its fuel
    const slotsPer = (r: RecipeDef, per: number, depth: number): number => {
      const m = machineFor(r);
      if (!m || depth > 4) return Infinity;
      let slots = (per / perMachine(m, r)) * m.slots;
      for (const [i, n] of Object.entries(r.inputs)) {
        const fr = isPower(i) ? recipeForPower(i) : primaryRecipe(i);
        if (fr && fr.outputs[i] && !(fr.id === r.id)) slots += slotsPer(fr, (per * n) / fr.outputs[i], depth + 1);
      }
      return slots;
    };
    const perSlot = (r: RecipeDef) => 1 / slotsPer(r, 1 / r.outputs[item], 0);
    const ranked = pool.filter(fuelOk).sort((a, b) => perSlot(b) - perSlot(a));
    // A better generator that isn't standing yet and can't be paid for (the elevator needs what only orbit
    // makes, the reactor needs superconductors and a grid to light it): keep the working route and save up
    const standing = (r: RecipeDef) => s().lines.some((l) => l.recipe === r.id && l.count > 0);
    const startable = (r: RecipeDef) => {
      const m = machineFor(r);
      if (!m || !canAfford(s(), m.cost)) return false;
      return !m.ignition || (last?.power.eu?.capacity ?? 0) - (last?.power.eu?.demand ?? 0) >= m.ignition.power;
    };
    const best = ranked[0];
    if (best && !standing(best) && !startable(best)) {
      const m = machineFor(best);
      if (m) for (const [i, n] of Object.entries(m.cost)) saveFor[i] = Math.max(saveFor[i] ?? 0, n);
      const works = ranked.find((r) => standing(r) || startable(r));
      if (works) return works;
    }
    return best ?? pool[0];
  }
  const primary = primaryRecipe(item);
  if (primary && pool.includes(primary)) return primary;
  return pool.sort((a, b) => score(a, item) - score(b, item))[0];
}

/** The route a power input would come from (steam for a turbine), without recursing into the choice */
function recipeForPower(p: string): RecipeDef | undefined {
  const lines = s().lines.filter((l) => l.count > 0 && RECIPES[l.recipe].outputs[p]);
  return lines.length ? RECIPES[lines.sort((a, b) => b.count - a.count)[0].recipe] : RECIPE_LIST.find((r) => r.outputs[p] && recipeReady(r));
}

function powered(r: RecipeDef): boolean {
  const line = s().lines.find((l) => l.recipe === r.id && l.count > 0);
  const m = line ? MACHINES[line.machine] : machineFor(r);
  const needs = [m?.power?.item, ...Object.keys(r.inputs).filter(isPower)].filter(Boolean) as string[];
  return needs.every((p) => (last?.power[p]?.capacity ?? 0) > 0);
}

/** Highest-tier unlocked machine that runs it and has power: most output per slot */
function machineFor(r: RecipeDef): MachineDef | undefined {
  const ms = MACHINE_LIST.filter((m) => canRun(m, r) && isMachineUnlocked(s(), m.id)).sort((a, b) => b.tier - a.tier);
  // A powered machine only while its grid has room to spare: otherwise a shortfall feeds on itself
  // (steam drills mining the boilers' coal slow down, so less coal, so less steam...)
  const spare = (p: string) => (last?.power[p]?.capacity ?? 0) - (last?.power[p]?.demand ?? 0);
  const ok = ms.filter((m) => !m.power || spare(m.power.item) > m.power.amount * overclock(m, r).power * 3);
  // Overclocking doubles speed for four times the power, and power costs slots too: take the machine whose
  // own slots plus the generator slots its draw needs are fewest per craft (about 20 EU per generator slot)
  const cost = (m: MachineDef) => (m.slots + (m.power ? m.power.amount * overclock(m, r).power * (EU_PER[m.power.item] ?? 1) / 20 : 0)) / perMachine(m, r);
  return ok.sort((a, b) => cost(a) - cost(b))[0] ?? ms[ms.length - 1];
}

const perMachine = (m: MachineDef, r: RecipeDef) => (overclock(m, r).speed * (m.speed ?? 1) * categoryBoost(s(), r.category)) / r.time;

// ---------- the plan: crafts per second wanted of each recipe ----------

const missingWhy = new Map<string, string>();

function plan(targets: Record<string, number>): Record<string, number> {
  const crafts: Record<string, number> = {};
  const stack = new Set<string>();
  const need = (item: string, rate: number, depth: number) => {
    if (rate <= 1e-6 || depth > 30 || stack.has(item)) return;
    // An intermediate already stocked for the whole horizon: use the pile instead of making more of it
    // (the bot once sat on 2,000 neutronium while the iridium it ate was what every build waited for)
    if (depth > 0 && !isPower(item) && (s().items[item] ?? 0) > rate * HORIZON * 1.5) return;
    // A lava route still being set up: ask the colony for it too, while home carries on
    const seed = lavaRecipe(item);
    if (seed && (!lavaStanding(seed) || LAVA_EXTRA.has(item))) {
      const on = (awayCrafts.lava ??= {});
      on[seed.id] = (on[seed.id] ?? 0) + rate / seed.outputs[item];
    }
    const r = recipeFor(item);
    if (!r) {
      const far = awayRecipe(item);
      if (far) {
        const on = (awayCrafts[recipePlanet(far)!] ??= {});
        on[far.id] = (on[far.id] ?? 0) + rate / far.outputs[item];
      } else missingWhy.set(item, 'no ready recipe');
      return;
    }
    stack.add(item);
    const c = rate / r.outputs[item];
    crafts[r.id] = (crafts[r.id] ?? 0) + c;
    for (const [i, n] of Object.entries(r.inputs)) need(i, c * n, depth + 1);
    const line = linesByRecipe().get(r.id);
    const m = line ? MACHINES[line.machine] : machineFor(r);
    // A line not built yet adds its draw; built lines are already in the measured demand
    if (m?.power && !line?.count) need(m.power.item, (c / perMachine(m, r)) * m.power.amount * overclock(m, r).power, depth + 1);
    if (m?.upkeep && s().maintenance) need(MAINTENANCE_ITEM, ((c / perMachine(m, r)) * m.upkeep) / 60, depth + 1);
    stack.delete(item);
  };
  for (const [item, rate] of Object.entries(targets)) need(item, rate, 0);
  return crafts;
}

/** The line the bot grows for each recipe: the one on the highest-tier machine */
const linesByRecipe = () => {
  const out = new Map<string, Line>();
  for (const l of s().lines) {
    const cur = out.get(l.recipe);
    if (!cur || MACHINES[l.machine].tier > MACHINES[cur.machine].tier) out.set(l.recipe, l);
  }
  return out;
};

// ---------- targets: what the bot is working toward ----------

/** Materials a build or upgrade lacked last time, kept until bought */
let buildWants: Record<string, number> = {};

function targets(): Record<string, number> {
  const st = s();
  const want: Record<string, number> = {};
  const add = (cost: Record<string, number>, horizon: number, scale = 1) => {
    for (const [i, n] of Object.entries(cost)) {
      const short = n * scale - (st.items[i] ?? 0);
      if (short > 0) want[i] = (want[i] ?? 0) + short / horizon;
    }
  };
  for (const t of TECH_LIST) if (techAvailable(st, t.id)) add(techCost(st, t.id), HORIZON);
  for (const m of MILESTONE_LIST) {
    if (st.milestones.includes(m.id) || !milestoneUnlocked(st, m.id)) continue;
    add(m.cost, HORIZON);
    if (m.holds) add(m.holds, HORIZON * 3);
  }
  add(buildWants, HORIZON / 3);
  // Ships burn rocket fuel at home for every item they carry
  const shipping = (st.routes ?? []).reduce((n, r) => n + (r.enabled ? r.ships * SHIP_RATE * routeFuel(r.from, r.to) : 0), 0);
  if (shipping > 0) want[SHIP_FUEL_ITEM] = (want[SHIP_FUEL_ITEM] ?? 0) + shipping * 1.25;
  add(saveFor, HORIZON);
  saveFor = {};
  // Power is planned from what the grid actually draws, like a player reading the top bar: keep 25% spare
  // The whole draw, not the gap: the plan turns it into generators *and* their fuel in proportion, so a
  // fuel shortage builds fuel rather than more idle generators
  for (const [p, ps] of Object.entries(last?.power ?? {})) if (ps.demand > 0) want[p] = Math.max(want[p] ?? 0, ps.demand * 1.25);
  // Running machines keep consuming: keep their inputs flowing (the plan adds those through recipes)
  return want;
}

// ---------- acting ----------

/** Machines the plan wants on each line, from the last decision */
const wantedCount = new Map<number, number>();

function ensureLines(crafts: Record<string, number>) {
  const st = s();
  buildWants = {};
  wantedCount.clear();
  const order = Object.entries(crafts).sort((a, b) => a[1] - b[1]);
  for (const [rid, c] of order) {
    const r = RECIPES[rid];
    let line = linesByRecipe().get(rid);
    // A better machine than the line's, with no in-place upgrade (basic drill → electric drill): start a new line on it
    const better = machineFor(r);
    if (line && better && better.tier > MACHINES[line.machine].tier && !upgradeTarget(st, line)) line = undefined;
    if (!line) {
      // Nothing standing for this recipe and the best machine out of reach (the big plant costs the plastic
      // it would make): start on the best one that can be paid for, as a player would
      const cheaper = MACHINE_LIST.filter((x) => canRun(x, r) && isMachineUnlocked(st, x.id) && canAfford(st, x.cost)).sort((a, b) => b.tier - a.tier)[0];
      const m = better && !canAfford(st, better.cost) && cheaper ? cheaper : better;
      if (!m) continue;
      const id = addLine(m.id, rid);
      if (id === null) continue;
      line = st.lines.find((l) => l.id === id)!;
      if (VERBOSE) log(`new line ${m.name} · ${r.name}`);
    }
    const m = MACHINES[line.machine];
    // 20% headroom, so a line on the edge doesn't stall everything behind it
    const wantCount = Math.max(1, Math.ceil((c * 1.2) / perMachine(m, r)));
    wantedCount.set(line.id, wantCount);
    const missing = wantCount - line.count;
    if (missing <= 0) continue;
    const orbit = !!m.orbital;
    if (slotsUsed(st, orbit) + m.slots > slotsTotal(st, orbit)) continue;
    const before = line.count;
    build(line.id, missing);
    if (line.count < wantCount && !canAfford(st, m.cost)) {
      for (const [i, n] of Object.entries(m.cost)) buildWants[i] = Math.max(buildWants[i] ?? 0, n);
    }
    if (VERBOSE && line.count > before) log(`build ${m.name} · ${r.name} ${before}→${line.count}`);
  }
}

/** Colonies: geothermal power first, then the lines the plan asked for, then ships to bring the goods home */
const colonyLog: string[] = [];
/** The smallest share of what the plan asked a colony for that its slots could hold */
const colonyShort: Record<string, number> = {};
function runColonies() {
  for (const [planet, crafts] of Object.entries(awayCrafts)) {
    switchPlanet(planet);
    const st = s();
    const best = (r: RecipeDef) => MACHINE_LIST.filter((m) => canRun(m, r) && isMachineUnlocked(st, m.id)).sort((a, b) => b.tier - a.tier)[0];
    const lineFor = (r: RecipeDef) => {
      const have = st.lines.find((l) => l.recipe === r.id);
      if (have) return have;
      const id = addLine(best(r).id, r.id);
      return st.lines.find((l) => l.id === id)!;
    };
    const grow = (r: RecipeDef, want: number) => {
      const line = lineFor(r);
      const m = MACHINES[line.machine];
      const before = line.count;
      if (want > before) build(line.id, want - before);
      if (line.count > before) colonyLog.push(`${fmtT(st.playTime)} ${planet} ${m.name}·${r.name} ${before}→${line.count}`);
      if (line.count < want && !canAfford({ ...st, items: storeOf(st, HOME)!.items }, m.cost)) {
        for (const [i, n] of Object.entries(m.cost)) buildWants[i] = Math.max(buildWants[i] ?? 0, n);
      }
      return line;
    };
    // What the asked-for recipes need that is made on the spot (magma for the foundries)
    const gen = RECIPE_LIST.find((r) => r.outputs.eu && recipePlanet(r) === planet && unlocked(r));
    const isExtra = (rid: string) => Object.keys(RECIPES[rid].outputs).some((o) => LAVA_EXTRA.has(o));
    const sized = (base: number, extra: number) => {
      const all: Record<string, number> = {};
      const expand = (rid: string, c: number, depth: number) => {
        if (c <= 0) return;
        all[rid] = (all[rid] ?? 0) + c;
        if (depth > 6) return;
        for (const [i, n] of Object.entries(RECIPES[rid].inputs)) {
          const src = RECIPE_LIST.find((r) => r.outputs[i] && unlocked(r) && recipePlanet(r) === planet);
          if (src) expand(src.id, (c * n) / src.outputs[i], depth + 1);
        }
      };
      for (const [rid, c] of Object.entries(crafts)) expand(rid, c * (isExtra(rid) ? extra : base), 0);
      const ws = Object.entries(all).map(([rid, c]) => {
        const r = RECIPES[rid];
        const m = best(r);
        return { r, m, count: Math.max(1, Math.ceil((c * 1.2) / perMachine(m, r))), c };
      });
      const draw = ws.reduce((n, w) => n + (w.m.power ? w.count * w.m.power.amount * overclock(w.m, w.r).power : 0), 0);
      const gens = gen && draw > 0 ? Math.ceil((draw * 1.25) / gen.outputs.eu) : 0;
      return { ws, gens, slots: gens + ws.reduce((n, w) => n + w.count * w.m.slots, 0) };
    };
    // The colony's slots are what limits it: what only tops up home (iridium) gives way first, then the rest shrinks
    let base = 1;
    let extra = 1;
    let fit = sized(base, extra);
    while (fit.slots > slotsTotal(st) && extra > 0) fit = sized(base, (extra = extra < 0.05 ? 0 : extra * 0.8));
    while (fit.slots > slotsTotal(st) && base > 0.02) fit = sized((base *= 0.85), extra);
    if (base < 1) colonyShort[planet] = Math.min(colonyShort[planet] ?? 1, base);
    const wants = fit.ws.filter((w) => crafts[w.r.id] !== undefined);
    // Power first, and nothing that draws it until a generator stands; then pumps before what they feed
    const lit = !gen || fit.gens === 0 || grow(gen, fit.gens).count > 0;
    if (lit) for (const w of [...fit.ws].sort((a, b) => Object.keys(a.r.inputs).length - Object.keys(b.r.inputs).length)) grow(w.r, w.count);
    switchPlanet(HOME);
    for (const w of wants) {
      for (const [item, n] of Object.entries(w.r.outputs)) {
        if (isPower(item)) continue;
        const id = addRoute(item, planet, HOME);
        if (id === null) continue;
        const route = s().routes!.find((x) => x.id === id)!;
        const ships = Math.max(1, Math.ceil((w.c * n * 1.2) / SHIP_RATE));
        const before = route.ships;
        if (ships > before) buildShip(id, ships - before);
        if (route.ships > before) colonyLog.push(`${fmtT(s().playTime)} 航線 ${ITEMS[item].name} ${planet}→home 船 ${before}→${route.ships}`);
        if (route.ships < ships) for (const [i, c] of Object.entries(SHIP_COST)) buildWants[i] = Math.max(buildWants[i] ?? 0, c);
      }
    }
  }
}

/** Pause lines the plan doesn't use (they'd eat shared inputs), resume the ones it does */
function pauseIdle(crafts: Record<string, number>) {
  const lines = linesByRecipe();
  // Items whose planned route has no machines yet: an older route keeps making them meanwhile
  const unbuilt = new Set(
    Object.keys(crafts).filter((rid) => (lines.get(rid)?.count ?? 0) === 0).flatMap((rid) => Object.keys(RECIPES[rid].outputs)),
  );
  const fuel = fuelLines(s());
  for (const l of s().lines) {
    const outs = Object.keys(RECIPES[l.recipe].outputs);
    // Generators only burn what demand asks for, and their fuel chain keeps them able to: pausing either is
    // never what a player wants
    const wanted = (crafts[l.recipe] ?? 0) > 1e-6 || outs.some(isPower) || fuel.has(l.id) || outs.some((o) => unbuilt.has(o));
    if (l.enabled !== wanted) toggleLine(l.id);
  }
}

/** Recipes that keep the generators fed: generators themselves and, recursively, what makes their fuel */
function powerChain(): Set<string> {
  const chain = new Set<string>();
  const visit = (item: string, depth: number) => {
    if (depth > 8) return;
    for (const l of s().lines) {
      const r = RECIPES[l.recipe];
      if (l.count === 0 || !r.outputs[item] || chain.has(r.id)) continue;
      chain.add(r.id);
      for (const i of Object.keys(r.inputs)) visit(i, depth + 1);
    }
  };
  for (const p of ['eu', 'steam', 'lift']) visit(p, 0);
  return chain;
}

/** Counts brownouts (under 60%); with `--shed`, also pauses everything off the power chain until the grid
 *  recovers, as a player had to before the game powered the fuel chain first */
let brownout = false;
const brownouts: string[] = [];
function shedLoad() {
  const st = s();
  const sat = Math.min(...['eu', 'steam'].map((p) => (last?.power[p]?.demand ? last.power[p].satisfaction : 1)));
  if (!brownout && sat < 0.6) {
    brownout = true;
    brownouts.push(`T${currentTier(st)} ${fmtT(st.playTime)}`);
  } else if (brownout && sat >= 0.98) brownout = false;
  // The game now powers the generators' fuel chain first, so a player no longer has to pause lines by hand;
  // `--shed` restores the old manual load shedding for comparison
  if (!brownout || !process.argv.includes('--shed')) return;
  const chain = powerChain();
  for (const l of st.lines) if (l.enabled && MACHINES[l.machine].power && !chain.has(l.recipe)) toggleLine(l.id);
}

const idleSince = new Map<number, number>();

/** When slots are tight, upgrade the line that saves the most slots per material, and scrap
 *  low-tier lines that a better line for the same recipe has replaced */
function upgradeWhenTight() {
  const st = s();
  if (slotsUsed(st) >= slotsTotal(st) * 0.85) {
    // Lines built up for an earlier need give back what the plan no longer wants
    for (const l of st.lines) {
      const want = wantedCount.get(l.id);
      // Never generators: power is shared, and the plan's figure for one generator ignores the others it replaces
      const gen = Object.keys(RECIPES[l.recipe].outputs).some(isPower);
      if (!gen && want !== undefined && l.count > want * 1.5 + 1) {
        if (VERBOSE) log(`trim ${MACHINES[l.machine].name} · ${RECIPES[l.recipe].name} ${l.count}→${want}`);
        demolish(l.id, l.count - want);
      }
    }
    // Spare generators: a grid running at under two-thirds load gives a machine back from its idlest line
    for (const p of ['eu', 'steam']) {
      const ps = last?.power[p];
      if (!ps || ps.capacity < ps.demand * 1.5 + 10) continue;
      const gens = st.lines.filter((l) => l.count > 1 && RECIPES[l.recipe].outputs[p] && (last?.lines[l.id]?.efficiency ?? 1) < 0.67);
      const idlest = gens.sort((a, b) => (last!.lines[a.id]?.efficiency ?? 0) - (last!.lines[b.id]?.efficiency ?? 0))[0];
      if (idlest) {
        if (VERBOSE) log(`trim generator ${MACHINES[idlest.machine].name} · ${RECIPES[idlest.recipe].name} ${idlest.count}→${idlest.count - 1}`);
        demolish(idlest.id, 1);
      }
    }
    // Lines the plan stopped using half an hour ago (smelters replaced by a colony): give the slots back
    for (const l of [...st.lines]) {
      if (l.enabled || l.count === 0) idleSince.delete(l.id);
      else if (!idleSince.has(l.id)) idleSince.set(l.id, st.playTime);
      else if (
        st.playTime - idleSince.get(l.id)! > 1800 &&
        // Never the old line while its replacement still stands empty (the plant that needs plastic to build
        // can't replace the reactor that makes the ethylene for it)
        !st.lines.some((o) => o !== l && o.recipe === l.recipe && o.count === 0)
      ) {
        if (VERBOSE) log(`scrap unused ${MACHINES[l.machine].name}×${l.count} · ${RECIPES[l.recipe].name}`);
        idleSince.delete(l.id);
        removeLine(l.id);
      }
    }
    const keep = linesByRecipe();
    for (const l of [...st.lines]) {
      const best = keep.get(l.recipe)!;
      if (best !== l && best.count >= l.count && (last?.lines[best.id]?.efficiency ?? 0) > 0.9) {
        if (VERBOSE) log(`scrap ${MACHINES[l.machine].name}×${l.count} · ${RECIPES[l.recipe].name}`);
        removeLine(l.id);
      }
    }
  }
  for (const orbit of [false, true]) {
    if (slotsTotal(st, orbit) === 0 || slotsUsed(st, orbit) < slotsTotal(st, orbit) * 0.85) continue;
    const lines = st.lines.filter((l) => l.count > 1 && !!MACHINES[l.machine].orbital === orbit && upgradeTarget(st, l));
    lines.sort((a, b) => b.count - a.count);
    for (const l of lines.slice(0, 3)) {
      const to = upgradeTarget(st, l)!;
      const pays = Object.fromEntries(Object.entries(upgradeCost(l, to)).filter(([, n]) => n > 0));
      if (canAfford(st, pays)) {
        const from = MACHINES[l.machine].name;
        upgradeLine(l.id);
        if (VERBOSE) log(`upgrade ${from} → ${to.name} ×${l.count}`);
      } else {
        for (const [i, n] of Object.entries(pays)) buildWants[i] = Math.max(buildWants[i] ?? 0, n);
      }
    }
  }
}

function researchAll(): boolean {
  let any = false;
  for (;;) {
    const st = s();
    const ok = TECH_LIST.filter((t) => techAvailable(st, t.id) && canAfford(st, techCost(st, t.id)));
    if (ok.length === 0) return any;
    const t = ok.sort((a, b) => Object.values(techCost(st, a.id))[0] - Object.values(techCost(st, b.id))[0])[0];
    research(t.id);
    any = true;
    if (VERBOSE) log(`research ${t.name}`);
  }
}

/** A co-product filling up and blocking a line the plan needs (aluminium dust beside oxygen, sodium
 *  beside chlorine): vent it, as the storage window allows for any stockable item */
function ventBlockers(crafts: Record<string, number>) {
  const st = s();
  for (const l of st.lines) {
    const r = last?.lines[l.id]?.reason;
    // Planned or not: an enabled line stopped by a full co-product is making something the factory uses
    if (!l.enabled || l.count === 0 || r?.kind !== 'output' || st.vent.includes(r.item)) continue;
    // An unplanned line counts only when another of its outputs has run dry (towers jammed on light oil
    // while ethylene starves for refinery gas)
    const dry = Object.keys(RECIPES[l.recipe].outputs).some((o) => o !== r.item && !isPower(o) && (st.items[o] ?? 0) < capOf(st, o) * 0.02);
    if (!crafts[l.recipe] && !dry) continue;
    // Only a co-product in the way: the recipe makes something else too. Venting only burns the overflow of a
    // full store, so it's safe even when something else uses the item (the salt ⇄ sodium loop needs exactly this)
    if (Object.keys(RECIPES[l.recipe].outputs).filter((o) => !isPower(o)).length < 2) continue;
    toggleVent(r.item);
    if (st.vent.includes(r.item)) vented.push(`${ITEMS[r.item].name}（T${currentTier(st)}，${fmtT(st.playTime)}）`);
  }
}

const vented: string[] = [];
function ventFull() {
  const st = s();
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.kind !== 'byproduct' || st.vent.includes(id)) continue;
    if ((st.items[id] ?? 0) >= capOf(st, id) * 0.95) {
      toggleVent(id);
      vented.push(`${def.name}（T${currentTier(st)}，${fmtT(st.playTime)}）`);
    }
  }
}

/** Taps the raw material a build is waiting on, while there is no machine making it yet */
function handGather() {
  const st = s();
  const manual = Object.keys(ITEMS).filter((i) => ITEMS[i].manual);
  // What lines are starved of, plus what a build is waiting on
  const starved = new Set(
    st.lines.flatMap((l) => {
      const r = last?.lines[l.id]?.reason;
      return r && r.kind === 'input' ? [r.item] : [];
    }),
  );
  const wanted = manual
    .filter((i) => starved.has(i) || (buildWants[i] ?? 0) >= (st.items[i] ?? 0) || (st.lines.length === 0 && (st.items[i] ?? 0) < 20))
    .filter((i) => !st.lines.some((l) => l.count > 0 && RECIPES[l.recipe].outputs[i]));
  // Smelting needs ore and coal together, and the first furnace needs stone: tap round-robin
  const pool = wanted.length ? wanted : st.lines.length < 3 ? ['stone', 'iron_ore', 'coal', 'copper_ore'] : [];
  for (let k = 0; k < TAPS_PER_SEC && pool.length; k++) gather(pool[k % pool.length]);
  return pool.length > 0;
}

// ---------- the loop ----------

interface Mark { what: string; t: number }
const marks: Mark[] = [];
const tierStart: Record<number, number> = { [FROM]: 0 };
let lastProgress = 0;
let lastObjective = -1;
let tappedSecs = 0;
let last: TickResult | null = null;
const powerShort: Record<string, number> = {};

function snapshotStuck(): string[] {
  const st = s();
  const out: string[] = [];
  const idx = currentObjective(st);
  out.push(`目標：${idx >= 0 ? OBJECTIVES[idx].text : '（全部完成）'}`);
  const avail = TECH_LIST.filter((t) => techAvailable(st, t.id));
  out.push(`可研究：${avail.map((t) => `${t.name}（${Object.entries(techCost(st, t.id)).map(([i, n]) => `${ITEMS[i].name} ${Math.floor(st.items[i] ?? 0)}/${n}`).join('、')}）`).join('；') || '無'}`);
  for (const m of MILESTONE_LIST.filter((x) => !st.milestones.includes(x.id) && milestoneUnlocked(st, x.id))) {
    out.push(`巨構 ${m.name}：${Object.entries({ ...m.cost, ...(m.holds ?? {}) }).map(([i, n]) => `${ITEMS[i].name} ${Math.floor(st.items[i] ?? 0)}/${n}`).join('、')}`);
  }
  if (missingWhy.size) out.push(`做不出來：${[...missingWhy.keys()].map((i) => ITEMS[i]?.name ?? i).join('、')}`);
  const stuck = st.lines
    .map((l) => ({ l, ls: last?.lines[l.id] }))
    .filter(({ l, ls }) => ls && l.count > 0 && ls.efficiency < 0.9 && !['load', 'paused', 'idle'].includes(ls.reason.kind));
  for (const { l, ls } of stuck.slice(0, 12)) {
    const why = 'item' in ls!.reason ? `${ls!.reason.kind}:${ITEMS[ls!.reason.item]?.name ?? ls!.reason.item}` : ls!.reason.kind;
    out.push(`  卡住 ${MACHINES[l.machine].name}×${l.count} · ${RECIPES[l.recipe].name} ${Math.round(ls!.efficiency * 100)}% ${why}`);
  }
  for (const [p, ps] of Object.entries(last?.power ?? {})) {
    if (ps.demand || ps.capacity) out.push(`${ITEMS[p].name}：需求 ${ps.demand.toFixed(1)} 可供 ${ps.capacity.toFixed(1)} 實供 ${ps.supply.toFixed(1)}`);
  }
  for (const l of st.lines.filter((x) => Object.keys(RECIPES[x.recipe].outputs).some(isPower) || Object.keys(RECIPES[x.recipe].inputs).some(isPower))) {
    const ls = last?.lines[l.id];
    out.push(`  發電/轉換 ${MACHINES[l.machine].name}×${l.count} · ${RECIPES[l.recipe].name} ${l.enabled ? '' : '（暫停）'}${ls ? `${Math.round(ls.efficiency * 100)}% ${ls.reason.kind}${'item' in ls.reason ? ':' + ITEMS[ls.reason.item]?.name : ''}` : ''}`);
  }
  const big = [...st.lines].sort((a, b) => b.count * MACHINES[b.machine].slots - a.count * MACHINES[a.machine].slots).slice(0, 10);
  out.push(`最佔槽位：${big.map((l) => `${MACHINES[l.machine].name}·${RECIPES[l.recipe].name}×${l.count}`).join('、')}`);
  out.push(`槽位 ${slotsUsed(st)}/${slotsTotal(st)}，軌道 ${slotsUsed(st, true)}/${slotsTotal(st, true)}，線 ${st.lines.length}`);
  if (Object.keys(buildWants).length) out.push(`等材料蓋機器：${Object.entries(buildWants).map(([i, n]) => `${ITEMS[i].name} ${Math.floor(st.items[i] ?? 0)}/${n}`).join('、')}`);
  return out;
}

let stuckAt: number | null = null;
for (let sec = 0; sec < MAX_HOURS * 3600; sec++) {
  const st = s();
  if (sec % DECIDE_EVERY === 0) {
    claimObjectives();
    const researched = researchAll();
    for (const m of MILESTONE_LIST) {
      if (!st.milestones.includes(m.id) && milestoneUnlocked(st, m.id) && canAfford(st, m.cost) && canAfford(st, m.holds ?? {})) {
        buildMilestone(m.id);
        marks.push({ what: `巨構 ${m.name}`, t: st.playTime });
        log(`★ 建成巨構「${m.name}」→ ${TIER_NAMES[currentTier(st)]}`);
        tierStart[currentTier(st)] ??= st.playTime;
        lastProgress = st.playTime;
      }
    }
    if (tierStart[1] === undefined && currentTier(st) >= 1) {
      tierStart[1] = st.playTime;
      log(`★ 研究蒸汽動力 → ${TIER_NAMES[1]}`);
    }
    if (st.milestones.includes('stargate')) break;
    if (researched) lastProgress = st.playTime;
    missingWhy.clear();
    awayCrafts = {};
    const tg = targets();
    const crafts = plan(tg);
    if (process.argv.includes('--debug-at=' + Math.floor(st.playTime / 60))) {
      console.log('targets', JSON.stringify(tg), '\ncrafts', JSON.stringify(crafts), '\nbuildWants', JSON.stringify(buildWants), '\nitems', JSON.stringify(st.items));
    }
    // Colonies first: a few machines there gate whole tiers (deuterium, ceramic), and home would spend the titanium
    const forColonies = { ...buildWants };
    runColonies();
    const fromColonies = { ...buildWants };
    ensureLines(crafts);
    for (const [i, n] of Object.entries(fromColonies)) if (n > (forColonies[i] ?? 0)) buildWants[i] = Math.max(buildWants[i] ?? 0, n);
    pauseIdle(crafts);
    shedLoad();
    upgradeWhenTight();
    ventFull();
    ventBlockers(crafts);
    checkAchievements(true);
    const obj = currentObjective(st);
    if (obj !== lastObjective) {
      lastObjective = obj;
      lastProgress = st.playTime;
      if (VERBOSE && obj >= 0) log(`目標 ${obj + 1}/${OBJECTIVES.length}：${OBJECTIVES[obj].text}`);
    }
    if (st.playTime - lastProgress > STALL_LIMIT) {
      stuckAt = st.playTime;
      break;
    }
  }
  if (FROM === 0 && st.playTime < 3 * 3600 && handGather()) tappedSecs++;
  last = tickAll(st, simSpeed(st)).last;
  st.playTime += 1;
  for (const [p, ps] of Object.entries(last.power)) if (ps.demand > 0 && ps.satisfaction < 0.9) powerShort[p] = (powerShort[p] ?? 0) + 1;
}

// ---------- report ----------

const st = s();
console.log('\n===== 全流程結果 =====');
console.log(st.milestones.includes('stargate') ? `通關：建成星門，遊玩 ${fmtT(st.playTime)}` : stuckAt ? `卡住：${fmtT(stuckAt)} 起 ${STALL_LIMIT / 3600} 小時沒有進展` : `${MAX_HOURS} 小時內沒有通關`);
console.log('\n各時代花費：');
const tiers = Object.keys(tierStart).map(Number).sort((a, b) => a - b);
for (const [i, t] of tiers.entries()) {
  const end = tiers[i + 1] !== undefined ? tierStart[tiers[i + 1]] : st.playTime;
  console.log(`  T${t} ${TIER_NAMES[t].padEnd(8, '　')} ${fmtT(end - tierStart[t]).padStart(7)}（${fmtT(tierStart[t])} 開始）`);
}
console.log(`\n目標進度：${Math.max(0, currentObjective(st))}/${OBJECTIVES.length}${currentObjective(st) >= 0 ? `，停在「${OBJECTIVES[currentObjective(st)].text}」` : ''}`);
console.log(`研究 ${st.techs.length}/${TECH_LIST.length}，生產線 ${st.lines.length} 條、機器 ${st.lines.reduce((n, l) => n + l.count, 0)} 台，槽位 ${slotsUsed(st)}/${slotsTotal(st)}`);
console.log(`手動採集 ${st.stats.gathered} 次（約 ${Math.round(tappedSecs / 60)} 分鐘在點）`);
for (const p of openPlanets(st).filter((x) => x !== HOME)) {
  const o = storeOf(st, p)!;
  console.log(`殖民地 ${p}：${o.lines.map((l) => `${MACHINES[l.machine].name}·${RECIPES[l.recipe].name}×${l.count}`).join('、') || '沒有生產線'}`);
}
if (Object.keys(colonyShort).length) console.log(`殖民地槽位不夠，只蓋得下計畫的：${Object.entries(colonyShort).map(([p, f]) => `${p} ${Math.round(f * 100)}%`).join('、')}`);
console.log(`航線：${(st.routes ?? []).map((r) => `${ITEMS[r.item].name} ${r.from}→${r.to} ×${r.ships}`).join('、') || '無'}`);
if (VERBOSE) for (const l of colonyLog) console.log('  ' + l);
console.log(`打開排放：${vented.join('、') || '無'}`);
console.log(`電力跌破 60%：${brownouts.length} 次${brownouts.length ? `（${brownouts.slice(0, 6).join('、')}${brownouts.length > 6 ? ' …' : ''}）` : ''}`);
console.log(`電力不足的時間：${Object.entries(powerShort).map(([p, n]) => `${ITEMS[p].name} ${fmtT(n)}`).join('、') || '無'}`);
const inspect = (process.argv.find((a) => a.startsWith('--item=')) ?? '').slice(7);
if (inspect) {
  console.log(`\n${ITEMS[inspect].name}：庫存 ${Math.floor(st.items[inspect] ?? 0)}/${capOf(st, inspect)}，排放 ${st.vent.includes(inspect)}`);
  for (const l of st.lines.filter((x) => inspect in RECIPES[x.recipe].inputs || inspect in RECIPES[x.recipe].outputs)) {
    const ls = last?.lines[l.id];
    const r = RECIPES[l.recipe];
    const net = ((r.outputs[inspect] ?? 0) - (r.inputs[inspect] ?? 0)) * (ls?.craftsPerSec ?? 0);
    console.log(`  ${MACHINES[l.machine].name}×${l.count} · ${r.name}${l.enabled ? '' : '（暫停）'} ${net >= 0 ? '+' : ''}${net.toFixed(3)}/s ${ls ? `${Math.round(ls.efficiency * 100)}% ${ls.reason.kind}${'item' in ls.reason ? ':' + ITEMS[ls.reason.item]?.name : ''}` : ''}`);
  }
}
if (stuckAt || !st.milestones.includes('stargate')) {
  console.log('\n卡住時的狀況：');
  for (const l of snapshotStuck()) console.log('  ' + l);
}
