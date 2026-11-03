import { GALAXIES, GALAXY_LIST } from '../data/galaxies';
import { SWARM_ITEM } from '../data/items';
import { LEGACY_LIST, legacyCost, warpPoints } from '../data/legacy';
import { simSpeed } from '../sim/rules';
import { buyLegacy, getState, warp } from '../state/store';
import { PageHeader, fmtNum } from './common';
import { ItemIcon, UiIcon } from './pixel';

export function LegacyPanel() {
  const s = getState();
  const { points, warps, upgrades } = s.legacy;
  const gateOpen = s.milestones.includes('stargate');
  const swarm = Math.floor(s.items[SWARM_ITEM] ?? 0);
  const earn = warpPoints(swarm);
  const nextBonus = 600 + (Math.max(0, Math.floor((swarm - 600) / 50)) + 1) * 50;

  return (
    <div class="panel">
      <PageHeader title="星系">遺產在躍遷和重新開始後都會保留，升級立刻生效。</PageHeader>
      <section class="card legacy-hero">
        <UiIcon id="legacy" size={64} />
        <div>
          <p class="kicker cjk">遺產點數</p>
          <p class="legacy-points">{points}</p>
        </div>
        <div class="muted small">
          已躍遷 {warps} 次<br />
          工廠時間流速 ×{fmtNum(Math.round(simSpeed({ ...s, boostUntil: 0 }) * 100) / 100)}
        </div>
      </section>

      <section class="card galaxy-card">
        <div class="section-head">
          <h2>星系特性</h2>
          <span class="muted">每次躍遷都會隨機抽一個，和上一個不同</span>
        </div>
        {s.galaxy && GALAXIES[s.galaxy] ? (
          <div class="galaxy-now">
            <ItemIcon id={GALAXIES[s.galaxy].icon} size={40} />
            <div>
              <strong>目前：{GALAXIES[s.galaxy].name}</strong>
              <p class="small">{GALAXIES[s.galaxy].text}</p>
            </div>
          </div>
        ) : (
          <p class="small muted">第一個星系沒有特性。躍遷之後，新的星系會讓某些機器更快、某些更慢。</p>
        )}
        <div class="galaxy-list">
          {GALAXY_LIST.map((g) => (
            <span key={g.id} class={`galaxy-pill ${g.id === s.galaxy ? 'on' : ''}`} title={g.text}>
              <ItemIcon id={g.icon} size={16} /> {g.name}
            </span>
          ))}
        </div>
      </section>

      <section class="card warp">
        <h3>躍遷</h3>
        {gateOpen ? (
          <>
            <p>
              穿過星門，到新的星系從墜毀營地重新開始，帶走 <strong>{earn}</strong> 遺產點。
              <span class="muted small"> 星門 10 點，戴森群超過 600 片後每 50 片再 +1（下一點在 {nextBonus} 片）。</span>
            </p>
            <button
              class="primary big"
              onClick={() => confirm(`躍遷到新星系？這一輪的工廠、研究和物品都會重置，帶走 ${earn} 遺產點。`) && warp()}
            >
              躍遷到新星系（+{earn}）
            </button>
          </>
        ) : (
          <p class="muted">建成星門後才能躍遷。</p>
        )}
      </section>

      <div class="tech-grid">
        {LEGACY_LIST.map((l) => {
          const level = upgrades[l.id] ?? 0;
          const maxed = level >= l.max;
          const cost = legacyCost(l.id, level);
          return (
            <article key={l.id} class={`card tech ${maxed ? 'done' : points >= cost ? 'avail' : ''}`}>
              <h4>{l.name} <span class="muted small">{level}/{l.max}</span></h4>
              <p class="small">{l.description}</p>
              <footer>
                {maxed ? (
                  <span class="tone-text-ok">✓ 已滿級</span>
                ) : (
                  <button class="primary" disabled={points < cost} onClick={() => buyLegacy(l.id)}>升級（{cost} 點）</button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
