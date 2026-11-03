import { onGameEvent, type GameEvent } from '../state/events';

/** Everything is synthesized with WebAudio: no sound files to load or license */

export interface AudioPrefs {
  sfx: boolean;
  music: boolean;
  /** Master volume 0..1 */
  volume: number;
}

const PREFS_KEY = 'sf-audio';
const DEFAULT_PREFS: AudioPrefs = { sfx: true, music: true, volume: 0.6 };

let prefs: AudioPrefs = readPrefs();
let ctx: AudioContext | null = null;
/** The player has tapped or pressed a key, so the browser lets audio start */
let unlocked = false;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicTimer: ReturnType<typeof setTimeout> | undefined;
const lastPlayed: Partial<Record<GameEvent, number>> = {};
const prefListeners = new Set<() => void>();

function readPrefs(): AudioPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const getAudioPrefs = () => prefs;

export function onAudioPrefs(fn: () => void): () => void {
  prefListeners.add(fn);
  return () => prefListeners.delete(fn);
}

export function setAudioPrefs(p: Partial<AudioPrefs>) {
  prefs = { ...prefs, ...p };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
  if (master) master.gain.value = prefs.volume;
  if (prefs.music) startMusic();
  else stopMusic();
  for (const fn of prefListeners) fn();
}

/** Browsers only allow audio after a user gesture, so the context is made on the first one */
function ensureCtx(): AudioContext | null {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = prefs.volume;
  // A gentle compressor keeps stacked sounds from clipping
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(master);
  return ctx;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Note {
  /** MIDI note, or a frequency in Hz when `hz` is set */
  n: number;
  at?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  /** Glide to this MIDI note over the duration */
  to?: number;
  hz?: boolean;
}

function play(notes: Note[], out: AudioNode | null = master) {
  const c = ctx;
  if (!c || !out) return;
  const t0 = c.currentTime + 0.01;
  for (const { n, at = 0, dur = 0.12, type = 'triangle', gain = 0.25, to, hz } of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const f = hz ? n : midi(n);
    osc.frequency.setValueAtTime(f, t0 + at);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(hz ? to : midi(to), t0 + at + dur);
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(gain, t0 + at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(g).connect(out);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.05);
  }
}

function noise(dur: number, gain: number, freq: number, at = 0) {
  const c = ctx;
  if (!c || !master) return;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(c.currentTime + 0.01 + at);
}

const PENTA = [72, 74, 76, 79, 81, 84];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const SFX: Record<GameEvent, () => void> = {
  click: () => play([{ n: 88, dur: 0.03, type: 'square', gain: 0.05 }]),
  gather: () => {
    play([{ n: pick(PENTA), dur: 0.09, type: 'triangle', gain: 0.18 }]);
    noise(0.04, 0.12, 2500);
  },
  build: () => {
    play([
      { n: 45, dur: 0.12, type: 'square', gain: 0.12, to: 40 },
      { n: 64, at: 0.05, dur: 0.1, type: 'triangle', gain: 0.18 },
      { n: 71, at: 0.1, dur: 0.14, type: 'triangle', gain: 0.16 },
    ]);
    noise(0.08, 0.2, 900);
  },
  demolish: () => {
    play([{ n: 55, dur: 0.18, type: 'sawtooth', gain: 0.08, to: 40 }]);
    noise(0.15, 0.18, 600);
  },
  research: () =>
    play([60, 64, 67, 72, 76].map((n, i) => ({ n, at: i * 0.07, dur: 0.35, type: 'triangle' as const, gain: 0.16 }))),
  milestone: () => {
    const chord = [48, 55, 60, 64, 67];
    play(chord.map((n) => ({ n, dur: 1.6, type: 'sawtooth' as const, gain: 0.04 })));
    play([60, 64, 67, 72, 76, 79, 84].map((n, i) => ({ n, at: 0.1 + i * 0.09, dur: 0.6, type: 'triangle' as const, gain: 0.15 })));
  },
  signal: () =>
    play([
      { n: 300, to: 1200, hz: true, dur: 0.5, type: 'sine', gain: 0.12 },
      { n: 84, at: 0.45, dur: 0.4, type: 'sine', gain: 0.12 },
      { n: 91, at: 0.6, dur: 0.6, type: 'sine', gain: 0.1 },
    ]),
  reward: () =>
    play([84, 88, 91, 96].map((n, i) => ({ n, at: i * 0.05, dur: 0.25, type: 'sine' as const, gain: 0.12 }))),
  error: () =>
    play([
      { n: 43, dur: 0.1, type: 'square', gain: 0.07 },
      { n: 40, at: 0.11, dur: 0.14, type: 'square', gain: 0.07 },
    ]),
  achievement: () =>
    play([
      { n: 79, dur: 0.9, type: 'sine', gain: 0.16 },
      { n: 91, dur: 0.6, type: 'sine', gain: 0.05 },
      { n: 84, at: 0.14, dur: 1.1, type: 'sine', gain: 0.16 },
      { n: 96, at: 0.14, dur: 0.7, type: 'sine', gain: 0.05 },
    ]),
  incident: () =>
    play([
      { n: 69, dur: 0.18, type: 'square', gain: 0.06 },
      { n: 76, at: 0.2, dur: 0.18, type: 'square', gain: 0.06 },
      { n: 69, at: 0.4, dur: 0.18, type: 'square', gain: 0.06 },
    ]),
  warp: () => {
    play([{ n: 80, to: 2400, hz: true, dur: 2.2, type: 'sawtooth', gain: 0.05 }]);
    noise(2.2, 0.15, 1800);
    play([48, 55, 60, 67, 72].map((n, i) => ({ n, at: 1.6 + i * 0.08, dur: 1.5, type: 'triangle' as const, gain: 0.1 })));
  },
};

/** Minimum gap between two plays of the same sound, so a fast tapper doesn't make a wall of noise */
const MIN_GAP: Partial<Record<GameEvent, number>> = { gather: 0.045, click: 0.03, build: 0.06, error: 0.25 };

export function playSfx(e: GameEvent) {
  // Events fired before the first tap (achievements and signals while loading a save) stay silent:
  // making the context then only gets it blocked by the autoplay policy
  if (!prefs.sfx || !unlocked || !ensureCtx() || !ctx) return;
  const now = ctx.currentTime;
  if (now - (lastPlayed[e] ?? -1) < (MIN_GAP[e] ?? 0.02)) return;
  lastPlayed[e] = now;
  SFX[e]();
}

// ---------- ambient music: a slow pad over a minor progression, with stars of high notes ----------

const PROGRESSION = [
  [45, 52, 57, 60, 64], // Am
  [41, 48, 53, 57, 60], // F
  [48, 55, 60, 64, 67], // C
  [43, 50, 55, 59, 62], // G
  [45, 52, 57, 60, 64], // Am
  [40, 47, 52, 55, 59], // Em
  [41, 48, 53, 57, 60], // F
  [43, 50, 55, 62, 67], // G
];
const STAR_NOTES = [76, 79, 81, 84, 88];
const BAR = 7;
let bar = 0;

function pad(notes: number[]) {
  const c = ctx;
  if (!c || !musicBus) return;
  const t0 = c.currentTime + 0.05;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, t0);
  filter.frequency.linearRampToValueAtTime(1100, t0 + BAR / 2);
  filter.frequency.linearRampToValueAtTime(500, t0 + BAR + 2);
  filter.connect(musicBus);
  for (const n of notes) {
    for (const detune of [-6, 6]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = n < 50 ? 'triangle' : 'sawtooth';
      osc.frequency.value = midi(n);
      osc.detune.value = detune;
      const peak = n < 50 ? 0.05 : 0.012;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 2.2);
      g.gain.setValueAtTime(peak, t0 + BAR - 0.5);
      g.gain.linearRampToValueAtTime(0, t0 + BAR + 2);
      osc.connect(g).connect(filter);
      osc.start(t0);
      osc.stop(t0 + BAR + 2.1);
    }
  }
  // A few twinkles over the pad
  const stars = 1 + Math.floor(Math.random() * 3);
  play(
    Array.from({ length: stars }, () => ({
      n: pick(STAR_NOTES),
      at: 0.8 + Math.random() * (BAR - 2),
      dur: 1.6,
      type: 'sine' as const,
      gain: 0.025,
    })),
    musicBus,
  );
}

function musicLoop() {
  if (!prefs.music || !ctx) return;
  if (document.visibilityState === 'visible') pad(PROGRESSION[bar++ % PROGRESSION.length]);
  musicTimer = setTimeout(musicLoop, BAR * 1000);
}

function startMusic() {
  if (!prefs.music || !ensureCtx() || musicTimer !== undefined) return;
  musicLoop();
}

function stopMusic() {
  clearTimeout(musicTimer);
  musicTimer = undefined;
}

/** Hook sounds to game events; audio itself starts on the player's first tap */
export function initSound() {
  onGameEvent(playSfx);
  const unlock = () => {
    unlocked = true;
    ensureCtx();
    startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
