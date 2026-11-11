// Cargo routes: ships that carry one item from one world's storage to another's
import { itemName } from '../data/items';
import { PLANETS, SHIP_COST, SHIP_FUEL_ITEM, shippable } from '../data/planets';
import { homeItems, openPlanets, planetOf, storeOf } from '../sim/planets';
import { capOf, shipFuel, shipRate } from '../sim/rules';
import type { Route } from '../sim/types';
import {
  buildShip, createRoute, getRouteStatus, getState, openLookup, openRoutePicker, removeRoute, routesOf, scrapShip, setRouteRule, toggleRoute,
} from '../state/store';
import { Cost, HoldButton, ItemLink, Modal, fmt, fmtNum } from './common';
import { ItemIcon } from './pixel';

const perSec = (n: number) => fmtNum(Math.round(n * 100) / 100);

export const WHY: Record<string, string> = {
  paused: '已暫停',
  idle: '還沒有船',
  empty: '來源沒貨了',
  full: '目的地倉庫已滿',
  keep: '來源只剩保留量',
  enough: '目的地已存夠',
  fuel: '母星沒有火箭燃料',
};
const STEPS = [0.1, 0.25, 0.5, 0.75];
const pct = (f: number) => `${Math.round(f * 100)}%`;

/** The route's two conditions, as fractions of the item's storage */
function RouteRules({ r }: { r: Route }) {
  const cap = capOf(getState(), r.item);
  const pick = (key: 'keep' | 'upTo') => (e: Event) => {
    const v = Number((e.target as HTMLSelectElement).value);
    setRouteRule(r.id, { [key]: v > 0 ? v : null });
  };
  return (
    <div class="route-rules small">
      <span class="muted" title="運費依距離計，從母星倉庫扣">運費 {Math.round(1 / shipFuel(getState(), r.from, r.to))} 個／1 燃料</span>
      <label>
        <span class="muted">{PLANETS[r.from].name}保留</span>
        <select value={String(r.keep ?? 0)} onChange={pick('keep')} aria-label="來源保留多少">
          <option value="0">不留</option>
          {STEPS.map((f) => <option key={f} value={String(f)}>{pct(f)}（{fmt(f * cap)}）</option>)}
        </select>
      </label>
      <label>
        <span class="muted">{PLANETS[r.to].name}存到</span>
        <select value={String(r.upTo ?? 0)} onChange={pick('upTo')} aria-label="目的地存到多少就停">
          <option value="0">放滿</option>
          {STEPS.map((f) => <option key={f} value={String(f)}>{pct(f)}（{fmt(f * cap)}）</option>)}
        </select>
      </label>
    </div>
  );
}

function RouteRow({ r }: { r: Route }) {
  const st = getRouteStatus(r.id);
  const slow = st && st.reason !== 'ok';
  const bad = st?.reason === 'fuel';
  return (
    <div class={`route ${r.enabled ? '' : 'paused'}`}>
      <button class="route-main" onClick={() => openLookup(r.item)} title={`查看${itemName(r.item)}`}>
        <ItemIcon id={r.item} size={24} />
        <span class="route-text">
          <span class="route-name">{itemName(r.item)}</span>
          <span class="small muted">{PLANETS[r.from].name} → {PLANETS[r.to].name}</span>
        </span>
        <span class="route-rate">
          <span class={bad ? 'tone-text-bad' : slow ? 'tone-text-warn' : 'tone-text-ok'}>{perSec(st?.perSec ?? 0)}/s</span>
          <span class="small muted">
            {slow ? WHY[st!.reason] : `滿載 ${perSec(r.ships * shipRate(getState()))}/s`}
          </span>
        </span>
      </button>
      <span class="route-ctl">
      <span class="route-ships" title="這條航線上的貨運船">{r.ships} 艘</span>
      <HoldButton class="lrow-btn" act={() => scrapShip(r.id) > 0} disabled={r.ships === 0} title="拆掉一艘船（全額退還材料）" label="拆掉一艘貨運船">−</HoldButton>
      <HoldButton class="lrow-btn add" act={() => buildShip(r.id) > 0} title={`加一艘船，每艘每秒運 ${perSec(shipRate(getState()))} 個`} label="加一艘貨運船">＋</HoldButton>
      <button class="small-btn" onClick={() => toggleRoute(r.id)}>{r.enabled ? '暫停' : '繼續'}</button>
      <button class="small-btn danger" onClick={() => removeRoute(r.id)} title="拆掉船並取消這條航線">取消</button>
      </span>
      <RouteRules r={r} />
    </div>
  );
}

