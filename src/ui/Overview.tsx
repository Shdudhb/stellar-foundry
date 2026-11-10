// Every world on one screen: room, power, what is stuck, and what the ships are carrying
import { POWER_ORDER, itemName } from '../data/items';
import { PLANETS, SHIP_FUEL_ITEM } from '../data/planets';
import { RECIPES } from '../data/recipes';
import { HOME, openPlanets, planetOf, storeOf, viewOf } from '../sim/planets';
import { slotsTotal, slotsUsed } from '../sim/rules';
import { focusLine, getRouteStatus, getState, getWorld, openOverview, routesOf, switchPlanet } from '../state/store';
import { Modal, fmt, fmtNum, fmtRate, isStuck, reasonText } from './common';
import { ItemIcon } from './pixel';
import { WHY } from './Shipping';

const perSec = (n: number) => fmtNum(Math.round(n * 100) / 100);

function World({ planet, toProduction }: { planet: string; toProduction: () => void }) {
  const s = getState();
  const def = PLANETS[planet];
  const view = viewOf(s, planet);
  const res = getWorld(planet);
  const store = storeOf(s, planet);
  const lines = store?.lines ?? [];
  const here = planet === planetOf(s);
  const used = slotsUsed(view);
  const total = slotsTotal(view);
  const stuck = lines.filter((l) => isStuck(l, res?.lines[l.id]));
  const routes = routesOf(s).filter((r) => r.from === planet || r.to === planet);
  // What this world is for, and whatever the ships bring or take
  const watch = [...new Set([...(planet === HOME ? [SHIP_FUEL_ITEM] : def.keyItems), ...routes.map((r) => r.item)])].slice(0, 8);
  const go = (line?: number) => {
    openOverview(false);
    if (line !== undefined) focusLine(line);
    else switchPlanet(planet);
    toProduction();
  };
  return (
    <section class={`world ${here ? 'here' : ''}`}>
      <header class="world-head">
        <ItemIcon id={def.icon} size={32} />
        <span class="world-name">
          <strong>{def.name}</strong>
          <span class="small muted">{lines.length} 條生產線 · 槽位 <span class={used >= total ? 'tone-text-warn' : ''}>{used}/{total}</span></span>
        </span>
        <span class="spacer" />
        {here ? <span class="small muted">目前所在</span> : <button class="small-btn" onClick={() => go()}>前往</button>}
      </header>
      <div class="world-power">
        {POWER_ORDER.map((p) => {
          const st = res?.power[p];
          if (!st || (st.capacity === 0 && st.demand === 0)) return null;
          const tone = st.demand === 0 ? 'muted' : st.satisfaction >= 0.999 ? 'ok' : 'warn';
          return (
            <span key={p} class={`stat tone-text-${tone}`}>
              <ItemIcon id={p} /> {itemName(p)} {fmt(st.demand)}/{fmt(st.capacity)}
              {st.demand > 0 && ` · ${Math.round(st.satisfaction * 100)}%`}
            </span>
          );
        })}
        {lines.length === 0 && <span class="small muted">還沒有蓋任何東西。</span>}
      </div>
      {watch.length > 0 && (
        <div class="world-items">
          {watch.map((id) => {
            const rate = res?.rates[id] ?? 0;
            return (
              <span key={id} class="world-item" title={itemName(id)}>
                <ItemIcon id={id} />
                <span class="world-item-name">{itemName(id)}</span>
                <strong>{fmt(store?.items[id] ?? 0)}</strong>
                <span class={`small ${rate < -0.005 ? 'tone-text-bad' : rate > 0.005 ? 'tone-text-ok' : 'muted'}`}>{fmtRate(rate)}</span>
              </span>
            );
          })}
        </div>
      )}
      {stuck.length > 0 && (
        <ul class="world-list">
          {stuck.slice(0, 4).map((l) => (
            <li key={l.id}>
              <button class="world-row tone-text-warn" onClick={() => go(l.id)}>
                <span>⚠ {RECIPES[l.recipe]?.name ?? l.recipe}</span>
                <span class="small">{reasonText(res!.lines[l.id].reason, res!.lines[l.id], true)}</span>
              </button>
            </li>
          ))}
          {stuck.length > 4 && <li class="small muted">還有 {stuck.length - 4} 條卡住</li>}
        </ul>
      )}
      {routes.length > 0 && (
        <ul class="world-list">
          {routes.map((r) => {
            const st = getRouteStatus(r.id);
            const out = r.from === planet;
            const bad = r.enabled && r.ships > 0 && ['fuel', 'full'].includes(st?.reason ?? '');
            return (
              <li key={r.id} class={`world-row ${bad ? 'tone-text-warn' : ''}`}>
                <span>
                  <ItemIcon id={r.item} /> {out ? '運出' : '運入'} {itemName(r.item)}
                  <span class="small muted"> {out ? `→ ${PLANETS[r.to].name}` : `← ${PLANETS[r.from].name}`}</span>
                </span>
                <span class="small">{!r.enabled ? '暫停' : r.ships === 0 ? '沒有船' : bad ? WHY[st!.reason] : `${perSec(st?.perSec ?? 0)}/${perSec(st?.capacity ?? 0)} /s`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function OverviewModal({ toProduction }: { toProduction: () => void }) {
  const s = getState();
  const burn = routesOf(s).reduce((n, r) => n + (getRouteStatus(r.id)?.fuel ?? 0), 0);
  return (
    <Modal title="星球總覽" icon={<ItemIcon id="rocket_part" size={24} />} wide onClose={() => openOverview(false)}>
      <div class="world-grid">
        {openPlanets(s).map((p) => <World key={p} planet={p} toProduction={toProduction} />)}
      </div>
      {burn > 0 && <p class="small muted">所有航線每秒共燒 {perSec(burn)} 火箭燃料。</p>}
    </Modal>
  );
}
