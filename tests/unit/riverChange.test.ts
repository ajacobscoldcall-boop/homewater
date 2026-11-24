import { describe, expect, it } from 'vitest';
import captions from '../../src/data/captions.json';
import journal from '../../src/data/journal.json';
import { makeOffspring, yearEffects } from '../../src/sim/genetics';
import { advanceGeneration, foundFromStray, foundLineage, markExtinct, offerOffspring, peekNextYear, strayRescue, type Lineage } from '../../src/sim/lineage';
import { fisheryCaption, netLinesFor, nextYear, populationCaptions, recapCaptions, seedPopulation, targetCatch } from '../../src/sim/population';
import {
  applyChange,
  changeCaptions,
  hatcheryAt,
  mateShift,
  recruitFactor,
  rollChange,
  setNetsFor,
  siltEggSurvival,
  summarizeChange,
  warmingAt,
  type ChangeYear,
} from '../../src/sim/riverChange';
import { Rng } from '../../src/sim/rng';
import type { YearConditions } from '../../src/sim/types';
import { params } from './helpers';

const p = params();
const plain: YearConditions = { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1, harvestRate: 0.4 };
const CAPS = (captions as { captions: Record<string, string> }).captions;

const found = (seed: number, riverMode?: 'healthy' | 'changing') =>
  foundLineage(p, { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed, ...(riverMode ? { riverMode } : {}) });

/** Advance a line `gens` generations with the first offspring each time. */
function grow(l: Lineage, gens: number): Lineage {
  for (let g = 0; g < gens; g++) {
    const kids = offerOffspring(p, l, l.current);
    advanceGeneration(p, l, kids[0]!, `K${g}`);
  }
  return l;
}

describe('the changing river: trends', () => {
  it('the first life meets the river as it was; warming then rises steadily to its cap', () => {
    expect(warmingAt(p, 1)).toBe(0);
    let last = 0;
    for (let age = 2; age < 40; age++) {
      const w = warmingAt(p, age);
      expect(w).toBeGreaterThanOrEqual(last);
      last = w;
    }
    expect(last).toBeCloseTo(p.get('change.warmingMax'), 9);
    expect(warmingAt(p, 2)).toBeCloseTo(p.get('change.warmingRate'), 9);
  });

  it('hatchery strays join from their start generation and build up to a cap', () => {
    const start = p.get('change.hatcheryStart');
    expect(hatcheryAt(p, start - 1)).toBe(0);
    expect(hatcheryAt(p, start)).toBeGreaterThan(0);
    expect(hatcheryAt(p, 100)).toBeCloseTo(p.get('change.hatcheryMax'), 9);
  });

  it('silt years come at about their chance once they can start, never before', () => {
    const rng = new Rng(3);
    let silt = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (rollChange(p, rng, { age: 5, warming: 0, silt: false, hatchery: 0, setNets: 0, goalShift: 0 }, 1).silt) silt++;
    expect(silt / n).toBeCloseTo(p.get('change.siltChance'), 1);
    expect(rollChange(p, new Rng(1), undefined, 1).silt).toBe(false);
  });

  it('the fishery grows, and eases off after a small run', () => {
    const grown: ChangeYear = { age: 4, warming: 0, silt: false, hatchery: 0, setNets: 0, goalShift: 0 };
    expect(rollChange(p, new Rng(1), grown, 1).goalShift).toBeCloseTo(p.get('change.goalShift'), 9);
    expect(rollChange(p, new Rng(1), grown, p.get('change.closeBelow') - 0.01).goalShift).toBe(0);
    expect(rollChange(p, new Rng(1), undefined, 1).goalShift).toBe(0);
  });
});

