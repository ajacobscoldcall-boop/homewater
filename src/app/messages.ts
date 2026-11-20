/**
 * Every message the game puts on screen during play goes out through here:
 * science captions (and their narration), the edge flash, field journal
 * entries and the Field guide's step prompts.
 *
 * Text diet: one caption at a time from a priority queue (src/app/captionQueue.ts:
 * warnings, then lines that say what to do, then science). A line the Field
 * guide already says stays off screen; a line that would wait too long goes to
 * the journal's "This life" page instead. Long lines show a short version
 * with "more". A recorded line plays only for the caption actually shown.
 * New journal entries are batched into one small chip.
 */
import type { JournalEntry } from '../ui/journal';
import { $, h } from '../ui/dom';
import { narrate } from '../ui/narration';
import { caption } from '../ui/text';
import { Guide } from '../ui/tutorial';
import { k } from '../input/bindings';
import type { SimEvent, StageId } from '../sim/types';
import type { World } from '../sim/world';
import { captionTier, SHORT_CAPTIONS } from './captionConfig';
import { CaptionQueue, type CaptionItem, type QueueEvent, type ShownCaption } from './captionQueue';

/** How long a caption stays before fading, by its length, in ms. */
export { captionShowMs as captionDuration } from './captionQueue';

export type FlashKind = 'on' | 'opening' | 'hit';

/** How long each edge flash lasts, in ms. */
export function flashDuration(kind: FlashKind): number {
  return kind === 'opening' ? 900 : kind === 'hit' ? 280 : 650;
}

/** The ID shown on screen for a caption: its short version if it has one (and the short text exists). */
export function screenId(id: string): string {
  const short = SHORT_CAPTIONS[id];
  return short && caption(short) ? short : id;
}

/** One caption line of this life, for the journal's "This life" page. */
export interface LifeLine {
  id: string;
  stage: StageId | null;
  /** The full line. */
  text: string;
  /** shown: on screen; guide: the Field guide said it; missed: it waited too long. */
  how: 'shown' | 'guide' | 'missed';
}

/** At most this many lines are kept for the "This life" page. */
const LOG_MAX = 120;
/** The journal chip stays this long after the last new entry (ms). */
const CHIP_MS = 6500;
const MOUSE_NOTE_KEY = 'homewater.mouseLockSeen';

export class Messages {
  /** The Field guide's step-by-step prompts (src/ui/tutorial.ts). */
  readonly guide = new Guide();
  readonly queue = new CaptionQueue();
  /** Caption lines of the current life, oldest first. */
  log: LifeLine[] = [];
  /** Journal entries unlocked since the journal was last opened (the chip counts them). */
  readonly fresh = new Set<string>();
  /** True while the guide is showing in this life (App sets it). */
  guided: () => boolean = () => false;
  private stage: StageId | null = null;
  /** Milliseconds of play: the caption clock stops while paused or in menus. */
  private clock = 0;
  private flashTimer = 0;
  private chipTimer = 0;
  private chipCount = 0;

  /**
   * Queue a caption by its stable ID. Returns the text that would be shown
   * (the short version if there is one), or null if the ID has no text.
   */
  caption(id: string, vars: Record<string, string | number> = {}): string | null {
    const full = caption(id, vars);
    if (!full) return null;
    const tier = captionTier(id);
    if (this.guided() && this.guide.covers(id, tier === 'warning')) {
      this.addLog(id, full, 'guide');
      return null;
    }
    const text = caption(screenId(id), vars) ?? full;
    this.queue.push({ id, vars, tier, text, at: this.clock }, this.clock);
    this.apply(this.queue.tick(this.clock));
    return text;
  }

  /** The stage the captions belong to (for the log), from App's world. */
  setStage(stage: StageId | null): void {
    this.stage = stage;
  }

  /** Call every frame. The caption clock runs only while `playing`. */
  frame(dtMs: number, playing: boolean): void {
    if (playing) this.clock += dtMs;
    // Captions wait (hidden) under the pause menu and the journal, and carry on when play resumes.
    const box = document.getElementById('hud-captions');
    if (box && box.hidden === playing) box.hidden = !playing;
    this.apply(this.queue.tick(this.clock));
  }

  /** Narration only, for lines shown on a screen rather than as a caption (death screen, end sequence). */
  narrate(id: string, vars: Record<string, string | number> = {}): void {
    narrate(id, vars);
  }

  /** Take every caption off screen (a stage card or a menu). Lines still waiting go to the journal. */
  clearCaptions(): void {
    for (const w of this.queue.waiting) this.toJournal(w);
    this.queue.clear();
    const box = document.getElementById('hud-captions');
    box?.replaceChildren();
  }

