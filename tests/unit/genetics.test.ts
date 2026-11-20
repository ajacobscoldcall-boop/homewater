import { describe, expect, it } from 'vitest';
import { becomesJack, childBv, express, h2, makeFish, populationBv, yearEffects, yearFavours } from '../../src/sim/genetics';
import { Rng } from '../../src/sim/rng';
import { params } from './helpers';

describe('inheritance', () => {
  it('offspring resemble parents in proportion to heritability', () => {
    const p = params();
    const r = new Rng(99);
    const pairs: [number, number][] = [];
    for (let i = 0; i < 20000; i++) {
      const m = populationBv(p, r);
      const f = populationBv(p, r);
      const mid = (express(p, r, m).size + express(p, r, f).size) / 2;
      const kid = express(p, r, childBv(p, r, m, f)).size;
      pairs.push([mid, kid]);
    }
    const mx = pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
    const my = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length;
    const cov = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
    const vx = pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0);
    // Regression of offspring on mid-parent estimates h2.
    expect(cov / vx).toBeCloseTo(h2(p, 'size'), 1);
  });

  it('keeps population variance stable across generations', () => {
    const p = params();
    const r = new Rng(5);
    let pop = Array.from({ length: 4000 }, () => populationBv(p, r));
    for (let g = 0; g < 5; g++) {
      pop = pop.map(() => childBv(p, r, r.pick(pop), r.pick(pop)));
    }
    const zs = pop.map((bv) => express(p, r, bv).jack);
    const mean = zs.reduce((s, x) => s + x, 0) / zs.length;
    const sd = Math.sqrt(zs.reduce((s, x) => s + (x - mean) ** 2, 0) / zs.length);
    expect(Math.abs(sd - 1)).toBeLessThan(0.08);
  });
});

describe('jack maturation', () => {
  it('matches the habitat base rate in an average population', () => {
    const p = params();
    const r = new Rng(11);
    let jacks = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const fish = makeFish(p, r, { sex: 'M', name: 'x', generation: 1, bv: populationBv(p, r) });
      // Growth spread around a typical fish's growth (the calibration reference).
      const growthPerf = Math.min(1, Math.max(0, p.get('genetics.jackGrowthReference') + r.normal(0, 0.25)));
      if (becomesJack(p, fish, growthPerf)) jacks++;
    }
    const base = p.get('genetics.jackBaseRate.creek');
    expect(jacks / n).toBeGreaterThan(base * 0.6);
    expect(jacks / n).toBeLessThan(base * 1.6);
  });

  it('is more common among sons of jack fathers', () => {
    const p = params();
    const r = new Rng(12);
    const rate = (fatherJackBv: number) => {
      let jacks = 0;
      for (let i = 0; i < 10000; i++) {
        const father = populationBv(p, r);
        father.jack = fatherJackBv;
        const son = makeFish(p, r, { sex: 'M', name: 'x', generation: 2, bv: childBv(p, r, populationBv(p, r), father) });
        if (becomesJack(p, son, 0.5)) jacks++;
      }
      return jacks / 10000;
    };
    expect(rate(2)).toBeGreaterThan(rate(0) * 1.5);
  });

  it('never makes a female a jack, and always honours a locked jack', () => {
    const p = params();
    const r = new Rng(13);
    const bv = populationBv(p, r);
    bv.jack = 4;
    expect(becomesJack(p, makeFish(p, r, { sex: 'F', name: 'x', generation: 1, bv }), 1)).toBe(false);
    bv.jack = -4;
    expect(becomesJack(p, makeFish(p, r, { sex: 'M', name: 'x', generation: 1, bv, lockedJack: true }), 0)).toBe(true);
  });
});

describe('bet hedging: year effects', () => {
  const p = params();
  const fishWith = (runTiming: number, bodyDepth: number) => {
    const f = makeFish(p, new Rng(1), { sex: 'F', name: 'x', generation: 1, bv: populationBv(p, new Rng(2)) });
    f.z.runTiming = runTiming;
    f.z.bodyDepth = bodyDepth;
    return f;
  };
  const year = (o: Partial<{ flow: number; temperature: number; oceanCrowding: number; runSize: number }>) => ({ flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1, ...o });

  it('warm years favour early-run fish; cool years favour late-run fish', () => {
    const early = fishWith(-1.5, 0);
    const late = fishWith(1.5, 0);
    expect(yearEffects(p, early, year({ temperature: 1.3 })).temperature).toBeLessThan(yearEffects(p, late, year({ temperature: 1.3 })).temperature);
    expect(yearEffects(p, late, year({ temperature: 0.8 })).temperature).toBeLessThan(yearEffects(p, early, year({ temperature: 0.8 })).temperature);
  });

  it('high water is harder on early-run and deep-bodied fish; low water exposes deep bodies to bears', () => {
    expect(yearEffects(p, fishWith(-1.5, 0), year({ flow: 1.3 })).flowFactor).toBeGreaterThan(yearEffects(p, fishWith(1.5, 0), year({ flow: 1.3 })).flowFactor);
    expect(yearEffects(p, fishWith(0, 1.5), year({ flow: 1.3 })).thrustFactor).toBeLessThan(1);
    expect(yearEffects(p, fishWith(0, 1.5), year({ flow: 0.7 })).bearReach).toBeGreaterThan(0);
    expect(yearEffects(p, fishWith(0, -1), year({ flow: 0.7 })).bearReach).toBe(0);
  });

  it('describes what each year favours', () => {
    expect(yearFavours(year({}))).toEqual(['year.ordinary']);
    expect(yearFavours(year({ temperature: 1.3, runSize: 1.4 }))).toEqual(['year.warm', 'year.bigRun']);
  });
});
