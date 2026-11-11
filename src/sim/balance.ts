// Rough economics for balancing: prices every item through one main recipe.
// Used by scripts/balance.ts (the report) and balance.test.ts (the pacing invariants).
import { GALAXIES, STARS, systemBoost, type StarSystem } from '../data/galaxies';
import { DEFAULT_CAP, ITEMS, isPower } from '../data/items';
import { MACHINE_LIST } from '../data/machines';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../data/recipes';
import { MILESTONE_LIST, TECH_LIST } from '../data/tech';
import { canRun } from './rules';

/** Where the default (first recipe whose first output is the item) is not the mature route */
const PRIMARY: Record<string, string> = {
  steel: 'bf_steel',
  iron_ingot: 'smelt_iron',
  stone_brick: 'fire_brick',
  gear: 'craft_gear',
  sand: 'crush_stone',
  light_oil: 'distill_crude',
  heavy_oil: 'distill_crude',
  refinery_gas: 'distill_crude',
  sulfur: 'distill_crude',
  oxygen: 'electrolyze_bauxite',
  iron_oxide: 'crush_slag',
  chlorine: 'electrolyze_salt',
  helium: 'collect_helium',
  coolant: 'make_coolant',
  slag: 'press_steel',
};

/** EU per unit of each carrier: turbines turn 20 steam into 10 EU, the elevator 256 EU into 100 lift */
export const EU_PER: Record<string, number> = { eu: 1, steam: 0.5, lift: 2.56 };

/** Raw ore units, machine-seconds at the recipe's own tier (no overclock), and EU */
export interface Price { raw: number; secs: number; eu: number }
export const ZERO: Price = { raw: 0, secs: 0, eu: 0 };
export const addPrice = (a: Price, b: Price, k = 1): Price => ({ raw: a.raw + b.raw * k, secs: a.secs + b.secs * k, eu: a.eu + b.eu * k });

export function primaryRecipe(item: string): RecipeDef | undefined {
  if (PRIMARY[item]) return RECIPES[PRIMARY[item]];
  return RECIPE_LIST.find((r) => Object.keys(r.outputs)[0] === item) ?? RECIPE_LIST.find((r) => item in r.outputs);
}

/** Cheapest machine of exactly the recipe's tier, else the lowest that can run it */
export function baseMachine(r: RecipeDef) {
  const ms = MACHINE_LIST.filter((m) => canRun(m, r)).sort((a, b) => a.tier - b.tier);
  return ms.find((m) => m.tier === r.tier) ?? ms[0];
}

const memo: Record<string, Price> = {};
const visiting = new Set<string>();

export function price(item: string): Price {
  if (memo[item]) return memo[item];
  const r = primaryRecipe(item);
  if (!r) return { raw: 1, secs: 0, eu: 0 };
  // Loops (salt, chlorine) are priced once; the inner visit counts as free
  if (visiting.has(item)) return ZERO;
  visiting.add(item);
  const m = baseMachine(r);
  // Mined raw items count as raw ore; everything else costs its inputs
  let p: Price = { raw: Object.keys(r.inputs).length === 0 && ITEMS[item].kind === 'raw' ? r.outputs[item] : 0, secs: r.time, eu: 0 };
  if (m.power) p.eu += m.power.amount * r.time * (EU_PER[m.power.item] ?? 1);
  for (const [i, n] of Object.entries(r.inputs)) {
    if (isPower(i)) p.eu += n * (EU_PER[i] ?? 1);
    else p = addPrice(p, price(i), n);
  }
  // Credit non-byproduct co-products (salt returned by reduction); byproducts ride free
  for (const [o, n] of Object.entries(r.outputs)) {
    if (o === item || isPower(o) || ITEMS[o].kind === 'byproduct') continue;
    if (!visiting.has(o)) p = addPrice(p, price(o), -n);
  }
  visiting.delete(item);
  const per = r.outputs[item];
  memo[item] = { raw: p.raw / per, secs: p.secs / per, eu: p.eu / per };
  return memo[item];
}

export const costOf = (cost: Record<string, number>) =>
  Object.entries(cost).reduce((p, [i, n]) => addPrice(p, price(i), n), ZERO);

export interface TierCost {
  tier: number;
  data: Record<string, number>;
  research: Price;
  /** The milestone, plus anything it makes you hold beyond what earlier milestones granted (the swarm) */
  milestone: Price;
  /** research + milestone machine-seconds */
  total: number;
}

