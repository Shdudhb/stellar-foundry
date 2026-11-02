import { ITEM_ORDER, ITEMS, type ItemKind } from '../data/items';
import { capOf, itemDiscovered } from '../sim/rules';
import { getLast, getRates, getState, openLookup, toggleVent, trash } from '../state/store';
import { Bar, PageHeader, fmt, fmtRate } from './common';
import { ItemIcon } from './pixel';

const GROUPS: { title: string; kicker: string; kinds: ItemKind[] }[] = [
  { title: '原料', kicker: '礦物、燃料與採集來的東西', kinds: ['raw'] },
  { title: '中間產物', kicker: '錠、零件、化學品', kinds: ['intermediate'] },
  { title: '副產物', kicker: '滿了會讓產生它的線停工：回收它，或在物品視窗打開排放', kinds: ['byproduct'] },
  { title: '科研', kicker: '科研包與研究數據', kinds: ['science', 'data'] },
];

function Slot({ id }: { id: string }) {
  const s = getState();
  const rate = getRates()[id] ?? 0;
  const n = s.items[id] ?? 0;
  const cap = capOf(s, id);
  const full = n >= cap - 1e-6;
  const venting = s.vent.includes(id);
  const byproduct = ITEMS[id].kind === 'byproduct';
  const tone = full ? (venting ? 'warn' : 'bad') : 'ok';
  return (
    <button
      class={`slot ${full ? 'full' : ''} ${venting ? 'venting' : ''} ${byproduct ? 'byproduct' : ''}`}
      onClick={() => openLookup(id)}
      title={`${ITEMS[id].name}：${fmt(n)}/${fmt(cap)}${venting ? '（排放中）' : ''}`}
    >
      {venting && <span class="slot-flag tone-text-warn" aria-label="排放中">▼</span>}
      {ITEMS[id].decay && <span class="slot-flag tone-text-warn" aria-label="會衰變">☢</span>}
      <ItemIcon id={id} size={32} />
      <span class="slot-count">{fmt(n)}</span>
      <span class={`slot-rate ${rate > 0.005 ? 'pos' : rate < -0.005 ? 'neg' : ''}`}>{fmtRate(rate)}</span>
      <span class="slot-name">{ITEMS[id].name}</span>
      <span class="slot-bar"><div class={`tone-${tone}`} style={{ width: `${Math.min(1, n / cap) * 100}%` }} /></span>
    </button>
  );
}

/** Amount, venting and throwing away: shown at the top of the item window */
export function StoreControls({ id }: { id: string }) {
  const s = getState();
  const def = ITEMS[id];
  if (!def || ['power', 'structure'].includes(def.kind)) return null;
  const n = s.items[id] ?? 0;
  const cap = capOf(s, id);
  const byproduct = def.kind === 'byproduct';
  const venting = s.vent.includes(id);
  const vented = getLast().vented[id] ?? 0;
  const decayed = getLast().decayed[id] ?? 0;
  return (
    <div class="store-controls">
      <ItemIcon id={id} size={40} />
      <div style={{ flex: 1, minWidth: '160px' }}>
        <div class="small">
          庫存 <strong>{fmt(n)}</strong>
          <span class="muted">/{fmt(cap)}</span> · {fmtRate(getRates()[id] ?? 0)}
          {vented > 0.005 && <span class="tone-text-warn"> · 排放 {fmtRate(-vented)}</span>}
          {decayed > 0.005 && <span class="tone-text-warn"> · 衰變 {fmtRate(-decayed)}</span>}
        </div>
        <Bar value={n / cap} tone={n >= cap - 1e-6 ? (venting ? 'warn' : 'bad') : 'ok'} />
      </div>
      {byproduct && (
        <label class="vent-toggle" title="滿了就銷毀多出來的量，生產線不會停">
          <input type="checkbox" checked={venting} onChange={() => toggleVent(id)} />
          排放
        </label>
      )}
      {n > 0 && (
        <button class="small-btn danger" onClick={() => (byproduct || confirm(`丟掉全部 ${def.name}？`)) && trash(id)}>
          丟棄
        </button>
      )}
    </div>
  );
}

export function StoragePanel() {
  const s = getState();
  // The swarm is a structure, not cargo: it lives in the top bar and can't be thrown away
  const items = ITEM_ORDER.filter((id) => !['power', 'structure'].includes(ITEMS[id].kind) && itemDiscovered(s, id));

  return (
    <div class="panel">
      <PageHeader kicker="LOGISTICS / STORAGE" title="倉庫">
        倉庫滿了，生產它的機器就會停工。點物品可以看配方、設定排放或丟棄。
      </PageHeader>
      {GROUPS.map((g) => {
        const ids = items.filter((id) => g.kinds.includes(ITEMS[id].kind));
        if (ids.length === 0) return null;
        return (
          <section key={g.title} class="card inv-section">
            <div class="section-head">
              <h2>{g.title}</h2>
              <span class="muted">{g.kicker}</span>
            </div>
            <div class="slot-grid">
              {ids.map((id) => <Slot key={id} id={id} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
