import { MILESTONE_LIST, type MilestoneDef } from '../data/tech';
import { canBuildMilestone, milestoneUnlocked } from '../sim/rules';
import { buildMilestone, getState } from '../state/store';
import { Bar, Cost, PageHeader } from './common';
import { ItemIcon, MachineIcon, UiIcon } from './pixel';

/** The picture for each megastructure */
function MilestoneArt({ id }: { id: string }) {
  switch (id) {
    case 'blast_furnace': return <MachineIcon id="blast_furnace" size={64} />;
    case 'power_hub': return <ItemIcon id="eu" size={64} />;
    case 'chem_plant': return <MachineIcon id="large_chem_plant" size={64} />;
    case 'orbital_pad': return <MachineIcon id="launch_pad" size={64} />;
    case 'colony_ship': return <ItemIcon id="rocket_part" size={64} />;
    case 'dyson_segment': return <ItemIcon id="dyson_swarm" size={64} />;
    case 'stargate': return <UiIcon id="legacy" size={64} />;
    default: return <UiIcon id="milestones" size={64} />;
  }
}

/** How much of the materials is already in storage, 0..1 */
function progress(ms: MilestoneDef): number {
  const items = getState().items;
  const need = Object.entries({ ...ms.cost, ...ms.holds });
  return need.reduce((sum, [id, n]) => sum + Math.min(1, (items[id] ?? 0) / n), 0) / need.length;
}

export function MilestonePanel() {
  const s = getState();
  return (
    <div class="panel">
      <PageHeader kicker="MEGASTRUCTURES" title="巨構">
        每個時代的終點都是一座巨構。建成之後，下一個時代的科技就會打開。
      </PageHeader>
      {MILESTONE_LIST.map((ms) => {
        const built = s.milestones.includes(ms.id);
        const unlocked = milestoneUnlocked(s, ms.id);
        const p = progress(ms);
        return (
          <section key={ms.id} class={`card milestone ${built ? 'done' : unlocked ? '' : 'locked'}`}>
            <span class="ms-art"><MilestoneArt id={ms.id} /></span>
            <div>
              <p class="kicker">TIER {ms.tier} · MILESTONE</p>
              <h2>{ms.name}</h2>
              <p>{ms.description}</p>
              {built ? (
                <p class="tone-text-ok">✓ 已建成</p>
              ) : !unlocked ? (
                <p class="tone-text-warn">需要先研究「{ms.name}」。</p>
              ) : (
                <>
                  <div class="ms-progress">
                    <Bar value={p} tone={p >= 1 ? 'ok' : 'warn'} />
                    <span class="small muted">材料 {Math.floor(p * 100)}%</span>
                  </div>
                  <p class="small">材料：<Cost cost={ms.cost} /></p>
                  {ms.holds && <p class="small">需要擁有（不會消耗）：<Cost cost={ms.holds} /></p>}
                  <button class="primary big" disabled={!canBuildMilestone(s, ms.id)} onClick={() => buildMilestone(ms.id)}>
                    建造{ms.name}
                  </button>
                </>
              )}
            </div>
          </section>
        );
      })}
      <section class="card">
        <h3>星門之後</h3>
        <p class="muted small">
          建成星門就通關了。之後可以在「星系」分頁躍遷：帶著星際遺產點到新的星系重新開始，用永久升級讓每一輪更快。
        </p>
      </section>
    </div>
  );
}