export function tierCosts(): TierCost[] {
  const granted: Record<string, number> = {};
  const out: TierCost[] = [];
  const top = Math.max(...TECH_LIST.map((t) => t.tier));
  for (let tier = 1; tier <= top; tier++) {
    const data: Record<string, number> = {};
    for (const t of TECH_LIST.filter((x) => x.tier === tier)) {
      for (const [i, n] of Object.entries(t.cost)) data[i] = (data[i] ?? 0) + n;
    }
    const research = costOf(data);
    const ms = MILESTONE_LIST.find((m) => m.tier === tier);
    let milestone = ms ? costOf(ms.cost) : ZERO;
    for (const [i, n] of Object.entries(ms?.holds ?? {})) milestone = addPrice(milestone, price(i), Math.max(0, n - (granted[i] ?? 0)));
    for (const [i, n] of Object.entries(ms?.grantsItems ?? {})) granted[i] = (granted[i] ?? 0) + n;
    out.push({ tier, data, research, milestone, total: research.secs + milestone.secs });
  }
  return out;
}

/** Storage cap of an item using only the storage techs from earlier tiers (a conservative guess) */
export function capAtTier(tier: number, item: string): number {
  const mult = TECH_LIST.filter((t) => t.tier < tier && t.storageMult).reduce((m, t) => m * t.storageMult!, 1);
  return (ITEMS[item]?.capBase ?? DEFAULT_CAP) * mult;
}

/** Every tech, milestone or machine cost that would not fit in storage when it first becomes available */
export function costsOverCap(): string[] {
  const over: string[] = [];
  const check = (what: string, tier: number, cost: Record<string, number>) => {
    for (const [i, n] of Object.entries(cost)) {
      if (n > capAtTier(tier, i)) over.push(`${what} (T${tier}): ${ITEMS[i].name} ${n} > ${capAtTier(tier, i)}`);
    }
  };
  for (const t of TECH_LIST) check(`tech ${t.name}`, t.tier, t.cost);
  for (const m of MILESTONE_LIST) check(`milestone ${m.name}`, m.tier, { ...m.cost, ...(m.holds ?? {}) });
  for (const m of MACHINE_LIST) check(`machine ${m.name}`, Math.max(1, m.tier), m.cost);
  return over;
}

// ---------- star systems ----------

let shares: Record<string, number> | null = null;

/** Machine-seconds the whole game (every research and milestone, on base machines) spends in each recipe category */
export function categoryShares(): Record<string, number> {
  if (shares) return shares;
  const out: Record<string, number> = {};
  const walking = new Set<string>();
  const spread = (item: string, n: number) => {
    const r = primaryRecipe(item);
    // Loops (salt ⇄ sodium) are walked once
    if (!r || isPower(item) || walking.has(item)) return;
    walking.add(item);
    const crafts = n / r.outputs[item];
    out[r.category] = (out[r.category] ?? 0) + crafts * r.time;
    for (const [i, k] of Object.entries(r.inputs)) spread(i, crafts * k);
    walking.delete(item);
  };
  for (const t of TECH_LIST) for (const [i, n] of Object.entries(t.cost)) spread(i, n);
  for (const m of MILESTONE_LIST) for (const [i, n] of Object.entries({ ...m.cost, ...(m.holds ?? {}) })) spread(i, n);
  return (shares = out);
}

/** Machine time the same game takes in this system next to the first one: the same goods at 1/boost the speed
 *  need 1/boost more machine-seconds. Power is not in it. */
export function systemStretch(sys: StarSystem | null | undefined): number {
  if (!sys) return 1;
  const share = categoryShares();
  const total = Object.values(share).reduce((a, b) => a + b, 0);
  const trait = sys.trait ? GALAXIES[sys.trait]?.boost : undefined;
  return Object.entries(share).reduce((sum, [c, n]) => sum + n / ((trait?.[c] ?? 1) * systemBoost(sys, c)), 0) / total;
}

/** Extra legacy points for building a stargate here and warping on: one for every 5% of extra machine time,
 *  plus what the star is worth for its dim light (less helium-3, a weaker swarm), which machine time doesn't show */
export function systemBonus(sys: StarSystem | null | undefined): number {
  if (!sys) return 0;
  return (STARS[sys.star]?.bonus ?? 0) + Math.max(0, Math.round((systemStretch(sys) - 1) * 20));
}

