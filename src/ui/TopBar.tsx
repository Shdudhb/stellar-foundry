import { POWER_ORDER, SWARM_EU, SWARM_ITEM, itemName } from '../data/items';
import { currentTier, slotsTotal, slotsUsed } from '../sim/rules';
import { getLast, getRates, getState, openLookup, openSignal } from '../state/store';
import { fmt, fmtDuration, fmtNum, fmtRate } from './common';

// What matters at each tier; the storage tab has everything else
const KEY_ITEMS_BY_TIER: string[][] = [
  ['iron_ingot', 'copper_ingot', 'stone_brick', 'gear', 'copper_wire', 'red_pack', 'data'],
  ['iron_ingot', 'copper_ingot', 'stone_brick', 'gear', 'steel', 'red_pack', 'data'],
  ['steel', 'coke', 'aluminum', 'silicon', 'rubber', 'circuit', 'green_pack', 'data', 'data_green'],
  ['stainless', 'light_oil', 'plastic', 'sulfuric_acid', 'pcb', 'adv_circuit', 'blue_pack', 'data_green', 'data_blue'],
  ['maintenance_kit', 'titanium', 'tungsten', 'coolant', 'precision_circuit', 'purple_pack', 'data_blue', 'data_purple'],
  ['rocket_fuel', 'rocket_part', 'iridium', 'helium_3', 'zg_crystal', 'nanotube', 'yellow_pack', 'data_purple', 'data_yellow'],
  ['deuterium', 'helium_3', 'liquid_helium', 'superconductor', 'iridium', 'neutronium', 'dyson_panel', 'yellow_pack', 'data_yellow'],
  ['dyson_panel', 'neutronium', 'superconductor', 'exotic_matter', 'stable_exotic', 'white_pack', 'data_yellow', 'data_white'],
];

const round1 = (n: number) => fmtNum(Math.round(n * 10) / 10);

export function TopBar() {
  const s = getState();
  const last = getLast();
  const rates = getRates();
  const used = slotsUsed(s);
  const total = slotsTotal(s);
  const orbitUsed = slotsUsed(s, true);
  const orbitTotal = slotsTotal(s, true);
  const swarm = Math.floor(s.items[SWARM_ITEM] ?? 0);
  const tier = currentTier(s);
  const keyItems = KEY_ITEMS_BY_TIER[Math.min(tier, KEY_ITEMS_BY_TIER.length - 1)];

  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">◆</span>
        <span class="brand-name">星燼工業</span>
        <span class="brand-tier">T{tier}</span>
        {s.legacy.warps > 0 && <span class="brand-tier muted" title="已躍遷的星系數">星系 {s.legacy.warps + 1}</span>}
      </div>
      {s.signal !== null && (
        <button class="signal-btn" onClick={() => openSignal(true)}>
          ◈ 遺物訊號 <span class="small">{Math.max(0, Math.ceil(s.signal - s.playTime))}s</span>
        </button>
      )}
      {s.boostUntil > s.playTime && (
        <span class="boost-chip" title="遺物的時間加速：整座工廠 ×2">時間加速 ×2 · {Math.ceil(s.boostUntil - s.playTime)}s</span>
      )}
      <div class="chips">
        {keyItems.map((id) => (
          <button key={id} class="chip" onClick={() => openLookup(id)}>
            <span class="chip-label">{itemName(id)}</span>
            <span class="chip-value">{fmt(s.items[id] ?? 0)}</span>
            <span class={`chip-rate ${(rates[id] ?? 0) < -0.005 ? 'neg' : ''}`}>{fmtRate(rates[id] ?? 0)}</span>
          </button>
        ))}
      </div>
      <div class="stats">
        {POWER_ORDER.map((p) => {
          const st = last.power[p];
          if (!st || (st.capacity === 0 && st.demand === 0)) return null;
          const tone = st.demand === 0 ? 'muted' : st.satisfaction >= 0.999 ? 'ok' : 'warn';
          return (
            <span key={p} class={`stat tone-text-${tone}`} title={`${itemName(p)}：需求 / 可供給`}>
              {itemName(p)} {round1(st.demand)}/{round1(st.capacity)}
              {st.demand > 0 && ` · ${Math.round(st.satisfaction * 100)}%`}
            </span>
          );
        })}
        {swarm > 0 && (
          <button class="stat link-stat" title="每片戴森板提供的免費電力" onClick={() => openLookup(SWARM_ITEM)}>
            {itemName(SWARM_ITEM)} {fmtNum(swarm)} 片 · +{fmtNum(swarm * SWARM_EU)} 電力
          </button>
        )}
        <span class={`stat ${used >= total ? 'tone-text-warn' : ''}`}>槽位 {used}/{total}</span>
        {orbitTotal > 0 && (
          <span class={`stat ${orbitUsed >= orbitTotal ? 'tone-text-warn' : ''}`}>軌道 {orbitUsed}/{orbitTotal}</span>
        )}
        <span class="stat muted">{fmtDuration(s.playTime)}</span>
      </div>
    </header>
  );
}
