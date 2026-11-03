import { useEffect, useRef, useState } from 'preact/hooks';
import { ITEMS, canVent, itemName } from '../data/items';
import type { Line, LineStatus, Reason } from '../sim/types';
import { hasAmount } from '../sim/rules';
import { getState, openLookup, subscribe } from '../state/store';
import { ItemIcon } from './pixel';

/** Re-render on every store notification */
export function useGame() {
  const [, setN] = useState(0);
  useEffect(() => subscribe(() => setN((n) => n + 1)), []);
  return getState();
}

export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}G`;
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
      <ItemIcon id={id} />
      <span>{itemName(id)}</span>
    </button>
  );
}

/** Pause / play glyph drawn as SVG: the ▶ character turns into a coloured emoji on phones */
export function PauseIcon({ paused, size = 12 }: { paused: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" class="pause-icon">
      {paused ? <path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor" /> : (
        <>
          <rect x="2" y="1.5" width="3" height="9" rx="0.6" fill="currentColor" />
          <rect x="7" y="1.5" width="3" height="9" rx="0.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** Material list, red where the player does not have enough */
export function Cost({ cost }: { cost: Record<string, number> }) {
  const items = getState().items;
  return (
    <span class="cost">
      {Object.entries(cost).map(([id, n]) => (
        <span key={id} class={hasAmount(items[id] ?? 0, n) ? 'have' : 'lack'}>
          <ItemLink id={id} /> {fmt(items[id] ?? 0)}/{n}
        </span>
      ))}
    </span>
  );
}

/** One side of a recipe: "2 鐵礦 + 1 煤" with icons */
export function Side({ items }: { items: Record<string, number> }) {
  const entries = Object.entries(items);
  if (entries.length === 0) return <span class="muted">（無）</span>;
  return (
    <>
      {entries.map(([id, n], i) => (
        <span key={id} class={ITEMS[id]?.kind === 'byproduct' ? 'byproduct' : ''}>
          {i > 0 && <span class="muted"> + </span>}
          {n} <ItemLink id={id} />
        </span>
      ))}
    </>
  );
}

/** Items the player is about to receive. Plain names: it sits inside buttons. */
export function Reward({ items }: { items: Record<string, number> }) {
  return (
    <span class="cost">
      {Object.entries(items).map(([id, n]) => (
        <span key={id} class="have">
          <ItemIcon id={id} /> {itemName(id)} +{fmt(n)}
        </span>
      ))}
    </span>
  );
}

/** Why a line is slow. `brief` drops the how-to hint, for places that offer the fix right there */
export function reasonText(reason: Reason, status?: LineStatus, brief = false): string {
  switch (reason.kind) {
    case 'ok': return '運轉中';
    case 'idle': return '沒有機器';
    case 'paused': return '已暫停';
    case 'input': return `缺少${itemName(reason.item)}`;
    case 'output':
      return canVent(reason.item) && !brief
        ? `${itemName(reason.item)}倉庫已滿（可在倉庫設為排放）`
        : `${itemName(reason.item)}倉庫已滿`;
    case 'power': return `${itemName(reason.item)}不足`;
    case 'load': return status && status.efficiency > 0 ? '依需求運轉' : '待命（沒有需求）';
    case 'wear': return '機器磨損，速度下降';
    case 'igniting': return '點火中';
  }
}

/** A line with machines that runs slow for a reason the player can fix (not idle, paused or waiting on demand) */
export function isStuck(line: Line, status: LineStatus | undefined): boolean {
  return !!status && line.count > 0 && status.efficiency < 0.999 && !['ok', 'idle', 'paused', 'load', 'igniting'].includes(status.reason.kind);
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
      {/* Scaled rather than sized: a transform animates without re-laying out the page, which matters with 100 lines */}
      <div class={`bar-fill tone-${tone}`} style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
    </div>
  );
}

/** Big tab heading: a spaced-out kicker over the title, then a line on what the tab is for */
export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: preact.ComponentChildren }) {
  return (
    <header class="page-head">
      <p class="kicker">{kicker}</p>
      <h1>{title}</h1>
      {children && <p class="page-desc">{children}</p>}
    </header>
  );
}

/** Open modals, innermost last: Escape closes only the top one */
const modalStack: (() => void)[] = [];

export function Modal({ title, icon, onClose, children }: {
  title: string;
  icon?: preact.ComponentChildren;
  onClose: () => void;
  children: preact.ComponentChildren;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = () => close.current();
    modalStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === me) me();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(me), 1);
    };
  }, []);
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header class="modal-head">
          <h2>{icon}{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
