/**
 * Every message the game puts on screen during play goes out through here:
 * science captions (and their narration), the edge flash, field journal toasts
 * and the Field guide's step prompts. One place, so a later caption queue can
 * replace the simple stacking below without touching the screens.
 */
import type { JournalEntry } from '../ui/journal';
import { showJournalToast } from '../ui/journal';
import { $, h } from '../ui/dom';
import { narrate } from '../ui/narration';
import { caption } from '../ui/text';
import { Guide } from '../ui/tutorial';
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';

/** At most this many captions stay on screen; the oldest goes first. */
const MAX_CAPTIONS = 3;

/** How long a caption stays before fading, by its length, in ms. */
export function captionDuration(text: string): number {
  return Math.min(11000, 3500 + text.length * 45);
}

export type FlashKind = 'on' | 'opening' | 'hit';

/** How long each edge flash lasts, in ms. */
export function flashDuration(kind: FlashKind): number {
  return kind === 'opening' ? 900 : kind === 'hit' ? 280 : 650;
}

export class Messages {
  private captionEls: HTMLElement[] = [];
  private flashTimer = 0;
  /** The Field guide's step-by-step prompts (src/ui/tutorial.ts). */
  readonly guide = new Guide();

  /** Show (and narrate) a caption by its stable ID. Returns the text shown, or null if the ID has none. */
  caption(id: string, vars: Record<string, string | number> = {}, warn = false): string | null {
    const text = caption(id, vars);
    if (!text) return null;
    narrate(id, vars);
    const box = $('hud-captions');
    const el = h('div', { class: `caption${warn ? ' warn' : ''}`, 'data-caption-id': id }, text);
    box.append(el);
    this.captionEls.push(el);
    while (this.captionEls.length > MAX_CAPTIONS) this.captionEls.shift()?.remove();
    const ms = captionDuration(text);
    setTimeout(() => el.classList.add('fade'), ms);
    setTimeout(() => {
      el.remove();
      this.captionEls = this.captionEls.filter((c) => c !== el);
    }, ms + 700);
    return text;
  }

  /** Narration only, for lines shown on a screen rather than as a caption (death screen, end sequence). */
  narrate(id: string, vars: Record<string, string | number> = {}): void {
    narrate(id, vars);
  }

  clearCaptions(): void {
    $('hud-captions').replaceChildren();
    this.captionEls = [];
  }

  /** A short flash at the screen's edges: a warning, a jack's opening, or a hit. */
  flash(kind: FlashKind): void {
    const el = $('flash');
    el.className = kind;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => (el.className = ''), flashDuration(kind));
  }

  /** "New in the field journal" toasts. */
  toast(entries: readonly JournalEntry[]): void {
    showJournalToast(entries);
  }

  guideEvents(w: World, events: readonly SimEvent[]): void {
    this.guide.events(w, events);
  }

  /** Call every frame; `active` is false outside a guided life or when not playing. */
  guideFrame(w: World, dt: number, active: boolean, onSkip: () => void): void {
    this.guide.frame(w, dt, active, onSkip);
  }
}
