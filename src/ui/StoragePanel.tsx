import { ITEM_ORDER, ITEMS } from '../data/items';
import { capOf, itemDiscovered } from '../sim/rules';
import { getLast, getRates, getState, toggleVent, trash } from '../state/store';
import { Bar, ItemLink, fmt, fmtRate } from './common';

export function StoragePanel() {
  const s = getState();
  const rates = getRates();
  const vented = getLast().vented;
  // The swarm is a structure, not cargo: it lives in the top bar and can't be thrown away
  const items = ITEM_ORDER.filter((id) => !['power', 'structure'].includes(ITEMS[id].kind) && itemDiscovered(s, id));
  const decayed = getLast().decayed;

  return (
    <div class="panel">
      <section class="card">
        <h3>倉庫</h3>
        <p class="muted small">
          倉庫滿了，生產它的機器就會停工。副產物要回收；或者勾選「排放」，滿了就把多的銷毀，機器不會停，但會浪費。
        </p>
        <table class="storage">
          <thead>
            <tr><th>物品</th><th>數量</th><th class="hide-sm">容量</th><th>每秒</th><th /></tr>
          </thead>
          <tbody>
            {items.map((id) => {
              const n = s.items[id] ?? 0;
              const cap = capOf(s, id);
              const full = n >= cap - 1e-6;
              const byproduct = ITEMS[id].kind === 'byproduct';
              const venting = s.vent.includes(id);
              return (
                <tr key={id} class={byproduct ? 'byproduct' : ''}>
                  <td><ItemLink id={id} /></td>
                  <td class={full && !venting ? 'tone-text-bad' : ''}>{fmt(n)}<span class="muted">/{fmt(cap)}</span></td>
                  <td class="hide-sm"><Bar value={n / cap} tone={full ? (venting ? 'warn' : 'bad') : 'ok'} /></td>
                  <td class={(rates[id] ?? 0) < -0.005 ? 'neg' : 'muted'}>
                    {fmtRate(rates[id] ?? 0)}
                    {(vented[id] ?? 0) > 0.005 && <span class="tone-text-warn small"> 排放 {fmtRate(-vented[id])}</span>}
                    {(decayed[id] ?? 0) > 0.005 && <span class="tone-text-warn small"> 衰變 {fmtRate(-decayed[id])}</span>}
                  </td>
                  <td class="row-actions">
                    {byproduct && (
                      <label class="vent-toggle" title="滿了就銷毀多出來的量，生產線不會停">
                        <input type="checkbox" checked={venting} onChange={() => toggleVent(id)} />
                        排放
                      </label>
                    )}
                    {n > 0 && (
                      <button
                        class="small-btn"
                        onClick={() => (byproduct || confirm(`丟掉全部 ${ITEMS[id].name}？`)) && trash(id)}
                      >
                        丟棄
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
