import { Component } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ITEM_ORDER, ITEMS, canVent, isPower, itemName } from '../data/items';
import { MACHINE_LIST, MACHINES, MAINTENANCE_ITEM, type MachineDef } from '../data/machines';
import { RECIPE_LIST, RECIPES, type RecipeDef } from '../data/recipes';
import { WORN_SPEED, fuelLines, limitableItem } from '../sim/engine';
import { shortfall } from '../sim/supply';
import {
  canAfford, canRun, capOf, categoryBoost, craftsPerMachine, isMachineUnlocked, isRecipeUnlocked, overclock, recipeFits, recipesFor, slotsTotal, slotsUsed, upgradeCost, upgradeTarget,
} from '../sim/rules';
import { PLANETS } from '../data/planets';
import { HOME, homeView, planetOf } from '../sim/planets';
import { RoutesCard } from './Shipping';
import type { Line, LineStatus } from '../sim/types';
import {
  build, buildUpTo, createLine, demolish, focusLine, gather, getLast, getState, getUi, openLookup, openPicker, openRecipeSwitch, removeLine,
  setLineLimit, setLineReserve, setRecipe, toggleLine, toggleVent, upgradeLine,
} from '../state/store';
import {
  Bar, Chevron, Cost, HoldButton, ItemLink, Modal, fmt, fmtNum, fmtRate, isStuck, reasonText, reasonTone, useHold,
} from './common';
import { ItemIcon, MachineIcon } from './pixel';

function GatherTile({ id, compact }: { id: string; compact?: boolean }) {
  const s = getState();
  const [pops, setPops] = useState(0);
  const full = (s.items[id] ?? 0) >= capOf(s, id);
  const one = () => {
    const st = getState();
    if ((st.items[id] ?? 0) >= capOf(st, id)) return false;
    gather(id);
    setPops((n) => n + 1);
    return true;
  };
  // A tap on a full tile still says why nothing happened
  const hold = useHold(one, () => {
    if (!one()) gather(id);
  });
  return (
    <button
      class={`gather-tile ${compact ? 'compact' : ''}`}
      title={`${itemName(id)} ${fmt(s.items[id] ?? 0)}/${fmt(capOf(s, id))}：點一下採一個，按住連續採集`}
      {...hold}
    >
      <ItemIcon id={id} size={compact ? 24 : 40} />
      <span class="gather-info">
        <span class="gather-name">{itemName(id)}</span>
        <span class={`gather-count ${full ? 'tone-text-warn' : ''}`}>
          {fmt(s.items[id] ?? 0)}{!compact && `/${fmt(capOf(s, id))}`}
        </span>
      </span>
      {pops > 0 && <span key={pops} class="gather-pop">+1</span>}
    </button>
  );
}

/** Big tiles while gathering by hand matters; once machines mine everything, a thin strip */
function ManualCard() {
  const s = getState();
  const manual = ITEM_ORDER.filter((id) => ITEMS[id].manual);
  const mined = manual.every((id) => s.lines.some((l) => l.count > 0 && id in (RECIPES[l.recipe]?.outputs ?? {})));
  if (mined) {
    return (
      <section class="card gather-strip" aria-label="手動採集">
        <span class="gather-strip-label">手動採集</span>
        <div class="gather-row compact">
          {manual.map((id) => <GatherTile key={id} id={id} compact />)}
        </div>
      </section>
    );
  }
  return (
    <section class="card">
      <div class="section-head">
        <h2>手動採集</h2>
        <span class="muted">點一下撿一個，按住連續採集</span>
      </div>
      <div class="gather-row">
        {manual.map((id) => <GatherTile key={id} id={id} />)}
      </div>
    </section>
  );
}

/** What a recipe group is for, in the player's terms; every recipe category belongs to one */
const GROUPS: { id: string; label: string; categories: string[] }[] = [
  { id: 'raw', label: '原料', categories: ['mining', 'pumping', 'asteroid', 'solar_wind', 'ice_mining', 'magma'] },
  { id: 'metal', label: '冶煉', categories: ['smelting', 'casting', 'blasting', 'arc', 'vacuum', 'freezing', 'cooling', 'coking'] },
  { id: 'parts', label: '零件', categories: ['crafting', 'compressing', 'assembling'] },
  { id: 'chem', label: '化工', categories: ['crushing', 'electrolysis', 'mixing', 'distilling', 'chemistry'] },
  { id: 'power', label: '電力', categories: ['burning', 'turbine', 'solar', 'combustion', 'fusion', 'launch', 'elevator', 'geothermal'] },
  { id: 'science', label: '研究', categories: ['research'] },
  { id: 'space', label: '太空', categories: ['microgravity', 'neutron', 'swarm', 'collider', 'stabilizer'] },
];
const GROUP_KEY = 'sf-new-group';

