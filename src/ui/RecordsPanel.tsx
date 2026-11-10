import { useEffect, useRef, useState } from 'preact/hooks';
import { ACHIEVEMENT_LIST } from '../data/achievements';
import { ITEMS, itemName } from '../data/items';
import { allLines } from '../sim/planets';
import { ACHIEVEMENT_BONUS } from '../sim/rules';
import { getHistory, getRates, getState, getUi, openLookup, type HistorySample } from '../state/store';
import { Bar, PageHeader, fmt, fmtDuration, fmtRate } from './common';
import { ItemIcon } from './pixel';

const SUPPLY = '#2fa89c';
const DEMAND = '#c9772a';
const POWER_NAMES: Record<string, string> = { eu: '電力', steam: '蒸汽', lift: '軌道運力' };

type Sub = 'achievements' | 'stats' | 'log';

export function RecordsPanel() {
  const [sub, setSub] = useState<Sub>('achievements');
  const s = getState();
  return (
    <div class="panel">
      <PageHeader title="紀錄" />
      <div class="seg" role="tablist">
        {([
          ['achievements', `成就 ${s.achievements.length}/${ACHIEVEMENT_LIST.length}`],
          ['stats', '統計'],
          ['log', '日誌'],
        ] as [Sub, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={sub === id} class={sub === id ? 'on' : ''} onClick={() => setSub(id)}>
            {label}
          </button>
        ))}
      </div>
      {sub === 'achievements' && <Achievements />}
      {sub === 'stats' && <Stats />}
      {sub === 'log' && <Log />}
    </div>
  );
}

