import { itemName } from '../data/items';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECH_LIST, TECHS, TIER_NAMES } from '../data/tech';
import { canAfford, currentTier, simSpeed, techAvailable, techCost } from '../sim/rules';
import { clearQueue, getRates, getState, queueTech, research } from '../state/store';
import { Cost, PageHeader, fmt, fmtDuration, fmtRate, useGoto } from './common';
import { ItemIcon, MachineIcon, UiIcon } from './pixel';

function unlockSummary(id: string): string {
  const t = TECHS[id];
  const parts = [
    ...(t.unlockMachines ?? []).map((m) => `機器：${MACHINES[m].name}`),
    ...(t.unlockRecipes ?? []).map((r) => `配方：${RECIPES[r].name}`),
    ...(t.unlockMilestone ? [`巨構：${MILESTONES[t.unlockMilestone].name}`] : []),
  ];
  return parts.join('、');
}

/** The description already says everything it unlocks ("解鎖蒸汽鍋爐。"): no need for the list too */
function namedIn(id: string): boolean {
  const t = TECHS[id];
  const names = [
    ...(t.unlockMachines ?? []).map((m) => MACHINES[m].name),
    ...(t.unlockRecipes ?? []).map((r) => RECIPES[r].name),
    ...(t.unlockMilestone ? [MILESTONES[t.unlockMilestone].name] : []),
  ];
  return names.every((n) => t.description.includes(n));
}

/** The picture on a tech card: what it unlocks */
function TechArt({ id, small }: { id: string; small?: boolean }) {
  const t = TECHS[id];
  const size = small ? 20 : 32;
  if (t.unlockMachines?.length) return <MachineIcon id={t.unlockMachines[0]} size={size} />;
  if (t.unlockRecipes?.length) {
    const out = Object.keys(RECIPES[t.unlockRecipes[0]].outputs)[0];
    return <ItemIcon id={out} size={size} />;
  }
  if (t.unlockMilestone) return <UiIcon id="milestones" size={size} />;
  return <UiIcon id={t.slotBonus || t.orbitSlotBonus ? 'production' : 'storage'} size={size} />;
}

/** "約 2 分 10 秒後": when the current data income covers the cost, or what is missing for it to ever do so */
function eta(cost: Record<string, number>): string {
  const s = getState();
  const rates = getRates();
  let wait = 0;
  for (const [item, n] of Object.entries(cost)) {
    const need = n - (s.items[item] ?? 0);
    if (need <= 0) continue;
    // Rates are per second of factory time; factory time runs faster than the clock with speed upgrades
    const perSec = (rates[item] ?? 0) * simSpeed(s);
    if (perSec < 0.005) return `目前沒有產出${itemName(item)}`;
    wait = Math.max(wait, need / perSec);
  }
  return `照目前速度約 ${fmtDuration(Math.ceil(wait))} 後`;
}

const DATA_ITEMS = [
  { id: 'data', minTier: 0 },
  { id: 'data_green', minTier: 2 },
  { id: 'data_blue', minTier: 3 },
  { id: 'data_purple', minTier: 4 },
  { id: 'data_yellow', minTier: 5 },
  { id: 'data_white', minTier: 7 },
];

