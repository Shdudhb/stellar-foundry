import { ITEMS, isPower, itemName } from '../data/items';
import { MACHINE_LIST } from '../data/machines';
import { RECIPE_LIST, type RecipeDef } from '../data/recipes';
import { MILESTONES } from '../data/tech';
import { isMachineUnlocked, isRecipeUnlocked, machinesFor, overclock } from '../sim/rules';
import { getState, openLookup } from '../state/store';
import { Modal, Side, fmtNum } from './common';
import { ItemIcon } from './pixel';
import { StoreControls } from './StoragePanel';

function RecipeRow({ r }: { r: RecipeDef }) {
  const s = getState();
  const locked = !isRecipeUnlocked(s, r.id);
  return (
    <li class={locked ? 'locked' : ''}>
      <div>
        <strong>{r.name}</strong>
        <span class="muted small"> · {r.time}s · 最低 T{r.tier}</span>
        {locked && <span class="badge">未解鎖</span>}
      </div>
      <div class="small recipe-eq">
        <Side items={r.inputs} /> <span class="flow-arrow">→</span> <Side items={r.outputs} />
      </div>
      <div class="muted small">
        機器：
        {machinesFor(r.id).map((m, i) => {
          const oc = overclock(m, r);
          const perMin = (60 * oc.speed * (m.speed ?? 1)) / r.time;
          return (
            <span key={m.id} class={isMachineUnlocked(s, m.id) ? '' : 'locked'}>
              {i > 0 && '、'}
              {m.name}（每台 {fmtNum(perMin)} 次/分{oc.speed > 1 ? `，超頻 ×${oc.speed}` : ''}）
            </span>
          );
        })}
      </div>
    </li>
  );
}

export function RecipeLookup({ item }: { item: string }) {
  const def = ITEMS[item];
  const makes = RECIPE_LIST.filter((r) => item in r.outputs);
  const uses = RECIPE_LIST.filter((r) => item in r.inputs);
  const builds = [
    ...MACHINE_LIST.filter((m) => item in m.cost).map((m) => m.name),
    ...Object.values(MILESTONES).filter((ms) => item in ms.cost).map((ms) => `${ms.name}（巨構）`),
  ];

  return (
    <Modal title={itemName(item)} icon={<ItemIcon id={item} size={24} />} onClose={() => openLookup(null)}>
      <StoreControls id={item} />
      {def?.kind === 'byproduct' && <p class="tone-text-warn small">副產物：倉庫滿了會讓產生它的生產線停工。</p>}
      {def?.decay && (
        <p class="tone-text-warn small">會衰變：存著的量每秒少 {Math.round(def.decay * 100)}%，產出後要盡快用掉。</p>
      )}
      {def?.kind === 'structure' && <p class="muted small">部署好的戴森板，不佔倉庫、不能丟棄；每片提供 20 電力/秒。</p>}
      {isPower(item) && <p class="muted small">{itemName(item)}不能儲存，產出當下就被機器用掉；不夠時所有用它的機器一起降速。</p>}
      <h4>取得方式</h4>
      <ul class="recipe-list">
        {def?.manual && <li>手動採集（生產線分頁）</li>}
        {makes.map((r) => <RecipeRow key={r.id} r={r} />)}
        {!def?.manual && makes.length === 0 && <li class="muted">無</li>}
      </ul>
      <h4>用途</h4>
      <ul class="recipe-list">
        {uses.map((r) => <RecipeRow key={r.id} r={r} />)}
        {builds.length > 0 && <li><span class="muted small">建造材料：</span>{builds.join('、')}</li>}
        {uses.length === 0 && builds.length === 0 && <li class="muted">無</li>}
      </ul>
    </Modal>
  );
}
