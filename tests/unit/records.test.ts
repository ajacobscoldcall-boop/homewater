import { describe, expect, it } from 'vitest';
import { advanceGeneration, foundFromStray, foundLineage, lineageName, markExtinct, offerOffspring, recordLife, strayRescue, type LifeRecord, type Lineage } from '../../src/sim/lineage';
import { hallOfRecords, lineageScore, summarize, traitDrift, traitHistory, yearTally } from '../../src/sim/records';
import { TRAIT_IDS } from '../../src/sim/types';
import { params } from './helpers';

const p = params();

function rec(l: Lineage, o: Partial<LifeRecord> = {}): LifeRecord {
  const f = l.current;
  return {
    fishId: f.id,
    name: f.name,
    sex: f.sex,
    generation: f.generation,
    isJack: f.sex === 'M' ? false : null,
    oceanYears: 2,
    adultSize: 1,
    conditions: l.conditions,
    deaths: [],
    spawned: true,
    result: { eggs: 3000, young: 30, relativeFitness: 1, detail: '' },
    isStray: f.isStray,
    lockedJack: f.lockedJack,
    bv: { ...f.bv },
    habitat: f.habitat,
    offspring: [],
    chosenId: null,
    ...o,
  };
}

/** Play n generations: each spawns with the given fitness, the first offspring carries on. */
function grow(seed: number, n: number, fit: (g: number) => number, difficulty: 'fieldGuide' | 'wild' = 'fieldGuide'): Lineage {
  const l = foundLineage(p, { preset: 'quick', sex: 'F', name: `Founder${seed}`, difficulty, seed });
  for (let g = 1; g <= n; g++) {
    recordLife(l, rec(l, { result: { eggs: 1000 * g, young: 10, relativeFitness: fit(g), detail: '' }, adultSize: 0.8 + g * 0.05 }));
    const kids = offerOffspring(p, l, l.current);
    if (g < n) advanceGeneration(p, l, kids[0]!, `Kid${seed}-${g}`);
  }
  return l;
}

describe('lineage records', () => {
  it('scores persistence and fitness, capping one lucky spawn', () => {
    const l = grow(1, 3, () => 1);
    expect(lineageScore(p, l)).toEqual({ spawns: 300, fitness: 300, total: 600 });
    const lucky = grow(2, 1, () => 50);
    expect(lineageScore(p, lucky).fitness).toBe(p.get('lineage.score.fitnessCap') * p.get('lineage.score.perFitness'));
    const failed = foundLineage(p, { preset: 'quick', sex: 'F', name: 'X', difficulty: 'wild', seed: 3 });
    recordLife(failed, rec(failed, { spawned: false, result: null, deaths: [{ name: 'X', stage: 'egg', cause: 'silt' }] }));
    expect(lineageScore(p, failed).total).toBe(0);
  });

  it('summarizes a line: generations, eggs, best and largest fish', () => {
    const l = grow(4, 4, (g) => (g === 2 ? 2.5 : 0.5));
    const s = summarize(l);
    expect(s.generations).toBe(4);
    expect(s.spawned).toBe(4);
    expect(s.totalEggs).toBe(1000 + 2000 + 3000 + 4000);
    expect(s.bestFish?.generation).toBe(2);
    expect(s.largestFish?.generation).toBe(4);
    expect(s.mostEggsFish?.generation).toBe(4);
    expect(lineageName(l)).toBe('Founder4');
  });

  it('finds records across lineages, per difficulty, counting duplicates once', () => {
    const a = grow(5, 5, () => 1);
    const b = grow(6, 2, () => 2, 'wild');
    const hall = hallOfRecords(p, [a, b, a]);
    expect(hall.longestLine?.lineage).toBe('Founder5');
    expect(hall.longestLine?.value).toBe(5);
    expect(hall.byDifficulty.wild?.lineage).toBe('Founder6');
    expect(hall.byDifficulty.fieldGuide?.value).toBe(5);
    expect(hall.mostEggs?.value).toBe(5000);
    expect(hall.mostJacks).toBeNull();
    expect(hallOfRecords(p, []).longestLine).toBeNull();
  });

  it('counts jacks', () => {
    const l = grow(7, 2, () => 1);
    l.records[0]!.isJack = true;
    l.records[0]!.sex = 'M';
    expect(summarize(l).jacks).toBe(1);
    expect(hallOfRecords(p, [l]).mostJacks?.value).toBe(1);
  });
});

describe('trait history', () => {
  it('averages the brood each played fish was chosen from', () => {
    const l = grow(8, 3, () => 1);
    const hist = traitHistory(l);
    expect(hist.map((h) => h.generation)).toEqual([1, 2, 3]);
    expect(hist[0]!.n).toBe(1);
    expect(hist[1]!.n).toBe(p.get('lineage.offspringChoices'));
    const brood = l.records[0]!.offspring;
    expect(hist[1]!.mean.size).toBeCloseTo(brood.reduce((a, o) => a + o.bv.size, 0) / brood.length, 10);
    const drift = traitDrift(hist);
    for (const t of TRAIT_IDS) expect(drift[t]).toBeCloseTo(hist[2]!.mean[t] - hist[0]!.mean[t], 10);
  });

  it('marks the chosen offspring and keeps the unchosen', () => {
    const l = grow(9, 2, () => 1);
    const first = l.records[0]!;
    expect(first.offspring).toHaveLength(p.get('lineage.offspringChoices'));
    expect(first.chosenId).toBe(l.records[1]!.fishId);
    expect(first.offspring.find((o) => o.id === first.chosenId)?.name).toBe('Kid9-1');
  });

  it('skips generations without trait data (old saves) and starts strays afresh', () => {
    const l = grow(10, 3, () => 1);
    l.records[0]!.bv = null;
    l.records[0]!.offspring = [];
    l.records[1]!.offspring = [];
    l.records[1]!.bv = null;
    expect(traitHistory(l).map((h) => h.generation)).toEqual([3]);
    const s = grow(11, 1, () => 1);
    recordLife(s, rec(s, { spawned: false, result: null }));
    strayRescue(p, s, 'Wanderer');
    recordLife(s, rec(s));
    const hist = traitHistory(s);
    expect(hist.at(-1)!.n).toBe(1);
    expect(hist.at(-1)!.mean.size).toBeCloseTo(s.records.at(-1)!.bv!.size, 10);
  });

  it('tallies the kinds of year a line lived through', () => {
    const t = yearTally([
      { flow: 1, temperature: 1.3, oceanCrowding: 1, runSize: 1 },
      { flow: 1, temperature: 1.3, oceanCrowding: 1.2, runSize: 1 },
      { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 },
    ]);
    expect(t).toEqual({ 'year.warm': 2, 'year.crowded': 1, 'year.ordinary': 1 });
  });
});

describe('a stray from this river', () => {
  it('founds a new line in the same river and difficulty, naming the line it follows', () => {
    const dead = grow(12, 2, () => 1, 'wild');
    markExtinct(dead);
    const l = foundFromStray(p, dead, 777, 'Drift');
    expect(l.id).not.toBe(dead.id);
    expect(l.generation).toBe(1);
    expect(l.current.isStray).toBe(true);
    expect(l.current.habitat).toBe(dead.current.habitat);
    expect(l.difficulty).toBe('wild');
    expect(l.ancestor).toEqual({ id: dead.id, name: 'Founder12' });
    expect(l.records).toEqual([]);
  });
});
