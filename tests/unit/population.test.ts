import { describe, expect, it } from 'vitest';
import captions from '../../src/data/captions.json';
import { advanceGeneration, foundFromStray, foundLineage, markExtinct, offerOffspring, strayRescue } from '../../src/sim/lineage';
import {
  crowdingSurvival,
  escapementGoal,
  fisheryCaption,
  fishingEffort,
  harvestRate,
  lakeCaption,
  lakeFor,
  netLinesFor,
  nextYear,
  patchSizeFor,
  populationCaptions,
  rickerRun,
  rollCatch,
  rollRun,
  seedPopulation,
  targetCatch,
  type Population,
} from '../../src/sim/population';
import { Rng } from '../../src/sim/rng';
import { fryView } from '../../src/sim/stages/fry';
import { NO_INTENT, type YearConditions } from '../../src/sim/types';
import { World } from '../../src/sim/world';
import { params } from './helpers';

const p = params();
const plain: YearConditions = { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe('stock and recruitment (Ricker)', () => {
  it('an escapement at the goal returns a typical run; none returns none', () => {
    expect(rickerRun(p, escapementGoal(p))).toBeCloseTo(1, 9);
    expect(rickerRun(p, 0)).toBe(0);
  });

  it('more spawners give more recruits at low density, but each spawner produces fewer (density dependence)', () => {
    const g = escapementGoal(p);
    expect(rickerRun(p, g / 2)).toBeLessThan(rickerRun(p, g));
    expect(rickerRun(p, g / 2) / (g / 2)).toBeGreaterThan(rickerRun(p, g) / g);
    // Ricker overcompensation: a very large escapement returns fewer than a moderate one.
    expect(rickerRun(p, 4 * g)).toBeLessThan(rickerRun(p, g));
  });

  it('the yearly noise has mean one, and a crowded (pink) ocean brings fewer home', () => {
    const r = new Rng(7);
    const g = escapementGoal(p);
    const quiet = Array.from({ length: 4000 }, () => rollRun(p, r, g, 1));
    const crowded = Array.from({ length: 4000 }, () => rollRun(p, r, g, 1.15));
    expect(mean(quiet)).toBeGreaterThan(0.93);
    expect(mean(quiet)).toBeLessThan(1.07);
    expect(sd(quiet)).toBeGreaterThan(0.2);
    expect(mean(crowded)).toBeLessThan(mean(quiet));
    expect(crowdingSurvival(p, 1.15)).toBeLessThan(1);
  });
});

describe('the fishery and its escapement goal', () => {
  it('takes nothing from a run below the goal and at most its maximum share of a big run', () => {
    const g = escapementGoal(p);
    expect(targetCatch(p, g * 0.9)).toBe(0);
    expect(targetCatch(p, 1)).toBeCloseTo(1 - g, 9);
    expect(targetCatch(p, 3)).toBeCloseTo(3 * p.get('population.maxHarvestRate'), 9);
    const r = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const run = r.range(0.2, 3);
      const c = rollCatch(p, r, run);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(p.get('population.maxHarvestRate') * run + 1e-9);
    }
  });

  it('fishes harder in big runs, closes in small ones, and leaves a year without a population alone', () => {
    const base = p.get('return.netLines');
    const year = (run: number): YearConditions => ({ ...plain, runSize: run, harvestRate: harvestRate({ run, catch: targetCatch(p, run) }) });
    expect(fishingEffort(p, year(1))).toBeCloseTo(1, 9);
    expect(netLinesFor(p, year(1), base)).toBe(base);
    expect(netLinesFor(p, year(2.5), base)).toBeGreaterThan(base);
    expect(netLinesFor(p, year(0.4), base)).toBe(0);
    expect(netLinesFor(p, plain, base)).toBe(base);
    expect(fisheryCaption(p, year(0.4))).toBe('pop.fisheryClosed');
    expect(fisheryCaption(p, year(2.5))).toBe('pop.fisheryHeavy');
    expect(fisheryCaption(p, year(1))).toBe('pop.fisheryOrdinary');
    expect(fisheryCaption(p, plain)).toBeNull();
  });
});

