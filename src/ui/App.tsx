import { useEffect, useState } from 'preact/hooks';
import { ITEMS } from '../data/items';
import { MACHINES } from '../data/machines';
import { RECIPES } from '../data/recipes';
import { MILESTONE_LIST, MILESTONES, TECH_LIST, TECHS } from '../data/tech';
import { BOOST_TIME } from '../data/legacy';
import { activeIncident, canAfford, canBuildMilestone, currentTier, milestoneUnlocked, offlineCap, techAvailable, techCost } from '../sim/rules';
import type { GameState } from '../sim/types';
import {
  acceptTrade, answerSignal, closeIntro, closeMilestoneModal, closeOfflineReport, dismissToast, exportSave, focusLine, getLast, getState, getUi,
  importSave, openPicker, openSignal, openTrade, resetGame, signalData, toggleMaintenance, togglePause,
} from '../state/store';
import { ItemLink, Modal, PauseIcon, isStuck, PageHeader, Reward, fmt, fmtDuration, reasonText, reasonTone, useGame } from './common';
import { Embers } from './Embers';
import { LegacyPanel } from './LegacyPanel';
import { MilestonePanel } from './MilestonePanel';
import { Objective } from './Objective';
import { NewLinePicker, ProductionPanel, RecipeSwitch } from './ProductionPanel';
import { RecipeLookup } from './RecipeLookup';
import { RecordsPanel } from './RecordsPanel';
import { ResearchPanel } from './ResearchPanel';
import { StoragePanel } from './StoragePanel';
import { Brand, TopBar } from './TopBar';
import { ItemIcon, MachineIcon, TIER_COLORS, UiIcon } from './pixel';
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

/** Where each tab was scrolled to when the player left it */
const scrollPlaces: Partial<Record<string, number>> = {};

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
  const [copied, setCopied] = useState(false);
  return (
    <div class="panel">
      <PageHeader title="設定" />
      <AudioSettings />
      <section class="card">
        <h3>存檔</h3>
        <p class="muted small">每 10 秒自動存到瀏覽器。關掉分頁後，最多會補算 {offlineCap(getState()) / 3600} 小時的離線產出。</p>
        <div class="row">
          <button onClick={() => setExported(exportSave())}>匯出存檔字串</button>
          {exported && (
            <button
              onClick={() => navigator.clipboard?.writeText(exported).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })}
            >
              {copied ? '已複製 ✓' : '複製'}
            </button>
          )}
        </div>
        {exported && <textarea readOnly rows={3} value={exported} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
        <textarea
          rows={3}
          placeholder="貼上存檔字串"
          value={importText}
          onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="row">
          <button disabled={!importText.trim()} onClick={() => confirm('匯入會取代目前的進度，確定嗎？') && setImportError(!importSave(importText))}>匯入</button>
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
      <p class="muted small">電腦上可以用數字鍵 1–7 切換分頁，N 新增生產線，P 暫停或繼續，Esc 關閉視窗。</p>
    </section>
  );
}

function IntroModal() {
  return (
    <Modal title="墜落" icon={<ItemIcon id="rocket_part" size={24} />} onClose={closeIntro}>
      <div class="intro">
        <p>
          躍遷引擎在最後一次跳躍時炸了。你們迫降在一顆沒有名字的岩石行星上，船體斷成三截，主電腦只救回了一份檔案：<strong>星門藍圖</strong>。
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
        <button
          key={x.id}
          class={`toast toast-${x.tone}`}
          onClick={() => {
            dismissToast(x.id);
            if (x.action === 'signal') openSignal(true);
            if (x.action === 'trade') openTrade(true);
          }}
        >
          {x.icon && <ItemIcon id={x.icon} size={x.tone === 'achievement' ? 32 : 24} />}
          <span class="toast-body">
            {x.title && <span class="toast-title">{x.title}</span>}
            <span>{x.text}</span>
          </span>
          {x.action && <span class="toast-go">{x.action === 'signal' ? '回應' : '看報價'} ›</span>}
        </button>
      ))}
    </div>
  );
}

/** Rows of each list shown before "show all": the first ones tell the story */
const REPORT_TOP = 12;