function Achievements() {
  const s = getState();
  const got = new Set(s.achievements);
  const groups = [...new Set(ACHIEVEMENT_LIST.map((a) => a.group))];
  return (
    <>
      <section class="card ach-summary">
        <div>
          <p class="kicker cjk">成就</p>
          <p class="ach-big">
            {got.size}<span class="muted">/{ACHIEVEMENT_LIST.length}</span>
          </p>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <Bar value={got.size / ACHIEVEMENT_LIST.length} tone="ok" />
          <p class="small muted">
            每個成就讓工廠速度永久 +{ACHIEVEMENT_BONUS * 100}%，躍遷和重新開始都會保留。目前加成
            <strong class="tone-text-ok"> +{Math.round(got.size * ACHIEVEMENT_BONUS * 100)}%</strong>
          </p>
        </div>
      </section>
      {groups.map((g) => (
        <section key={g} class="card">
          <div class="section-head">
            <h2>{g}</h2>
            <span class="muted">
              {ACHIEVEMENT_LIST.filter((a) => a.group === g && got.has(a.id)).length}/{ACHIEVEMENT_LIST.filter((a) => a.group === g).length}
            </span>
          </div>
          <div class="ach-grid">
            {ACHIEVEMENT_LIST.filter((a) => a.group === g).map((a) => {
              const done = got.has(a.id);
              const secret = a.hidden && !done;
              const [cur, goal] = a.progress?.(s) ?? [0, 0];
              return (
                <div key={a.id} class={`ach ${done ? 'done' : ''}`}>
                  <span class="ach-icon">{secret ? <span class="ach-q">?</span> : <ItemIcon id={a.icon} size={32} />}</span>
                  <div>
                    <strong>{secret ? '隱藏成就' : a.name}</strong>
                    <p class="small muted">{secret ? '達成某個特別的條件時解鎖。' : a.text}</p>
                    {!done && goal > 1 && (
                      <div class="ach-progress">
                        <Bar value={cur / goal} tone="warn" />
                        <span class="small muted">{Math.floor(cur).toLocaleString('en-US')} / {goal.toLocaleString('en-US')}</span>
                      </div>
                    )}
                  </div>
                  {done && <span class="ach-check" aria-label="已解鎖">✓</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

/** Width of an element, kept up to date */
function useWidth<T extends HTMLElement>(): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const ago = (sec: number) => (sec < 60 ? `${Math.round(sec)} 秒前` : `${Math.round(sec / 60)} 分前`);

/** Supply and demand of one power network over the last 15 minutes, with a hover readout */
function PowerChart({ history, net }: { history: HistorySample[]; net: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const pts = history.map((h) => h.power[net] ?? { supply: 0, demand: 0 });
  const max = Math.max(1, ...pts.flatMap((p) => [p.supply, p.demand])) * 1.1;
  const n = pts.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = (key: 'supply' | 'demand') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const now = history[n - 1]?.t ?? 0;
  const hi = hover ?? n - 1;
  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div class="chart" ref={ref}>
      <div class="chart-legend">
        <span><i style={{ background: SUPPLY }} />供應</span>
        <span><i style={{ background: DEMAND }} />需求</span>
        {n > 0 && (
          <span class="chart-read">
            {hover !== null ? ago(now - history[hi].t) : '現在'} · 供應 <strong>{fmt(pts[hi].supply)}/s</strong> · 需求{' '}
            <strong>{fmt(pts[hi].demand)}/s</strong>
          </span>
        )}
      </div>
      <svg width={width} height={H} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${POWER_NAMES[net] ?? net}供需曲線`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={width - pad.r} y1={y(max * f / 1.1)} y2={y(max * f / 1.1)} class="chart-grid" />
        ))}
        <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} class="chart-axis" />
        {n > 1 && (
          <>
            <path d={path('demand')} fill="none" stroke={DEMAND} stroke-width="2" stroke-linejoin="round" />
            <path d={path('supply')} fill="none" stroke={SUPPLY} stroke-width="2" stroke-linejoin="round" />
          </>
        )}
        {hover !== null && n > 0 && (
          <>
            <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={y(0)} class="chart-cross" />
            <circle cx={x(hi)} cy={y(pts[hi].demand)} r="4" fill={DEMAND} class="chart-dot" />
            <circle cx={x(hi)} cy={y(pts[hi].supply)} r="4" fill={SUPPLY} class="chart-dot" />
          </>
        )}
        <text x={pad.l} y={H - 6} class="chart-label">{n > 1 ? ago(now - history[0].t) : ''}</text>
        <text x={width - pad.r} y={H - 6} class="chart-label" text-anchor="end">現在</text>
        <text x={width - pad.r} y={y(max / 1.1) - 4} class="chart-label" text-anchor="end">{fmt(max / 1.1)}/s</text>
      </svg>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const W = 120;
  const H = 28;
  if (values.length < 2) return <svg class="spark" width={W} height={H} />;
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => 2 + (1 - (v - lo) / span) * (H - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg class="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} class="chart-axis" />
      <path d={d} fill="none" stroke={SUPPLY} stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>
  );
}

function Stats() {
  const s = getState();
  const history = getHistory();
  const nets = Object.keys(POWER_NAMES).filter((k) => history.some((h) => (h.power[k]?.supply ?? 0) + (h.power[k]?.demand ?? 0) > 0));
  const [net, setNet] = useState<string | null>(null);
  const shownNet = net && nets.includes(net) ? net : nets.includes('eu') ? 'eu' : nets[0];
  const rates = getRates();
  const movers = Object.keys(ITEMS)
    .filter((id) => !['power', 'structure'].includes(ITEMS[id].kind) && Math.abs(rates[id] ?? 0) >= 0.005)
    .sort((a, b) => Math.abs(rates[b]) - Math.abs(rates[a]))
    .slice(0, 8);
  const top = Object.entries(s.stats.produced).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topMax = top[0]?.[1] ?? 1;
  const machines = allLines(s).reduce((n, l) => n + l.count, 0);
  const tiles: [string, string][] = [
    ['本輪時間', fmtDuration(s.playTime)],
    ['目前星系', `第 ${s.legacy.warps + 1} 個`],
    ['運轉中機器', `${machines} 台`],
    ['完成研究', `${s.techs.length} 項`],
    ['累計建造', `${fmt(s.stats.built)} 台`],
    ['手動採集', `${fmt(s.stats.gathered)} 次`],
    ['遺物訊號', `${s.stats.signals} 次`],
    ['星球事件', `${s.stats.incidents} 次`],
    ['商隊交易', `${s.stats.trades} 次`],
    ['最快星門', s.stats.bestGate ? fmtDuration(s.stats.bestGate) : '—'],
  ];
  return (
    <>
      <section class="stat-tiles">
        {tiles.map(([k, v]) => (
          <div key={k} class="stat-tile">
            <span class="muted small">{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </section>
      <section class="card">
        <div class="section-head">
          <h2>能源曲線</h2>
          <span class="muted">最近 15 分鐘，每 5 秒一筆</span>
        </div>
        {nets.length > 1 && (
          <div class="seg small-seg">
            {nets.map((k) => (
              <button key={k} class={k === shownNet ? 'on' : ''} onClick={() => setNet(k)}>{POWER_NAMES[k]}</button>
            ))}
          </div>
        )}
        {shownNet ? <PowerChart history={history} net={shownNet} /> : <p class="muted small">還沒有能源網路。蓋一座蒸汽鍋爐後，這裡會畫出供需曲線。</p>}
      </section>
      <section class="card">
        <div class="section-head">
          <h2>即時產率</h2>
          <span class="muted">變化最大的 8 種物品</span>
        </div>
        {movers.length === 0 ? (
          <p class="muted small">工廠還沒動起來。</p>
        ) : (
          <div class="mover-list">
            {movers.map((id) => (
              <button key={id} class="mover" onClick={() => openLookup(id)}>
                <ItemIcon id={id} size={24} />
                <span class="mover-name">{itemName(id)}</span>
                <Spark values={history.map((h) => h.rates[id] ?? 0)} />
                <span class={`mover-rate ${rates[id] > 0 ? 'tone-text-ok' : 'tone-text-bad'}`}>{fmtRate(rates[id])}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section class="card">
        <div class="section-head">
          <h2>累計產量</h2>
          <span class="muted">所有星系加總，前 10 名</span>
        </div>
        {top.length === 0 ? (
          <p class="muted small">還沒有機器生產過東西。</p>
        ) : (
          <div class="rank-list">
            {top.map(([id, n]) => (
              <div key={id} class="rank">
                <ItemIcon id={id} size={20} />
                <span class="rank-name">{itemName(id)}</span>
                <span class="rank-bar"><i style={{ width: `${Math.max(2, (n / topMax) * 100)}%` }} /></span>
                <span class="rank-n">{fmt(n)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Log() {
  const { log } = getUi();
  const now = getState().playTime;
  return (
    <section class="card">
      {log.length === 0 ? (
        <p class="muted small">這次開啟遊戲以來還沒有大事發生。研究、事件、成就都會記在這裡。</p>
      ) : (
        <ul class="log">
          {log.map((e, i) => (
            <li key={i} class={`log-${e.tone}`}>
              <span class="log-icon">{e.icon ? <ItemIcon id={e.icon} size={20} /> : '•'}</span>
              <span class="log-text">{e.text}</span>
              <span class="muted small log-t">{ago(Math.max(0, now - e.t))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
