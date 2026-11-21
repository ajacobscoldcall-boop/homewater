/**
 * The fry's lake days (src/sim/stages/fry.ts): the day's light and plankton, warm and cold water,
 * a Dolly Varden's sight in the dark and the deep, and mergansers from above.
 */
import { describe, expect, it } from 'vitest';
import { fryDay, fryView, lightAtDepth, warmWater } from '../../src/sim/stages/fry';
import { fryDaySky } from '../../src/render/lakeDay';
import type { Intent } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { intent, newWorld, params, run, steerTo } from './helpers';

const SEC = 60;
const p = params();

/** A lived summer straight away: the second summer's checkpoint, with the predators cleared unless asked for. */
function summer(seed: number, keep: 'none' | 'char' | 'all' = 'none'): World {
  const { w } = newWorld({ startStage: 1, seed });
  w.restore({ stageIndex: 1, marker: 2, progress: { ...w.progress, fryBites: 12, fryRichBites: 5 } });
  if (keep === 'none') for (const t of w.live('trout')) t.alive = false;
  return w;
}

function holdAt(w: World, y: number, x = 0): Intent {
  const dy = y - w.body.pos.y;
  const far = Math.hypot(w.body.pos.x - x, w.body.pos.z) > 2;
  return steerTo(w, x, 0, { forward: far ? 0.6 : 0, rise: dy > 0.4, dive: dy < -0.4 });
}

describe('a lake day', () => {
  it('runs dawn, day, dusk, night, with the light and the plankton following', () => {
    const seq: string[] = [];
    for (let c = 0; c < 1; c += 0.01) {
      const d = fryDay(p, c);
      if (seq[seq.length - 1] !== d.tod) seq.push(d.tod);
    }
    expect(seq).toEqual(['dawn', 'day', 'dusk', 'night']);
    const mid = (tod: string) => {
      let best = 0;
      for (let c = 0; c < 1; c += 0.001) if (fryDay(p, c).tod === tod) best = c;
      return fryDay(p, best - 0.02);
    };
    expect(mid('day').light).toBe(1);
    expect(mid('day').sunk).toBe(1);
    expect(mid('night').light).toBeLessThan(0.2);
    expect(mid('night').sunk).toBe(0);
    // Days repeat.
    expect(fryDay(p, 1.3)).toEqual(fryDay(p, 0.3));
  });

  it('the sky blends day to dusk, then dusk to night with stars', () => {
    expect(fryDaySky(1, 0.5, 0.14)).toEqual({ from: 'day', to: 'dusk', k: 0 });
    expect(fryDaySky(0.5, 0.5, 0.14)).toEqual({ from: 'day', to: 'dusk', k: 1 });
    const night = fryDaySky(0.14, 0.5, 0.14);
    expect(night.to).toBe('night');
    expect(night.k).toBeCloseTo(1);
  });

  it('light falls with depth, and the water is warm near the surface and over the shallows', () => {
    expect(lightAtDepth(p, 1, 8)).toBeLessThan(lightAtDepth(p, 1, 1) * 0.4);
    expect(warmWater(p, 0, 1)).toBe(true);
    expect(warmWater(p, 0, 8)).toBe(false);
    expect(warmWater(p, -25, 5)).toBe(true);
  });

  it('the plankton is deep by day and high at night, and the summer ends after its last night', () => {
    const w = summer(3);
    let dayY = 0;
    let nightY = 0;
    let end = '';
    run(w, 200 * SEC, (ww) => {
      const v = fryView(ww);
      const rich = ww.live('plankton').filter((e) => e.value === 1);
      const y = rich.reduce((s, e) => s + e.pos.y, 0) / Math.max(1, rich.length);
      if (v?.tod === 'day' && rich.length) dayY = y;
      if (v?.tod === 'night' && rich.length) nightY = y;
      if (v && v.phase !== 'second' && !end) end = v.phase;
      return holdAt(ww, -8);
    });
    expect(dayY).toBeLessThan(-5);
    expect(nightY).toBeGreaterThan(-3.5);
    expect(end).toBe('skip');
    const caps = w.events.filter((e) => e.type === 'caption').map((e) => e.key);
    for (const id of ['fry.day', 'fry.dusk', 'fry.night', 'fry.dawn']) expect(caps).toContain(id);
  });

  it('warm water burns growth; the cold deep does not', () => {
    const after = (y: number) => {
      const w = summer(4);
      w.body.pos = { x: 0, y, z: 0 };
      const g0 = fryView(w)!.growth;
      // Keep the birds away so only the water counts.
      run(w, 15 * SEC, (ww) => {
        for (const m of ww.live('merganser')) m.alive = false;
        for (const e of ww.live('plankton')) e.alive = false;
        return holdAt(ww, y);
      });
      return fryView(w)!.growth - g0;
    };
    const warm = after(-1.5);
    const cold = after(-8.5);
    expect(warm).toBeLessThan(-0.01);
    expect(cold).toBeGreaterThan(-1e-9);
  });

  it('a Dolly Varden sees a fry from farther near the surface by day than in the deep or at night', () => {
    const w = summer(5);
    w.body.pos = { x: 0, y: -1, z: 0 };
    const top = fryView(w)!.charSight;
    w.body.pos = { x: 0, y: -9, z: 0 };
    const deep = fryView(w)!.charSight;
    expect(deep).toBeLessThan(top * 0.5);
    expect(top).toBeGreaterThan(7);
  });
});

const captionsOf = (w: World): string[] => w.events.filter((e) => e.type === 'caption').map((e) => e.key ?? '');

describe('mergansers over the lake', () => {
  it('come to a fry that lingers near the surface by day, and catch one that stays there', () => {
    let caught = 0;
    let came = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = summer(seed);
      run(w, 40 * SEC, (ww) => {
        if (ww.live('merganser').length) came++;
        return holdAt(ww, -1.5);
      });
      if (w.deathCause === 'merganser') caught++;
    }
    expect(came).toBeGreaterThan(0);
    expect(caught).toBeGreaterThanOrEqual(4);
  });

  it('never come to a fry that keeps deep, and a dive below their reach is the escape', () => {
    let came = 0;
    for (const seed of [1, 2, 3]) {
      const w = summer(seed);
      run(w, 30 * SEC, (ww) => {
        came += ww.live('merganser').length;
        return holdAt(ww, -9);
      });
      expect(w.status).toBe('playing');
    }
    expect(came).toBe(0);
    let escaped = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = summer(seed);
      run(w, 40 * SEC, (ww) => {
        const m = ww.live('merganser')[0];
        // Feed high until a bird shows, then dive deep over open water.
        return m && m.state !== 'leave' ? holdAt(ww, -10, 4) : holdAt(ww, -1.5);
      });
      if (w.status === 'playing' && w.events.some((e) => e.type === 'warning' && e.key === 'merganser')) escaped++;
    }
    expect(escaped).toBeGreaterThanOrEqual(4);
  });

  it('do not hunt at night, and the weeds do not hide a fry from them', () => {
    const w = summer(7);
    // Jump to the night.
    const v = fryView(w)!;
    (w.stage as { clock: number }).clock = Math.floor(v.clock) + 0.83;
    let came = 0;
    run(w, 4 * SEC, (ww) => {
      came += ww.live('merganser').length;
      return intent();
    });
    expect(came).toBe(0);
    expect(fryView(w)!.tod).toBe('night');
    // Over the weed shallows a fry is within reach (on Wild the whole water column; Field guide reaches a little less deep).
    w.body.pos = { x: -25, y: -4.8, z: 0 };
    expect(fryView(w)!.birdReach).toBe(true);
  });
});
