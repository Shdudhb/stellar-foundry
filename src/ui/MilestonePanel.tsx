import { MILESTONE_LIST } from '../data/tech';
import { canBuildMilestone, milestoneUnlocked } from '../sim/rules';
import { buildMilestone, getState } from '../state/store';
import { Cost } from './common';


export function MilestonePanel() {
  const s = getState();
  return (
    <div class="panel">
      {MILESTONE_LIST.map((ms) => {
        const built = s.milestones.includes(ms.id);
        const unlocked = milestoneUnlocked(s, ms.id);
        return (
          <section key={ms.id} class={`card milestone ${built ? 'done' : unlocked ? '' : 'locked'}`}>
            <h3>T{ms.tier} 里程碑 · {ms.name}</h3>
            <p>{ms.description}</p>
            {built ? (
              <p class="tone-text-ok">✓ 已建成</p>
            ) : !unlocked ? (
              <p class="tone-text-warn">需要先研究「{ms.name}」。</p>
            ) : (
              <>
                <p class="small">材料：<Cost cost={ms.cost} /></p>
                {ms.holds && <p class="small">需要擁有（不會消耗）：<Cost cost={ms.holds} /></p>}
                <button class="primary big" disabled={!canBuildMilestone(s, ms.id)} onClick={() => buildMilestone(ms.id)}>
                  建造{ms.name}
                </button>
              </>
            )}
          </section>
        );
      })}
      <section class="card">
        <h3>更遠的路</h3>
        <p class="muted small">
          從墜毀營地到星門，八個階層都在這裡了。完整版的下一步是「躍遷」：穿過星門重新開始，帶著星際遺產點前往規則不同的新星系。
        </p>
      </section>
    </div>
  );
}
