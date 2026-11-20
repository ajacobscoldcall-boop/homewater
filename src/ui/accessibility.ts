/**
 * Readability and comfort options: caption size and background, threat
 * marker style and colours, reduced motion, game speed, hold or toggle
 * for swimming and bursting, and cinematic camera moments. Kept per browser in localStorage under
 * `homewater.access` (not in the save), and applied to the page as data
 * attributes and CSS variables on <html> (see styles.css).
 */
import { h } from './dom';

export type CaptionSize = 'normal' | 'large' | 'largest';
export type PressMode = 'hold' | 'toggle';

export interface AccessOptions {
  captionSize: CaptionSize;
  /** Caption background opacity, 0.4..1. */
  captionBg: number;
  /** Thicker, outlined threat markers with a solid label. */
  highContrast: boolean;
  /** Threat and flash colours from a colour-blind-safe palette, with shape cues. */
  colourBlind: boolean;
  reducedMotion: boolean;
  /** Simulation speed: the fixed 60 Hz step runs less often, nothing else changes. */
  gameSpeed: number;
  forwardMode: PressMode;
  burstMode: PressMode;
  /** Short framed camera shots at key moments (src/render/cinematics.ts). */
  cinematics: boolean;
}

export const CAPTION_SIZES: Record<CaptionSize, { px: number; label: string }> = {
  normal: { px: 16, label: 'Normal' },
  large: { px: 20, label: 'Large' },
  largest: { px: 25, label: 'Largest' },
};
export const GAME_SPEEDS = [1, 0.75, 0.5] as const;
export const CAPTION_BG = { min: 0.4, max: 1, default: 0.78 } as const;

export const ACCESS_KEY = 'homewater.access';

function systemReducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultAccess(): AccessOptions {
  return { captionSize: 'normal', captionBg: CAPTION_BG.default, highContrast: false, colourBlind: false, reducedMotion: systemReducedMotion(), gameSpeed: 1, forwardMode: 'hold', burstMode: 'hold', cinematics: true };
}

/** Rebuild options from stored data; anything malformed falls back to the default. */
export function parseAccess(raw: unknown): AccessOptions {
  const d = defaultAccess();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw as Partial<AccessOptions>;
  const mode = (m: unknown): PressMode => (m === 'toggle' ? 'toggle' : 'hold');
  return {
    captionSize: s.captionSize && s.captionSize in CAPTION_SIZES ? s.captionSize : d.captionSize,
    captionBg: typeof s.captionBg === 'number' && s.captionBg >= CAPTION_BG.min && s.captionBg <= CAPTION_BG.max ? s.captionBg : d.captionBg,
    highContrast: s.highContrast === true,
    colourBlind: s.colourBlind === true,
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : d.reducedMotion,
    gameSpeed: (GAME_SPEEDS as readonly number[]).includes(s.gameSpeed as number) ? (s.gameSpeed as number) : 1,
    forwardMode: mode(s.forwardMode),
    burstMode: mode(s.burstMode),
    cinematics: s.cinematics !== false,
  };
}

let current: AccessOptions = load();

function load(): AccessOptions {
  try {
    if (typeof localStorage === 'undefined') return defaultAccess();
    const raw = localStorage.getItem(ACCESS_KEY);
    return raw ? parseAccess(JSON.parse(raw)) : defaultAccess();
  } catch {
    return defaultAccess();
  }
}

export function access(): AccessOptions {
  return current;
}

export function setAccess(patch: Partial<AccessOptions>): void {
  current = parseAccess({ ...current, ...patch });
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACCESS_KEY, JSON.stringify(current));
  } catch {
    // Storage is optional.
  }
  applyAccess();
}

/** Multiplier on how fast simulated time passes (App's fixed-step loop). */
export function gameSpeed(): number {
  return current.gameSpeed;
}

/** Push the options onto the page. Safe to call any time. */
export function applyAccess(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--caption-size', `${CAPTION_SIZES[current.captionSize].px}px`);
  root.style.setProperty('--caption-scale', String(CAPTION_SIZES[current.captionSize].px / CAPTION_SIZES.normal.px));
  root.style.setProperty('--caption-bg', String(current.captionBg));
  root.dataset.threats = current.highContrast ? 'contrast' : 'standard';
  root.dataset.colours = current.colourBlind ? 'safe' : 'standard';
  root.dataset.motion = current.reducedMotion ? 'reduced' : 'full';
}