describe('the lake: crowding and carcasses', () => {
  it('a big parent run enriches the lake but crowds it, so food per fry is lower; a small run the reverse', () => {
    const g = escapementGoal(p);
    const big = lakeFor(p, 2 * g);
    const small = lakeFor(p, 0.5 * g);
    const typical = lakeFor(p, g);
    expect(typical.lakeFood).toBeCloseTo(1, 9);
    expect(big.enrichment).toBeGreaterThan(1);
    expect(big.fry).toBeCloseTo(2, 9);
    expect(big.lakeFood).toBeLessThan(1);
    expect(small.enrichment).toBeLessThan(1);
    expect(small.lakeFood).toBeGreaterThan(1);
    // Modest and bounded.
    expect(lakeFor(p, 20).lakeFood).toBe(p.get('population.minLakeFood'));
    expect(lakeFor(p, 0.001).lakeFood).toBe(p.get('population.maxLakeFood'));
  });

  it('fewer plankton per patch when food per fry is low', () => {
    expect(patchSizeFor(p, plain)).toBe(p.get('fry.patchSize'));
    expect(patchSizeFor(p, { ...plain, lakeFood: 0.7 })).toBeLessThan(patchSizeFor(p, plain));
    expect(patchSizeFor(p, { ...plain, lakeFood: 1.3 })).toBeGreaterThan(patchSizeFor(p, plain));
  });

  it('names the lake on the fry card and the fishery on the return card only', () => {
    const crowded: YearConditions = { ...plain, fryCrowding: 2, lakeFood: 0.8, harvestRate: 0.55 };
    expect(lakeCaption(p, crowded)).toBe('pop.lakeCrowded');
    expect(lakeCaption(p, { ...crowded, fryCrowding: 0.5 })).toBe('pop.lakeRoomy');
    expect(populationCaptions(p, 'fry', crowded)).toEqual(['pop.lakeCrowded']);
    expect(populationCaptions(p, 'return', crowded)).toEqual(['pop.fisheryOrdinary']);
    expect(populationCaptions(p, 'ocean', crowded)).toEqual([]);
    const ids = Object.keys((captions as { captions: Record<string, string> }).captions);
    for (const id of ['pop.lakeCrowded', 'pop.lakeRoomy', 'pop.lakeOrdinary', 'pop.fisheryHeavy', 'pop.fisheryLight', 'pop.fisheryClosed', 'pop.fisheryOrdinary', 'pop.runHistory']) expect(ids).toContain(id);
  });
});

describe('the population over many generations', () => {
  it('carries state: runs follow the escapement, stay around typical, and vary', () => {
    const r = new Rng(11);
    const pop: Population = seedPopulation(p, r);
    const runs: number[] = [];
    for (let g = 1; g <= 3000; g++) runs.push(nextYear(p, r, pop, g).runSize);
    expect(mean(runs)).toBeGreaterThan(0.8);
    expect(mean(runs)).toBeLessThan(1.3);
    expect(sd(runs)).toBeGreaterThan(0.25);
    expect(Math.min(...runs)).toBeGreaterThanOrEqual(p.get('population.minRun'));
    expect(pop.history.length).toBe(p.get('population.historyKept'));
    // Each generation's lake comes from the previous generation's escapement.
    for (let i = 1; i < pop.history.length; i++) expect(pop.history[i]!.parentSpawners).toBeCloseTo(pop.history[i - 1]!.spawners, 12);
  });

  it('is deterministic for a seed', () => {
    const a = foundLineage(p, { preset: 'quick', sex: 'F', name: 'A', difficulty: 'fieldGuide', seed: 21 });
    const b = foundLineage(p, { preset: 'quick', sex: 'F', name: 'A', difficulty: 'fieldGuide', seed: 21 });
    expect(a.population).toEqual(b.population);
    expect(a.conditions).toEqual(b.conditions);
  });
});

