/**
 * One caption at a time, from a priority queue: warnings first, then lines
 * that tell the player what to do, then science. A line that would wait too
 * long goes to the journal instead of the screen (stale warnings are simply
 * dropped). Pure: time comes in as milliseconds of play, nothing touches the
 * DOM, so it is unit tested (tests/unit/captionQueue.test.ts).
 */
import { CAPTION_QUEUE, type CaptionQueueConfig, type CaptionTier } from './captionConfig';

export interface CaptionItem {
  /** The caption ID the sim sent (the full line). */
  id: string;
  vars: Record<string, string | number>;
  tier: CaptionTier;
  /** The text shown on screen (the short line, if the full one has one). */
  text: string;
  /** Play time it was queued, in ms. */
  at: number;
}

export interface ShownCaption extends CaptionItem {
  shownAt: number;
  /** How long it would stay with nothing waiting. */
  durationMs: number;
}

export type QueueEvent =
  | { type: 'show'; item: ShownCaption }
  | { type: 'hide'; item: ShownCaption; cut: boolean }
  | { type: 'journal'; item: CaptionItem; reason: 'waited' | 'crowded' }
  | { type: 'drop'; item: CaptionItem };

const RANK: Record<CaptionTier, number> = { warning: 0, guide: 1, science: 2 };

/** How long a line stays on screen, by its length, in ms. */
export function captionShowMs(text: string, cfg: CaptionQueueConfig = CAPTION_QUEUE): number {
  return Math.min(cfg.maxMs, cfg.baseMs + text.length * cfg.perCharMs);
}

const sameLine = (a: Pick<CaptionItem, 'id' | 'vars'>, b: Pick<CaptionItem, 'id' | 'vars'>) => a.id === b.id && JSON.stringify(a.vars) === JSON.stringify(b.vars);

export class CaptionQueue {
  current: ShownCaption | null = null;
  waiting: CaptionItem[] = [];
  /** No new caption shows before this time (the gap after one fades). */
  private nextAt = 0;
  private events: QueueEvent[] = [];

  constructor(readonly cfg: CaptionQueueConfig = CAPTION_QUEUE) {}

  /** Queue a line. A warning cuts short a lower line on screen. What happened comes out of the next tick. */
  push(item: CaptionItem, now: number): void {
    if ((this.current && sameLine(this.current, item)) || this.waiting.some((w) => sameLine(w, item))) return;
    const cur = this.current;
    if (cur && item.tier === 'warning' && cur.tier !== 'warning') {
      // Cut the line on screen; it comes back first if it had barely been seen.
      this.hide(cur, true);
      if (now - cur.shownAt < this.cfg.requeueUnderMs) this.waiting.unshift({ id: cur.id, vars: cur.vars, tier: cur.tier, text: cur.text, at: now });
      this.nextAt = now; // a warning goes straight up
    }
    this.waiting.push(item);
    this.order();
    while (this.waiting.length > this.cfg.maxWaiting) {
      const out = this.waiting.pop() as CaptionItem; // lowest tier, newest of it last
      this.out(out, 'crowded');
    }
  }

  /** Advance to `now` (ms of play). Returns what changed since the last tick. */
  tick(now: number): QueueEvent[] {
    // Lines that waited too long leave the queue.
    this.waiting = this.waiting.filter((w) => {
      if (now - w.at <= this.cfg.maxWaitMs[w.tier]) return true;
      this.out(w, 'waited');
      return false;
    });
    const cur = this.current;
    if (cur && now >= cur.shownAt + this.stayMs(cur)) {
      this.hide(cur, false);
      this.nextAt = now + this.cfg.gapMs;
    }
    if (!this.current && this.waiting.length && now >= this.nextAt) {
      const next = this.waiting.shift() as CaptionItem;
      const shown: ShownCaption = { ...next, shownAt: now, durationMs: captionShowMs(next.text, this.cfg) };
      this.current = shown;
      this.events.push({ type: 'show', item: shown });
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Keep the line on screen longer (the player asked for "more"). */
  extend(ms: number): void {
    if (this.current) this.current.durationMs += ms;
  }

  /** Clear everything (a new stage or a menu). Nothing goes to the journal. */
  clear(): void {
    this.current = null;
    this.waiting = [];
    this.events = [];
    this.nextAt = 0;
  }

  /** How long the line on screen stays, given what is waiting behind it. */
  stayMs(c: ShownCaption): number {
    if (!this.waiting.length) return c.durationMs;
    const floor = c.tier === 'warning' ? this.cfg.warningMinMs : this.cfg.minShowMs;
    return Math.min(c.durationMs, Math.max(floor, c.durationMs * this.cfg.busyShare));
  }

  private hide(c: ShownCaption, cut: boolean): void {
    this.current = null;
    this.events.push({ type: 'hide', item: c, cut });
  }

  private out(item: CaptionItem, reason: 'waited' | 'crowded'): void {
    this.events.push(item.tier === 'warning' ? { type: 'drop', item } : { type: 'journal', item, reason });
  }

  /** Highest tier first; within a tier, oldest first. */
  private order(): void {
    this.waiting.sort((a, b) => RANK[a.tier] - RANK[b.tier] || a.at - b.at);
  }
}
