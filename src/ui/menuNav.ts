/**
 * Keyboard and gamepad navigation through every menu drawn in #screen: arrow keys (or the D-pad and
 * left stick) move focus to the nearest control in that direction, Enter (or A) chooses, and Esc
 * (or B) goes back one level by pressing the screen's Back button. While the player is using keys or
 * a pad, a new screen focuses its first choice, and a screen redrawn in place (an option changed)
 * keeps focus on the same control. Mouse users see no focus ring until they press a key.
 */
import { PAD, pollPad } from '../input/gamepad';
import { MENU_NAV } from './menuNavConfig';

export type NavDir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
/** Attributes that name the same control after a screen is redrawn. */
const KEY_ATTRS = ['id', 'data-opt', 'data-quality', 'data-settings-tab', 'data-gore', 'data-bind', 'data-preset', 'data-habitat', 'data-lineage', 'data-journal-page'];

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The index of the box nearest `from` in direction `dir`, or -1 if there is none. Distance along the
 * direction counts once, distance across it twice, so a control straight below beats one diagonally closer.
 */
export function nearestInDirection(from: Box, boxes: readonly Box[], dir: NavDir): number {
  const cx = (b: Box) => (b.left + b.right) / 2;
  const cy = (b: Box) => (b.top + b.bottom) / 2;
  const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    let along: number;
    let across: number;
    if (dir === 'down' || dir === 'up') {
      along = dir === 'down' ? cy(b) - cy(from) : cy(from) - cy(b);
      if (along <= MENU_NAV.minStep || (dir === 'down' ? b.top <= from.top : b.bottom >= from.bottom)) return;
      across = gap(from.left, from.right, b.left, b.right);
    } else {
      along = dir === 'right' ? cx(b) - cx(from) : cx(from) - cx(b);
      if (along <= MENU_NAV.minStep || (dir === 'right' ? b.left <= from.left : b.right >= from.right)) return;
      across = gap(from.top, from.bottom, b.top, b.bottom);
    }
    const score = along + across * MENU_NAV.acrossWeight;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && !el.closest('[hidden]');
}

function keyOf(el: Element): string {
  for (const a of KEY_ATTRS) {
    const v = el.getAttribute(a);
    if (v) return `${a}=${v}`;
  }
  return `text=${el.textContent ?? ''}`;
}

export class MenuNav {
  /** The last input came from keys or a pad (not the mouse). */
  private keyboard = false;
  private lastKey = '';
  private padHeld: NavDir | 'a' | 'b' | null = null;
  private padRepeatAt = 0;
  private padActive = false;

  /** `root` is #screen. Navigation runs only while `active()` says a menu is up (not in play or photo mode). */
  constructor(
    private readonly root: HTMLElement,
    private readonly active: () => boolean,
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e));
    const mouse = () => (this.keyboard = false);
    window.addEventListener('pointerdown', mouse, true);
    window.addEventListener('pointermove', (e) => (e.movementX || e.movementY) && mouse(), true);
    root.addEventListener('focusin', (e) => {
      if (e.target instanceof Element) this.lastKey = keyOf(e.target);
    });
    new MutationObserver(() => this.afterRedraw()).observe(root, { childList: true, subtree: true });
    const poll = () => {
      this.pollPad(performance.now());
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  /** Every control a player can reach on the current screen, in page order. */
  controls(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  }

  /** Press the screen's Back button (Esc / B). Returns false if the screen has none. */
  back(): boolean {
    const vis = (sel: string) => [...this.root.querySelectorAll<HTMLButtonElement>(sel)].filter((b) => visible(b) && !b.disabled);
    const btn = vis('[data-back]').at(-1) ?? vis('button[id$="-back"]').at(-1) ?? vis('button').filter((b) => b.textContent?.trim() === 'Back').at(-1);
    if (!btn) return false;
    btn.click();
    return true;
  }

  /** Move focus one step in a direction (focusing the screen's first choice if nothing is focused yet). */
  move(dir: NavDir): void {
    this.keyboard = true;
    const all = this.controls();
    const cur = document.activeElement as HTMLElement | null;
    const i = cur ? all.indexOf(cur) : -1;
    if (i < 0) return this.focusDefault();
    const others = all.filter((_, j) => j !== i);
    const k = nearestInDirection(cur!.getBoundingClientRect(), others.map((o) => o.getBoundingClientRect()), dir);
    const next = k >= 0 ? others[k] : all[i + (dir === 'down' || dir === 'right' ? 1 : -1)];
    next?.focus();
  }

  private focusDefault(): void {
    const all = this.controls();
    const pick = all.find((e) => e.hasAttribute('autofocus')) ?? all.find((e) => e.getAttribute('aria-selected') === 'true') ?? all.find((e) => e.classList.contains('primary')) ?? all[0];
    pick?.focus();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active()) return;
    const dirs: Record<string, NavDir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const dir = dirs[e.key];
    if (!dir) {
      if (e.key === 'Enter' || e.key === 'Tab') this.keyboard = true;
      return;
    }
    const t = e.target as HTMLElement | null;
    const type = t instanceof HTMLInputElement ? t.type : '';
    // Sliders and text fields keep left and right for themselves.
    if ((type === 'range' || type === 'text') && (dir === 'left' || dir === 'right')) return;
    e.preventDefault();
    this.move(dir);
  }

  /** A screen was drawn or redrawn: keep (or give) keyboard focus. */
  private afterRedraw(): void {
    if (!this.keyboard || !this.active()) return;
    const cur = document.activeElement;
    if (cur && cur !== document.body && this.root.contains(cur)) return;
    const same = this.controls().find((el) => keyOf(el) === this.lastKey);
    if (same) same.focus();
    else this.focusDefault();
  }

  private pollPad(now: number): void {
    const p = this.active() && !document.body.classList.contains('photo-mode') ? pollPad() : null;
    if (!p) {
      this.padActive = false;
      return;
    }
    const b = (i: number) => !!p.snap.buttons[i]?.pressed;
    const [x = 0, y = 0] = p.snap.axes;
    const s = MENU_NAV.stick;
    const held: NavDir | 'a' | 'b' | null =
      b(PAD.up) || y < -s ? 'up' : b(PAD.down) || y > s ? 'down' : b(PAD.left) || x < -s ? 'left' : b(PAD.right) || x > s ? 'right' : b(PAD.a) ? 'a' : b(PAD.b) ? 'b' : null;
    // A button still held from play when a menu opens (a burst as the fish died) is not a menu press.
    if (!this.padActive) {
      this.padActive = true;
      this.padHeld = held;
      return;
    }
    const fresh = held !== this.padHeld;
    const repeat = !fresh && held && held !== 'a' && held !== 'b' && now >= this.padRepeatAt;
    this.padHeld = held;
    if (!held || (!fresh && !repeat)) return;
    this.padRepeatAt = now + (fresh ? MENU_NAV.repeatDelay : MENU_NAV.repeatEvery);
    this.keyboard = true;
    if (held === 'a') {
      const cur = document.activeElement as HTMLElement | null;
      if (cur && this.root.contains(cur) && cur !== this.root) cur.click();
      else this.focusDefault();
    } else if (held === 'b') this.onBack();
    else this.move(held);
  }

  /** Called for the pad's B button; App sets it to the same handler as Esc. */
  onBack: () => void = () => void this.back();
}
