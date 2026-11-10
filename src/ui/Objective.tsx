import { OBJECTIVES, currentObjective, unclaimedObjectives } from '../data/objectives';
import type { GameState } from '../sim/types';
import { claimObjectives, focusLine, goTo, objectiveReward, openPicker } from '../state/store';
import { Reward } from './common';
import { type Step, nextStep, stepLabel } from './guide';

function go(step: Step) {
  switch (step.kind) {
    case 'research': return goTo({ tab: 'research', id: step.tech });
    case 'milestone': return goTo({ tab: 'milestones', id: step.milestone });
    case 'line': return focusLine(step.line);
    case 'picker': return openPicker(true, step.query);
  }
}

export function Objective({ state }: { state: GameState }) {
  const pending = unclaimedObjectives(state);
  if (pending.length > 0) {
    const reward = objectiveReward(state, pending);
    return (
      <div class="objective claim">
        <span class="objective-step">✓ 目標完成</span>
        <span class="objective-text">{OBJECTIVES[pending[0]].text}{pending.length > 1 && ` 等 ${pending.length} 項`}</span>
        <button class="primary" onClick={claimObjectives}>
          領取 <span class="objective-claim-reward"><Reward items={reward} /></span>
        </button>
      </div>
    );
  }
  const idx = currentObjective(state);
  if (idx < 0) return <div class="objective done"><span class="objective-step">通關</span><span class="objective-text">星門已開啟，恭喜通關！可以到「星系」分頁躍遷。</span></div>;
  const step = nextStep(state, OBJECTIVES[idx]);
  return (
    <div class="objective">
      <span class="objective-step">目標 {idx + 1}/{OBJECTIVES.length}</span>
      <span class="objective-main">
        <span class="objective-text">{OBJECTIVES[idx].text}</span>
        <span class="muted small objective-reward"><span class="hide-sm">獎勵：</span><Reward items={objectiveReward(state, [idx])} /></span>
      </span>
      {step && <button class="objective-go" onClick={() => go(step)}>{stepLabel(step)} ›</button>}
    </div>
  );
}