/** What is lined up: in order, the first with when it will go, each one tap to take off */
function QueueStrip() {
  const s = getState();
  const queue = (s.queue ?? []).filter((q) => !s.techs.includes(q));
  if (queue.length === 0) return null;
  const head = queue.find((q) => techAvailable(s, q));
  // Nothing can go yet: say what the first one waits for
  const gate = TECHS[queue[0]].requiresMilestone;
  const waiting = gate && !s.milestones.includes(gate) ? `要先建成巨構「${MILESTONES[gate].name}」` : '前置研究還沒完成';
  return (
    <section class="card queue-strip">
      <div class="section-head">
        <h2>研究排程</h2>
        <span class="muted small">{head ? `${TECHS[head].name}：${eta(techCost(s, head))}` : `${TECHS[queue[0]].name}${waiting}`}</span>
        <span class="spacer" />
        <button class="small-btn" onClick={clearQueue}>清除</button>
      </div>
      <ol class="queue-list">
        {queue.map((q, i) => (
          <li key={q}>
            <button class={`queue-chip ${q === head ? 'next' : ''}`} title="從排程拿掉" onClick={() => queueTech(q)}>
              <span class="queue-n">{i + 1}</span>
              <TechArt id={q} small />
              <span>{TECHS[q].name}</span>
              <span class="muted" aria-label="拿掉">✕</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ResearchPanel() {
  const s = getState();
  const rates = getRates();
  const tier = currentTier(s);
  const glow = useGoto('research', 'tech');
  const order = (id: string) => (s.techs.includes(id) ? 2 : techAvailable(s, id) ? 0 : 1);
  // Show the tiers the player has reached, plus a peek at the next one (locked behind its megastructure),
  // so a finished tier never leaves the tab with nothing to look forward to
  const tiers = [...new Set(TECH_LIST.map((t) => t.tier))].filter((t) => t <= Math.max(1, tier + 1));

  return (
    <div class="panel">
      <PageHeader title="研究">已完成 {s.techs.length}/{TECH_LIST.length}</PageHeader>
      <div class="data-row">
        {DATA_ITEMS.filter((d) => tier >= d.minTier).map((d) => (
          <span key={d.id} class="data-chip" title={itemName(d.id)}>
            <ItemIcon id={d.id} size={28} />
            <span>
              <strong>{fmt(s.items[d.id] ?? 0)}</strong>
              <span class="muted small"> {fmtRate(rates[d.id] ?? 0)}</span>
              <br />
              <span class="muted small">{itemName(d.id)}</span>
            </span>
          </span>
        ))}
      </div>
      <QueueStrip />
      {tiers.map((tr) => {
        const techs = TECH_LIST.filter((t) => t.tier === tr).sort((a, b) => order(a.id) - order(b.id));
        return (
          // A finished tier folds away so the open research stays at the top
          <details key={tr} class="tier" open={!techs.every((t) => s.techs.includes(t.id)) || techs.some((t) => t.id === glow)}>
            <summary class="tier-head">
              <span class="tier-pill">T{tr}</span>{TIER_NAMES[tr] ?? ''}
              <span class="muted small">{techs.filter((t) => s.techs.includes(t.id)).length}/{techs.length}</span>
            </summary>
            <div class="tech-grid">
              {techs.map((t) => {
                const done = s.techs.includes(t.id);
                const avail = techAvailable(s, t.id);
                const missing = t.requires.filter((r) => !s.techs.includes(r));
                const needMilestone = t.requiresMilestone && !s.milestones.includes(t.requiresMilestone);
                const unlocks = unlockSummary(t.id);
                const qi = (s.queue ?? []).indexOf(t.id);
                return (
                  <article key={t.id} id={`tech-${t.id}`} class={`card tech ${done ? 'done' : avail ? 'avail' : 'locked'} ${qi >= 0 ? 'queued' : ''} ${glow === t.id ? 'fresh' : ''}`}>
                    <div class="tech-top">
                      <span class="tech-art"><TechArt id={t.id} /></span>
                      <div>
                        <h4>{t.name}</h4>
                        <p class="small">{t.description}</p>
                      </div>
                    </div>
                    {unlocks && !namedIn(t.id) && <p class="muted small">{unlocks}</p>}
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
                          {avail && !canAfford(s, techCost(s, t.id)) && <p class="muted small tech-eta">{eta(techCost(s, t.id))}</p>}
                          <div class="tech-buttons">
                            <button class="primary" disabled={!avail || !canAfford(s, techCost(s, t.id))} onClick={() => research(t.id)}>
                              研究
                            </button>
                            <button
                              class={qi >= 0 ? 'queued' : ''}
                              title={qi >= 0 ? '從排程拿掉' : missing.length ? '連同前置研究一起排進去，數據夠了就依序自動研究' : '數據夠了就自動研究'}
                              onClick={() => queueTech(t.id)}
                            >
                              {qi >= 0 ? `排程第 ${qi + 1} ✕` : missing.length ? '排程（含前置）' : '排程'}
                            </button>
                          </div>
                        </>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
