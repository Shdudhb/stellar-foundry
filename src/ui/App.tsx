import { useEffect, useState } from 'preact/hooks';
import { ITEMS } from '../data/items';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONE_LIST, MILESTONES, TECH_LIST } from '../data/tech';
import { BOOST_TIME } from '../data/legacy';
import { activeIncident, canAfford, canBuildMilestone, currentTier, milestoneUnlocked, offlineCap, techAvailable, techCost } from '../sim/rules';
import type { GameState } from '../sim/types';
import {
  acceptTrade, answerSignal, closeIntro, closeMilestoneModal, closeOfflineReport, dismissToast, exportSave, getLast, getState, getUi,
  importSave, openSignal, openTrade, resetGame, signalData, toggleMaintenance,
} from '../state/store';
import { ItemLink, Modal, PageHeader, Reward, fmt, fmtDuration, reasonText, reasonTone, useGame } from './common';
import { Embers } from './Embers';
import { LegacyPanel } from './LegacyPanel';
import { MilestonePanel } from './MilestonePanel';
import { Objective } from './Objective';
import { ProductionPanel } from './ProductionPanel';
import { RecipeLookup } from './RecipeLookup';
import { RecordsPanel } from './RecordsPanel';
import { ResearchPanel } from './ResearchPanel';
import { StoragePanel } from './StoragePanel';
import { Brand, TopBar } from './TopBar';
import { ItemIcon, TIER_COLORS, UiIcon } from './pixel';
import { getAudioPrefs, onAudioPrefs, setAudioPrefs } from './sound';

const TABS = [
  { id: 'production', label: '生產線', view: ProductionPanel },
  { id: 'storage', label: '倉庫', view: StoragePanel },
  { id: 'research', label: '研究', view: ResearchPanel },
  { id: 'milestones', label: '巨構', view: MilestonePanel },
  { id: 'legacy', label: '星系', view: LegacyPanel },
  { id: 'records', label: '紀錄', view: RecordsPanel },
  { id: 'settings', label: '設定', view: SettingsPanel },
] as const;

type TabId = (typeof TABS)[number]['id'];

function readTab(): TabId {
  try {
    const t = localStorage.getItem('sf-tab');
    if (TABS.some((x) => x.id === t)) return t as TabId;
  } catch {
    // ignore
  }
  return 'production';
}

function SettingsPanel() {
  const [exported, setExported] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);
  return (
    <div class="panel">
      <PageHeader kicker="SYSTEM / SETTINGS" title="設定">聲音、存檔、遊戲規則，以及重新開始。</PageHeader>
      <AudioSettings />
      <section class="card">
        <h3>存檔</h3>
        <p class="muted small">每 10 秒自動存到瀏覽器。關掉分頁後，最多會補算 {offlineCap(getState()) / 3600} 小時的離線產出。</p>
        <div class="row">
          <button onClick={() => setExported(exportSave())}>匯出存檔字串</button>
          {exported && <button onClick={() => navigator.clipboard?.writeText(exported)}>複製</button>}
        </div>
        {exported && <textarea readOnly rows={3} value={exported} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
        <textarea
          rows={3}
          placeholder="貼上存檔字串"
          value={importText}
          onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="row">
          <button disabled={!importText.trim()} onClick={() => setImportError(!importSave(importText))}>匯入</button>
          {importError && <span class="tone-text-bad small">存檔字串無法讀取</span>}
        </div>
      </section>
      <section class="card">
        <h3>遊戲規則</h3>
        <label class="check-row">
          <input type="checkbox" checked={getState().maintenance} onChange={toggleMaintenance} />
          機器磨損與維護
        </label>
        <p class="muted small">
          開啟時，HV 機器運轉會消耗維護套件；缺套件時會慢慢磨損，最多降到一半速度，補上套件後會修回來。關閉後不磨損也不消耗套件。
        </p>
      </section>
      <section class="card">
        <h3>重新開始</h3>
        <p class="muted small">清除這一輪的工廠、研究和物品。躍遷得到的星際遺產會保留。</p>
        <button class="danger" onClick={() => confirm('清除這一輪的進度並重新開始？') && resetGame()}>清除進度</button>
      </section>
    </div>
  );
}

function AudioSettings() {
  const [, setN] = useState(0);
  useEffect(() => onAudioPrefs(() => setN((n) => n + 1)), []);
  const a = getAudioPrefs();
  return (
    <section class="card">
      <h3>聲音</h3>
      <label class="check-row">
        <input type="checkbox" checked={a.sfx} onChange={() => setAudioPrefs({ sfx: !a.sfx })} />
        音效
      </label>
      <label class="check-row">
        <input type="checkbox" checked={a.music} onChange={() => setAudioPrefs({ music: !a.music })} />
        背景音樂
      </label>
      <label class="range-row">
        <span>音量</span>
        <input
          type="range" min="0" max="1" step="0.05" value={a.volume}
          onInput={(e) => setAudioPrefs({ volume: +(e.target as HTMLInputElement).value })}
        />
        <span class="muted small">{Math.round(a.volume * 100)}%</span>
      </label>
      <p class="muted small">聲音都是即時合成的。電腦上可以用數字鍵 1–7 切換分頁。</p>
    </section>
  );
}

