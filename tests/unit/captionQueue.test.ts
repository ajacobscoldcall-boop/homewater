import { describe, expect, it } from 'vitest';
import captionsFile from '../../src/data/captions.json';
import { CAPTION_QUEUE, captionTier, GUIDE_CAPTIONS, SHORT_CAPTIONS, WARNING_CAPTIONS, type CaptionTier } from '../../src/app/captionConfig';
import { CaptionQueue, captionShowMs, type CaptionItem, type QueueEvent } from '../../src/app/captionQueue';
import { guideCovers, guideSteps } from '../../src/ui/tutorial';
import type { SpawnRole } from '../../src/sim/stages/spawn';
import type { StageId } from '../../src/sim/types';

const CAPTIONS = (captionsFile as { captions: Record<string, string> }).captions;

const item = (id: string, tier: CaptionTier, at: number, text = 'x'.repeat(40)): CaptionItem => ({ id, vars: {}, tier, text, at });
const shown = (evs: QueueEvent[]) => evs.filter((e) => e.type === 'show').map((e) => e.item.id);
const journaled = (evs: QueueEvent[]) => evs.filter((e) => e.type === 'journal').map((e) => e.item.id);

/** Run the queue from `from` to `to` ms in frame steps, collecting every event. */
function run(q: CaptionQueue, from: number, to: number, step = 16): QueueEvent[] {
  const out: QueueEvent[] = [];
  for (let t = from; t <= to; t += step) out.push(...q.tick(t));
  return out;
}

describe('caption queue', () => {
  it('shows one caption at a time, in priority order: warnings, then guide lines, then science', () => {
    const q = new CaptionQueue();
    q.push(item('sci', 'science', 0), 0);
    q.push(item('guide', 'guide', 0), 0);
    q.push(item('warn', 'warning', 0), 0);
    const evs = q.tick(0);
    expect(shown(evs)).toEqual(['warn']);
    expect(q.current?.id).toBe('warn');
    expect(q.waiting.map((w) => w.id)).toEqual(['guide', 'sci']);
    const later = run(q, 16, 20000);
    expect(shown(later)).toEqual(['guide', 'sci']);
    // Never two on screen: every show after the first follows a hide.
    let on = 1;
    for (const e of later) {
      if (e.type === 'hide') on--;
      if (e.type === 'show') on++;
      expect(on).toBeLessThanOrEqual(1);
    }
  });

  it('a warning cuts a science line short, and the line comes back if it was barely seen', () => {
    const q = new CaptionQueue();
    q.push(item('sci', 'science', 0), 0);
    q.tick(0);
    q.push(item('warn', 'warning', 500), 500);
    const evs = q.tick(500);
    expect(evs.find((e) => e.type === 'hide')).toMatchObject({ cut: true });
    expect(q.current?.id).toBe('warn');
    expect(q.waiting[0]?.id).toBe('sci');
    // Seen long enough before the cut: it counts as read and does not come back.
    const q2 = new CaptionQueue();
    q2.push(item('sci', 'science', 0), 0);
    q2.tick(0);
    q2.push(item('warn', 'warning', 3000), 3000);
    q2.tick(3000);
    expect(q2.waiting).toHaveLength(0);
  });

  it('a line that would wait too long goes to the journal; a stale warning is dropped', () => {
    const q = new CaptionQueue();
    q.push(item('long', 'guide', 0, 'x'.repeat(300)), 0);
    q.tick(0);
    q.push(item('sci', 'science', 10), 10);
    q.push(item('warn', 'warning', 20), 20);
    // The warning cuts the guide line and shows; the science line waits behind the guide line, which comes back first.
    const evs = run(q, 20, 15000);
    expect(journaled(evs)).toContain('sci');
    expect(shown(evs)).toContain('warn');
    const q2 = new CaptionQueue();
    q2.push(item('w1', 'warning', 0, 'x'.repeat(300)), 0);
    q2.tick(0);
    q2.push(item('w2', 'warning', 0), 0);
    q2.push(item('w3', 'warning', 0), 0);
    const evs2 = run(q2, 0, 10000);
    expect(evs2.some((e) => e.type === 'drop')).toBe(true);
    expect(journaled(evs2)).toHaveLength(0);
  });

  it('a crowded queue sends its lowest, newest line to the journal', () => {
    const q = new CaptionQueue();
    q.push(item('w0', 'warning', 0), 0);
    q.tick(0);
    for (let i = 0; i < CAPTION_QUEUE.maxWaiting; i++) q.push(item(`s${i}`, 'science', i), i);
    q.push(item('g', 'guide', 9), 9);
    const evs = q.tick(10);
    expect(journaled(evs)).toEqual([`s${CAPTION_QUEUE.maxWaiting - 1}`]);
    expect(q.waiting[0]?.id).toBe('g');
  });

  it('ignores a line already showing or waiting', () => {
    const q = new CaptionQueue();
    q.push(item('a', 'science', 0), 0);
    q.tick(0);
    q.push(item('a', 'science', 5), 5);
    q.push(item('b', 'science', 5), 5);
    q.push(item('b', 'science', 6), 6);
    expect(q.waiting.map((w) => w.id)).toEqual(['b']);
  });

  it('with lines waiting, the one showing gives way sooner, but stays long enough to read', () => {
    const q = new CaptionQueue();
    const text = 'x'.repeat(120);
    q.push(item('a', 'science', 0, text), 0);
    q.tick(0);
    const alone = q.stayMs(q.current!);
    expect(alone).toBe(captionShowMs(text));
    q.push(item('b', 'science', 1), 1);
    const busy = q.stayMs(q.current!);
    expect(busy).toBeLessThan(alone);
    expect(busy).toBeGreaterThanOrEqual(CAPTION_QUEUE.minShowMs);
  });

  it('the clock is whatever the caller passes: nothing moves while it stands still (paused)', () => {
    const q = new CaptionQueue();
    q.push(item('a', 'science', 0), 0);
    q.tick(0);
    for (let i = 0; i < 100; i++) expect(q.tick(100)).toEqual([]);
    expect(q.current?.id).toBe('a');
  });
});