describe('lineage and population', () => {
  const found = () => foundLineage(p, { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed: 9 });

  it('a new line meets a history: warm-up runs before generation 1, and the year carries the run and the lake', () => {
    const l = found();
    const warm = p.get('population.warmupGenerations');
    expect(l.population.history.map((y) => y.generation)).toEqual([...Array.from({ length: warm }, (_, i) => i - warm + 1), 1]);
    const now = l.population.history.at(-1)!;
    expect(l.conditions.runSize).toBe(now.run);
    expect(l.conditions.lakeFood).toBe(now.lakeFood);
    expect(l.conditions.fryCrowding).toBe(now.fry);
    expect(l.conditions.harvestRate).toBeCloseTo(harvestRate(now), 12);
  });

  it('each generation advances the run; the player alone does not move it', () => {
    const a = found();
    const b = found();
    const kidA = offerOffspring(p, a, a.current)[0]!;
    const kidB = offerOffspring(p, b, b.current)[0]!;
    // A great spawner and a failed one leave the river's run the same.
    a.records.push({ result: { eggs: 5000, young: 80, relativeFitness: 3, detail: '' } } as never);
    advanceGeneration(p, a, kidA, 'Next');
    advanceGeneration(p, b, kidB, 'Next');
    expect(a.population).toEqual(b.population);
    expect(a.population.history.at(-1)!.generation).toBe(2);
    expect(a.conditions.runSize).toBe(a.population.history.at(-1)!.run);
    strayRescue(p, a, 'Stray');
    expect(a.population.history.at(-1)!.generation).toBe(3);
  });

  it('keeps the pink-salmon alternation in ocean crowding', () => {
    const l = found();
    const even: number[] = [];
    const odd: number[] = [];
    for (let g = 2; g < 200; g++) {
      advanceGeneration(p, l, { ...l.current, id: `k${g}`, generation: g }, `N${g}`);
      (g % 2 === 0 ? even : odd).push(l.conditions.oceanCrowding);
    }
    expect(mean(even)).toBeGreaterThan(mean(odd) + 0.15);
  });

  it('a stray line in the same river inherits the run history', () => {
    const l = found();
    advanceGeneration(p, l, { ...l.current, id: 'k2', generation: 2 }, 'Two');
    markExtinct(l);
    const s = foundFromStray(p, l, 77, 'Stray');
    const old = l.population.history;
    expect(s.population.history.length).toBe(old.length + 1);
    expect(s.population.history.slice(0, -1).map((y) => y.run)).toEqual(old.map((y) => y.run));
    expect(s.population.history.at(-1)!.generation).toBe(1);
    expect(s.population.history.at(-1)!.parentSpawners).toBe(old.at(-1)!.spawners);
  });
});

describe('effects in play', () => {
  const world = (conditions: YearConditions, stage: number) => {
    const l = foundLineage(p, { preset: 'quick', sex: 'F', name: 'T', difficulty: 'fieldGuide', seed: 5 });
    const w = new World(p, { fish: l.current, conditions, difficulty: 'fieldGuide', siblings: 3, seed: 5 });
    w.debugJumpTo(stage);
    return w;
  };

  it('a crowded lake has fewer plankton to share at dusk', () => {
    const atDusk = (c: YearConditions) => {
      const w = world(c, 1);
      // Wait in the weeds through the lesson until the dusk feeding begins.
      for (let i = 0; i < 60 * 90 && fryView(w)?.phase !== 'dusk'; i++) w.step(NO_INTENT);
      expect(fryView(w)?.phase).toBe('dusk');
      return w.live('plankton').length;
    };
    const lean = atDusk({ ...plain, lakeFood: 0.65 });
    const typical = atDusk(plain);
    const rich = atDusk({ ...plain, lakeFood: 1.35 });
    expect(lean).toBeLessThan(typical);
    expect(rich).toBeGreaterThan(typical);
  });

  it('the nets on the approach follow the fishery', () => {
    const lines = (h: number | undefined) => world(h === undefined ? plain : { ...plain, harvestRate: h }, 4).live('netLine').length;
    expect(lines(undefined)).toBe(p.get('return.netLines'));
    expect(lines(0)).toBe(0);
    expect(lines(p.get('population.maxHarvestRate'))).toBeGreaterThan(p.get('return.netLines'));
  });
});
