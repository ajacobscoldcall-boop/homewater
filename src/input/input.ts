/**
 * Keyboard, mouse and gamepad to Intent. Keys go through the player's
 * bindings (bindings.ts); mouse steering uses pointer lock on the canvas;
 * a standard-mapping gamepad is polled every animation frame (gamepad.ts).
 */
import { NO_INTENT, type Intent } from '../sim/types';
import { access } from '../ui/accessibility';
import { actionFor, bindings, FIXED_PAUSE, SWIM_ACTIONS, type Action } from './bindings';
import { pollPad, readPad, type PadState } from './gamepad';
// Feel pass: keyboard turn ramp and stick curve (feel.ts); mouse sensitivity and invert from the Controls page.
import { rampTurn, stickCurve } from './feel';

/** Intent is consumed once per fixed 60 Hz sim step. */
const STEP = 1 / 60;

/**
 * App's one-shot UI handlers are written in terms of the default keys.
 * Input sends that default code for whichever key the player bound, so a
 * rebound key and a gamepad button both reach the same handler.
 */
const UI_CODE: Partial<Record<Action, string>> = { view: 'KeyV', details: 'KeyH', sound: 'KeyM', journal: 'KeyJ', guide: 'KeyG', photo: 'KeyP', pause: FIXED_PAUSE };

export class Input {
  private down = new Set<string>();
  /** Actions whose key or button went down since the last step. */
  private pressed = new Set<Action>();
  private mouseX = 0;
  private mouseY = 0;
  /** Latched state for toggle mode (forward swim and burst). */
  private latched = { forward: false, burst: false };
  private pad: PadState | null = null;
  private padPrev = new Set<Action>();
  /** Keyboard turn, ramped toward the held steer keys. */
  private keyTurn = 0;
  locked = false;
  /** Called for one-shot UI keys, with the default code of the action (KeyV, KeyH, Escape...). */
  onKey: (code: string) => void = () => undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const action = e.code === FIXED_PAUSE ? 'pause' : actionFor(bindings(), e.code);
      if (!this.down.has(e.code) && action) this.press(action);
      this.down.add(e.code);
      if (action && (SWIM_ACTIONS as readonly string[]).includes(action)) e.preventDefault();
      const ui = action ? UI_CODE[action] : undefined;
      if (ui) this.onKey(ui);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const o = access();
      this.mouseX += e.movementX * o.mouseSensitivity;
      this.mouseY += e.movementY * o.mouseSensitivity * (o.invertY ? -1 : 1);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    const poll = () => {
      this.pollGamepad();
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  /** A key or button went down: edge flags, and the toggle latches. */
  private press(a: Action): void {
    this.pressed.add(a);
    const o = access();
    if (a === 'forward' && o.forwardMode === 'toggle') {
      this.latched.forward = !this.latched.forward;
      if (!this.latched.forward) this.latched.burst = false;
    } else if (a === 'burst' && o.burstMode === 'toggle') {
      this.latched.burst = !this.latched.burst;
    } else if (a === 'easeOff') {
      this.latched.forward = false;
      this.latched.burst = false;
    }
  }

  private pollGamepad(): void {
    const p = pollPad();
    this.pad = p ? readPad(p.snap) : null;
    const held = this.pad?.held ?? new Set<Action>();
    for (const a of held) {
      if (this.padPrev.has(a)) continue;
      this.press(a);
      const ui = UI_CODE[a];
      if (ui) this.onKey(ui);
    }
    this.padPrev = held;
  }

  /** True while any bound key or the gamepad holds this action. */
  private held(a: Action): boolean {
    if (this.pad?.held.has(a)) return true;
    for (const c of bindings()[a]) if (this.down.has(c)) return true;
    return false;
  }

  /** Held on the keyboard only (the stick is analog already). */
  private keyHeld(a: Action): boolean {
    for (const c of bindings()[a]) if (this.down.has(c)) return true;
    return false;
  }

  requestLock(): void {
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => undefined);
    } catch {
      // Pointer lock is optional; keyboard steering still works.
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Intent for one simulation step. Edge flags and mouse deltas are consumed. */
  consume(): Intent {
    const o = access();
    const keyWant = (this.keyHeld('steerRight') ? 1 : 0) - (this.keyHeld('steerLeft') ? 1 : 0);
    this.keyTurn = rampTurn(this.keyTurn, keyWant, STEP);
    const turn = Math.max(-1, Math.min(1, this.keyTurn + stickCurve(this.pad?.turn ?? 0)));
    const heldForward = this.held('forward') ? Math.max(this.pad?.forward ?? 0, this.forwardKeyDown() ? 1 : 0) : 0;
    const forward = o.forwardMode === 'toggle' ? (this.latched.forward ? 1 : 0) : heldForward;
    const burst = o.burstMode === 'toggle' ? this.latched.burst : this.held('burst');
    const i: Intent = {
      ...NO_INTENT,
      forward,
      hold: this.held('easeOff'),
      turn,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      rise: this.held('rise'),
      dive: this.held('dive'),
      burst,
      action: this.held('act'),
      actionPressed: this.pressed.has('act'),
      risePressed: this.pressed.has('rise'),
      burstPressed: this.pressed.has('burst'),
    };
    this.mouseX = 0;
    this.mouseY = 0;
    this.pressed.clear();
    return i;
  }

  private forwardKeyDown(): boolean {
    return bindings().forward.some((c) => this.down.has(c));
  }

  clear(): void {
    this.down.clear();
    this.pressed.clear();
    this.latched.forward = this.latched.burst = false;
    this.mouseX = this.mouseY = 0;
    this.keyTurn = 0;
  }
}
