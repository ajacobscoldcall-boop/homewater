/**
 * Gamepads with the browser's "standard" mapping (Xbox and PlayStation style
 * pads in current browsers). Fixed layout: the Controls page lists it.
 *
 * `readPad` is pure (a snapshot of buttons and axes in, actions out) so the
 * mapping can be tested without a browser.
 */
import type { Action } from './bindings';

/** Button indices of the standard mapping. */
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 } as const;

/** Stick and trigger thresholds. Input feel, not simulation. */
export const STICK_DEADZONE = 0.2;
const STICK_PRESS = 0.55;
const TRIGGER_PRESS = 0.25;

/** The layout shown to the player. */
export const PAD_LAYOUT: { action: Action | 'steer'; pad: string }[] = [
  { action: 'steer', pad: 'Left stick (or D-pad left/right)' },
  { action: 'forward', pad: 'Right trigger (RT / R2)' },
  { action: 'easeOff', pad: 'Left trigger (LT / L2) or B / ○' },
  { action: 'rise', pad: 'Right bumper (RB / R1), D-pad up, or left stick up' },
  { action: 'dive', pad: 'Left bumper (LB / L1), D-pad down, or left stick down' },
  { action: 'burst', pad: 'A / ✕' },
  { action: 'act', pad: 'X / □' },
  { action: 'view', pad: 'Y / △' },
  { action: 'details', pad: 'Back / Share' },
  { action: 'photo', pad: 'Right stick press (R3)' },
  { action: 'pause', pad: 'Start / Options' },
];

export interface PadSnapshot {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

export interface PadState {
  /** -1..1, left negative. */
  turn: number;
  /** 0..1 forward thrust (the trigger is analog). */
  forward: number;
  /** Actions held this frame. */
  held: Set<Action>;
}

const btn = (s: PadSnapshot, i: number, threshold = 0.5): boolean => {
  const b = s.buttons[i];
  return !!b && (b.pressed || b.value > threshold);
};

/** Remove the dead zone and rescale so the stick still reaches ±1. */
export function deadzone(v: number, dz = STICK_DEADZONE): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

export function readPad(s: PadSnapshot): PadState {
  const held = new Set<Action>();
  const lx = deadzone(s.axes[0] ?? 0);
  const ly = s.axes[1] ?? 0;
  const dpad = (btn(s, PAD.right) ? 1 : 0) - (btn(s, PAD.left) ? 1 : 0);
  const turn = Math.max(-1, Math.min(1, lx + dpad));
  const rt = s.buttons[PAD.rt]?.value ?? 0;
  const forward = rt > TRIGGER_PRESS ? Math.min(1, rt) : 0;
  if (forward > 0) held.add('forward');
  if (btn(s, PAD.lt, TRIGGER_PRESS) || btn(s, PAD.b)) held.add('easeOff');
  if (btn(s, PAD.rb) || btn(s, PAD.up) || ly < -STICK_PRESS) held.add('rise');
  if (btn(s, PAD.lb) || btn(s, PAD.down) || ly > STICK_PRESS) held.add('dive');
  if (btn(s, PAD.a)) held.add('burst');
  if (btn(s, PAD.x)) held.add('act');
  if (btn(s, PAD.y)) held.add('view');
  if (btn(s, PAD.back)) held.add('details');
  if (btn(s, PAD.r3)) held.add('photo');
  if (btn(s, PAD.start)) held.add('pause');
  return { turn, forward, held };
}

/** The first connected pad with the standard mapping, as a snapshot. */
export function pollPad(): { id: string; snap: PadSnapshot } | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) {
    if (!p || !p.connected || p.mapping !== 'standard') continue;
    return { id: p.id, snap: { buttons: p.buttons.map((b) => ({ pressed: b.pressed, value: b.value })), axes: [...p.axes] } };
  }
  return null;
}

/** Name of a connected pad, including non-standard ones (for the Controls page). */
export function padStatus(): { name: string; standard: boolean } | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) if (p && p.connected) return { name: p.id, standard: p.mapping === 'standard' };
  return null;
}
