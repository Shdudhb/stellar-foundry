import { ITEMS, isPower, itemName } from '../data/items';
import { MACHINE_LIST, MACHINES, MAINTENANCE_ITEM } from '../data/machines';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../data/recipes';
import { MILESTONES } from '../data/tech';
import { isMachineUnlocked, isRecipeUnlocked, machinesFor, overclock } from '../sim/rules';
import type { Line } from '../sim/types';
import { createLine, focusLine, getLast, getState, openLookup } from '../state/store';
import { Modal, Side, fmtNum, fmtRate, reasonText, reasonTone } from './common';
import { ItemIcon, MachineIcon } from './pixel';
import { StoreControls } from './StoragePanel';

/** Can be built right now: the recipe and at least one machine for it are unlocked */
function ready(r: RecipeDef): boolean {
  const s = getState();
  return isRecipeUnlocked(s, r.id) && machinesFor(r.id).some((m) => isMachineUnlocked(s, m.id));
}

/** Usable recipes first, then the locked ones as a peek at what's ahead */
const byReady = (list: RecipeDef[]) => [...list.filter(ready), ...list.filter((r) => !ready(r))];

function RecipeRow({ r }: { r: RecipeDef }) {
  const s = getState();
  const locked = !isRecipeUnlocked(s, r.id);
  const machines = machinesFor(r.id);
  const usable = machines.filter((m) => !locked && isMachineUnlocked(s, m.id));
  const rest = machines.filter((m) => !usable.includes(m));
  const perMin = (m: (typeof machines)[number]) => {
    const oc = overclock(m, r);
    return `每台 ${fmtNum((60 * oc.speed * (m.speed ?? 1)) / r.time)} 次/分${oc.speed > 1 ? `，超頻 ×${oc.speed}` : ''}`;
  };
  return (
    <li class={locked ? 'locked' : ''}>
      <div>
        <strong>{r.name}</strong>
        <span class="muted small"> · {r.time}s · 最低 T{r.tier}</span>
        {locked && <span class="badge">未解鎖</span>}
      </div>
      <div class="small recipe-eq">
        <span class="side"><Side items={r.inputs} /></span>
        <span class="side"><span class="flow-arrow">→</span><Side items={r.outputs} /></span>
      </div>
      {usable.length > 0 && (
        <div class="build-row">
          <span class="muted small">建立生產線：</span>
          {usable.map((m) => (
            <button key={m.id} class="small-btn build-chip" title={`用${m.name}建立「${r.name}」生產線`} onClick={() => createLine(m.id, r.id)}>
              <MachineIcon id={m.id} size={16} /> {m.name}
              <span class="muted">{perMin(m)}</span>
            </button>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div class="muted small">
          {usable.length > 0 ? '還沒解鎖：' : '機器：'}
          {rest.map((m, i) => (
            <span key={m.id} class={isMachineUnlocked(s, m.id) ? '' : 'locked'}>
              {i > 0 && '、'}
              {m.name}（{perMin(m)}）
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

interface FlowRow {
  line: Line;
  /** Per second right now: positive makes the item, negative uses it */
  now: number;
  /** Per second at full speed, when the line has a meaningful one */
  full?: number;
}

/** Every line with machines that makes or uses this item, and how much */
function flowRows(item: string): FlowRow[] {
  const s = getState();
  const last = getLast();
  const rows: FlowRow[] = [];
  for (const line of s.lines) {
    const r = RECIPES[line.recipe];
    const m = MACHINES[line.machine];
    if (!r || !m || line.count === 0) continue;
    const st = last.lines[line.id];
    if (isPower(item)) {
      if (!(item in r.inputs || item in r.outputs || m.power?.item === item)) continue;
      rows.push({ line, now: st?.power[item] ?? 0 });
      continue;
    }
    const net = (r.outputs[item] ?? 0) - (r.inputs[item] ?? 0);
    const kits = item === MAINTENANCE_ITEM && s.maintenance && m.upkeep ? (m.upkeep * line.count) / 60 : 0;
    if (net === 0 && kits === 0) continue;
    const now = net * (st?.craftsPerSec ?? 0) - (kits > 0 && st?.upkeep ? st.upkeep.need * st.upkeep.supplied : 0);
    rows.push({ line, now, full: net * (st?.maxCraftsPerSec ?? 0) - kits });
  }
  return rows;
}

function FlowList({ title, rows, sign }: { title: string; rows: FlowRow[]; sign: 1 | -1 }) {
  if (rows.length === 0) return null;
  const last = getLast();
  const total = rows.reduce((n, r) => n + r.now, 0);
  return (
    <div class="flow-list">
      <h5>
        {title} <span class={Math.abs(total) < 0.005 ? 'muted' : sign > 0 ? 'tone-text-ok' : 'tone-text-bad'}>{fmtRate(total)}</span>
      </h5>
      <ul>
        {rows.map(({ line, now, full }) => {
          const st = last.lines[line.id];
          const slow = full !== undefined && Math.abs(now) < Math.abs(full) * 0.999;
          return (
            <li key={line.id}>
              <button class="flow-line" title="到這條生產線" onClick={() => focusLine(line.id)}>
                <MachineIcon id={line.machine} size={20} />
                <span class="flow-line-name">
                  <span>{MACHINES[line.machine].name} ×{line.count}</span>
                  <span class="small">
                    <span class="muted">{RECIPES[line.recipe].name}</span>
                    {slow && st && <span class={`tone-text-${reasonTone(st.reason)}`}> · {reasonText(st.reason, st, true)}</span>}
                  </span>
                </span>
                <span class="flow-line-rate">
                  {fmtRate(now)}
                  {slow && <span class="muted small">滿速 {fmtRate(full!)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Who makes it and who uses it right now: the answer to "why is this short?" */
function ItemFlow({ item }: { item: string }) {
  // Biggest first: with dozens of lines on the grid, the top few are the ones worth acting on
  const size = (r: FlowRow) => Math.abs(r.full ?? r.now);
  const rows = flowRows(item).sort((a, b) => size(b) - size(a));
  if (rows.length === 0) return null;
  // A line counts as a maker or a user by what it does at full speed, so a stalled one still shows up in the right list
  const sign = (r: FlowRow) => (r.full ?? r.now) || r.now;
  return (
    <>
      <h4>目前流量</h4>
      <div class="flow-lists">
        <FlowList title="生產" rows={rows.filter((r) => sign(r) > 0)} sign={1} />
        <FlowList title="消耗" rows={rows.filter((r) => sign(r) < 0)} sign={-1} />
      </div>
    </>
  );
}

export function RecipeLookup({ item }: { item: string }) {
  const def = ITEMS[item];
  const makes = byReady(RECIPE_LIST.filter((r) => item in r.outputs));
  const uses = byReady(RECIPE_LIST.filter((r) => item in r.inputs));
  const builds = [
    ...MACHINE_LIST.filter((m) => item in m.cost).map((m) => m.name),
    ...Object.values(MILESTONES).filter((ms) => item in ms.cost).map((ms) => `${ms.name}（巨構）`),
  ];

  return (
    <Modal title={itemName(item)} icon={<ItemIcon id={item} size={24} />} onClose={() => openLookup(null)}>
      <StoreControls id={item} />
      {def?.kind === 'byproduct' && <p class="tone-text-warn small">副產物：倉庫滿了會讓產生它的生產線停工。</p>}
      {def?.decay && (
        <p class="tone-text-warn small">會衰變：存著的量每秒少 {Math.round(def.decay * 100)}%，產出後要盡快用掉。</p>
      )}
      {def?.kind === 'structure' && <p class="muted small">部署好的戴森板，不佔倉庫、不能丟棄；每片提供 20 電力/秒。</p>}
      {isPower(item) && <p class="muted small">{itemName(item)}不能儲存，產出當下就被機器用掉；不夠時所有用它的機器一起降速。</p>}
      <ItemFlow item={item} />
      <h4>取得方式</h4>
      <ul class="recipe-list">
        {def?.manual && <li>手動採集（生產線分頁）</li>}
        {makes.map((r) => <RecipeRow key={r.id} r={r} />)}
        {!def?.manual && makes.length === 0 && <li class="muted">無</li>}
      </ul>
      <h4>用途</h4>
      <ul class="recipe-list">
        {uses.map((r) => <RecipeRow key={r.id} r={r} />)}
        {builds.length > 0 && <li><span class="muted small">建造材料：</span>{builds.join('、')}</li>}
        {uses.length === 0 && builds.length === 0 && <li class="muted">無</li>}
      </ul>
    </Modal>
  );
}
