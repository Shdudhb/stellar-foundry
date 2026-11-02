import { itemName } from '../data/items';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECH_LIST, TECHS } from '../data/tech';
import { canAfford, currentTier, techAvailable, techCost } from '../sim/rules';
import { getRates, getState, research } from '../state/store';
import { Cost, fmt, fmtRate } from './common';

function unlockSummary(id: string): string {
  const t = TECHS[id];
  const parts = [
    ...(t.unlockMachines ?? []).map((m) => `機器：${MACHINES[m].name}`),
    ...(t.unlockRecipes ?? []).map((r) => `配方：${RECIPES[r].name}`),
    ...(t.unlockMilestone ? [`巨構：${MILESTONES[t.unlockMilestone].name}`] : []),
  ];
  return parts.join('、');
}

const TIER_NAMES: Record<number, string> = { 1: '蒸汽時代', 2: 'LV 電力時代', 3: 'MV 石化時代', 4: 'HV 冶金時代', 5: 'EV 軌道時代', 6: 'IV 聚變時代', 7: '星際時代' };

const DATA_ITEMS = [
  { id: 'data', minTier: 0 },
  { id: 'data_green', minTier: 2 },
  { id: 'data_blue', minTier: 3 },
  { id: 'data_purple', minTier: 4 },
  { id: 'data_yellow', minTier: 5 },
  { id: 'data_white', minTier: 7 },
];

export function ResearchPanel() {
  const s = getState();
  const rates = getRates();
  const tier = currentTier(s);
  const order = (id: string) => (s.techs.includes(id) ? 2 : techAvailable(s, id) ? 0 : 1);
  // Show the tiers the player has reached, plus a peek at the next one
  const tiers = [...new Set(TECH_LIST.map((t) => t.tier))].filter((t) => t <= Math.max(1, tier));

  return (
    <div class="panel">
      <section class="card">
        <h3>研究</h3>
        <p class="row">
          {DATA_ITEMS.filter((d) => tier >= d.minTier).map((d) => (
            <span key={d.id}>
              {itemName(d.id)} <strong>{fmt(s.items[d.id] ?? 0)}</strong>{' '}
              <span class="muted">{fmtRate(rates[d.id] ?? 0)}</span>
            </span>
          ))}
        </p>
        <p class="muted small">研究站把科研包分析成研究數據。研究完成 {s.techs.length}/{TECH_LIST.length}。</p>
      </section>
      {tiers.map((tr) => {
        const techs = TECH_LIST.filter((t) => t.tier === tr).sort((a, b) => order(a.id) - order(b.id));
        return (
          <section key={tr}>
            <h3 class="tier-head">T{tr} {TIER_NAMES[tr] ?? ''}</h3>
            <div class="tech-grid">
              {techs.map((t) => {
                const done = s.techs.includes(t.id);
                const avail = techAvailable(s, t.id);
                const missing = t.requires.filter((r) => !s.techs.includes(r));
                const needMilestone = t.requiresMilestone && !s.milestones.includes(t.requiresMilestone);
                const unlocks = unlockSummary(t.id);
                return (
                  <article key={t.id} class={`card tech ${done ? 'done' : avail ? 'avail' : 'locked'}`}>
                    <h4>{t.name}</h4>
                    <p class="small">{t.description}</p>
                    {unlocks && <p class="muted small">{unlocks}</p>}
                    {needMilestone && (
                      <p class="small tone-text-warn">需要先建成巨構「{MILESTONES[t.requiresMilestone!].name}」</p>
                    )}
                    {missing.length > 0 && (
                      <p class="small tone-text-warn">需要先研究：{missing.map((m) => TECHS[m].name).join('、')}</p>
                    )}
                    <footer>
                      {done ? (
                        <span class="tone-text-ok">✓ 已完成</span>
                      ) : (
                        <>
                          <p class="small"><Cost cost={techCost(s, t.id)} /></p>
                          <button class="primary" disabled={!avail || !canAfford(s, techCost(s, t.id))} onClick={() => research(t.id)}>
                            研究
                          </button>
                        </>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