function OfflineReportModal() {
  const report = getUi().offlineReport!;
  const [all, setAll] = useState(false);
  const s = getState();
  const changes = Object.entries(report.changes).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const stalled = s.lines
    .map((l) => ({ l, st: report.last?.lines[l.id] }))
    .filter(({ st }) => st && st.efficiency < 0.999 && !['idle', 'paused', 'load', 'limit'].includes(st.reason.kind))
    // The most stuck first
    .sort((a, b) => a.st!.efficiency - b.st!.efficiency);

  return (
    <Modal title="離線報告" onClose={closeOfflineReport}>
      <p>
        你離開了 {fmtDuration(report.away)}
        {report.simulated < report.away && <span class="muted">（只補算 {fmtDuration(report.simulated)}）</span>}。
      </p>
      {(report.researched?.length ?? 0) > 0 && (
        <>
          <h4>排程研究完成</h4>
          <p>{report.researched.map((id) => TECHS[id]?.name ?? id).join('、')}</p>
        </>
      )}
      <h4>物品變化</h4>
      {changes.length === 0 ? (
        <p class="muted">沒有變化。</p>
      ) : (
        <ul class="changes">
          {(all ? changes : changes.slice(0, REPORT_TOP)).map(([id, d]) => (
            <li key={id}>
              <ItemLink id={id} /> <span class={d > 0 ? 'tone-text-ok' : 'tone-text-bad'}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</span>
            </li>
          ))}
          {!all && changes.length > REPORT_TOP && (
            <li>
              <button class="small-btn" onClick={() => setAll(true)}>顯示全部 {changes.length} 項</button>
            </li>
          )}
        </ul>
      )}
      {stalled.length > 0 && (
        <>
          <h4>卡住的生產線</h4>
          <ul class="changes">
            {(all ? stalled : stalled.slice(0, REPORT_TOP)).map(({ l, st }) => (
              <li key={l.id}>
                <button
                  class="flow-line"
                  title="到這條生產線"
                  onClick={() => {
                    closeOfflineReport();
                    focusLine(l.id);
                  }}
                >
                  <MachineIcon id={l.machine} size={20} />
                  <span class="flow-line-name">
                    <span>{MACHINES[l.machine].name} ×{l.count}</span>
                    <span class="small">
                      <span class="muted">{RECIPES[l.recipe].name}</span>
                      <span class={`tone-text-${reasonTone(st!.reason)}`}> · {reasonText(st!.reason, st)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!all && stalled.length > REPORT_TOP && (
              <li>
                <button class="small-btn" onClick={() => setAll(true)}>顯示全部 {stalled.length} 條</button>
              </li>
            )}
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
      <p>二選一，還剩 {Math.max(0, Math.ceil((s.signal ?? 0) - s.playTime))} 秒。</p>
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
      {victory.ending && (
        <>
          <p class="tone-text-ok">恭喜通關《星燼工業》！</p>
          <p class="small">可以在「星系」分頁躍遷，帶著遺產點到新星系重新開始。戴森群越大，躍遷拿到的點數越多。</p>
          <button onClick={onWarp}>前往「星系」分頁</button>
        </>
      )}
      <button class="primary" onClick={closeMilestoneModal}>繼續經營</button>
    </Modal>
  );
}

/** This tab lost the game to a newer one: say so, and offer to take it back */
function SupersededScreen() {
  return (
    <div class="modal-backdrop">
      <div class="modal" role="alertdialog" aria-modal="true" aria-label="遊戲已在另一個分頁開啟">
        <header class="modal-head">
          <h2>遊戲已在另一個分頁開啟</h2>
        </header>
        <div class="modal-body">
          <p>這個分頁已經停下來，免得兩邊各跑各的、互相蓋掉存檔。進度以另一個分頁為準。</p>
          <button class="primary big" onClick={() => location.reload()}>改在這個分頁繼續</button>
        </div>
      </div>
    </div>
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
  const stuck = s.lines.filter((l) => isStuck(l, last.lines[l.id])).length;
  if (stuck > 0) out.production = { text: String(stuck), tone: 'warn', title: `${stuck} 條生產線卡住或變慢` };
  return out;
}

export function App() {
  const s = useGame();
  const ui = getUi();
  const [tab, setTabState] = useState<TabId>(readTab);
  const setTab = (t: TabId) => {
    // Each tab keeps its own place: coming back to the lines lands where the player left them
    scrollPlaces[tab] = window.scrollY;
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

  useEffect(() => {
    // A line being focused does its own scrolling
    if (ui.focusLine === null) window.scrollTo(0, scrollPlaces[shown] ?? 0);
  }, [shown]);

  // The objective bar's shortcut to a research or megastructure card
  useEffect(() => {
    if (ui.goto && shown !== ui.goto.tab) setTab(ui.goto.tab);
  }, [ui.goto]);

  // Picking a line elsewhere (the item window) takes the player to the production tab, which scrolls to it
  useEffect(() => {
    if (ui.focusLine !== null && shown !== 'production') setTab('production');
  }, [ui.focusLine]);

  // Number keys switch tabs on a keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (document.querySelector('.modal')) return;
      // A held key would otherwise flip the pause back and forth, or reopen the window it just opened
      if (e.repeat) return;
      if (e.key === 'p' || e.key === 'P') return togglePause();
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setTab('production');
        return openPicker(true);
      }
      const i = Number(e.key) - 1;
      if (i >= 0 && i < visibleTabs.length) setTab(visibleTabs[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (ui.superseded) {
    return (
      <div class="app">
        <Embers />
        <SupersededScreen />
      </div>
    );
  }

  return (
    <div class={`app ${s.paused ? 'paused' : ''}`} style={{ '--tier': TIER_COLORS[Math.min(currentTier(s), TIER_COLORS.length - 1)] }}>
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
              // Tapping the tab you're on goes back to its top
              onClick={() => (shown === t.id ? window.scrollTo({ top: 0, behavior: 'smooth' }) : setTab(t.id))}
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
        <TopBar chips={shown === 'production'} />
        <main class="main">
          {s.paused && (
            <div class="paused-banner" role="status">
              <span class="paused-icon"><PauseIcon paused={false} size={16} /></span>
              <span class="paused-text">
                <strong>遊戲已暫停</strong>
                <span class="muted small">時間停止，關掉分頁也不補算。仍可建造、研究、調整生產線。</span>
              </span>
              <button class="primary resume-btn" onClick={togglePause}><PauseIcon paused size={11} /> 繼續</button>
            </div>
          )}
          <Objective state={s} />
          <View />
        </main>
      </div>
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
      {ui.picker && <NewLinePicker />}
      {ui.recipeLine !== null && <RecipeSwitch lineId={ui.recipeLine} />}
      {/* The item window opens from inside the others too, so it goes on top */}
      {ui.lookupItem && <RecipeLookup item={ui.lookupItem} />}
      <Toasts />
    </div>
  );
}