  /** A new life: the "This life" page starts empty. */
  newLife(): void {
    this.clearCaptions();
    this.log = [];
  }

  /** A short flash at the screen's edges: a warning, a jack's opening, or a hit. */
  flash(kind: FlashKind): void {
    const el = $('flash');
    el.className = kind;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => (el.className = ''), flashDuration(kind));
  }

  /** New journal entries: one small chip, "3 new journal entries", J to open. */
  toast(entries: readonly JournalEntry[]): void {
    if (!entries.length || typeof document === 'undefined') return;
    for (const e of entries) this.fresh.add(e.id);
    this.chipCount += entries.length;
    const root = document.getElementById('app');
    if (!root) return;
    let chip = document.getElementById('journal-chip');
    if (!chip) {
      chip = h('div', { id: 'journal-chip', 'aria-live': 'polite' });
      root.append(chip);
    }
    const n = this.chipCount;
    chip.replaceChildren(h('b', {}, n === 1 ? `New journal entry: ${entries[0]?.title ?? ''}` : `${n} new journal entries`), h('span', { class: 'chip-key' }, k('journal')));
    chip.className = 'show';
    window.clearTimeout(this.chipTimer);
    this.chipTimer = window.setTimeout(() => this.hideChip(), CHIP_MS);
  }

  /** The journal was opened: the chip goes and its count starts again. */
  journalOpened(): void {
    this.hideChip();
  }

  /** After the journal has shown the new entries. */
  journalSeen(): void {
    this.fresh.clear();
  }

  private hideChip(): void {
    this.chipCount = 0;
    window.clearTimeout(this.chipTimer);
    const chip = document.getElementById('journal-chip');
    if (chip) chip.className = '';
  }

  /** The first time the mouse takes over steering, say what happened and how to get the pointer back. Once per browser. */
  pointerLocked(): void {
    try {
      if (localStorage.getItem(MOUSE_NOTE_KEY)) return;
      localStorage.setItem(MOUSE_NOTE_KEY, '1');
    } catch {
      // Without storage the note shows once per page load.
      if (this.mouseNoteShown) return;
    }
    this.mouseNoteShown = true;
    this.caption('help.mouseLock');
  }
  private mouseNoteShown = false;

  guideEvents(w: World, events: readonly SimEvent[]): void {
    this.guide.events(w, events);
  }

  /** Call every frame; `active` is false outside a guided life or when not playing. */
  guideFrame(w: World, dt: number, active: boolean, onSkip: () => void): void {
    this.guide.frame(w, dt, active, onSkip);
  }

  // ---------- On screen ----------

  private apply(events: QueueEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'show') this.show(ev.item);
      else if (ev.type === 'hide') this.hide(ev.item);
      else if (ev.type === 'journal') this.toJournal(ev.item);
      else this.addLog(ev.item.id, caption(ev.item.id, ev.item.vars) ?? ev.item.text, 'missed');
    }
  }

  private show(c: ShownCaption): void {
    const shownId = screenId(c.id);
    narrate(shownId, c.vars);
    const full = caption(c.id, c.vars) ?? c.text;
    this.addLog(c.id, full, 'shown');
    const box = document.getElementById('hud-captions');
    if (!box) return;
    const text = h('span', { class: 'caption-text' }, c.text);
    const el = h('div', { class: `caption ${c.tier}${c.tier === 'warning' ? ' warn' : ''}`, 'data-caption-id': c.id, 'data-shown-id': shownId }, text);
    if (shownId !== c.id) {
      const more = h('button', { class: 'caption-more', type: 'button', title: 'Show the whole line' }, 'more');
      more.addEventListener('click', () => {
        text.textContent = full;
        more.remove();
        el.classList.add('expanded');
        this.queue.extend(Math.max(0, (full.length - c.text.length) * this.queue.cfg.perCharMs) + 2000);
      });
      el.append(more);
    }
    box.replaceChildren(el);
  }

  private hide(c: ShownCaption): void {
    const box = document.getElementById('hud-captions');
    const el = box?.querySelector<HTMLElement>(`.caption[data-caption-id="${CSS.escape(c.id)}"]`);
    if (!el) return;
    el.classList.add('fade');
    window.setTimeout(() => el.remove(), this.queue.cfg.fadeMs);
  }

  private toJournal(item: CaptionItem): void {
    this.addLog(item.id, caption(item.id, item.vars) ?? item.text, 'missed');
  }

  private addLog(id: string, text: string, how: LifeLine['how']): void {
    const last = this.log.at(-1);
    if (last && last.id === id && last.text === text) {
      if (how === 'shown') last.how = 'shown';
      return;
    }
    this.log.push({ id, stage: this.stage, text, how });
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
  }
}
