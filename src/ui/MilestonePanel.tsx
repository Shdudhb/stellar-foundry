import { MILESTONE_LIST, type MilestoneDef } from '../data/tech';
import { canBuildMilestone, milestoneUnlocked } from '../sim/rules';
import { buildMilestone, getState } from '../state/store';
import { Bar, Cost, PageHeader, useGoto } from './common';
import { ItemIcon, MachineIcon, UiIcon } from './pixel';

/** The picture for each megastructure */
function MilestoneArt({ id, size = 64 }: { id: string; size?: number }) {
  switch (id) {
    case 'blast_furnace': return <MachineIcon id="blast_furnace" size={size} />;
    case 'power_hub': return <ItemIcon id="eu" size={size} />;
    case 'chem_plant': return <MachineIcon id="large_chem_plant" size={size} />;
    case 'orbital_pad': return <MachineIcon id="launch_pad" size={size} />;
    case 'colony_ship': return <ItemIcon id="rocket_part" size={size} />;
    case 'dyson_segment': return <ItemIcon id="dyson_swarm" size={size} />;
    case 'stargate': return <UiIcon id="legacy" size={size} />;
    default: return <UiIcon id="milestones" size={size} />;
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
  const glow = useGoto('milestones', 'ms');
  return (
    <div class="panel">
      <PageHeader title="巨構">建成這個時代的巨構，才會解鎖下一個時代的研究。</PageHeader>
      {MILESTONE_LIST.map((ms) => {
        const built = s.milestones.includes(ms.id);
        const unlocked = milestoneUnlocked(s, ms.id);
        const p = progress(ms);
        // Finished ones fold to a single row, so the one being worked on isn't pushed down the page
        if (built) {
          return (
            <section key={ms.id} class="card milestone done compact">
              <span class="ms-art"><MilestoneArt id={ms.id} size={32} /></span>
              <span class="tier-pill">T{ms.tier}</span>
              <strong>{ms.name}</strong>
              <span class="tone-text-ok small">✓ 已建成</span>
            </section>
          );
        }
        return (
          <section key={ms.id} id={`ms-${ms.id}`} class={`card milestone ${built ? 'done' : unlocked ? '' : 'locked'} ${glow === ms.id ? 'fresh' : ''}`}>
            <span class="ms-art"><MilestoneArt id={ms.id} /></span>
            <div>
              <h2><span class="tier-pill">T{ms.tier}</span> {ms.name}</h2>
              {ms.description && <p>{ms.description}</p>}
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
    </div>
  );
}