describe('the changing river: effects', () => {
  const changed: ChangeYear = { age: 6, warming: 0.15, silt: true, hatchery: 0.2, setNets: 2, goalShift: 0.08 };

  it('warming is added to the year temperature, so yearEffects and the return water warm with it', () => {
    const c = applyChange(plain, changed);
    expect(c.temperature).toBeCloseTo(1.15, 9);
    expect(c.warming).toBe(0.15);
    const fish = found(1).current;
    expect(yearEffects(p, fish, c).temperature).toBeGreaterThan(yearEffects(p, fish, plain).temperature);
  });

  it('silt lowers egg survival on the grounds; a healthy year leaves it alone', () => {
    expect(siltEggSurvival(p, plain)).toBe(1);
    expect(siltEggSurvival(p, applyChange(plain, changed))).toBeCloseTo(p.get('change.siltEggSurvival'), 9);
  });

  it('hatchery parents, silt and warm water each cost the run; none of them costs nothing', () => {
    expect(recruitFactor(p, undefined, undefined)).toBe(1);
    expect(recruitFactor(p, { ...changed, silt: false, hatchery: 0 }, { ...changed, warming: 0 })).toBe(1);
    expect(recruitFactor(p, { ...changed, silt: false, hatchery: 0.3 }, undefined)).toBeLessThan(1);
    expect(recruitFactor(p, { ...changed, hatchery: 0 }, undefined)).toBeCloseTo(p.get('change.siltRecruit'), 9);
    expect(recruitFactor(p, undefined, changed)).toBeLessThan(1);
  });

  it('set nets come in big open runs, not small ones, and add to the managed nets', () => {
    expect(setNetsFor(p, changed, 1)).toBe(0);
    expect(setNetsFor(p, changed, 0.5)).toBe(0);
    expect(setNetsFor(p, changed, 3)).toBe(p.get('change.setNetLines'));
    expect(setNetsFor(p, { ...changed, goalShift: 0 }, 3)).toBe(0);
    const base = p.get('return.netLines');
    expect(netLinesFor(p, { ...plain, setNets: 2 }, base)).toBe(netLinesFor(p, plain, base) + 2);
    // A closed fishery stays closed: no set nets either.
    expect(netLinesFor(p, { ...plain, harvestRate: 0, setNets: 2 }, base)).toBe(0);
    // The fishery line on the card still describes the managed fishery.
    expect(fisheryCaption(p, { ...plain, setNets: 2 })).toBe(fisheryCaption(p, plain));
  });

  it('a lowered goal takes more of a run', () => {
    expect(targetCatch(p, 1, 0.08)).toBeGreaterThan(targetCatch(p, 1));
  });

  it('a mate from a run with hatchery strays homes less faithfully; a healthy run draws nothing', () => {
    const rng = new Rng(5);
    const before = rng.state;
    expect(mateShift(p, rng, plain)).toEqual({});
    expect(rng.state).toBe(before);
    const shift = mateShift(p, new Rng(5), applyChange(plain, changed));
    expect(shift.homing).toBeCloseTo(-0.2 * p.get('change.hatcheryHoming'), 9);
    // Offspring of a fish whose mates carry it: lower homing on average.
    const parent = found(2).current;
    const avg = (s: Partial<Record<'homing', number>>) => {
      const r = new Rng(9);
      let sum = 0;
      for (let i = 0; i < 300; i++) for (const k of makeOffspring(p, r, parent, 3, () => 'x', s)) sum += k.bv.homing;
      return sum / 900;
    };
    expect(avg({ homing: -0.5 })).toBeLessThan(avg({}) - 0.15);
  });
});

