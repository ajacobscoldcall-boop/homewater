/**
 * Key bindings: which keyboard keys drive each action, the player's own
 * rebinding, and the key names shown in on-screen hints and captions.
 *
 * The binding logic is pure (maps in, maps out) so it can be tested without a
 * browser. A small store at the bottom keeps the player's bindings in
 * localStorage under `homewater.controls` (per browser, not in the save).
 */

export const ACTIONS = ['steerLeft', 'steerRight', 'forward', 'easeOff', 'rise', 'dive', 'burst', 'act', 'view', 'details', 'sound', 'journal', 'guide', 'photo', 'pause'] as const;
export type Action = (typeof ACTIONS)[number];

/** Each action has up to two keys (KeyboardEvent.code values). */
export type Bindings = Record<Action, string[]>;
export const SLOTS = 2;

export const ACTION_LABELS: Record<Action, string> = {
  steerLeft: 'Steer left',
  steerRight: 'Steer right',
  forward: 'Swim forward',
  easeOff: 'Ease off (hold against the current)',
  rise: 'Rise',
  dive: 'Dive',
  burst: 'Burst',
  act: 'Act (dig, dart in)',
  view: 'Switch view',
  details: 'Detailed HUD',
  sound: 'Sound on/off',
  journal: 'Field journal (while paused)',
  guide: 'Skip guidance',
  photo: 'Photo mode',
  pause: 'Pause',
};

/** Actions that steer the fish, as opposed to menu and view keys. */
export const SWIM_ACTIONS: readonly Action[] = ['steerLeft', 'steerRight', 'forward', 'easeOff', 'rise', 'dive', 'burst', 'act'];

/** Escape always pauses and closes menus, whatever else is bound. */
export const FIXED_PAUSE = 'Escape';

export const DEFAULT_BINDINGS: Readonly<Bindings> = Object.freeze({
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  forward: ['KeyW', 'ArrowUp'],
  easeOff: ['KeyS', 'ArrowDown'],
  rise: ['Space'],
  dive: ['KeyC', 'ControlLeft'],
  burst: ['ShiftLeft', 'ShiftRight'],
  act: ['KeyE'],
  view: ['KeyV'],
  details: ['KeyH'],
  sound: ['KeyM'],
  journal: ['KeyJ'],
  guide: ['KeyG'],
  photo: ['KeyP'],
  pause: ['Escape'],
});

export function defaultBindings(): Bindings {
  return Object.fromEntries(ACTIONS.map((a) => [a, [...DEFAULT_BINDINGS[a]]])) as Bindings;
}

/** The action a key is bound to, if any. */
export function actionFor(b: Bindings, code: string): Action | null {
  for (const a of ACTIONS) if (b[a].includes(code)) return a;
  return null;
}

/** Keys that can't be bound: they belong to the browser or to the pause key. */
export function isReserved(code: string): boolean {
  return code === FIXED_PAUSE || /^(Meta|OS|Tab|F\d+|ContextMenu)/.test(code);
}

export interface RebindResult {
  bindings: Bindings;
  /** The action that lost this key, if it was bound elsewhere. */
  displaced: Action | null;
}

/**
 * Bind `code` to `action` in `slot`. A key drives only one action, so it is
 * taken from any action that had it (that action is reported as displaced).
 * Returns a new map; the input is not changed.
 */
export function rebind(b: Bindings, action: Action, slot: number, code: string): RebindResult {
  const next = Object.fromEntries(ACTIONS.map((a) => [a, [...b[a]]])) as Bindings;
  if (isReserved(code)) return { bindings: next, displaced: null };
  let displaced: Action | null = null;
  for (const a of ACTIONS) {
    const i = next[a].indexOf(code);
    if (i < 0) continue;
    if (a !== action) displaced = a;
    next[a].splice(i, 1);
  }
  const keys = next[action];
  const s = Math.max(0, Math.min(SLOTS - 1, slot));
  if (s < keys.length) keys[s] = code;
  else keys.push(code);
  next[action] = keys.slice(0, SLOTS);
  return { bindings: next, displaced };
}

/** Remove the key in one slot of an action. */
export function unbind(b: Bindings, action: Action, slot: number): Bindings {
  const next = Object.fromEntries(ACTIONS.map((a) => [a, [...b[a]]])) as Bindings;
  next[action].splice(slot, 1);
  return next;
}