describe('caption configuration', () => {
  it('every listed caption exists, and every short line is shorter than its full line', () => {
    for (const id of [...WARNING_CAPTIONS, ...GUIDE_CAPTIONS]) expect(CAPTIONS[id], id).toBeTruthy();
    for (const [id, short] of Object.entries(SHORT_CAPTIONS)) {
      expect(CAPTIONS[id], id).toBeTruthy();
      expect(CAPTIONS[short], short).toBeTruthy();
      expect(CAPTIONS[short]!.length, short).toBeLessThan(CAPTIONS[id]!.length);
      expect(CAPTIONS[short]!.length, short).toBeLessThanOrEqual(110);
      // The same values fill both lines.
      const vars = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(CAPTIONS[short]!), short).toEqual(vars(CAPTIONS[id]!).filter((v) => vars(CAPTIONS[short]!).includes(v)));
    }
  });

  it('a long line in play has a short version, so nothing on screen runs past about two lines', () => {
    const inPlay = Object.keys(CAPTIONS).filter((id) => /^(egg|fry|smolt|ocean|return|spawn|imprint)\./.test(id) && !id.endsWith('.short'));
    for (const id of inPlay) {
      const shown = CAPTIONS[SHORT_CAPTIONS[id] ?? id]!;
      expect(shown.length, id).toBeLessThanOrEqual(115);
    }
  });

  it('tiers', () => {
    expect(captionTier('smolt.bird')).toBe('warning');
    expect(captionTier('egg.ready')).toBe('guide');
    expect(captionTier('fry.intro')).toBe('science');
  });
});

// ---------- The guide and the captions never say the same thing ----------

const STOP = new Set(
  'a an and are as at be before but by for from get go gone has have he her him his if in into is it its keep make more no not now of on one or out over she so than that the then them there they this through to too up us was when where which while will with you your'.split(' '),
);
const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');
const content = (t: string) => new Set(words(t).filter((w) => !STOP.has(w)).map(stem));

/** True if two lines repeat each other: a shared run of four words, or most of their content words in common. */
export function sameMessage(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b).join(' ');
  for (let i = 0; i + 4 <= wa.length; i++) if (` ${wb} `.includes(` ${wa.slice(i, i + 4).join(' ')} `)) return true;
  const ca = content(a);
  const cb = content(b);
  const inter = [...ca].filter((w) => cb.has(w)).length;
  return inter / Math.max(1, Math.min(ca.size, cb.size)) >= 0.5 && inter >= 3;
}

/** The stage a caption can show in. */
function stageOf(id: string): StageId | null {
  const m = /^(egg|fry|smolt|ocean|return|spawn)/.exec(id.replace(/^imprint\./, ''));
  return (m?.[1] as StageId) ?? null;
}

describe('the Field guide and the captions', () => {
  it('detects repeats', () => {
    expect(sameMessage('Wait. An egg can do little but wait for the alevin to hatch.', 'An egg in the gravel. There is little an egg can do but wait.')).toBe(true);
    expect(sameMessage('Wait for the egg to hatch.', 'An egg in the gravel. Cold water seeps between the stones.')).toBe(false);
  });

  it('a guide step and a caption that can show beside it never say the same thing', () => {
    const cases: [StageId, SpawnRole | null][] = [
      ['egg', null],
      ['fry', null],
      ['smolt', null],
      ['ocean', null],
      ['return', null],
      ['spawn', 'female'],
      ['spawn', 'largeMale'],
      ['spawn', 'jack'],
    ];
    const pool = Object.keys(CAPTIONS).filter((id) => !id.endsWith('.short') && stageOf(id));
    const clashes: string[] = [];
    for (const [stage, role] of cases) {
      const steps = guideSteps(stage, role);
      for (const [i, step] of steps.entries()) {
        for (const id of pool.filter((c) => stageOf(c) === stage)) {
          if (guideCovers(stage, role, i, id, captionTier(id) === 'warning')) continue;
          const onScreen = CAPTIONS[SHORT_CAPTIONS[id] ?? id]!;
          if (sameMessage(step.text, onScreen)) clashes.push(`${stage}${role ? `/${role}` : ''} step ${i + 1} "${step.text}" ~ ${id} "${onScreen}"`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