function IntroModal() {
  return (
    <Modal title="墜落" icon={<ItemIcon id="rocket_part" size={24} />} onClose={closeIntro}>
      <div class="intro">
        <p class="kicker">殖民艦「餘燼號」· 航行日誌 第 2,113 天</p>
        <p>
          躍遷引擎在最後一次跳躍時炸了。你們迫降在一顆沒有名字的岩石行星上，船體斷成三截，
          主電腦只救回了一份檔案：<strong>星門藍圖</strong>。
        </p>
        <p>
          回家已經不可能。但只要工業夠強大，就能在這裡蓋出一座星門，把殖民地帶往群星之間。
        </p>
        <ol class="intro-steps">
          <li><ItemIcon id="stone" size={20} /> 先用手採集石頭和礦石</li>
          <li><ItemIcon id="iron_ingot" size={20} /> 建立生產線，讓機器自動冶煉、製作</li>
          <li><ItemIcon id="data" size={20} /> 產出研究數據，解鎖蒸汽、電力、石化⋯⋯</li>
          <li><ItemIcon id="exotic_matter" size={20} /> 一路走到星際時代，點亮星門</li>
        </ol>
      </div>
      <button class="primary big" onClick={closeIntro}>開始建設</button>
    </Modal>
  );
}

function IncidentModal() {
  const s = getState();
  const def = activeIncident(s)!;
  const offer = s.incident?.offer;
  const left = Math.max(0, Math.ceil((s.incident?.until ?? 0) - s.playTime));
  return (
    <Modal title={def.name} icon={<ItemIcon id={def.icon} size={24} />} onClose={() => openTrade(false)}>
      <p>{def.text}</p>
      <p class="muted small">剩下 {left} 秒。</p>
      {offer ? (
        <>
          <div class="trade">
            <span class="trade-side">
              <ItemIcon id={offer.item} size={40} />
              <strong>−{fmt(offer.n)}</strong>
              <span class="small muted">{ITEMS[offer.item].name}（庫存 {fmt(s.items[offer.item] ?? 0)}）</span>
            </span>
            <span class="trade-arrow">→</span>
            <span class="trade-side">
              <ItemIcon id={Object.keys(offer.pay)[0]} size={40} />
              <strong>+{fmt(Object.values(offer.pay)[0])}</strong>
              <span class="small muted">{ITEMS[Object.keys(offer.pay)[0]].name}</span>
            </span>
          </div>
          <div class="row">
            <button class="primary" disabled={(s.items[offer.item] ?? 0) < offer.n} onClick={acceptTrade}>成交</button>
            <button onClick={() => openTrade(false)}>再想想</button>
          </div>
        </>
      ) : (
        <button class="primary" onClick={() => openTrade(false)}>知道了</button>
      )}
    </Modal>
  );
}

