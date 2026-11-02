// Balance report: run with `npx vite-node scripts/balance.ts`.
// Prices every item through one main recipe, then totals research and milestone cost per tier.
import { ITEMS, isPower } from '../src/data/items';
import { MACHINE_LIST } from '../src/data/machines';
import { RECIPE_LIST } from '../src/data/recipes';
import { EU_PER, baseMachine, costOf, costsOverCap, price, tierCosts } from '../src/sim/balance';

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
