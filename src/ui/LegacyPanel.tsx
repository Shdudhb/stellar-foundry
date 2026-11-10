import { GALAXIES, LIGHT_CATEGORIES, STARS, VEINS, type StarSystem } from '../data/galaxies';
import { PLANETS } from '../data/planets';
import { RECIPE_LIST } from '../data/recipes';
import { SWARM_ITEM } from '../data/items';
import { LEGACY_LIST, legacyCost } from '../data/legacy';
import { homeItems, openPlanets } from '../sim/planets';
import { simSpeed } from '../sim/rules';
import { buyLegacy, getState, warp, warpChoices, warpEarnings } from '../state/store';
import { PageHeader, fmtNum } from './common';
import { ItemIcon, UiIcon } from './pixel';

const times = (k: number) => `×${fmtNum(Math.round(k * 100) / 100)}`;
const tone = (k: number) => (k > 1.001 ? 'tone-text-ok' : k < 0.999 ? 'tone-text-warn' : 'muted');
const HAS_CATEGORY = new Set<string>(RECIPE_LIST.map((r) => r.category));

/** A star system as a card: its star, its trait, and how rich each world is */
function SystemCard({ sys, children, now }: { sys: StarSystem; children?: preact.ComponentChildren; now?: boolean }) {
  const star = STARS[sys.star];
  const trait = sys.trait ? GALAXIES[sys.trait] : null;
  // On the map every world is listed; in the system you are in, the ones not reached yet stay unnamed
  const known = now ? new Set(openPlanets(getState())) : null;
  return (
    <article class={`system ${now ? 'now' : ''}`}>
      <header class="system-head">
        <span class="star-dot" style={{ background: star.color, boxShadow: `0 0 ${Math.round(6 + star.lum * 8)}px ${star.color}` }} aria-hidden="true" />
        <span class="system-name">
          <strong>{sys.name}</strong>
          <span class="small muted">{star.name} · {star.cls} 型</span>
        </span>
      </header>
      <p class="small muted">{star.text}</p>
      <ul class="system-facts small">
        <li title={`影響：太陽能、太陽風、聚光陣列，以及每片戴森板的電力（${LIGHT_CATEGORIES.filter((c) => HAS_CATEGORY.has(c)).length} 類機器）`}>
          <span>☀ 光度</span><strong class={tone(star.lum)}>{times(star.lum)}</strong>
        </li>
        {Object.entries(VEINS).map(([p, v]) => (
          <li key={p}>
            <span><ItemIcon id={PLANETS[p].icon} size={16} /> {known && !known.has(p) ? '未探索的星球' : `${PLANETS[p].name}${v.what}`}</span>
            <strong class={tone(sys.rich[p] ?? 1)}>{times(sys.rich[p] ?? 1)}</strong>
          </li>
        ))}
      </ul>
      {star.effect && <p class="small tone-text-ok">恆星效應：{star.effect}</p>}
      {trait && (
        <p class="small system-trait"><ItemIcon id={trait.icon} size={16} /> <strong>{trait.name}</strong>：{trait.text}</p>
      )}
      {star.bonus > 0 && <p class="small tone-text-ok">在這裡建成星門再躍遷，多拿 {star.bonus} 遺產點。</p>}
      {children}
    </article>
  );
}

export function LegacyPanel() {
  const s = getState();
  const { points, warps, upgrades } = s.legacy;
  const gateOpen = s.milestones.includes('stargate');
  const swarm = Math.floor(homeItems(s)[SWARM_ITEM] ?? 0);
  const earn = warpEarnings();
  const choices = warpChoices();
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
          <h2>目前的恆星系</h2>
          <span class="muted">恆星的光度、星球的貧富和星域特性，每個恆星系都不一樣</span>
        </div>
        {s.system ? (
          <SystemCard sys={s.system} now />
        ) : s.galaxy && GALAXIES[s.galaxy] ? (
          <div class="galaxy-now">
            <ItemIcon id={GALAXIES[s.galaxy].icon} size={40} />
            <div>
              <strong>目前：{GALAXIES[s.galaxy].name}</strong>
              <p class="small">{GALAXIES[s.galaxy].text}</p>
            </div>
          </div>
        ) : (
          <p class="small muted">出發的恆星系：一顆普通的黃矮星，沒有任何加成或減益。穿過星門之後，可以從星圖上挑下一個落腳的恆星系。</p>
        )}
      </section>

      <section class="card warp">
        <h3>星圖</h3>
        {gateOpen ? (
          <>
            <p>
              穿過星門，到新的恆星系從墜毀營地重新開始，帶走 <strong>{earn}</strong> 遺產點。
              <span class="muted small"> 星門 10 點，戴森群超過 600 片後每 50 片再 +1（下一點在 {nextBonus} 片）{s.system && STARS[s.system.star]?.bonus ? `；這顆${STARS[s.system.star].name}再 +${STARS[s.system.star].bonus}` : ''}。</span>
            </p>
            <p class="small muted">星門搆得到這三個恆星系。挑一個：</p>
            <div class="system-grid">
              {choices.map((sys, i) => (
                <SystemCard key={sys.name} sys={sys}>
                  <button
                    class="primary"
                    onClick={() => confirm(`躍遷到「${sys.name}」？這一輪的工廠、研究和物品都會重置，帶走 ${earn} 遺產點。`) && warp(i)}
                  >
                    躍遷到這裡（+{earn}）
                  </button>
                </SystemCard>
              ))}
            </div>
          </>
        ) : (
          <p class="muted">建成星門後，才看得到它搆得到哪些恆星系。</p>
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
