import { useEffect, useState } from 'preact/hooks';
import { ITEM_ORDER, ITEMS, isPower, itemName } from '../data/items';
import { MACHINE_LIST, MACHINES, MAINTENANCE_ITEM, type MachineDef } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { WORN_SPEED } from '../sim/engine';
import { canAfford, capOf, isMachineUnlocked, overclock, recipesFor, upgradeCost, upgradeTarget } from '../sim/rules';
import type { Line, LineStatus } from '../sim/types';
import {
  addLine, build, demolish, gather, getLast, getState, removeLine, setRecipe, toggleLine, upgradeLine,
} from '../state/store';
import { Bar, Cost, ItemLink, PageHeader, Side, fmt, fmtNum, fmtRate, isStuck, reasonText, reasonTone } from './common';
import { ItemIcon, MachineIcon } from './pixel';

function GatherTile({ id }: { id: string }) {
  const s = getState();
  const [pops, setPops] = useState(0);
  const full = (s.items[id] ?? 0) >= capOf(s, id);
  return (
    <button
      class="gather-tile"
      onClick={() => {
        gather(id);
        if (!full) setPops((n) => n + 1);
      }}
    >
      <ItemIcon id={id} size={40} />
      <span class="gather-info">
        <span class="gather-name">{itemName(id)}</span>
        <span class={`gather-count ${full ? 'tone-text-warn' : ''}`}>{fmt(s.items[id] ?? 0)}/{fmt(capOf(s, id))}</span>
      </span>
      {pops > 0 && <span key={pops} class="gather-pop">+1</span>}
    </button>
  );
}

function ManualCard() {
  const manual = ITEM_ORDER.filter((id) => ITEMS[id].manual);
  return (
    <section class="card">
      <div class="section-head">
        <h2>手動採集</h2>
        <span class="muted">點一下撿一個，早期的原料從這裡來</span>
      </div>
      <div class="gather-row">
        {manual.map((id) => <GatherTile key={id} id={id} />)}
      </div>
    </section>
  );
}

function NewLineCard({ onCreated }: { onCreated: (id: number) => void }) {
  const s = getState();
  const machines = MACHINE_LIST.filter((m) => isMachineUnlocked(s, m.id));
  const [picked, setMachine] = useState(machines[0]?.id ?? '');
  // After a reset or warp the machine picked earlier may be locked again
  const machine = machines.some((mm) => mm.id === picked) ? picked : machines[0]?.id ?? '';
  const recipes = recipesFor(s, machine);
  const [recipe, setRecipeSel] = useState(recipes[0]?.id ?? '');
  const recipeId = recipes.some((r) => r.id === recipe) ? recipe : recipes[0]?.id ?? '';
  const m = MACHINES[machine];

  return (
    <section class="card">
      <div class="section-head">
        <h2>新增生產線</h2>
        <span class="muted">選機器和配方，建立後再加蓋機器</span>
      </div>
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
        <button class="primary" disabled={!machine || !recipeId} onClick={() => {
            const id = addLine(machine, recipeId);
            if (id !== null) onCreated(id);
          }}>建立</button>
      </div>
      {m && (
        <div class="new-preview">
          <MachineIcon id={m.id} size={48} />
          <div>
            <p class="small">{m.description}</p>
            {recipeId && (
              <p class="small recipe-eq">
                <Side items={RECIPES[recipeId].inputs} />
                <span class="flow-arrow">→</span>
                <Side items={RECIPES[recipeId].outputs} />
                <span class="muted">· {RECIPES[recipeId].time} 秒</span>
              </p>
            )}
            <p class="small muted">建造一台：<Cost cost={m.cost} /></p>
          </div>
        </div>
      )}
    </section>
  );
}

const WORN_SPEED_LOSS = 1 - WORN_SPEED;

function Flow({ items, perSec, sign }: { items: Record<string, number>; perSec: number; sign: '−' | '+' }) {
  const entries = Object.entries(items).filter(([id]) => !isPower(id));
  if (entries.length === 0) return <span class="muted">無</span>;
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

/** Removing a line with machines in it takes a second tap within a few seconds */
function RemoveButton({ line }: { line: Line }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      class={`danger ${armed ? 'armed' : ''}`}
      title="拆除全部並移除這條生產線"
      onClick={() => (line.count === 0 || armed ? removeLine(line.id) : setArmed(true))}
    >
      {armed ? `確定移除 ${line.count} 台？` : '移除'}
    </button>
  );
}

