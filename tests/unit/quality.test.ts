import { describe, expect, it } from 'vitest';
import { AUTO_DEFAULTS, AutoQuality, type AutoChange } from '../../src/render/autoQuality';
import { Graphics, QUALITY_PRESETS, quality } from '../../src/render/quality';

/** Feed `seconds` of frames at a steady fps; return the changes Auto made. */
function run(a: AutoQuality, fps: number, seconds: number, clock: { t: number }, key: unknown = 0): AutoChange[] {
  const out: AutoChange[] = [];
  const dt = 1 / fps;
  for (let s = 0; s < seconds; s += dt) {
    clock.t += dt;
    const c = a.frame(clock.t, key);
    if (c) out.push(c);
  }
  return out;
}

describe('auto graphics quality', () => {
  it('stays at High when the game runs fast', () => {
    const a = new AutoQuality({ level: 'high', scale: 1 });
    expect(run(a, 60, 30, { t: 0 })).toEqual([]);
    expect(a.level).toBe('high');
  });

  it('ignores the warm-up, then steps down one level per window when slow', () => {
    const a = new AutoQuality({ level: 'high', scale: 1 });
    const clock = { t: 0 };
    // Slow during the warm-up only: nothing happens.
    expect(run(a, 20, AUTO_DEFAULTS.warmup * 0.9, clock)).toEqual([]);
    // Then one window of slow frames: one step.
    const first = run(a, 20, AUTO_DEFAULTS.warmup * 0.1 + AUTO_DEFAULTS.window + 0.05, clock);
    expect(first).toEqual([{ kind: 'level', level: 'medium' }]);
    // The next step needs a fresh warm-up and a full window.
    expect(run(a, 20, AUTO_DEFAULTS.warmup + AUTO_DEFAULTS.window * 0.5, clock)).toEqual([]);
    expect(run(a, 20, AUTO_DEFAULTS.window, clock)).toEqual([{ kind: 'level', level: 'low' }]);
  });

  it('still measures a very slow machine (a frame a second) and steps down', () => {
    const a = new AutoQuality({ level: 'high', scale: 1 });
    expect(run(a, 1, 12, { t: 0 })).toEqual([{ kind: 'level', level: 'medium' }, { kind: 'level', level: 'low' }]);
  });

  it('at Low lowers the resolution scale to a floor, then stops', () => {
    const a = new AutoQuality({ level: 'low', scale: 1 });
    const changes = run(a, 10, 120, { t: 0 });
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((c) => c.kind === 'scale')).toBe(true);
    const scales = changes.map((c) => (c.kind === 'scale' ? c.scale : 1));
    for (let i = 1; i < scales.length; i++) expect(scales[i]!).toBeLessThan(scales[i - 1]!);
    expect(a.scale).toBeCloseTo(AUTO_DEFAULTS.minScale);
    expect(a.atFloor).toBe(true);
    expect(run(a, 10, 30, { t: 1000 })).toEqual([]);
  });

  it('never steps back up: alternating fast and slow spells only ever go down', () => {
    const a = new AutoQuality({ level: 'high', scale: 1 });
    const clock = { t: 0 };
    const all: AutoChange[] = [];
    for (let i = 0; i < 10; i++) all.push(...run(a, i % 2 ? 60 : 30, 6, clock));
    const order = ['high', 'medium', 'low'];
    let last = 0;
    for (const c of all) {
      if (c.kind === 'level') {
        expect(order.indexOf(c.level)).toBeGreaterThan(last);
        last = order.indexOf(c.level);
      }
    }
    // Fast spells keep their level: two levels lost over five slow spells, plus scale steps.
    expect(a.level).toBe('low');
  });

  it('judges by the median, so a few hitches (shader compiles) do not count', () => {
    const a = new AutoQuality({ level: 'high', scale: 1 });
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += i % 20 === 0 ? 0.25 : 1 / 60;
      expect(a.frame(t, 0)).toBeNull();
    }
  });

  it('restarts the warm-up after a pause or a stage change', () => {
    const a = new AutoQuality({ level: 'high', scale: 1 });
    const clock = { t: 0 };
    // Almost a whole warm-up and window of slow frames...
    run(a, 20, AUTO_DEFAULTS.warmup + AUTO_DEFAULTS.window * 0.8, clock);
    // ...then a new stage: measuring starts again, so no step yet.
    expect(run(a, 20, AUTO_DEFAULTS.warmup + AUTO_DEFAULTS.window * 0.8, clock, 1)).toEqual([]);
    // A pause (a gap in frames) also restarts it.
    clock.t += AUTO_DEFAULTS.gap + 1;
    expect(run(a, 20, AUTO_DEFAULTS.warmup + AUTO_DEFAULTS.window * 0.8, clock, 1)).toEqual([]);
    expect(run(a, 20, AUTO_DEFAULTS.window, clock, 1)).toEqual([{ kind: 'level', level: 'medium' }]);
  });
});

describe('graphics presets', () => {
  it('apply to the live quality object and rebuild only when the scene depends on it', () => {
    const g = new Graphics('high');
    expect(quality.level).toBe('high');
    const changes: boolean[] = [];
    g.onChange = (_q, c) => changes.push(c.rebuild);
    g.set('low');
    expect(quality).toEqual(QUALITY_PRESETS.low);
    expect(g.describe()).toBe('Low (80% resolution)');
    g.set('low');
    g.set('medium');
    expect(changes).toEqual([true, true]);
    // High was the context's antialiasing; Low has none, Medium has it.
    expect(g.antialiasPending).toBe(false);
    g.set('low');
    expect(g.antialiasPending).toBe(true);
  });

  it('Auto starts at High without a remembered level, and steps down when slow', () => {
    const g = new Graphics('auto');
    expect(g.describe()).toBe('Auto: High');
    let t = 0;
    for (let i = 0; i < 20 * 5; i++) g.frame((t += 1 / 20), 0);
    expect(quality.level).toBe('medium');
    expect(g.describe()).toBe('Auto: Medium');
  });

  it('Auto can start lower (software GL) when it has no remembered level', () => {
    const g = new Graphics('auto', 'low');
    expect(g.describe()).toBe('Auto: Low (80% resolution)');
    expect(g.contextAntialias).toBe(false);
  });

  it('keep High as the most detailed and Low as the cheapest', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect(high.antialias && high.caustics === 2 && high.floorShading === 'standard').toBe(true);
    expect([low.caustics, medium.caustics]).toEqual([0, 1]);
    expect(low.marineSnow).toBeLessThan(medium.marineSnow);
    expect(medium.marineSnow).toBeLessThan(high.marineSnow);
    expect(low.lightShafts).toBeLessThanOrEqual(medium.lightShafts);
    expect(low.maxPixelRatio * low.resolutionScale).toBeLessThan(high.maxPixelRatio * high.resolutionScale);
    expect([low.envDetail, medium.envDetail, high.envDetail]).toEqual([0, 1, 2]);
    // Low still draws at least half of each school (the simulation keeps them all).
    expect(low.schoolFraction).toBeGreaterThanOrEqual(0.5);
  });
});
