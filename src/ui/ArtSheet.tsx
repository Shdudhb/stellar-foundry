import { ITEM_ORDER, ITEMS } from '../data/items';
import { MACHINE_LIST } from '../data/machines';
import { ItemIcon, MachineIcon, UiIcon } from './pixel';

/** Every icon at a glance, for drawing and checking the art: open the game with #art */
export function ArtSheet() {
  return (
    <div class="art-sheet">
      <h2>物品</h2>
      <div class="art-grid">
        {ITEM_ORDER.map((id) => (
          <figure key={id}>
            <ItemIcon id={id} size={48} />
            <figcaption>{ITEMS[id].name}</figcaption>
          </figure>
        ))}
      </div>
      <h2>介面</h2>
      <div class="art-grid">
        {['production', 'storage', 'research', 'milestones', 'legacy', 'settings'].map((id) => (
          <figure key={id}>
            <UiIcon id={id} size={48} />
            <figcaption>{id}</figcaption>
          </figure>
        ))}
      </div>
      <h2>機器</h2>
      <div class="art-grid">
        {MACHINE_LIST.map((m) => (
          <figure key={m.id}>
            <MachineIcon id={m.id} size={48} />
            <figcaption>{m.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
