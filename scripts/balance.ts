// Balance report: run with `npx vite-node scripts/balance.ts`.
// Prices every item through one main recipe, then totals research and milestone cost per tier.
import { ITEMS, isPower } from '../src/data/items';
import { MACHINE_LIST } from '../src/data/machines';
import { RECIPE_LIST } from '../src/data/recipes';
import { EU_PER, baseMachine, costOf, costsOverCap, price, categoryShares, systemBonus, systemStretch, tierCosts } from '../src/sim/balance';
import { GALAXY_LIST, STAR_LIST, VEINS, rollSystems } from '../src/data/galaxies';
import { SWARM_EU } from '../src/data/items';
import { LEGACY_LIST, legacyCost } from '../src/data/legacy';
import { SHIP_COST, SHIP_RATE, routeFuel } from '../src/data/planets';
import { MILESTONE_LIST, TECH_LIST } from '../src/data/tech';

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 100 ? `${Math.round(n)}` : n.toFixed(1));

// ---------- 1. tier totals ----------
console.log('## Cost per tier (raw ore units / machine-seconds at base tier / EU)\n');
console.log('Milestones include anything they make you hold beyond what earlier milestones granted (the swarm).\n');
console.log('| tier | research data | research raw | research mach-s | research EU | milestone raw | milestone mach-s | milestone EU | total mach-s | × prev |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
let prev = 0;
for (const t of tierCosts()) {
  const data = Object.entries(t.data).map(([i, n]) => `${ITEMS[i].name} ${n}`).join(', ');
  const ratio = prev ? `${(t.total / prev).toFixed(1)}×` : '';
  prev = t.total;
  console.log(`| T${t.tier} | ${data} | ${fmt(t.research.raw)} | ${fmt(t.research.secs)} | ${fmt(t.research.eu)} | ${fmt(t.milestone.raw)} | ${fmt(t.milestone.secs)} | ${fmt(t.milestone.eu)} | ${fmt(t.total)} | ${ratio} |`);
}

// ---------- 2. science ----------
console.log('\n## Data items\n');
console.log('| data | raw/data | mach-s/data | EU/data |');
console.log('|---|---|---|---|');
for (const d of Object.keys(ITEMS).filter((i) => ITEMS[i].kind === 'data')) {
  const p = price(d);
  console.log(`| ${ITEMS[d].name} | ${fmt(p.raw)} | ${fmt(p.secs)} | ${fmt(p.eu)} |`);
}

// ---------- 3. generators: EU out per unit of fuel cost ----------
console.log('\n## Generators\n');
console.log('| recipe | machine | EU/s per machine (base) | fuel raw per 1000 EU | fuel mach-s per 1000 EU |');
console.log('|---|---|---|---|---|');
for (const r of RECIPE_LIST) {
  const gen = Object.keys(r.outputs).find(isPower);
  // Converters (turbine, elevator) only move power between networks
  if (!gen || Object.keys(r.inputs).some(isPower)) continue;
  const m = baseMachine(r);
  const eu = r.outputs[gen] * (EU_PER[gen] ?? 1);
  const fuel = costOf(r.inputs);
  const k = 1000 / eu;
  console.log(`| ${r.name} | ${m.name} | ${fmt((eu / r.time) * (m.speed ?? 1))} | ${fmt(fuel.raw * k)} | ${fmt((fuel.secs + r.time) * k)} |`);
}

// ---------- 4. storage ----------
console.log('\n## Costs over the storage cap at that tier\n');
const over = costsOverCap();
console.log(over.length ? over.map((o) => `- ${o}`).join('\n') : 'none');

// ---------- 5. buildings ----------
console.log('\n## Machines by build cost\n');
console.log('| machine | tier | raw | mach-s | EU |');
console.log('|---|---|---|---|---|');
for (const m of [...MACHINE_LIST].sort((a, b) => a.tier - b.tier)) {
  const c = costOf(m.cost);
  console.log(`| ${m.name} | ${m.tier} | ${fmt(c.raw)} | ${fmt(c.secs)} | ${fmt(c.eu)} |`);
}

// ---------- 6. key items ----------
console.log('\n## Key items\n');
console.log('| item | raw | mach-s | EU |');
console.log('|---|---|---|---|');
for (const i of ['steel', 'aluminum', 'circuit', 'stainless', 'plastic', 'adv_circuit', 'maintenance_kit', 'titanium', 'tungsten', 'precision_circuit',
  'rocket_part', 'iridium', 'helium_3', 'zg_crystal', 'nanotube', 'superconductor', 'neutronium', 'dyson_panel', 'stable_exotic']) {
  const p = price(i);
  console.log(`| ${ITEMS[i].name} | ${fmt(p.raw)} | ${fmt(p.secs)} | ${fmt(p.eu)} |`);
}

// ---------- 7. star systems ----------
// How much of the whole game's machine time each recipe category carries, and so how much a star system
// (star, trait, richness) stretches or shrinks the run: the same goods at 1/boost the speed need 1/boost
// more machine-seconds. Power is left out: generators are counted in their own table below.
const share = categoryShares();
const totalSecs = Object.values(share).reduce((a, b) => a + b, 0);

console.log('\n## Star systems\n');
console.log('Share of the whole game\'s machine time by recipe category (research + milestones, base machines):\n');
console.log('| category | share |');
console.log('|---|---|');
for (const [c, n] of Object.entries(share).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`| ${c} | ${((n / totalSecs) * 100).toFixed(1)}% |`);

const stretch = systemStretch;
const flat = (k: number) => Object.fromEntries(Object.keys(VEINS).map((p) => [p, k]));

console.log('\nStars alone (no trait, every world ×1): machine time for the same game, and what the light is worth\n');
console.log('| star | weight | machine time | solar EU/slot | He-3 per collector/min | light array EU | 600 panels EU | bonus points |');
console.log('|---|---|---|---|---|---|---|---|');
for (const st of STAR_LIST) {
  const sys = { name: '', star: st.id, trait: null, rich: flat(1) };
  console.log(`| ${st.name} | ${st.weight} | ×${stretch(sys).toFixed(3)} | ${(2 * st.lum).toFixed(1)} | ${(6 * st.lum).toFixed(1)} | ${Math.round(300 * st.lum)} | ${Math.round(600 * SWARM_EU * st.lum)} | +${systemBonus(sys)} |`);
}

console.log('\nTraits alone (yellow dwarf, every world ×1)\n');
console.log('| trait | machine time |');
console.log('|---|---|');
for (const g of GALAXY_LIST) console.log(`| ${g.name} | ×${stretch({ name: '', star: 'yellow_dwarf', trait: g.id, rich: flat(1) }).toFixed(3)} |`);

console.log('\nRichness alone (yellow dwarf, no trait)\n');
console.log('| every world | machine time |');
console.log('|---|---|');
for (const k of [0.7, 0.85, 1, 1.25, 1.5]) console.log(`| ×${k} | ×${stretch({ name: '', star: 'yellow_dwarf', trait: null, rich: flat(k) }).toFixed(3)} |`);

// What the map actually offers: many rolls of three, and the best of each three
let seedN = 12345;
const rand = () => ((seedN = (seedN * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const bonuses: Record<number, number> = {};
const all: number[] = [];
const best: number[] = [];
const worst: number[] = [];
for (let i = 0; i < 20000; i++) {
  const rolled = rollSystems(null, 3, rand);
  for (const x of rolled) bonuses[systemBonus(x)] = (bonuses[systemBonus(x)] ?? 0) + 1;
  const three = rolled.map(stretch);
  all.push(...three);
  best.push(Math.min(...three));
  worst.push(Math.max(...three));
}
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)].toFixed(3);
console.log('\nRolled systems (20000 maps of three): machine time next to the first system\n');
console.log('| | min | 10% | median | 90% | max |');
console.log('|---|---|---|---|---|---|');
for (const [name, xs] of [['any system', all], ['easiest of the three', best], ['hardest of the three', worst]] as const) {
  console.log(`| ${name} | ×${pct(xs, 0)} | ×${pct(xs, 0.1)} | ×${pct(xs, 0.5)} | ×${pct(xs, 0.9)} | ×${pct(xs, 1)} |`);
}

console.log(`\nBonus legacy points across those systems: ${Object.entries(bonuses).map(([b, n]) => `+${b}: ${((n / 60000) * 100).toFixed(1)}%`).join(', ')}`);

// Freight: what the fuel for one item costs next to the item itself
console.log('\nFreight: rocket fuel burned per item carried home, next to what the item costs to make\n');
console.log('| cargo | from | fuel per item | fuel mach-s | item mach-s | fuel / item |');
console.log('|---|---|---|---|---|---|');
const fuelPrice = price('rocket_fuel');
for (const [item, from] of [['comet_ice', 'ice'], ['heat_ceramic', 'lava'], ['tungsten', 'lava'], ['iron_ingot', 'lava'], ['metallic_hydrogen', 'gas'], ['resonant_crystal', 'crystal']] as const) {
  const f = routeFuel(from, 'home');
  const p = price(item);
  console.log(`| ${ITEMS[item].name} | ${from} | ${f.toFixed(2)} | ${fmt(f * fuelPrice.secs)} | ${fmt(p.secs)} | ${((f * fuelPrice.secs) / Math.max(p.secs, 0.01) * 100).toFixed(0)}% |`);
}
const ship = costOf(SHIP_COST);
console.log(`\nOne cargo ship: ${fmt(ship.secs)} mach-s, ${fmt(ship.eu)} EU; carries ${SHIP_RATE}/s. Rocket fuel: ${fmt(fuelPrice.secs)} mach-s, ${fmt(fuelPrice.eu)} EU each.`);

// Legacy: points per upgrade against what a run pays
console.log('\nLegacy: total points to max each upgrade (a warp pays 10, plus 1 per 50 swarm panels past 600)\n');
console.log('| upgrade | levels | total points | per level effect |');
console.log('|---|---|---|---|');
for (const l of LEGACY_LIST) {
  const total = Array.from({ length: l.max }, (_, i) => legacyCost(l.id, i)).reduce((a, b) => a + b, 0);
  console.log(`| ${l.name} | ${l.max} | ${total} | ${l.description} |`);
}