// ---------- The Readability page ----------

function choiceRow<T extends string | number>(label: string, options: { value: T; label: string }[], value: T, set: (v: T) => void, id: string): HTMLElement {
  return h(
    'div',
    { class: 'opt-row' },
    h('span', { class: 'opt-label' }, label),
    h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': label },
      ...options.map((o) => h('button', { 'aria-pressed': String(o.value === value), 'data-opt': `${id}:${o.value}`, onclick: () => set(o.value) }, o.label)),
    ),
  );
}

const onOff = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];

/** The Readability page, for the title screen and the pause menu. */
export function accessPanel(back: () => void): HTMLElement {
  const panel = h('div', { class: 'panel options', id: 'access-panel' });
  const render = () => {
    const o = access();
    const set = (p: Partial<AccessOptions>) => {
      setAccess(p);
      render();
    };
    const bg = h('input', { type: 'range', min: String(CAPTION_BG.min), max: String(CAPTION_BG.max), step: '0.05', value: String(o.captionBg), 'aria-label': 'Caption background', id: 'opt-caption-bg' });
    bg.addEventListener('input', () => setAccess({ captionBg: Number(bg.value) }));
    const sample = h('div', { class: 'caption', id: 'caption-sample' }, 'The current is working you loose. Face upstream and sink deeper into the gravel.');
    const threatSample = h(
      'div',
      { class: 'threat-sample' },
      ...[
        ['warn', 'seal'],
        ['hot', 'orca'],
        ['opening', 'now'],
      ].map(([cls, label]) => h('div', { class: `threat ${cls === 'warn' ? '' : cls}` }, h('div', { class: 'ring' }), h('span', {}, label))),
    );
    panel.replaceChildren(
      h('h2', {}, 'Readability'),
      h('p', { class: 'label' }, 'Captions'),
      choiceRow('Text size', (Object.keys(CAPTION_SIZES) as CaptionSize[]).map((k) => ({ value: k, label: CAPTION_SIZES[k].label })), o.captionSize, (v) => set({ captionSize: v }), 'captionSize'),
      h('label', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Background'), bg),
      sample,
      h('p', { class: 'label' }, 'Threat markers'),
      choiceRow('High contrast', onOff, o.highContrast ? 'on' : 'off', (v) => set({ highContrast: v === 'on' }), 'highContrast'),
      choiceRow('Colour-blind-safe colours', onOff, o.colourBlind ? 'on' : 'off', (v) => set({ colourBlind: v === 'on' }), 'colourBlind'),
      threatSample,
      h(
        'p',
        { class: 'muted small' },
        o.colourBlind
          ? 'Yellow rings warn, orange dashed rings mean an attack, and a blue square marks an opening.'
          : 'Amber rings warn, red rings mean an attack, and green marks an opening. Colour-blind-safe colours add shapes as well as colours.',
      ),
      h('p', { class: 'label' }, 'Comfort'),
      choiceRow('Reduced motion', onOff, o.reducedMotion ? 'on' : 'off', (v) => set({ reducedMotion: v === 'on' }), 'reducedMotion'),
      h('p', { class: 'muted small' }, 'Softer screen flashes and no pulsing or sliding on-screen markers.'),
      choiceRow('Game speed', GAME_SPEEDS.map((s) => ({ value: s, label: s === 1 ? 'Normal' : `${s}×` })), o.gameSpeed, (v) => set({ gameSpeed: v }), 'gameSpeed'),
      h('p', { class: 'muted small' }, 'Slows the whole game, so there is more time to react. Everything else stays the same.'),
      h('p', { class: 'label' }, 'Camera'),
      choiceRow('Cinematic moments', onOff, o.cinematics ? 'on' : 'off', (v) => set({ cinematics: v === 'on' }), 'cinematics'),
      h(
        'p',
        { class: 'muted small' },
        'A few seconds of film-style framing at key moments: hatching, the lake, the night run, the sea, home, spawning. Any key or click returns the camera. Never shown while something is attacking. With reduced motion the camera cuts instead of moving.',
      ),
      h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-access-back', onclick: back }, 'Back')),
    );
  };
  render();
  return panel;
}
