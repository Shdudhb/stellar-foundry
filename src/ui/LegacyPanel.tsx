import { GALAXIES, LIGHT_CATEGORIES, STARS, VEINS, type StarSystem } from '../data/galaxies';
import { PLANETS } from '../data/planets';
import { RECIPE_LIST } from '../data/recipes';
import { SWARM_ITEM } from '../data/items';
import { LEGACY_LIST, legacyCost } from '../data/legacy';
import { homeItems, openPlanets } from '../sim/planets';
import { systemBonus, systemStretch } from '../sim/balance';
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
  const stretch = systemStretch(sys);
  const bonus = systemBonus(sys);
  // On the map every world is listed; in the system you are in, the ones not reached yet stay unnamed
  const known = now ? new Set(openPlanets(getState())) : null;
  return (
    <article id={now ? undefined : `system-${sys.name}`} class={`system ${now ? 'now' : ''}`}>
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
        <li title="同樣的東西在這裡要花的機器工時，和出發的恆星系相比（不含發電）。越低越輕鬆">
          <span>⏱ 整體工時</span><strong class={tone(1 / stretch)}>{times(stretch)}</strong>
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
      {bonus > 0 && <p class="small tone-text-ok">越難的恆星系越值錢：在這裡建成星門再躍遷，多拿 {bonus} 遺產點。</p>}
      {children}
    </article>
  );
}

/** A number in 0..1 that is always the same for the same name, to place a star on the map */
function spot(name: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** The gate's reach drawn as a map: where you are in the middle, the candidates around it */
function StarMap({ here, choices }: { here: StarSystem | null; choices: StarSystem[] }) {
  const W = 600;
  const H = 220;
  const at = (sys: StarSystem, i: number) => {
    // One sector of the circle each, so they never land on top of each other
    const a = ((i + 0.2 + spot(sys.name, 1) * 0.6) / choices.length) * Math.PI * 2 - Math.PI / 2;
    const d = 0.55 + spot(sys.name, 2) * 0.4;
    return { x: W / 2 + Math.cos(a) * d * (W / 2 - 70), y: H / 2 + Math.sin(a) * d * (H / 2 - 28) };
  };
  const hereStar = here ? STARS[here.star] : STARS.yellow_dwarf;
  const jump = (name: string) => document.getElementById(`system-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return (
    <svg class="star-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="星圖：目前的恆星系與星門搆得到的三個恆星系">
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={spot('bg', i) * W} cy={spot('bg', i + 100) * H} r={0.6 + spot('bg', i + 200)} fill="#fff" opacity={0.15 + spot('bg', i + 300) * 0.3} />
      ))}
      {choices.map((sys, i) => {
        const p = at(sys, i);
        return <line key={sys.name} x1={W / 2} y1={H / 2} x2={p.x} y2={p.y} class="star-lane" />;
      })}
      <circle cx={W / 2} cy={H / 2} r={7} fill={hereStar.color} />
      <circle cx={W / 2} cy={H / 2} r={13} class="star-here" />
      <text x={W / 2 + 20} y={H / 2 - 12} class="star-label here" style={{ textAnchor: 'start' }}>{here?.name ?? '出發的恆星系'}</text>
      {choices.map((sys, i) => {
        const p = at(sys, i);
        const star = STARS[sys.star];
        return (
          <g key={sys.name} class="star-pick" onClick={() => jump(sys.name)}>
            <circle cx={p.x} cy={p.y} r={22} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={5 + star.lum * 3} fill={star.color} style={{ filter: `drop-shadow(0 0 ${4 + star.lum * 4}px ${star.color})` }} />
            <text x={p.x} y={p.y - 16 - star.lum * 2} class="star-label">{sys.name}</text>
            <text x={p.x} y={p.y + 24 + star.lum * 2} class="star-label sub">{star.name}</text>
          </g>
        );
      })}
    </svg>
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
              <span class="muted small"> 星門 10 點，戴森群超過 600 片後每 50 片再 +1（下一點在 {nextBonus} 片）{systemBonus(s.system) > 0 ? `；這個恆星系再 +${systemBonus(s.system)}` : ''}。</span>
            </p>
            <p class="small muted">星門搆得到這三個恆星系。挑一個：</p>
            <StarMap here={s.system ?? null} choices={choices} />
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