/** Actions left with no key at all (shown as a warning on the Controls page). */
export function unboundActions(b: Bindings): Action[] {
  return ACTIONS.filter((a) => b[a].length === 0 && a !== 'pause');
}

// ---------- Persistence ----------

export const STORAGE_KEY = 'homewater.controls';
export const CONTROLS_VERSION = 1;

/** What is kept in localStorage: only the actions that differ from the defaults. */
export interface StoredControls {
  v: number;
  keys: Partial<Record<Action, string[]>>;
}

export function serialize(b: Bindings): StoredControls {
  const keys: Partial<Record<Action, string[]>> = {};
  for (const a of ACTIONS) if (b[a].join(',') !== DEFAULT_BINDINGS[a].join(',')) keys[a] = [...b[a]];
  return { v: CONTROLS_VERSION, keys };
}

/** Rebuild bindings from stored data. Anything malformed falls back to the defaults; a key bound twice keeps its first action. */
export function parse(raw: unknown): Bindings {
  let b = defaultBindings();
  if (!raw || typeof raw !== 'object') return b;
  const keys = (raw as Partial<StoredControls>).keys;
  if (!keys || typeof keys !== 'object') return b;
  for (const a of ACTIONS) {
    const list = (keys as Record<string, unknown>)[a];
    if (!Array.isArray(list)) continue;
    const codes = list.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length < 40 && !isReserved(c)).slice(0, SLOTS);
    // Clear the action, then bind each stored key through rebind so conflicts resolve the same way as in the UI.
    b = { ...b, [a]: [] };
    for (const [i, c] of codes.entries()) b = rebind(b, a, i, c).bindings;
  }
  return b;
}

// ---------- Key names ----------

const NAMED: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'Alt',
  AltRight: 'R Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Enter: 'Enter',
  Backspace: 'Backspace',
  CapsLock: 'Caps Lock',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/** A short, readable name for a key code: KeyW → W, Digit1 → 1, ShiftLeft → Shift. */
export function keyName(code: string): string {
  if (NAMED[code]) return NAMED[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1] as string;
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** The first key of an action, by name ('—' when nothing is bound). */
export function primaryKey(b: Bindings, a: Action): string {
  const c = b[a][0];
  return c ? keyName(c) : '—';
}

/** Name used in hints. 'steer' is the pair of steering keys, e.g. A/D. */
export function hintFor(b: Bindings, a: Action | 'steer'): string {
  if (a === 'steer') return `${primaryKey(b, 'steerLeft')}/${primaryKey(b, 'steerRight')}`;
  return primaryKey(b, a);
}

/**
 * Fill key placeholders in player-facing text with the current keys.
 * `{key:burst}` becomes "(Shift)" and `{hold:rise}` becomes "(hold Space)".
 * `steer` names both steering keys and the mouse.
 * Narration strips these placeholders (see scripts/recording-script.mjs), so a
 * recorded line never names a key.
 */
export function fillKeys(text: string, b: Bindings): string {
  return text.replace(/\{(key|hold):(\w+)\}/g, (_, kind: string, a: string) => {
    const name = a === 'steer' ? hintFor(b, 'steer') : (ACTIONS as readonly string[]).includes(a) ? hintFor(b, a as Action) : a;
    const mouse = a === 'steer' ? ' or the mouse' : '';
    if (kind === 'hold') return `(hold ${name}${mouse})`;
    return `(${name}${mouse})`;
  });
}

/** The same text with key placeholders removed, as narration speaks it. */
export function stripKeys(text: string): string {
  return text.replace(/\s*\{(key|hold):\w+\}/g, '');
}

// ---------- Store ----------

let current: Bindings = load();
const listeners = new Set<() => void>();

function load(): Bindings {
  try {
    if (typeof localStorage === 'undefined') return defaultBindings();
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parse(JSON.parse(raw)) : defaultBindings();
  } catch {
    return defaultBindings();
  }
}

/** The player's current bindings. */
export function bindings(): Bindings {
  return current;
}

export function setBindings(b: Bindings): void {
  current = b;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(b)));
  } catch {
    // Storage is optional; the bindings still apply for this visit.
  }
  for (const l of listeners) l();
}

export function onBindingsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Current key name for an action, for hints in code. */
export function k(a: Action | 'steer'): string {
  return hintFor(current, a);
}

/** fillKeys with the current bindings. */
export function withKeys(text: string): string {
  return fillKeys(text, current);
}
