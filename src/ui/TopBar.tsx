import { POWER_ORDER, SWARM_EU, SWARM_ITEM, itemName } from '../data/items';
import { GALAXIES } from '../data/galaxies';
import { TIER_NAMES } from '../data/tech';
import { activeIncident, currentTier, slotsTotal, slotsUsed } from '../sim/rules';
import { getLast, getRates, getState, openLookup, openSignal, openTrade } from '../state/store';
import { fmt, fmtDuration, fmtNum, fmtRate } from './common';
import { ItemIcon } from './pixel';
import { getAudioPrefs, setAudioPrefs } from './sound';

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

/** A colony day is ten minutes of factory time; it only marks the passing of time */
const DAY_SECONDS = 600;

/** Power numbers: one decimal while small, then k/M/G like stock counts */
const round1 = (n: number) => (Math.abs(n) >= 1e4 ? fmt(n) : fmtNum(Math.round(n * 10) / 10));

export function Brand({ compact }: { compact?: boolean }) {
  const s = getState();
  const tier = currentTier(s);
  return (
    <div class={`brand ${compact ? 'compact' : ''}`}>
      <span class="brand-logo" aria-hidden="true">
        <ItemIcon id="exotic_matter" size={compact ? 24 : 32} />
      </span>
      <span class="brand-text">
        <span class="brand-name">星燼工業</span>
        <span class="brand-sub">STELLAR FOUNDRY</span>
      </span>
      <span class="tier-pill" title={TIER_NAMES[tier]}>T{tier}</span>
    </div>
  );
}

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
  const day = Math.floor(s.playTime / DAY_SECONDS) + 1;
  const incident = activeIncident(s);
  const audio = getAudioPrefs();
  const muted = !audio.sfx && !audio.music;

  return (
    <header class="topbar">
      <div class="mobile-brand">
        <Brand compact />
      </div>
      <section class="colony">
        <div class="colony-head">
          <span class="colony-title">✦ 殖民第 {day} 天 · {TIER_NAMES[tier]}</span>
          {s.legacy.warps > 0 && (
            <span class="colony-tag" title={s.galaxy ? `${GALAXIES[s.galaxy]?.name}：${GALAXIES[s.galaxy]?.text}` : '已躍遷的星系數'}>
              星系 {s.legacy.warps + 1}{s.galaxy && GALAXIES[s.galaxy] ? ` · ${GALAXIES[s.galaxy].name}` : ''}
            </span>
          )}
          <span class="spacer" />
          {incident && (
            <button
              class={`incident-chip ${incident.tone}`}
              title={incident.text}
              onClick={() => openTrade(true)}
            >
              <ItemIcon id={incident.icon} />
              {incident.name}
              {s.incident?.offer && <span class="hide-sm"> · 查看報價</span>} <span class="small">{Math.max(0, Math.ceil(s.incident!.until - s.playTime))}s</span>
            </button>
          )}
          {s.boostUntil > s.playTime && (
            <span class="boost-chip" title="遺物的時間加速：整座工廠 ×2">⏩ 時間加速 ×2 · {Math.ceil(s.boostUntil - s.playTime)}s</span>
          )}
          {s.signal !== null && (
            <button class="signal-btn" onClick={() => openSignal(true)}>
              ◈ 遺物訊號 <span class="small">{Math.max(0, Math.ceil(s.signal - s.playTime))}s</span>
            </button>
          )}
          <button
            class="icon-btn"
            title={muted ? '開啟聲音' : '靜音'}
            aria-label={muted ? '開啟聲音' : '靜音'}
            onClick={() => setAudioPrefs(muted ? { sfx: true, music: true } : { sfx: false, music: false })}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
        <div class="colony-stats">
          {POWER_ORDER.map((p) => {
            const st = last.power[p];
            if (!st || (st.capacity === 0 && st.demand === 0)) return null;
            const tone = st.demand === 0 ? 'muted' : st.satisfaction >= 0.999 ? 'ok' : 'warn';
            return (
              <span key={p} class={`stat tone-text-${tone}`} title={`${itemName(p)}：需求 / 可供給`}>
                <ItemIcon id={p} />
                {itemName(p)} {round1(st.demand)}/{round1(st.capacity)}
                {st.demand > 0 && ` · ${Math.round(st.satisfaction * 100)}%`}
              </span>
            );
          })}
          {swarm > 0 && (
            <button class="stat link-stat" title="每片戴森板提供的免費電力" onClick={() => openLookup(SWARM_ITEM)}>
              <ItemIcon id={SWARM_ITEM} />
              {fmt(swarm)} 片 · +{fmt(swarm * SWARM_EU)} 電力
            </button>
          )}
          <span class={`stat ${used >= total ? 'tone-text-warn' : ''}`} title="地面區域槽位">▦ 槽位 {used}/{total}</span>
          {orbitTotal > 0 && (
            <span class={`stat ${orbitUsed >= orbitTotal ? 'tone-text-warn' : ''}`} title="軌道站槽位">◎ 軌道 {orbitUsed}/{orbitTotal}</span>
          )}
          <span class="stat muted" title="遊玩時間">⏱ {fmtDuration(s.playTime)}</span>
        </div>
      </section>
      <div class="chips" role="list" aria-label="關鍵物資">
        {keyItems.map((id) => (
          <button key={id} class="chip" role="listitem" onClick={() => openLookup(id)} title={itemName(id)}>
            <ItemIcon id={id} size={24} />
            <span class="sr-only">{itemName(id)}</span>
            <span class="chip-body">
              <span class="chip-value">{fmt(s.items[id] ?? 0)}</span>
              <span class={`chip-rate ${(rates[id] ?? 0) < -0.005 ? 'neg' : (rates[id] ?? 0) > 0.005 ? 'pos' : ''}`}>
                {fmtRate(rates[id] ?? 0)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </header>
  );
}
