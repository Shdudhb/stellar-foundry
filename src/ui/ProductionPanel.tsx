import { useState } from 'preact/hooks';
import { ITEM_ORDER, ITEMS, isPower, itemName } from '../data/items';
import { MACHINE_LIST, MACHINES, MAINTENANCE_ITEM, type MachineDef } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { WORN_SPEED } from '../sim/engine';
import { canAfford, capOf, isMachineUnlocked, overclock, recipesFor, upgradeCost, upgradeTarget } from '../sim/rules';
import type { Line, LineStatus } from '../sim/types';
import {
  addLine, build, demolish, gather, getLast, getState, removeLine, setRecipe, toggleLine, upgradeLine,
} from '../state/store';
import { Bar, Cost, ItemLink, fmt, fmtNum, fmtRate, reasonText, reasonTone } from './common';

function ManualCard() {
  const s = getState();
  const manual = ITEM_ORDER.filter((id) => ITEMS[id].manual);
  return (
    <section class="card">
      <h3>手動採集</h3>
      <div class="gather-row">
        {manual.map((id) => (
          <button key={id} class="gather-btn" onClick={() => gather(id)}>
            <span>{itemName(id)}</span>
            <span class="muted">{fmt(s.items[id] ?? 0)}/{fmt(capOf(s, id))}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NewLineCard() {
  const s = getState();
  const machines = MACHINE_LIST.filter((m) => isMachineUnlocked(s, m.id));
  const [machine, setMachine] = useState(machines[0]?.id ?? '');
  const recipes = recipesFor(s, machine);
  const [recipe, setRecipeSel] = useState(recipes[0]?.id ?? '');
  const recipeId = recipes.some((r) => r.id === recipe) ? recipe : recipes[0]?.id ?? '';
  const m = MACHINES[machine];

  return (
    <section class="card">
      <h3>新增生產線</h3>
      <div class="new-line">
        <label>
          機器
          <select value={machine} onChange={(e) => setMachine((e.target as HTMLSelectElement).value)}>
            {machines.map((mm) => (
              <option key={mm.id} value={mm.id}>T{mm.tier} {mm.name}{mm.orbital ? '（軌道）' : ''}</option>
            ))}
          </select>
        </label>
        <label>
          配方
          <select value={recipeId} onChange={(e) => setRecipeSel((e.target as HTMLSelectElement).value)}>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <button class="primary" disabled={!recipeId} onClick={() => addLine(machine, recipeId)}>建立</button>
      </div>
      {m && (
        <p class="muted small">
          {m.description} 建造一台：<Cost cost={m.cost} />
        </p>
      )}
    </section>
  );
}

const WORN_SPEED_LOSS = 1 - WORN_SPEED;

function Flow({ items, perSec, sign }: { items: Record<string, number>; perSec: number; sign: '−' | '+' }) {
  const entries = Object.entries(items).filter(([id]) => !isPower(id));
  if (entries.length === 0) return <span class="muted">—</span>;
  return (
    <span class="flow">
      {entries.map(([id, n]) => (
        <span key={id} class={ITEMS[id]?.kind === 'byproduct' ? 'byproduct' : ''}>
          <ItemLink id={id} /> {sign}{fmtNum(Math.round(n * perSec * 100) / 100)}/s
        </span>
      ))}
    </span>
  );
}

function UpgradeRow({ line, to }: { line: Line; to: MachineDef }) {
  const net = upgradeCost(line, to);
  const pays = Object.fromEntries(Object.entries(net).filter(([, n]) => n > 0));
  const refunds = Object.entries(net).filter(([, n]) => n < 0);
  const oc = overclock(to, RECIPES[line.recipe]);
  return (
    <div class="upgrade-row">
      <button disabled={!canAfford(getState(), pays)} onClick={() => upgradeLine(line.id)}>
        升級為 {to.name}
      </button>
      <span class="muted small">
        {oc.speed > 1 ? `速度 ×${oc.speed}、耗電 ×${oc.power}` : `T${to.tier} 配方可用`}
        {line.count > 0 && <> · 全線 {line.count} 台：<Cost cost={pays} /></>}
        {refunds.length > 0 && <> · 退還 {refunds.map(([id, n]) => `${itemName(id)} ${-n}`).join('、')}</>}
      </span>
    </div>
  );
}

function WearRow({ wear, short }: { wear: number; short: boolean }) {
  const tone = wear > 0.5 ? 'bad' : 'warn';
  return (
    <div class="wear-row">
      <span class="muted small">磨損</span>
      <Bar value={wear} tone={tone} />
      <span class={`small tone-text-${tone}`}>
        {Math.round(wear * 100)}% · 速度 {Math.round((1 - WORN_SPEED_LOSS * wear) * 100)}%
      </span>
      <span class="muted small">{short ? '缺維護套件，持續磨損中' : '維修中'}</span>
    </div>
  );
}

function IgnitionRow({ heat, igniting, power, time }: { heat: number; igniting: boolean; power: number; time: number }) {
  return (
    <div class="wear-row">
      <span class="muted small">點火</span>
      <Bar value={heat} tone="warn" />
      <span class="small tone-text-warn">{Math.round(heat * 100)}%</span>
      <span class="muted small">
        {igniting ? `需要 ${fmtNum(power)} 電力/s，滿電 ${time} 秒` : heat > 0 ? '缺燃料，正在冷卻' : '裝入燃料後開始點火'}
      </span>
    </div>
  );
}

function LineCard({ line, status }: { line: Line; status?: LineStatus }) {
  const s = getState();
  const m = MACHINES[line.machine];
  const r = RECIPES[line.recipe];
  const oc = overclock(m, r);
  const eff = status?.efficiency ?? 0;
  const reason = status?.reason ?? { kind: 'idle' as const };
  const tone = reasonTone(reason);
  const perSec = status?.craftsPerSec ?? 0;
  const generator = Object.keys(r.outputs).some(isPower);
  const recipeOptions = recipesFor(s, line.machine);
  if (!recipeOptions.some((rr) => rr.id === r.id)) recipeOptions.unshift(r);
  const upgrade = upgradeTarget(s, line);

  return (
    <article class={`card line tone-border-${tone}`}>
      <header class="line-head">
        <div>
          <span class="line-name">{m.name}</span>
          <span class="line-count">× {line.count}</span>
          <span class="badge">T{m.tier}</span>
          {oc.speed > 1 && (
            <span class="badge oc" title="機器階層高於配方：速度與耗能增加">{m.perfectOC ? '完美超頻' : '超頻'} ×{oc.speed}</span>
          )}
          {(m.speed ?? 1) > 1 && <span class="badge oc" title="大型設施">大型 ×{m.speed}</span>}
          {m.upkeep && s.maintenance && <span class="badge" title="每台每分鐘全速運轉消耗的維護套件">維護 {m.upkeep}/分</span>}
          {m.orbital && <span class="badge orbit" title="佔軌道槽位，靠軌道運力運轉">軌道</span>}
          {m.ignition && line.count > 0 && (line.heat ?? 0) >= 1 && <span class="badge lit">已點火</span>}
        </div>
        <select value={line.recipe} onChange={(e) => setRecipe(line.id, (e.target as HTMLSelectElement).value)}>
          {recipeOptions.map((rr) => (
            <option key={rr.id} value={rr.id}>{rr.name}</option>
          ))}
        </select>
      </header>

      <div class="line-flows">
        <div><span class="muted">消耗</span> <Flow items={r.inputs} perSec={perSec} sign="−" /></div>
        {!generator && <div><span class="muted">產出</span> <Flow items={r.outputs} perSec={perSec} sign="+" /></div>}
        {Object.entries(status?.power ?? {}).map(([p, v]) => (
          <div key={p}>
            <span class="muted">{itemName(p)}</span> {fmtRate(v)}
          </div>
        ))}
        {status?.upkeep && (
          <div>
            <span class="muted">維護</span> <ItemLink id={MAINTENANCE_ITEM} /> {fmtRate(-status.upkeep.need * status.upkeep.supplied)}
            {status.upkeep.supplied < 0.999 && (
              <span class="tone-text-bad small"> 不足（需要 {fmtRate(-status.upkeep.need)}）</span>
            )}
          </div>
        )}
      </div>
      {m.upkeep && s.maintenance && (line.wear ?? 0) > 0.005 && <WearRow wear={line.wear!} short={(status?.upkeep?.supplied ?? 1) < 0.999} />}
      {m.ignition && line.count > 0 && (line.heat ?? 0) < 1 && (
        <IgnitionRow
          heat={line.heat ?? 0}
          igniting={reason.kind === 'igniting'}
          power={m.ignition.power * line.count}
          time={m.ignition.time}
        />
      )}

      <div class="line-status">
        <Bar value={eff} tone={tone} />
        <span class={`reason tone-text-${tone}`}>{reasonText(reason, status)}</span>
        <span class="muted small">{Math.round(eff * 100)}%</span>
      </div>

      <footer class="line-actions">
        <button onClick={() => demolish(line.id)} disabled={line.count === 0} title="拆除一台（全額退還材料）">−</button>
        <button class="primary" onClick={() => build(line.id)} title="建造一台">＋</button>
        <button onClick={() => build(line.id, 5)} title="建造五台">＋5</button>
        <button onClick={() => toggleLine(line.id)}>{line.enabled ? '暫停' : '繼續'}</button>
        <span class="spacer" />
        <span class="muted small">每台：<Cost cost={m.cost} /></span>
        <button class="danger" onClick={() => removeLine(line.id)} title="拆除全部並移除這條生產線">移除</button>
      </footer>
      {upgrade && <UpgradeRow line={line} to={upgrade} />}
    </article>
  );
}

export function ProductionPanel() {
  const s = getState();
  const last = getLast();
  return (
    <div class="panel">
      <ManualCard />
      <NewLineCard />
      {s.lines.length === 0 ? (
        <p class="empty">還沒有生產線。先手動採集石頭，然後建立一條「石爐」生產線。</p>
      ) : (
        <div class="lines">
          {s.lines.map((l) => (
            <LineCard key={l.id} line={l} status={last.lines[l.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
