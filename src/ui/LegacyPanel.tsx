import { SWARM_ITEM } from '../data/items';
import { LEGACY_LIST, legacyCost, warpPoints } from '../data/legacy';
import { simSpeed } from '../sim/rules';
import { buyLegacy, getState, warp } from '../state/store';
import { PageHeader, fmtNum } from './common';
import { UiIcon } from './pixel';

export function LegacyPanel() {
  const s = getState();
  const { points, warps, upgrades } = s.legacy;
  const gateOpen = s.milestones.includes('stargate');
  const swarm = Math.floor(s.items[SWARM_ITEM] ?? 0);
  const earn = warpPoints(swarm);
  const nextBonus = 600 + (Math.max(0, Math.floor((swarm - 600) / 50)) + 1) * 50;

  return (
    <div class="panel">
      <PageHeader kicker="GALAXY / LEGACY" title="星系">
        遺產永久保留：躍遷之後、重新開始之後都還在。升級會立刻生效。
      </PageHeader>
      <section class="card legacy-hero">
        <UiIcon id="legacy" size={64} />
        <div>
          <p class="kicker">LEGACY POINTS</p>
          <p class="legacy-points">{points}</p>
        </div>
        <div class="muted small">
          已躍遷 {warps} 次<br />
          工廠時間流速 ×{fmtNum(Math.round(simSpeed({ ...s, boostUntil: 0 }) * 100) / 100)}
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