describe('the changing river: lineages', () => {
  it('a healthy line rolls exactly as before: no change fields and the same years', () => {
    const a = found(11);
    const b = found(11, 'healthy');
    expect(a.riverMode).toBe('healthy');
    expect(b.conditions).toEqual(a.conditions);
    grow(a, 5);
    expect(a.population.history.every((y) => y.change === undefined)).toBe(true);
    expect(a.conditions.warming).toBeUndefined();
    expect(a.conditions.silt).toBeUndefined();
  });

  it('a changing line warms over the generations and keeps its change in the run history', () => {
    const l = grow(found(12, 'changing'), 8);
    const changes = l.population.history.filter((y) => y.generation >= 1).map((y) => y.change);
    expect(changes.length).toBe(9);
    expect(changes.every((c) => c !== undefined)).toBe(true);
    expect(changes[0]!.age).toBe(1);
    expect(changes.at(-1)!.age).toBe(9);
    // Years before the line began did not change.
    expect(l.population.history.filter((y) => y.generation < 1).every((y) => y.change === undefined)).toBe(true);
    expect(l.conditions.warming).toBeCloseTo(warmingAt(p, 9), 9);
    expect(l.conditions.hatchery).toBeGreaterThan(0);
  });

  it('the coming year shown on the offspring cards is the year the line then lives', () => {
    const l = grow(found(13, 'changing'), 4);
    const kids = offerOffspring(p, l, l.current);
    const peek = peekNextYear(p, l);
    advanceGeneration(p, l, kids[1]!, 'Next');
    expect(l.conditions).toEqual(peek);
  });

  it('a stray rescue and a stray line in the same river keep the river changing', () => {
    const l = grow(found(14, 'changing'), 3);
    strayRescue(p, l, 'Stray');
    expect(l.population.history.at(-1)!.change!.age).toBe(5);
    markExtinct(l);
    const next = foundFromStray(p, l, 99, 'Wanderer');
    expect(next.riverMode).toBe('changing');
    expect(next.population.history.at(-1)!.change!.age).toBe(6);
  });

  it('on average the changing river shrinks the run compared with the healthy one', () => {
    const avgRun = (mode: 'healthy' | 'changing') => {
      let sum = 0;
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const rng = new Rng(seed);
        const pop = seedPopulation(p, rng);
        for (let g = 1; g <= 12; g++) {
          const c = nextYear(p, rng, pop, g, mode);
          if (g > 6) {
            sum += c.runSize * (1 - (c.hatchery ?? 0));
            n++;
          }
        }
      }
      return sum / n;
    };
    expect(avgRun('changing')).toBeLessThan(avgRun('healthy') * 0.9);
  });

  it('summarizes what has changed since the line began', () => {
    const l = grow(found(15, 'changing'), 6);
    const sum = summarizeChange(
      p,
      l.population.history.filter((y) => y.generation >= 1).map((y) => y.change),
    )!;
    expect(sum.generations).toBe(7);
    expect(sum.warmerC).toBeCloseTo(warmingAt(p, 7) * p.get('return.water.yearTemp'), 9);
    expect(sum.hatchery).toBeCloseTo(hatcheryAt(p, 7), 9);
    expect(summarizeChange(p, [undefined])).toBeNull();
  });
});

describe('the changing river: what the player is told', () => {
  const changed = applyChange(plain, { age: 6, warming: 0.15, silt: true, hatchery: 0.2, setNets: 2, goalShift: 0.08 });

  it('each change has a caption and a card line, shown on the stage where it matters', () => {
    expect(changeCaptions(p, 'return', changed)).toEqual(['change.warming', 'change.setNets']);
    expect(changeCaptions(p, 'egg', changed)).toEqual(['change.silt']);
    expect(changeCaptions(p, 'spawn', changed)).toEqual(['change.silt', 'change.hatchery']);
    expect(changeCaptions(p, 'fry', changed)).toEqual([]);
    expect(changeCaptions(p, null, plain)).toEqual([]);
    for (const id of changeCaptions(p, null, changed)) {
      expect(CAPS[id], id).toBeTruthy();
      expect(CAPS[`card.${id}`], `card.${id}`).toBeTruthy();
    }
    expect(populationCaptions(p, 'return', changed)).toContain('change.setNets');
    expect(recapCaptions(p, changed)).toContain('change.hatchery');
  });

  it('the changes unlock the journal entry', () => {
    const e = (journal as { entries: { id: string; unlock: string[] }[] }).entries.find((x) => x.id === 'spawn.changingRiver')!;
    expect(e.unlock.sort()).toEqual(changeCaptions(p, null, changed).sort());
  });

  it('no player-facing change line names a cause the notes do not support as certain', () => {
    // Careful wording: the hatchery effect on homing is "may"; nothing claims a recorded warming trend.
    expect(CAPS['change.hatchery']).toMatch(/may/);
    for (const id of Object.keys(CAPS).filter((k) => k.startsWith('change.') || k.startsWith('card.change.'))) {
      expect(CAPS[id], id).not.toMatch(/climate|recorded|scientists/i);
    }
  });
});
