import { useEffect, useState } from 'preact/hooks';
import { ITEMS, itemName } from '../data/items';
import type { LineStatus, Reason } from '../sim/types';
import { getState, openLookup, subscribe } from '../state/store';

/** Re-render on every store notification */
export function useGame() {
  const [, setN] = useState(0);
  useEffect(() => subscribe(() => setN((n) => n + 1)), []);
  return getState();
}

export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return Math.floor(n + 1e-9).toString();
}

export function fmtRate(n: number): string {
  const a = Math.abs(n);
  if (a < 0.005) return '0/s';
  const s = String(+(a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)));
  return `${n > 0 ? '+' : '−'}${s}/s`;
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

export function fmtDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小時 ${m} 分`;
  if (m > 0) return `${m} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

export function ItemLink({ id }: { id: string }) {
  return (
    <button class="item-link" onClick={() => openLookup(id)} title="查看配方">
      {itemName(id)}
    </button>
  );
}

/** Material list, red where the player does not have enough */
export function Cost({ cost }: { cost: Record<string, number> }) {
  const items = getState().items;
  return (
    <span class="cost">
      {Object.entries(cost).map(([id, n]) => (
        <span key={id} class={(items[id] ?? 0) >= n ? 'have' : 'lack'}>
          <ItemLink id={id} /> {fmt(items[id] ?? 0)}/{n}
        </span>
      ))}
    </span>
  );
}

/** Items the player is about to receive. Plain names: it sits inside buttons. */
export function Reward({ items }: { items: Record<string, number> }) {
  return (
    <span class="cost">
      {Object.entries(items).map(([id, n]) => (
        <span key={id} class="have">
          {itemName(id)} +{fmt(n)}
        </span>
      ))}
    </span>
  );
}

export function reasonText(reason: Reason, status?: LineStatus): string {
  switch (reason.kind) {
    case 'ok': return '運轉中';
    case 'idle': return '沒有機器';
    case 'paused': return '已暫停';
    case 'input': return `缺少${itemName(reason.item)}`;
    case 'output':
      return ITEMS[reason.item]?.kind === 'byproduct'
        ? `${itemName(reason.item)}倉庫已滿（可在倉庫設為排放）`
        : `${itemName(reason.item)}倉庫已滿`;
    case 'power': return `${itemName(reason.item)}不足`;
    case 'load': return status && status.efficiency > 0 ? '依需求運轉' : '待命（沒有需求）';
    case 'wear': return '機器磨損，速度下降';
    case 'igniting': return '點火中';
  }
}

export function reasonTone(reason: Reason): 'ok' | 'warn' | 'bad' | 'muted' {
  switch (reason.kind) {
    case 'ok': return 'ok';
    case 'idle': case 'paused': case 'load': return 'muted';
    case 'power': case 'input': case 'wear': case 'igniting': return 'warn';
    case 'output': return 'bad';
  }
}

export function Bar({ value, tone = 'ok' }: { value: number; tone?: string }) {
  return (
    <div class="bar">
      <div class={`bar-fill tone-${tone}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: preact.ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header class="modal-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
