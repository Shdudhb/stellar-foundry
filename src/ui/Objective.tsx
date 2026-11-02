import { OBJECTIVES, currentObjective, unclaimedObjectives } from '../data/objectives';
import type { GameState } from '../sim/types';
import { claimObjectives, objectiveReward } from '../state/store';
import { Reward } from './common';

export function Objective({ state }: { state: GameState }) {
  const pending = unclaimedObjectives(state);
  if (pending.length > 0) {
    const reward = objectiveReward(state, pending.length);
    return (
      <div class="objective claim">
        <span class="objective-step">✓ 目標完成</span>
        <span>{OBJECTIVES[pending[0]].text}{pending.length > 1 && ` 等 ${pending.length} 項`}</span>
        <button class="primary" onClick={claimObjectives}>
          領取 <Reward items={reward} />
        </button>
      </div>
    );
  }
  const idx = currentObjective(state);
  if (idx < 0) return <div class="objective done">星門已開啟，恭喜通關！</div>;
  return (
    <div class="objective">
      <span class="objective-step">目標 {idx + 1}/{OBJECTIVES.length}</span>
      <span>{OBJECTIVES[idx].text}</span>
      <span class="muted small objective-reward">獎勵：<Reward items={objectiveReward(state, 1)} /></span>
    </div>
  );
}