/** The group the player last looked at, or '' the first time */
function readGroup(): string {
  try {
    return localStorage.getItem(GROUP_KEY) ?? '';
  } catch {
    return '';
  }
}

/** One more of this machine fits and is paid for right now */
function affordable(m: MachineDef): boolean {
  const s = getState();
  const orbit = !!m.orbital;
  return canAfford(homeView(s), m.cost) && slotsUsed(s, orbit) + m.slots <= slotsTotal(s, orbit);
}

/** One side of a recipe as per-second amounts for a single machine */
function Rates({ items, perSec, sign }: { items: Record<string, number>; perSec: number; sign: '−' | '+' }) {
  const entries = Object.entries(items);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([id, n]) => (
        <span key={id} class={`rt-item ${ITEMS[id]?.kind === 'byproduct' ? 'byproduct' : ''}`}>
          <ItemIcon id={id} />
          <span>{itemName(id)}</span>
          <span class="rt-rate">{sign}{fmtNum(Math.round(n * perSec * 100) / 100)}</span>
        </span>
      ))}
    </>
  );
}

/** A recipe the player can start a line of: what it makes per machine, what that machine costs, one tap to build */
function RecipeTile({ r, machines }: { r: RecipeDef; machines: MachineDef[] }) {
  const s = getState();
  const [picked, setPicked] = useState(machines[0].id);
  const m = machines.find((x) => x.id === picked) ?? machines[0];
  const per = perMachineRate(m, r);
  const existing = s.lines.find((l) => l.recipe === r.id && l.machine === m.id);
  const main = Object.keys(r.outputs)[0];
  const draw = m.power ? m.power.amount * overclock(m, r).power : 0;
  return (
    <article class="recipe-tile">
      <div class="rt-head">
        <ItemIcon id={main} size={32} />
        <div class="rt-title">
          <span class="rt-name">{r.name}</span>
          {machines.length === 1 && <span class="rt-machine">{m.name}</span>}
        </div>
        {existing ? (
          <button class="rt-go" onClick={() => focusLine(existing.id)} title="已經有這條生產線">前往 ×{existing.count}</button>
        ) : (
          <button
            class={`rt-build ${affordable(m) ? 'primary' : ''}`}
            onClick={() => createLine(m.id, r.id)}
            title={affordable(m) ? '建立生產線並蓋第一台' : '材料或槽位不夠：先建立空的生產線，之後再按＋'}
          >
            建立
          </button>
        )}
      </div>
      {machines.length > 1 && (
        <div class="rt-machines" role="radiogroup" aria-label="用哪種機器">
          {machines.map((x) => (
            <button key={x.id} role="radio" aria-checked={x.id === m.id} class={x.id === m.id ? 'on' : ''} onClick={() => setPicked(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div class="rt-formula" aria-label="每台每秒">
        <span class="rt-unit">每秒</span>
        <Rates items={r.inputs} perSec={per} sign="−" />
        {/* The arrow travels with what it points at when the row wraps */}
        <span class="rt-side">
          {Object.keys(r.inputs).length > 0 && <span class="flow-arrow">→</span>}
          <Rates items={r.outputs} perSec={per} sign="+" />
        </span>
      </div>
      <div class="rt-foot">
        <span class="rt-cost">建造 <Cost cost={m.cost} /></span>
        {draw > 0 && (
          <span class="rt-draw">
            <ItemIcon id={m.power!.item} /> 耗{itemName(m.power!.item)} {fmtNum(Math.round(draw * 100) / 100)}/秒
          </span>
        )}
      </div>
    </article>
  );
}

const perMachineRate = (m: MachineDef, r: RecipeDef) => craftsPerMachine(getState(), m, r);

/** Every recipe that can be built right now, with the machines that can run it (cheapest first) */
function readyRecipes() {
  const s = getState();
  return RECIPE_LIST.flatMap((r) => {
    if (!isRecipeUnlocked(s, r.id) || !recipeFits(s, r)) return [];
    const ms = MACHINE_LIST.filter((m) => canRun(m, r) && isMachineUnlocked(s, m.id)).sort((a, b) => a.tier - b.tier);
    return ms.length ? [{ r, ms }] : [];
  });
}

const groupOf = (r: RecipeDef) => GROUPS.find((g) => g.categories.includes(r.category))?.id ?? GROUPS[2].id;

/** The new-line window: recipes by what they're for, or found by name; one tap builds the first machine */
export function NewLinePicker() {
  const [group, setGroupState] = useState(readGroup);
  // The objective bar opens it already searching for what the step needs
  const [query, setQuery] = useState(() => getUi().pickerQuery);
  const search = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const setGroup = (g: string) => {
    setGroupState(g);
    body.current?.closest('.modal')?.querySelector('.modal-body')?.scrollTo(0, 0);
    try {
      localStorage.setItem(GROUP_KEY, g);
    } catch {
      // ignore
    }
  };
  // A keyboard can start typing right away; on a phone the on-screen keyboard would cover the list
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) search.current?.focus();
  }, []);
  const ready = readyRecipes();
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, ready.filter(({ r }) => groupOf(r) === g.id).length]));
  const groups = GROUPS.filter((g) => counts[g.id] > 0);
  // The first time, open where something can be built right now (at the start: the stone furnace's smelting)
  const fallback = groups.find((g) => ready.some(({ r, ms }) => groupOf(r) === g.id && ms.some(affordable))) ?? groups[0];
  const active = groups.some((g) => g.id === group) ? group : fallback?.id;
  const q = query.trim();
  // How well a recipe answers the search: makes it, is named it, runs on it, uses it (lower is better)
  const rank = (r: RecipeDef, ms: MachineDef[]) => {
    const tests = [Object.keys(r.outputs).map(itemName), [r.name], ms.map((m) => m.name), Object.keys(r.inputs).map(itemName)];
    const i = tests.findIndex((names) => names.some((t) => t.includes(q)));
    return i < 0 ? Infinity : i;
  };
  // Newest tier first: what was just unlocked is usually what the player came for
  // Searching for a machine by name: its tiles start on that machine
  const named = q ? MACHINE_LIST.find((m) => m.name === q) : undefined;
  const shown = q
    ? ready
      .map((x) => ({ ...x, ms: named && x.ms.includes(named) ? [named, ...x.ms.filter((m) => m !== named)] : x.ms }))
      .map((x) => ({ ...x, score: rank(x.r, x.ms) }))
      .filter((x) => x.score < Infinity)
      .sort((a, b) => a.score - b.score || b.r.tier - a.r.tier)
    : ready.filter(({ r }) => groupOf(r) === active).sort((a, b) => b.r.tier - a.r.tier);
  const enter = () => {
    // Only a search picks for the player; Enter on an empty box must not build whatever tile comes first
    const first = q ? shown[0] : undefined;
    if (!first) return;
    const existing = getState().lines.find((l) => l.recipe === first.r.id && l.machine === first.ms[0].id);
    if (existing) focusLine(existing.id);
    else createLine(first.ms[0].id, first.r.id);
  };

  const bar = (
    <>
      <input
        ref={search}
        type="search"
        class="picker-search"
        placeholder="搜尋物品或機器"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === 'Enter' && enter()}
        aria-label="搜尋配方"
      />
      {!q && (
        <div class="line-filter picker-groups" role="tablist" aria-label="配方分類">
          {groups.map((g) => (
            <button key={g.id} role="tab" aria-selected={g.id === active} class={`filter-chip ${g.id === active ? 'active' : ''}`} onClick={() => setGroup(g.id)}>
              {g.label} <span class="filter-count">{counts[g.id]}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
  return (
    <Modal title="新增生產線" wide tall bar={bar} onClose={() => openPicker(false)}>
      <div ref={body}>
        {shown.length === 0 ? (
          <p class="muted">沒有符合「{q}」的配方。</p>
        ) : (
          <div class="recipe-grid">
            {shown.map(({ r, ms }) => <RecipeTile key={r.id} r={r} machines={ms} />)}
          </div>
        )}
      </div>
    </Modal>
  );
}

const WORN_SPEED_LOSS = 1 - WORN_SPEED;

/** One side of a line's recipe, one item per row; with `full`, each rate is followed by its full-speed figure */
function Flow({ items, perSec, full, sign }: { items: Record<string, number>; perSec: number; full?: number; sign: '−' | '+' }) {
  const entries = Object.entries(items);
  if (entries.length === 0) return <span class="muted">無</span>;
  const num = (x: number) => fmtNum(Math.round(x * 100) / 100);
  return (
    <span class="flow">
      {entries.map(([id, n]) => (
        <span key={id} class={ITEMS[id]?.kind === 'byproduct' ? 'byproduct' : ''}>
          <ItemLink id={id} /> {sign}{num(n * perSec)}/s
          {full !== undefined && <span class="flow-full"> / {num(n * full)}</span>}
        </span>
      ))}
    </span>
  );
}

function UpgradeRow({ line, to }: { line: Line; to: MachineDef }) {
  const net = upgradeCost(line, to);
  const pays = Object.fromEntries(Object.entries(net).filter(([, n]) => n > 0));
  const refunds = Object.entries(net).filter(([, n]) => n < 0);
  const r = RECIPES[line.recipe];
  const from = MACHINES[line.machine];
  // Compared with the machines in the line now, which may themselves be overclocked or draw nothing at all
  const speedOf = (m: MachineDef) => overclock(m, r).speed * (m.speed ?? 1);
  const faster = speedOf(to) / speedOf(from);
  const draw = to.power ? to.power.amount * overclock(to, r).power : 0;
  const was = from.power ? from.power.amount * overclock(from, r).power : 0;
  const drawText = draw > 0 && (to.power!.item !== from.power?.item || Math.abs(draw - was) > 1e-9)
    ? `每台耗${itemName(to.power!.item)} ${fmtNum(Math.round(draw * 100) / 100)}/s`
    : '';
  return (
    <div class="upgrade-row">
      <button disabled={!canAfford(homeView(getState()), pays)} onClick={() => upgradeLine(line.id)}>
        升級為 {to.name}
      </button>
      <span class="muted small">
        {[faster > 1.001 ? `速度 ×${fmtNum(Math.round(faster * 100) / 100)}` : `T${to.tier} 配方可用`, drawText].filter(Boolean).join('、')}
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

const LIMITS = [0.1, 0.25, 0.5, 0.75];

/** Stop the line once its main output stocks up to a share of storage, so it leaves shared inputs to others */
function LimitRow({ line, item }: { line: Line; item: string }) {
  const s = getState();
  const cap = capOf(s, item);
  return (
    <div class="limit-row">
      <span class="small">
        <ItemLink id={item} /> 庫存上限
      </span>
      <div class="limit-chips">
        <button class={`filter-chip ${line.limit === undefined ? 'active' : ''}`} onClick={() => setLineLimit(line.id, undefined)}>不限</button>
        {LIMITS.map((f) => (
          <button key={f} class={`filter-chip ${line.limit === f ? 'active' : ''}`} title={`${fmt(f * cap)} 個`} onClick={() => setLineLimit(line.id, f)}>
            {Math.round(f * 100)}%
          </button>
        ))}
      </div>
      <span class="muted small">
        {line.limit === undefined
          ? '不設上限：一直做到倉庫滿。設了上限，就能把共用的原料留給別條線'
          : `存到 ${fmt(line.limit * cap)} 個就停，下游用掉多少再補多少`}
      </span>
    </div>
  );
}

/** The other half of the stock limit: how much of its inputs the line leaves for others */
function ReserveRow({ line }: { line: Line }) {
  return (
    <div class="limit-row">
      <span class="small">原料保留</span>
      <div class="limit-chips">
        <button class={`filter-chip ${line.reserve === undefined ? 'active' : ''}`} onClick={() => setLineReserve(line.id, undefined)}>不留</button>
        {LIMITS.map((f) => (
          <button key={f} class={`filter-chip ${line.reserve === f ? 'active' : ''}`} onClick={() => setLineReserve(line.id, f)}>
            {Math.round(f * 100)}%
          </button>
        ))}
      </div>
      <span class="muted small">
        {line.reserve === undefined
          ? '不保留：原料有多少用多少。設了保留，庫存低於這個量就停手，留給別條線或貨運船'
          : `每種原料的庫存低於容量的 ${Math.round(line.reserve * 100)}% 就停手`}
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

/**
 * A line short of an input or of power: how many more machines on the line that makes it would cover
 * everyone at full speed, built in one tap. Nothing shows when the makers could already keep up and are
 * slow for their own reasons; their status says why.
 */
export function ShortfallFix({ item, depth = 0 }: { item: string; depth?: number }) {
  const f = shortfall(getState(), getLast(), item);
  if (!f) return null;
  // The maker is short itself: send the player one link up the chain instead of selling them idle machines
  if (f.line && f.blocked && f.blocked !== item && depth < 3) {
    const maker = MACHINES[f.line.machine];
    return (
      <>
        <div class="line-fix">
          <span class="muted small">
            做{itemName(item)}的{maker.name}本身缺{itemName(f.blocked)}，先補它：
          </span>
        </div>
        {shortfall(getState(), getLast(), f.blocked) ? (
          <ShortfallFix item={f.blocked} depth={depth + 1} />
        ) : (
          <div class="line-fix">
            <button class="small-btn" onClick={() => openLookup(f.blocked!)}>查看{itemName(f.blocked)}</button>
          </div>
        )}
      </>
    );
  }
  const gap = <span class="muted small">全速還缺 {fmtNum(Math.round(f.gap * 100) / 100)}/s</span>;
  if (!f.line) {
    return (
      <div class="line-fix">
        <button class="small-btn add" onClick={() => openPicker(true, itemName(item))}>建立{itemName(item)}生產線</button>
        {gap}
      </div>
    );
  }
  const maker = MACHINES[f.line.machine];
  return (
    <div class="line-fix">
      <button
        class="small-btn add"
        onClick={() => buildUpTo(f.line!.id, f.machines)}
        title={`在「${maker.name}·${RECIPES[f.line.recipe].name}」加蓋 ${f.machines} 台，每台 +${fmtNum(Math.round(f.perMachine * 100) / 100)}/s`}
      >
        補足：{maker.name} +{f.machines}
      </button>
      {gap}
    </div>
  );
}

/** The recipe a line runs, as a button that opens the choice of everything its machine can make */
function RecipeButton({ line, options }: { line: Line; options: number }) {
  const r = RECIPES[line.recipe];
  if (options <= 1) return <span class="recipe-btn static">{r.name}</span>;
  return (
    <button class="recipe-btn" onClick={() => openRecipeSwitch(line.id)} title="更換配方">
      <span>{r.name}</span>
      <Chevron />
    </button>
  );
}

/** Pick another recipe for a line: tiles like the new-line window, with the one in use marked */
export function RecipeSwitch({ lineId }: { lineId: number }) {
  const s = getState();
  const line = s.lines.find((l) => l.id === lineId);
  if (!line) return null;
  const m = MACHINES[line.machine];
  const options = recipesFor(s, line.machine);
  if (!options.some((rr) => rr.id === line.recipe)) options.unshift(RECIPES[line.recipe]);
  return (
    <Modal title={`更換配方：${m.name}`} icon={<MachineIcon id={m.id} size={24} />} wide onClose={() => openRecipeSwitch(null)}>
      {line.count > 0 && <p class="muted small">換配方不用花材料，{line.count} 台機器會立刻改做新的東西。</p>}
      <div class="recipe-grid">
        {options.map((r) => {
          const per = craftsPerMachine(s, m, r);
          const on = r.id === line.recipe;
          return (
            <button key={r.id} class={`recipe-tile pick-tile ${on ? 'on' : ''}`} onClick={() => setRecipe(line.id, r.id)} aria-pressed={on}>
              <div class="rt-head">
                <ItemIcon id={Object.keys(r.outputs)[0]} size={32} />
                <div class="rt-title">
                  <span class="rt-name">{r.name}</span>
                  {on && <span class="rt-machine tone-text-ok">使用中</span>}
                </div>
              </div>
              <div class="rt-formula">
                <span class="rt-unit">每台每秒</span>
                <Rates items={r.inputs} perSec={per} sign="−" />
                <span class="rt-side">
                  {Object.keys(r.inputs).length > 0 && <span class="flow-arrow">→</span>}
                  <Rates items={r.outputs} perSec={per} sign="+" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function LineCard({ line, status, fresh, fuel, onCollapse }: {
  line: Line;
  status?: LineStatus;
  fresh?: boolean;
  fuel?: boolean;
  /** In the list view: fold back to a row */
  onCollapse?: () => void;
}) {
  const s = getState();
  const m = MACHINES[line.machine];
  const r = RECIPES[line.recipe];
  const oc = overclock(m, r);
  const eff = status?.efficiency ?? 0;
  const reason = status?.reason ?? { kind: 'idle' as const };
  const tone = reasonTone(reason);
  // An empty line shows what one machine would do; a slowed line also shows what full speed would be
  const perMachine = (oc.speed * (m.speed ?? 1) * categoryBoost(s, r.category)) / r.time;
  const empty = line.count === 0;
  const perSec = empty ? perMachine : status?.craftsPerSec ?? 0;
  const fullSpeed = status?.maxCraftsPerSec ?? 0;
  const showFull = !empty && line.enabled && eff < 0.999 && fullSpeed > 0 && !['load', 'limit', 'reserve', 'igniting', 'idle', 'paused'].includes(reason.kind);
  const ventable = reason.kind === 'output' && canVent(reason.item) && !s.vent.includes(reason.item);
  const reasonItem = 'item' in reason ? reason.item : undefined;
  const reasonLabel = reasonText(reason, status, ventable);
  const recipeOptions = recipesFor(s, line.machine);
  if (!recipeOptions.some((rr) => rr.id === r.id)) recipeOptions.unshift(r);
  const upgrade = upgradeTarget(s, line);
  // What the machines themselves draw to run, apart from power the recipe turns into something else
  const drawItem = m.power?.item;
  const recipeNet = drawItem ? (r.outputs[drawItem] ?? 0) - (r.inputs[drawItem] ?? 0) : 0;
  const draw = !drawItem ? 0 : empty ? m.power!.amount * oc.power : recipeNet * perSec - (status?.power[drawItem] ?? 0);
  const limitItem = limitableItem(line);
  const [limitOpen, setLimitOpen] = useState(false);
  const hasInputs = Object.keys(r.inputs).some((i) => !isPower(i));

  return (
    <article id={`line-${line.id}`} data-line={line.id} class={`card line tone-border-${tone} ${line.enabled ? '' : 'paused'} ${eff > 0.01 ? 'running' : ''} ${fresh ? 'fresh' : ''}`}>
      <header class="line-head">
        <span class={`line-icon ${eff > 0.01 ? 'running' : ''}`}>
          <MachineIcon id={m.id} size={44} title />
          <span class="line-count-badge">×{line.count}</span>
        </span>
        <div class="line-title">
          <div class="line-name-row">
          <span class="line-name">{m.name}</span>
          <span class="badge tier">T{m.tier}</span>
          {oc.speed > 1 && (
            <span class="badge oc" title="機器階層高於配方：速度與耗能增加">{m.perfectOC ? '完美超頻' : '超頻'} ×{oc.speed}</span>
          )}
          {(m.speed ?? 1) > 1 && <span class="badge oc" title="大型設施">大型 ×{m.speed}</span>}
          {m.upkeep && s.maintenance && <span class="badge" title="每台每分鐘全速運轉消耗的維護套件">維護 {m.upkeep}/分</span>}
          {m.orbital && <span class="badge orbit" title="佔軌道槽位，靠軌道運力運轉">軌道</span>}
          {fuel && m.power && (
            <span class="badge fuel" title="這條線在替發電機產燃料：缺電時先供給它，發電才不會跟著垮">供電優先</span>
          )}
          {m.ignition && line.count > 0 && (line.heat ?? 0) >= 1 && <span class="badge lit">已點火</span>}
          </div>
          <RecipeButton line={line} options={recipeOptions.length} />
        </div>
        {onCollapse && (
          <button class="icon-btn collapse-btn" onClick={onCollapse} aria-label="收合" title="收合">
            <Chevron up />
          </button>
        )}
      </header>

      <div class="flow-row">
        {empty && <span class="flow-tag" title="還沒有機器：這是一台的產能">每台</span>}
        {showFull && <span class="flow-tag" title="現在的速度 / 全速時的速度">實際 / 滿速</span>}
        <Flow items={r.inputs} perSec={perSec} full={showFull ? fullSpeed : undefined} sign="−" />
        <span class="flow-arrow">→</span>
        <Flow items={r.outputs} perSec={perSec} full={showFull ? fullSpeed : undefined} sign="+" />
      </div>
      {(draw > 0.005 || status?.upkeep) && (
        <div class="flow-extra">
          {draw > 0.005 && (
            <span class="muted">
              機器耗用 <ItemLink id={drawItem!} /> −{fmtNum(Math.round(draw * 100) / 100)}/s
            </span>
          )}
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
        {reasonItem && line.count > 0 ? (
          <button class={`reason reason-link tone-text-${tone}`} title={`查看${itemName(reasonItem)}：誰在生產、誰在用`} onClick={() => openLookup(reasonItem)}>
            {reasonLabel}
          </button>
        ) : (
          <span class={`reason tone-text-${tone}`}>{reasonLabel}</span>
        )}
        <span class="muted small">{Math.round(eff * 100)}%</span>
      </div>
      {ventable && line.count > 0 && (
        <div class="line-fix">
          <button class="small-btn" onClick={() => toggleVent(reasonItem!)}>排放{itemName(reasonItem!)}</button>
          <span class="muted small">滿了就銷毀多出來的量，這條線不會再停</span>
        </div>
      )}
      {(reason.kind === 'input' || reason.kind === 'power') && line.count > 0 && line.enabled && <ShortfallFix item={reason.item} />}

      <footer class="line-actions">
        <HoldButton act={() => demolish(line.id) > 0} disabled={line.count === 0} title="拆除一台（全額退還材料），按住連續拆除" label="拆除一台">−</HoldButton>
        <HoldButton class="primary" act={() => build(line.id) > 0} title="建造一台，按住連續建造" label="建造一台">＋</HoldButton>
        <button onClick={() => build(line.id, 5)} title="建造五台">＋5</button>
        <button onClick={() => toggleLine(line.id)}>{line.enabled ? '暫停' : '繼續'}</button>
        {(limitItem || hasInputs) && (
          <button
            class={`limit-btn ${line.limit !== undefined || line.reserve !== undefined ? 'set' : ''}`}
            aria-expanded={limitOpen}
            title="條件：產物存到多少就停、原料保留多少不用"
            onClick={() => setLimitOpen(!limitOpen)}
          >
            {[
              line.limit !== undefined ? `上限${Math.round(line.limit * 100)}%` : '',
              line.reserve !== undefined ? `保留${Math.round(line.reserve * 100)}%` : '',
            ].filter(Boolean).join('·') || '條件'}
          </button>
        )}
        <span class="spacer" />
        <RemoveButton line={line} />
      </footer>
      {limitItem && limitOpen && <LimitRow line={line} item={limitItem} />}
      {limitOpen && hasInputs && <ReserveRow line={line} />}
      <p class="line-cost muted small">每台{planetOf(s) === HOME ? '' : '（母星庫存）'}：<Cost cost={m.cost} /></p>
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

/** The list view: one row per line, with what it makes or why it's stuck, and the build buttons */
function LineRow({ line, status, onOpen }: { line: Line; status?: LineStatus; onOpen: () => void }) {
  const m = MACHINES[line.machine];
  const r = RECIPES[line.recipe];
  const eff = status?.efficiency ?? 0;
  const reason = status?.reason ?? { kind: 'idle' as const };
  const tone = reasonTone(reason);
  const main = Object.keys(r.outputs)[0];
  const rate = (r.outputs[main] ?? 0) * (status?.craftsPerSec ?? 0);
  const fine = reason.kind === 'ok' || ((reason.kind === 'load' || reason.kind === 'limit' || reason.kind === 'reserve') && eff > 0);
  return (
    <div id={`line-${line.id}`} data-line={line.id} class={`lrow tone-border-${tone} ${line.enabled ? '' : 'paused'}`}>
      <button class="lrow-main" onClick={onOpen} title="展開這條生產線">
        <span class={`line-icon ${eff > 0.01 ? 'running' : ''}`}>
          <MachineIcon id={m.id} size={32} />
          <span class="line-count-badge">×{line.count}</span>
        </span>
        <span class="lrow-text">
          <span class="lrow-name">{r.name}</span>
          {/* What it makes (or why not) comes first; on a narrow screen the machine name is what gets cut */}
          <span class="lrow-sub">
            {fine ? (
              <span class="lrow-rate"><ItemIcon id={main} /> {fmtRate(rate)}</span>
            ) : (
              <span class={`lrow-reason tone-text-${tone}`}>{reasonText(reason, status, true)}</span>
            )}
            <span class="lrow-machine muted">{m.name}</span>
          </span>
        </span>
        <span class={`lrow-eff tone-text-${tone === 'ok' ? 'muted' : tone}`}>{Math.round(eff * 100)}%</span>
        <Chevron />
      </button>
      <HoldButton class="lrow-btn" act={() => demolish(line.id) > 0} disabled={line.count === 0} title="拆除一台，按住連續拆除" label="拆除一台">−</HoldButton>
      <HoldButton class="lrow-btn add" act={() => build(line.id) > 0} title="建造一台，按住連續建造" label="建造一台">＋</HoldButton>
      <span class="lrow-bar"><Bar value={eff} tone={tone} /></span>
    </div>
  );
}

/**
 * The panel redraws four times a second. A card scrolled out of view keeps its last picture instead,
 * which in a big factory is most of them; it catches up the moment it scrolls back in.
 */
interface LiveProps {
  line: Line;
  status?: LineStatus;
  fresh?: boolean;
  fuel: boolean;
  onScreen: boolean;
  /** List view: a row, unless the player opened it */
  row: boolean;
  onToggle?: () => void;
}

class LiveLine extends Component<LiveProps> {
  shouldComponentUpdate(next: LiveProps) {
    const p = this.props;
    return p.onScreen || next.onScreen || p.fresh !== next.fresh || p.fuel !== next.fuel || p.line !== next.line || p.row !== next.row;
  }

  render(p: LiveProps) {
    if (p.row) return <LineRow line={p.line} status={p.status} onOpen={p.onToggle!} />;
    return <LineCard line={p.line} status={p.status} fresh={p.fresh} fuel={p.fuel} onCollapse={p.onToggle} />;
  }
}

/**
 * Center a line card on screen. Cards out of view are drawn as fixed-height placeholders (content-visibility),
 * so the ones near the target change height as they render: jump there, then correct until it settles.
 */
function scrollToLine(id: number) {
  const el = document.getElementById(`line-${id}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  let tries = 0;
  const settle = () => {
    const r = el.getBoundingClientRect();
    const off = r.top + r.height / 2 - window.innerHeight / 2;
    if (Math.abs(off) > 4 && tries++ < 12) {
      window.scrollBy(0, off);
      requestAnimationFrame(settle);
    }
  };
  requestAnimationFrame(settle);
}

/** Ids of the line cards near the viewport; `layout` changes whenever the elements are swapped out */
function useOnScreen(ids: number[], layout: string): Set<number> {
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const key = `${layout}|${ids.join(',')}`;
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(new Set(ids));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => setSeen((prev) => {
        const next = new Set(prev);
        for (const e of entries) {
          const id = Number((e.target as HTMLElement).dataset.line);
          if (e.isIntersecting) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
      { rootMargin: '300px 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(`line-${id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key]);
  return seen;
}

const VIEW_KEY = 'sf-line-view';

/** What the player chose; until then a phone gets the list, where a screen holds ten lines instead of two */
function readView(): 'cards' | 'list' {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(VIEW_KEY);
  } catch {
    // ignore
  }
  if (saved === 'list' || saved === 'cards') return saved;
  return window.matchMedia?.('(max-width: 860px)').matches ? 'list' : 'cards';
}

/** After the list changes under a stuck toolbar, start it from its first line rather than somewhere in the middle */
function listToTop() {
  requestAnimationFrame(() => {
    const bar = document.querySelector('.prod-bar');
    const list = document.querySelector('.lines, .prod-panel > .empty');
    if (!bar || !list) return;
    const gap = list.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
    if (gap < 0) window.scrollBy(0, gap - 8);
  });
}

export function ProductionPanel() {
  const s = getState();
  const last = getLast();
  const [picked, setPicked] = useState(readFilter);
  const [view, setViewState] = useState(readView);
  // Rows the player opened in the list view
  const [open, setOpen] = useState<Set<number>>(new Set());
  const setFilter = (f: string) => {
    setPicked(f);
    listToTop();
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      // ignore
    }
  };
  const setView = (v: 'cards' | 'list') => {
    setViewState(v);
    setOpen(new Set());
    listToTop();
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };
  const toggleOpen = (id: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });
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
  // A line picked elsewhere (just created, or chosen in the item window) must not be hidden by the filter
  const focus = getUi().focusLine;
  const focused = focus === null ? undefined : s.lines.find((l) => l.id === focus);
  let filter = tests[picked] ? picked : 'all';
  if (focused && !tests[filter](focused)) filter = 'all';
  const shown = s.lines.filter(tests[filter]);
  const list = view === 'list';

  const onScreen = useOnScreen(shown.map((l) => l.id), `${view}|${[...open].join(',')}`);
  const fuel = fuelLines(s);

  // Bring it into view with a brief glow so the eye finds it after the scroll; in the list it opens up
  const [glow, setGlow] = useState<number | null>(null);
  useEffect(() => {
    if (focus === null) return;
    if (filter !== picked) setFilter(filter);
    if (list && !open.has(focus)) setOpen((prev) => new Set(prev).add(focus));
    setGlow(focus);
    // After the render that shows it (and opens its row), so the scroll aims at the card
    requestAnimationFrame(() => scrollToLine(focus));
    focusLine(null);
  }, [focus]);
  useEffect(() => {
    if (glow === null) return;
    const t = setTimeout(() => setGlow(null), 1800);
    return () => clearTimeout(t);
  }, [glow]);

  const machines = s.lines.reduce((n, l) => n + l.count, 0);
  const away = planetOf(s) !== HOME;
  return (
    <div class="panel prod-panel">
      {/* The page heading doubles as the toolbar; on a phone it and the filter stay at the top while the list scrolls */}
      <div class="prod-bar">
      <header class="page-head prod-head">
        <h1>
          <button class="title-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="回到最上面">生產線</button>
        </h1>
        {s.lines.length > 0 && <span class="muted prod-count">{s.lines.length} 條 · {machines} 台</span>}
        <span class="spacer" />
        {s.lines.length > 1 && (
          <div class="seg view-seg" role="radiogroup" aria-label="顯示方式">
            <button role="radio" aria-checked={!list} class={list ? '' : 'on'} onClick={() => setView('cards')}>卡片</button>
            <button role="radio" aria-checked={list} class={list ? 'on' : ''} onClick={() => setView('list')}>清單</button>
          </div>
        )}
        {s.lines.length > 0 && (
          <button class="primary new-line-btn" onClick={() => openPicker(true)} title="新增生產線（N）">
            ＋ 新增<span class="hide-sm">生產線</span>
          </button>
        )}
      </header>
      {s.lines.length > 1 && <LineFilter filter={filter} setFilter={setFilter} counts={counts} />}
      </div>
      {away ? (
        <p class="planet-note muted small">
          <strong>{PLANETS[planetOf(s)].name}</strong>：這裡有自己的倉庫和電網。蓋機器的材料從母星倉庫扣；原料和產物要用貨運航線來回。
        </p>
      ) : <ManualCard />}
      {away && <RoutesCard />}
      {s.lines.length === 0 ? (
        <div class="empty empty-cta">
          <p>{away ? '這顆星球還沒有生產線。先蓋發電的，再蓋開採的。' : '還沒有生產線。先手動採集石頭，然後建立一條「石爐」生產線。'}</p>
          <button class="primary big" onClick={() => openPicker(true)}>＋ 新增生產線</button>
        </div>
      ) : (
        <>
        {shown.length === 0 ? (
          <p class="empty">{filter === 'stuck' ? '沒有卡住的生產線，一切順暢。' : '這裡沒有生產線。'}</p>
        ) : (
          <div class={list ? 'lines lines-list' : 'lines'}>
            {shown.map((l) => (
              <LiveLine
                key={l.id}
                line={l}
                status={last.lines[l.id]}
                fresh={l.id === glow}
                fuel={fuel.has(l.id)}
                onScreen={onScreen.has(l.id)}
                row={list && !open.has(l.id)}
                onToggle={list ? () => toggleOpen(l.id) : undefined}
              />
            ))}
          </div>
        )}
        </>
      )}
      {!away && <RoutesCard />}
    </div>
  );
}