function Toasts() {
  const { toasts } = getUi();
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <button key={x.id} class={`toast toast-${x.tone}`} onClick={() => dismissToast(x.id)}>
          {x.icon && <ItemIcon id={x.icon} size={x.tone === 'achievement' ? 32 : 24} />}
          <span class="toast-body">
            {x.title && <span class="toast-title">{x.title}</span>}
            <span>{x.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function OfflineReportModal() {
  const report = getUi().offlineReport!;
  const s = getState();
  const changes = Object.entries(report.changes).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const stalled = s.lines
    .map((l) => ({ l, st: report.last?.lines[l.id] }))
    .filter(({ st }) => st && st.efficiency < 0.999 && !['idle', 'paused', 'load'].includes(st.reason.kind));

  return (
    <Modal title="離線報告" onClose={closeOfflineReport}>
      <p>
        你離開了 {fmtDuration(report.away)}
        {report.simulated < report.away && <span class="muted">（只補算 {fmtDuration(report.simulated)}）</span>}。
      </p>
      <h4>物品變化</h4>
      {changes.length === 0 ? (
        <p class="muted">沒有變化。</p>
      ) : (
        <ul class="changes">
          {changes.map(([id, d]) => (
            <li key={id}>
              <ItemLink id={id} /> <span class={d > 0 ? 'tone-text-ok' : 'tone-text-bad'}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</span>
            </li>
          ))}
        </ul>
      )}
      {stalled.length > 0 && (
        <>
          <h4>卡住的生產線</h4>
          <ul class="changes">
            {stalled.map(({ l, st }) => (
              <li key={l.id}>
                {MACHINES[l.machine].name} · {RECIPES[l.recipe].name}：
                <span class={`tone-text-${reasonTone(st!.reason)}`}>{reasonText(st!.reason, st)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function SignalModal() {
  const s = getState();
  const data = signalData(s);
  return (
    <Modal title="遺物訊號" icon={<ItemIcon id="exotic_matter" size={24} />} onClose={() => openSignal(false)}>
      <p>無人機在地表下找到一件會發光的異星遺物。訊號正在減弱，還剩 {Math.max(0, Math.ceil((s.signal ?? 0) - s.playTime))} 秒。</p>
      <div class="choice-row">
        <button class="choice" onClick={() => answerSignal('data')}>
          <ItemIcon id={Object.keys(data)[0]} size={32} />
          <strong>解析遺物</strong>
          <span class="small">立刻得到 <Reward items={data} /></span>
        </button>
        <button class="choice" onClick={() => answerSignal('boost')}>
          <ItemIcon id="eu" size={32} />
          <strong>啟動遺物</strong>
          <span class="small">整座工廠時間加速 ×2，持續 {BOOST_TIME} 秒</span>
        </button>
      </div>
    </Modal>
  );
}

function MilestoneModal({ id, onWarp }: { id: string; onWarp: () => void }) {
  const { victory } = MILESTONES[id];
  return (
    <Modal title={victory.title} onClose={closeMilestoneModal}>
      <p>{victory.text}</p>
      <p class="muted">遊玩時間：{fmtDuration(getState().playTime)}</p>
      {victory.ending ? (
        <>
          <p class="tone-text-ok">恭喜通關《星燼工業》！</p>
          <p class="small">
            現在可以在「星系」分頁躍遷：帶著遺產點到新的星系重新開始，買永久升級，一輪比一輪快。
            留下來繼續擴大戴森群，躍遷時會拿到更多點數。
          </p>
          <button onClick={onWarp}>前往「星系」分頁</button>
        </>
      ) : (
        victory.last && <p class="muted small">這是原型目前的終點。完整版會從這裡繼續，一路走到星門。</p>
      )}
      <button class="primary" onClick={closeMilestoneModal}>繼續經營</button>
    </Modal>
  );
}

interface Badge { text: string; tone: 'go' | 'warn'; title: string }

/** Little counters on the tabs: something to research or build, or lines that are stuck */
function navBadges(s: GameState): Partial<Record<TabId, Badge>> {
  const out: Partial<Record<TabId, Badge>> = {};
  const research = TECH_LIST.filter((t) => techAvailable(s, t.id) && canAfford(s, techCost(s, t.id))).length;
  if (research > 0) out.research = { text: String(research), tone: 'go', title: `${research} 項研究可以進行` };
  if (MILESTONE_LIST.some((m) => !s.milestones.includes(m.id) && milestoneUnlocked(s, m.id) && canBuildMilestone(s, m.id))) {
    out.milestones = { text: '!', tone: 'go', title: '巨構可以建造了' };
  }
  const last = getLast();
  const stuck = s.lines.filter((l) => {
    const st = last.lines[l.id];
    return st && l.count > 0 && st.efficiency < 0.999 && !['ok', 'idle', 'paused', 'load', 'igniting'].includes(st.reason.kind);
  }).length;
  if (stuck > 0) out.production = { text: String(stuck), tone: 'warn', title: `${stuck} 條生產線卡住或變慢` };
  return out;
}

export function App() {
  const s = useGame();
  const ui = getUi();
  const [tab, setTabState] = useState<TabId>(readTab);
  const setTab = (t: TabId) => {
    setTabState(t);
    try {
      localStorage.setItem('sf-tab', t);
    } catch {
      // ignore
    }
  };
  const legacyVisible = s.legacy.warps > 0 || s.milestones.includes('stargate');
  const visibleTabs = TABS.filter((t) => t.id !== 'legacy' || legacyVisible);
  const shown = tab === 'legacy' && !legacyVisible ? 'production' : tab;
  const View = TABS.find((t) => t.id === shown)!.view;
  const badges = navBadges(s);

  // Number keys switch tabs on a keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < visibleTabs.length) setTab(visibleTabs[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div class="app" style={{ '--tier': TIER_COLORS[Math.min(currentTier(s), TIER_COLORS.length - 1)] }}>
      <Embers />
      <aside class="sidebar">
        <div class="side-brand">
          <Brand />
        </div>
        <nav class="nav" aria-label="分頁">
          {visibleTabs.map((t, i) => (
            <button
              key={t.id}
              title={`${t.label}（${i + 1}）`}
              class={`nav-btn ${shown === t.id ? 'active' : ''}`}
              aria-current={shown === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <span class="nav-icon">
                <UiIcon id={t.id} size={24} />
                {badges[t.id] && <span class={`nav-badge ${badges[t.id]!.tone}`} title={badges[t.id]!.title}>{badges[t.id]!.text}</span>}
              </span>
              <span class="nav-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <p class="side-foot muted small">遊玩 {fmtDuration(s.playTime)}</p>
      </aside>
      <div class="content">
        <TopBar />
        <main class="main">
          <Objective state={s} />
          <View />
        </main>
      </div>
      {ui.lookupItem && <RecipeLookup item={ui.lookupItem} />}
      {ui.offlineReport && <OfflineReportModal />}
      {ui.milestoneModal && (
        <MilestoneModal
          id={ui.milestoneModal}
          onWarp={() => {
            closeMilestoneModal();
            setTab('legacy');
          }}
        />
      )}
      {ui.signalOpen && s.signal !== null && <SignalModal />}
      {ui.tradeOpen && activeIncident(s) && <IncidentModal />}
      {ui.intro && <IntroModal />}
      <Toasts />
    </div>
  );
}
