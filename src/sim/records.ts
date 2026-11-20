/**
 * Lineage-wide records, the lineage score and the trait history of a line.
 * Pure functions over saved lineages, so the recap, the Lineages page and
 * the extinction screen all show the same numbers.
 */
import { yearFavours } from './genetics';
import { lineageName, type LifeRecord, type Lineage } from './lineage';
import type { Difficulty, Params } from './params';
import { TRAIT_IDS, type TraitId, type TraitValues, type YearConditions } from './types';

/** Lineage score: persistence and fitness. See DESIGN.md, "Score across generations". */
export interface ScoreParts {
  spawns: number;
  fitness: number;
  total: number;
}

export function lineageScore(p: Params, l: Lineage): ScoreParts {
  const perSpawn = p.get('lineage.score.perSpawn');
  const perFitness = p.get('lineage.score.perFitness');
  const cap = p.get('lineage.score.fitnessCap');
  let spawns = 0;
  let fitness = 0;
  for (const r of l.records) {
    if (!r.spawned) continue;
    spawns += 1;
    fitness += Math.min(cap, Math.max(0, r.result?.relativeFitness ?? 0));
  }
  const spawnPts = Math.round(spawns * perSpawn);
  const fitPts = Math.round(fitness * perFitness);
  return { spawns: spawnPts, fitness: fitPts, total: spawnPts + fitPts };
}

export interface LineageSummary {
  id: string;
  name: string;
  difficulty: Difficulty;
  /** Highest generation the line reached (the life in progress counts). */
  generations: number;
  /** Lives that spawned. */
  spawned: number;
  totalEggs: number;
  jacks: number;
  strays: number;
  siblingsLost: number;
  extinct: boolean;
  /** The fish with the highest relative fitness, if any spawned. */
  bestFish: LifeRecord | null;
  largestFish: LifeRecord | null;
  mostEggsFish: LifeRecord | null;
}

const maxBy = <T>(xs: readonly T[], f: (x: T) => number | null): T | null => {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const x of xs) {
    const v = f(x);
    if (v !== null && v > bestV) {
      best = x;
      bestV = v;
    }
  }
  return best;
};

export function summarize(l: Lineage): LineageSummary {
  const recs = l.records;
  const lastGen = recs.at(-1)?.generation ?? 0;
  return {
    id: l.id,
    name: lineageName(l),
    difficulty: l.difficulty,
    generations: Math.max(l.generation, lastGen),
    spawned: recs.filter((r) => r.spawned).length,
    totalEggs: recs.reduce((a, r) => a + (r.result?.eggs ?? 0), 0),
    jacks: recs.filter((r) => r.isJack === true).length,
    strays: recs.filter((r) => r.isStray).length,
    siblingsLost: recs.reduce((a, r) => a + r.deaths.length, 0),
    extinct: l.extinct,
    bestFish: maxBy(recs, (r) => (r.spawned && r.result ? r.result.relativeFitness : null)),
    largestFish: maxBy(recs, (r) => r.adultSize),
    mostEggsFish: maxBy(recs, (r) => (r.result ? r.result.eggs : null)),
  };
}

/** One record in the hall of ancestors: who holds it, in which line, and the value. */
export interface RecordHolder {
  lineageId: string;
  lineage: string;
  fish: string | null;
  value: number;
}

export interface HallOfRecords {
  longestLine: RecordHolder | null;
  mostEggs: RecordHolder | null;
  largestFish: RecordHolder | null;
  mostJacks: RecordHolder | null;
  bestScore: RecordHolder | null;
  /** Longest line reached on each difficulty. */
  byDifficulty: Record<Difficulty, RecordHolder | null>;
}

/** Records across every lineage given (current and archived). Duplicates by id count once. */
export function hallOfRecords(p: Params, lineages: readonly Lineage[]): HallOfRecords {
  const seen = new Set<string>();
  const ls = lineages.filter((l) => !seen.has(l.id) && (seen.add(l.id), true));
  const holder = (l: Lineage, value: number, fish: string | null = null): RecordHolder => ({ lineageId: l.id, lineage: lineageName(l), fish, value });
  const best = (f: (l: Lineage) => RecordHolder | null): RecordHolder | null => {
    let out: RecordHolder | null = null;
    for (const l of ls) {
      const h = f(l);
      if (h && h.value > 0 && (!out || h.value > out.value)) out = h;
    }
    return out;
  };
  const longest = (d?: Difficulty) => best((l) => (d && l.difficulty !== d ? null : holder(l, summarize(l).generations)));
  return {
    longestLine: longest(),
    mostEggs: best((l) => {
      const r = summarize(l).mostEggsFish;
      return r?.result ? holder(l, r.result.eggs, r.name) : null;
    }),
    largestFish: best((l) => {
      const r = summarize(l).largestFish;
      return r?.adultSize ? holder(l, r.adultSize, r.name) : null;
    }),
    mostJacks: best((l) => holder(l, summarize(l).jacks)),
    bestScore: best((l) => holder(l, lineageScore(p, l).total)),
    byDifficulty: { fieldGuide: longest('fieldGuide'), wild: longest('wild') },
  };
}

/** Mean breeding value of each trait for one generation. */
export interface TraitPoint {
  generation: number;
  mean: TraitValues;
  /** How many fish the mean is over. */
  n: number;
}

/**
 * How the line's inherited traits drifted: for each generation, the mean
 * breeding value of the brood the played fish was chosen from (or of the
 * played fish alone when no brood was offered, as for founders and strays).
 * Generations from old saves without trait data are skipped.
 */
export function traitHistory(l: Lineage): TraitPoint[] {
  const out: TraitPoint[] = [];
  l.records.forEach((r, i) => {
    const prev = i > 0 ? l.records[i - 1] : undefined;
    const brood = !r.isStray && prev && prev.generation === r.generation - 1 && prev.offspring.length ? prev.offspring.map((o) => o.bv) : r.bv ? [r.bv] : [];
    if (!brood.length) return;
    const mean = Object.fromEntries(TRAIT_IDS.map((t) => [t, brood.reduce((a, b) => a + b[t], 0) / brood.length])) as TraitValues;
    out.push({ generation: r.generation, mean, n: brood.length });
  });
  return out;
}

/** Net change in each trait's mean from the first to the last generation with data. */
export function traitDrift(history: readonly TraitPoint[]): Record<TraitId, number> {
  const first = history[0];
  const last = history.at(-1);
  return Object.fromEntries(TRAIT_IDS.map((t) => [t, first && last ? last.mean[t] - first.mean[t] : 0])) as Record<TraitId, number>;
}

/** Year kinds (caption ids from yearFavours) counted over a line's lives. */
export function yearTally(conditions: readonly YearConditions[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of conditions) for (const id of yearFavours(c)) out[id] = (out[id] ?? 0) + 1;
  return out;
}
