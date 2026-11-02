import { useState } from 'preact/hooks';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONE_LIST, MILESTONES, TECH_LIST } from '../data/tech';
import { BOOST_TIME } from '../data/legacy';
import { canAfford, canBuildMilestone, milestoneUnlocked, offlineCap, techAvailable, techCost } from '../sim/rules';
import type { GameState } from '../sim/types';
import {
  answerSignal, closeMilestoneModal, closeOfflineReport, exportSave, getLast, getState, getUi, importSave, openSignal, resetGame,
  signalData, toggleMaintenance,
} from '../state/store';
import { ItemLink, Modal, Reward, fmt, fmtDuration, reasonText, reasonTone, useGame } from './common';
import { LegacyPanel } from './LegacyPanel';
import { MilestonePanel } from './MilestonePanel';
import { Objective } from './Objective';
import { ProductionPanel } from './ProductionPanel';
import { RecipeLookup } from './RecipeLookup';
import { ResearchPanel } from './ResearchPanel';
import { StoragePanel } from './StoragePanel';
import { TopBar } from './TopBar';

const TABS = [
  { id: 'production', label: '生產線', view: ProductionPanel },
  { id: 'storage', label: '倉庫', view: StoragePanel },
  { id: 'research', label: '研究', view: ResearchPanel },
  { id: 'milestones', label: '巨構', view: MilestonePanel },
  { id: 'legacy', label: '星系', view: LegacyPanel },
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
    <Modal title="遺物訊號" onClose={() => openSignal(false)}>
      <p>無人機在地表下找到一件會發光的異星遺物。訊號正在減弱，還剩 {Math.max(0, Math.ceil((s.signal ?? 0) - s.playTime))} 秒。</p>
      <div class="choice-row">
        <button class="choice" onClick={() => answerSignal('data')}>
          <strong>解析遺物</strong>
          <span class="small">立刻得到 <Reward items={data} /></span>
        </button>
        <button class="choice" onClick={() => answerSignal('boost')}>
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
  const shown = tab === 'legacy' && !legacyVisible ? 'production' : tab;
  const View = TABS.find((t) => t.id === shown)!.view;
  const badges = navBadges(s);

  return (
    <div class="app">
      <TopBar />
      <div class="body">
        <nav class="nav">
          {TABS.filter((t) => t.id !== 'legacy' || legacyVisible).map((t) => (
            <button key={t.id} class={`nav-btn ${shown === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {badges[t.id] && <span class={`nav-badge ${badges[t.id]!.tone}`} title={badges[t.id]!.title}>{badges[t.id]!.text}</span>}
            </button>
          ))}
        </nav>
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
      {ui.toast && <div class="toast" role="status">{ui.toast}</div>}
    </div>
  );
}