/** On the production tab: every route that starts or ends on the world in view */
export function RoutesCard() {
  const s = getState();
  if (openPlanets(s).length < 2) return null;
  const here = planetOf(s);
  const routes = routesOf(s).filter((r) => r.from === here || r.to === here);
  const burn = routesOf(s).reduce((n, r) => n + (getRouteStatus(r.id)?.fuel ?? 0), 0);
  return (
    <section class="card routes-card">
      <div class="section-head">
        <h2>貨運航線</h2>
        <span class="muted small hide-sm">每顆星球各有倉庫，東西要靠船運</span>
        <span class="spacer" />
        <button class="small-btn add" onClick={() => openRoutePicker(true)}>＋ 新增航線</button>
      </div>
      {routes.length === 0 ? (
        <p class="muted small">還沒有航線。新增一條，把這裡多的東西運出去，或把缺的運進來。</p>
      ) : (
        <div class="route-list">
          {routes.map((r) => <RouteRow key={r.id} r={r} />)}
        </div>
      )}
      <p class="line-cost muted small">每艘船（每秒運 {perSec(shipRate(s))} 個）：<Cost cost={SHIP_COST} /></p>
      <p class="line-cost muted small">
        運費：離母星每一段航程，每運 {Math.round(1 / shipFuel(s, 'home', 'ice'))} 個耗 1 <ItemLink id={SHIP_FUEL_ITEM} />，從母星倉庫扣（現有 {fmt(homeItems(s)[SHIP_FUEL_ITEM] ?? 0)}
        {burn > 0 ? `，航線每秒共燒 ${perSec(burn)}` : ''}）
      </p>
    </section>
  );
}

/** Items a world has in stock that a ship could carry */
function cargo(planet: string): [string, number][] {
  const items = storeOf(getState(), planet)?.items ?? {};
  return Object.entries(items)
    .filter(([id, n]) => n >= 1 && shippable(id))
    .sort((a, b) => b[1] - a[1]);
}

function CargoGrid({ from, to }: { from: string; to: string }) {
  const s = getState();
  const list = cargo(from);
  const taken = new Set(routesOf(s).filter((r) => r.from === from && r.to === to).map((r) => r.item));
  return (
    <>
      <h4>{PLANETS[from].name} → {PLANETS[to].name}</h4>
      {list.length === 0 ? (
        <p class="muted small">{PLANETS[from].name}的倉庫還是空的。</p>
      ) : (
        <div class="cargo-grid">
          {list.map(([id, n]) => (
            <button key={id} class={`cargo ${taken.has(id) ? 'on' : ''}`} onClick={() => createRoute(id, from, to)} title={taken.has(id) ? '已經有這條航線' : `把${itemName(id)}運到${PLANETS[to].name}`}>
              <ItemIcon id={id} size={24} />
              <span class="cargo-name">{itemName(id)}</span>
              <span class="small muted">{fmt(n)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Pick what to ship: whatever either world has in stock, in either direction */
export function RoutePicker() {
  const s = getState();
  const here = planetOf(s);
  const elsewhere = openPlanets(s).filter((p) => p !== here);
  return (
    <Modal title="新增航線" wide onClose={() => openRoutePicker(false)}>
      <p class="muted small">
        選一樣東西和方向。船會一直把來源倉庫裡的貨運到目的地，直到目的地放滿；建好後可以設「來源保留多少」「目的地存到多少」。運貨會燒母星的火箭燃料。每艘船：<Cost cost={SHIP_COST} />
      </p>
      {elsewhere.map((p) => (
        <div key={p}>
          <CargoGrid from={here} to={p} />
          <CargoGrid from={p} to={here} />
        </div>
      ))}
    </Modal>
  );
}

/** In the item window: this item's routes, and one tap to start shipping it */
export function ItemRoutes({ item }: { item: string }) {
  const s = getState();
  const planets = openPlanets(s);
  if (planets.length < 2 || !shippable(item)) return null;
  const here = planetOf(s);
  const routes = routesOf(s).filter((r) => r.item === item);
  const has = (from: string, to: string) => routes.some((r) => r.from === from && r.to === to);
  return (
    <>
      <h4>貨運</h4>
      {routes.length > 0 && <div class="route-list">{routes.map((r) => <RouteRow key={r.id} r={r} />)}</div>}
      <div class="row">
        {planets.filter((p) => p !== here).flatMap((p) => [
          !has(p, here) && (
            <button key={`in-${p}`} class="small-btn add" onClick={() => createRoute(item, p, here)}>
              從{PLANETS[p].name}運來（庫存 {fmt(storeOf(s, p)?.items[item] ?? 0)}）
            </button>
          ),
          !has(here, p) && (
            <button key={`out-${p}`} class="small-btn" onClick={() => createRoute(item, here, p)}>運到{PLANETS[p].name}</button>
          ),
        ])}
      </div>
    </>
  );
}
