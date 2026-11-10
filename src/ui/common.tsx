import { useEffect, useRef, useState } from 'preact/hooks';
import { ITEMS, canVent, itemName } from '../data/items';
import type { Line, LineStatus, Reason } from '../sim/types';
import { homeItems } from '../sim/planets';
import { AMOUNT_EPSILON, hasAmount } from '../sim/rules';
import { getState, getUi, goTo, openLookup, subscribe } from '../state/store';
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
  // The same allowance as the can-afford check, so a cost never reads 9/10 while the button says it's enough
  return Math.floor(n + AMOUNT_EPSILON).toString();
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

/** A small arrowhead, drawn so it sits centred in a button on every platform */
export function Chevron({ up, size = 14 }: { up?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d={up ? 'M3 9 L7 5 L11 9' : 'M3 5 L7 9 L11 5'} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** Material list, red where the player does not have enough. Everything is paid from the home world's storage */
export function Cost({ cost }: { cost: Record<string, number> }) {
  const items = homeItems(getState());
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
    case 'limit': return `${itemName(reason.item)}已存到上限`;
    case 'wear': return '機器磨損，速度下降';
    case 'igniting': return '點火中';
  }
}

/** A line with machines that runs slow for a reason the player can fix (not idle, paused or waiting on demand) */
export function isStuck(line: Line, status: LineStatus | undefined): boolean {
  return !!status && line.count > 0 && status.efficiency < 0.999 && !['ok', 'idle', 'paused', 'load', 'limit', 'igniting'].includes(status.reason.kind);
}

export function reasonTone(reason: Reason): 'ok' | 'warn' | 'bad' | 'muted' {
  switch (reason.kind) {
    case 'ok': return 'ok';
    case 'idle': case 'paused': case 'load': case 'limit': return 'muted';
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

/** Tab heading, with a line under it only when there is something the player needs to know */
export function PageHeader({ title, children }: { title: string; children?: preact.ComponentChildren }) {
  return (
    <header class="page-head">
      <h1>{title}</h1>
      {children && <p class="page-desc">{children}</p>}
    </header>
  );
}

/** Open modals, innermost last: Escape closes only the top one */
const modalStack: (() => void)[] = [];

export function Modal({ title, icon, onClose, wide, tall, bar, children }: {
  title: string;
  icon?: preact.ComponentChildren;
  onClose: () => void;
  /** A wide window, for grids of tiles */
  wide?: boolean;
  /** A fixed height, so switching tabs in a long list doesn't make the window jump */
  tall?: boolean;
  /** Controls that stay put above the scrolling body (search, tabs) */
  bar?: preact.ComponentChildren;
  children: preact.ComponentChildren;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const me = () => close.current();
    modalStack.push(me);
    // The keyboard moves into the window and stays there, then goes back to where it was: without this,
    // Tab walks through the page behind, and Enter presses a button the player can't see
    const before = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== me) return;
      if (e.key === 'Escape') return me();
      if (e.key !== 'Tab' || !el) return;
      const stops = [...el.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((x) => !x.hasAttribute('disabled') && x.getClientRects().length > 0);
      const at = document.activeElement;
      const [first, last] = [stops[0], stops[stops.length - 1]];
      if (!first) return e.preventDefault();
      if (!el.contains(at) || (e.shiftKey ? at === first || at === el : at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(me), 1);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div
        ref={box}
        tabIndex={-1}
        class={`modal ${wide ? 'wide' : ''} ${tall ? 'tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header class="modal-head">
          <h2>{icon}{title}</h2>
          <button class="icon-btn close-btn" onClick={onClose} aria-label="關閉">✕</button>
        </header>
        {bar && <div class="modal-bar">{bar}</div>}
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Repeats start this long after the press, then speed up from HOLD_EVERY down to HOLD_FASTEST */
const HOLD_DELAY = 400;
const HOLD_EVERY = 150;
const HOLD_FASTEST = 50;
/** A click this soon after a hold ends is that hold's own release */
const HOLD_CLICK_WINDOW = 400;

/**
 * Handlers for a button that acts once per tap and keeps acting while held. `act` returns false when
 * it couldn't (can't afford, nothing left), which ends the hold. `tap` is what a plain tap does.
 */
export function useHold(act: () => boolean, tap: () => void = act) {
  const t = useRef<{ timer?: ReturnType<typeof setTimeout>; held: boolean; endedAt: number }>({ held: false, endedAt: 0 });
  const fns = useRef({ act, tap });
  fns.current = { act, tap };
  const stop = () => {
    clearTimeout(t.current.timer);
    if (t.current.held) {
      t.current.held = false;
      t.current.endedAt = performance.now();
    }
  };
  useEffect(() => stop, []);
  const repeat = (wait: number) => {
    t.current.timer = setTimeout(() => {
      t.current.held = true;
      if (fns.current.act()) repeat(Math.max(HOLD_FASTEST, wait * 0.85));
    }, wait);
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      stop();
      t.current.endedAt = 0;
      t.current.timer = setTimeout(() => {
        t.current.held = true;
        if (fns.current.act()) repeat(HOLD_EVERY);
      }, HOLD_DELAY);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: Event) => e.preventDefault(),
    onClick: () => {
      // The click that ends a hold has already been paid for by the repeats. Matched by time, not a flag:
      // a hold that slid off the button gets no click, and a flag would then swallow the next key press
      if (performance.now() - t.current.endedAt < HOLD_CLICK_WINDOW) {
        t.current.endedAt = 0;
        return;
      }
      fns.current.tap();
    },
  };
}

/** A button that repeats while held */
export function HoldButton({ act, class: cls, title, disabled, label, children }: {
  act: () => boolean;
  class?: string;
  title?: string;
  disabled?: boolean;
  label?: string;
  children: preact.ComponentChildren;
}) {
  const hold = useHold(act);
  return <button class={cls} title={title} aria-label={label} disabled={disabled} {...hold}>{children}</button>;
}

/**
 * On a tab the objective bar sent the player to: once it has drawn, centre the card with id `${prefix}-${id}`
 * and return its id for a brief glow
 */
export function useGoto(tab: 'research' | 'milestones', prefix: string): string | null {
  const target = getUi().goto;
  const [glow, setGlow] = useState<string | null>(null);
  useEffect(() => {
    if (!target || target.tab !== tab) return;
    const id = target.id;
    setGlow(id);
    // After the tab switch has restored its own scroll position
    requestAnimationFrame(() => {
      document.getElementById(`${prefix}-${id}`)?.scrollIntoView({ block: 'center' });
      goTo(null);
    });
  }, [target]);
  useEffect(() => {
    if (glow === null) return;
    const t = setTimeout(() => setGlow(null), 1800);
    return () => clearTimeout(t);
  }, [glow]);
  return glow;
}