function LineCard({ line, status, fresh }: { line: Line; status?: LineStatus; fresh?: boolean }) {
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
    <article id={`line-${line.id}`} class={`card line tone-border-${tone} ${line.enabled ? '' : 'paused'} ${fresh ? 'fresh' : ''}`}>
      <header class="line-head">
        <span class={`line-icon ${eff > 0.01 ? 'running' : ''}`}>
          <MachineIcon id={m.id} size={44} title />
          <span class="line-count-badge">×{line.count}</span>
        </span>
        <div class="line-title">
          <span class="line-name">{m.name}</span>
          <span class="line-badges">
          <span class="badge tier">T{m.tier}</span>
          {oc.speed > 1 && (
            <span class="badge oc" title="機器階層高於配方：速度與耗能增加">{m.perfectOC ? '完美超頻' : '超頻'} ×{oc.speed}</span>
          )}
          {(m.speed ?? 1) > 1 && <span class="badge oc" title="大型設施">大型 ×{m.speed}</span>}
          {m.upkeep && s.maintenance && <span class="badge" title="每台每分鐘全速運轉消耗的維護套件">維護 {m.upkeep}/分</span>}
          {m.orbital && <span class="badge orbit" title="佔軌道槽位，靠軌道運力運轉">軌道</span>}
          {m.ignition && line.count > 0 && (line.heat ?? 0) >= 1 && <span class="badge lit">已點火</span>}
          </span>
          <select value={line.recipe} aria-label="配方" onChange={(e) => setRecipe(line.id, (e.target as HTMLSelectElement).value)}>
            {recipeOptions.map((rr) => (
              <option key={rr.id} value={rr.id}>{rr.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div class="flow-row">
        <Flow items={r.inputs} perSec={perSec} sign="−" />
        {!generator && (
          <>
            <span class="flow-arrow">→</span>
            <Flow items={r.outputs} perSec={perSec} sign="+" />
          </>
        )}
      </div>
      {(Object.keys(status?.power ?? {}).length > 0 || status?.upkeep) && (
        <div class="flow-extra">
          {Object.entries(status?.power ?? {}).map(([p, v]) => (
            <span key={p} class={v > 0 ? 'tone-text-ok' : 'muted'}>
              <ItemIcon id={p} /> {itemName(p)} {fmtRate(v)}
            </span>
          ))}
          {status?.upkeep && (
            <span>
              <ItemLink id={MAINTENANCE_ITEM} /> {fmtRate(-status.upkeep.need * status.upkeep.supplied)}
              {status.upkeep.supplied < 0.999 && (
                <span class="tone-text-bad small"> 不足（需要 {fmtRate(-status.upkeep.need)}）</span>
              )}
            </span>
          )}
        </div>
      )}
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
        <RemoveButton line={line} />
      </footer>
      <p class="line-cost muted small">每台：<Cost cost={m.cost} /></p>
      {upgrade && <UpgradeRow line={line} to={upgrade} />}
    </article>
  );
}

const FILTER_KEY = 'sf-line-filter';

/** 'all', 'stuck', 'paused', or a machine tier like 't3' */
function readFilter(): string {
  try {
    return localStorage.getItem(FILTER_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function LineFilter({ filter, setFilter, counts }: { filter: string; setFilter: (f: string) => void; counts: [string, string, number][] }) {
  return (
    <div class="line-filter" role="tablist" aria-label="篩選生產線">
      {counts.map(([id, label, n]) => (
        <button
          key={id}
          role="tab"
          aria-selected={filter === id}
          class={`filter-chip ${filter === id ? 'active' : ''} ${id === 'stuck' && n > 0 ? 'warn' : ''}`}
          onClick={() => setFilter(id)}
        >
          {label} <span class="filter-count">{n}</span>
        </button>
      ))}
    </div>
  );
}

export function ProductionPanel() {
  const s = getState();
  const last = getLast();
  const [picked, setPicked] = useState(readFilter);
  const setFilter = (f: string) => {
    setPicked(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      // ignore
    }
  };
  const tierOf = (l: Line) => `t${MACHINES[l.machine]?.tier ?? 0}`;
  const tests: Record<string, (l: Line) => boolean> = {
    all: () => true,
    stuck: (l) => isStuck(l, last.lines[l.id]),
    paused: (l) => !l.enabled,
  };
  const tiers = [...new Set(s.lines.map(tierOf))].sort((a, b) => +a.slice(1) - +b.slice(1));
  for (const t of tiers) tests[t] = (l) => tierOf(l) === t;
  const counts: [string, string, number][] = [
    ['all', '全部', s.lines.length],
    ['stuck', '有問題', s.lines.filter(tests.stuck).length],
    ['paused', '已暫停', s.lines.filter(tests.paused).length],
    ...tiers.map((t): [string, string, number] => [t, t.toUpperCase(), s.lines.filter(tests[t]).length]),
  ];
  // A tier filter from a run that no longer has that tier falls back to everything
  const filter = tests[picked] ? picked : 'all';
  const shown = s.lines.filter(tests[filter]);

  // A newly created line lands at the end of the list: bring it into view (and out of a filter that hides it)
  const [fresh, setFresh] = useState<number | null>(null);
  const created = (id: number) => {
    const line = s.lines.find((l) => l.id === id);
    if (line && !tests[filter](line)) setFilter('all');
    setFresh(id);
  };
  useEffect(() => {
    if (fresh === null) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`line-${fresh}`)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    const t = setTimeout(() => setFresh(null), 1800);
    return () => clearTimeout(t);
  }, [fresh]);
  return (
    <div class="panel">
      <PageHeader kicker="FACTORY / PRODUCTION" title="生產線">
        採集原料、建立生產線，讓機器自己運轉。卡住的線會亮黃燈或紅燈，告訴你缺什麼。
      </PageHeader>
      <div class="prod-top">
        <ManualCard />
        <NewLineCard onCreated={created} />
      </div>
      {s.lines.length === 0 ? (
        <p class="empty">還沒有生產線。先手動採集石頭，然後建立一條「石爐」生產線。</p>
      ) : (
        <>
        <div class="section-head">
          <h2>生產線</h2>
          <span class="muted">{s.lines.length} 條 · {s.lines.reduce((n, l) => n + l.count, 0)} 台機器</span>
        </div>
        {s.lines.length > 1 && <LineFilter filter={filter} setFilter={setFilter} counts={counts} />}
        {shown.length === 0 ? (
          <p class="empty">{filter === 'stuck' ? '沒有卡住的生產線，一切順暢。' : '這裡沒有生產線。'}</p>
        ) : (
          <div class="lines">
            {shown.map((l) => (
              <LineCard key={l.id} line={l} status={last.lines[l.id]} fresh={l.id === fresh} />
            ))}
          </div>
        )}
        </>
      )}
    </div>
  );
}
