/**
 * The river's sockeye population, carried from generation to generation.
 *
 * The player's line is a few fish among many; the run around it follows a
 * simple model whose state is saved with the lineage:
 *
 * - Stock and recruitment (Ricker): the spawners that reached the grounds set
 *   the size of the run that comes home a generation later, with year-to-year
 *   noise and a little less survival in crowded (pink) ocean years.
 * - The fishery is managed for an escapement goal: it lets about `goal` fish
 *   through to spawn and takes the rest, up to a maximum share of the run, so
 *   it takes more in big runs and closes in small ones.
 * - The lake: the young of a big run rear together, so food per fry is lower
 *   (density dependence), while the carcasses of that run enrich the lake a
 *   little (marine-derived nutrients). Crowding outweighs the enrichment.
 *
 * Units: runs and spawners are relative to a typical run (1.0). The Ricker
 * capacity is set so an escapement at the goal returns a typical run.
 *
 * Pure and deterministic: all chance goes through the given Rng.
 */
import { rollYear } from './genetics';
import type { Params } from './params';
import { applyChange, changeCaptions, isChanging, recruitFactor, rollChange, setNetsFor, type ChangeYear, type RiverMode } from './riverChange';
import type { Rng } from './rng';
import type { YearConditions } from './types';

/** One generation of the river's run, as kept in the save. */
export interface PopulationYear {
  /** Lineage generation (0 and below: runs before the line was founded). */
  generation: number;
  /** Spawners whose young are this generation's cohort (the parents' escapement). */
  parentSpawners: number;
  /** Fry in the lake this generation, relative to a typical cohort. */
  fry: number;
  /** Lake food from the parents' carcasses, relative to a typical year. */
  enrichment: number;
  /** Food per fry, relative to a typical year (enrichment over crowding). */
  lakeFood: number;
  /** Fish coming home this generation, relative to a typical run. */
  run: number;
  /** Fish the fishery took (same units). */
  catch: number;
  /** Fish that got through to spawn (same units). */
  spawners: number;
  /** What had changed in the river this generation (changing river mode only; saves schema 8). */
  change?: ChangeYear;
}

export interface Population {
  /** Oldest first; the last entry is the current generation. */
  history: PopulationYear[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const escapementGoal = (p: Params): number => p.get('population.escapementGoal');

/** Ricker capacity (unfished equilibrium spawners) that makes an escapement at the goal return a typical run of 1. */
export function rickerCapacity(p: Params): number {
  const a = p.get('population.rickerProductivity');
  const g = escapementGoal(p);
  return g / Math.max(0.05, 1 - Math.log(1 / g) / a);
}

/** Mean run returning from a number of spawners (Ricker: R = S·exp(a(1 − S/K))). */
export function rickerRun(p: Params, spawners: number): number {
  const a = p.get('population.rickerProductivity');
  const s = Math.max(0, spawners);
  return s * Math.exp(a * (1 - s / rickerCapacity(p)));
}

/** Marine survival in a crowded ocean (pink years): fewer of the cohort come home. */
export const crowdingSurvival = (p: Params, oceanCrowding: number): number => Math.pow(Math.max(0.3, oceanCrowding), -p.get('population.crowdingSurvival'));

/**
 * The run this generation, from the parents' escapement, the ocean and a lognormal noise draw.
 * `factor` scales recruits (the changing river: hatchery parents, silt, warm water) and
 * `strays` is the share of the run that joins from hatcheries (adds to the wild run).
 */
export function rollRun(p: Params, rng: Rng, parentSpawners: number, oceanCrowding: number, factor = 1, strays = 0): number {
  const sd = p.get('population.recruitSd');
  // Mean-one lognormal noise, so the typical run stays at 1.
  const noise = Math.exp(rng.normal(0, sd) - (sd * sd) / 2);
  const wild = rickerRun(p, parentSpawners) * crowdingSurvival(p, oceanCrowding) * noise * factor;
  return clamp(wild / (1 - clamp(strays, 0, 0.9)), p.get('population.minRun'), p.get('population.maxRun'));
}

/** The fishery's target catch: everything above the escapement goal (lowered by `goalShift` on a changing river), up to its maximum share of the run. */
export function targetCatch(p: Params, run: number, goalShift = 0): number {
  return clamp(run - (escapementGoal(p) - goalShift), 0, p.get('population.maxHarvestRate') * run);
}

/** Catch with management error (the run is never known exactly in season). */
export function rollCatch(p: Params, rng: Rng, run: number, goalShift = 0): number {
  const t = targetCatch(p, run, goalShift);
  if (t <= 0) return 0;
  const err = Math.exp(rng.normal(0, p.get('population.managementSd')));
  return clamp(t * err, 0, p.get('population.maxHarvestRate') * run);
}

/** The lake for a cohort: how crowded with fry, how enriched by the parents' carcasses, and the food per fry. */
export function lakeFor(p: Params, parentSpawners: number): Pick<PopulationYear, 'fry' | 'enrichment' | 'lakeFood'> {
  const fry = Math.max(0.05, parentSpawners / escapementGoal(p));
  const enrichment = 1 + p.get('population.carcassEnrichment') * clamp(fry - 1, -1, p.get('population.enrichmentCap'));
  const lakeFood = clamp(enrichment / Math.pow(fry, p.get('population.fryDensity')), p.get('population.minLakeFood'), p.get('population.maxLakeFood'));
  return { fry, enrichment, lakeFood };
}

/**
 * Roll one generation of the run from the parents' escapement. On a changing
 * river, `change` is this generation's change and `parentChange` the parents'.
 */
export function rollPopulationYear(
  p: Params,
  rng: Rng,
  generation: number,
  parentSpawners: number,
  oceanCrowding: number,
  change?: ChangeYear,
  parentChange?: ChangeYear,
): PopulationYear {
  const run = change ? rollRun(p, rng, parentSpawners, oceanCrowding, recruitFactor(p, parentChange, change), change.hatchery) : rollRun(p, rng, parentSpawners, oceanCrowding);
  const caught = rollCatch(p, rng, run, change?.goalShift ?? 0);
  const y: PopulationYear = { generation, parentSpawners, ...lakeFor(p, parentSpawners), run, catch: caught, spawners: run - caught };
  if (change) y.change = { ...change, setNets: setNetsFor(p, change, run) };
  return y;
}

/** Share of the run the fishery takes. */
export const harvestRate = (y: Pick<PopulationYear, 'run' | 'catch'>): number => (y.run > 0 ? y.catch / y.run : 0);

/** Year conditions for a generation: the random year (flow, temperature, the pink ocean) plus this generation's run and lake, and on a changing river what has changed. */
export function yearFromPopulation(base: YearConditions, y: PopulationYear): YearConditions {
  return applyChange({ ...base, runSize: y.run, lakeFood: y.lakeFood, fryCrowding: y.fry, harvestRate: harvestRate(y) }, y.change);
}

/**
 * A population for a newly founded line: a few generations run on from an
 * escapement at the goal, so the first life already meets a history.
 */
export function seedPopulation(p: Params, rng: Rng): Population {
  const warmup = Math.round(p.get('population.warmupGenerations'));
  const history: PopulationYear[] = [];
  let spawners = escapementGoal(p);
  for (let i = 0; i < warmup; i++) {
    const gen = i - warmup + 1;
    const pink = p.get('year.pinkAmplitude') * (gen % 2 === 0 ? 1 : -1);
    const y = rollPopulationYear(p, rng, gen, spawners, 1 + pink);
    history.push(y);
    spawners = y.spawners;
  }
  return { history };
}

/** The spawners whose young make the next generation. */
export const lastSpawners = (p: Params, pop: Population): number => pop.history.at(-1)?.spawners ?? escapementGoal(p);

/**
 * Advance the population by one generation and return that generation's year
 * conditions. On a changing river (`mode`), the change is rolled after the year
 * and before the run; a healthy river draws exactly as before.
 */
export function nextYear(p: Params, rng: Rng, pop: Population, generation: number, mode: RiverMode = 'healthy'): YearConditions {
  const base = rollYear(p, rng, generation);
  const last = pop.history.at(-1);
  const change = isChanging(mode) ? rollChange(p, rng, last?.change, last?.run ?? 1) : undefined;
  const y = rollPopulationYear(p, rng, generation, lastSpawners(p, pop), base.oceanCrowding, change, last?.change);
  pop.history.push(y);
  // Keep the save small: a long line keeps its most recent generations.
  const keep = Math.round(p.get('population.historyKept'));
  if (pop.history.length > keep) pop.history.splice(0, pop.history.length - keep);
  return yearFromPopulation(base, y);
}

/** A random year from a freshly seeded population (single lives, tools). */
export function randomPopulationYear(p: Params, rng: Rng, generation: number): YearConditions {
  return nextYear(p, rng, seedPopulation(p, rng), generation);
}

/**
 * Rebuild a population from year conditions saved before the population
 * existed (save migration): each recorded run size becomes that
 * generation's run, the fishery takes its target catch, and the lake follows
 * from the previous generation's escapement. No chance involved.
 */
export function populationFromConditions(p: Params, years: readonly { generation: number; conditions: YearConditions }[]): Population {
  const history: PopulationYear[] = [];
  let parent = escapementGoal(p);
  for (const { generation, conditions } of years) {
    const run = clamp(conditions.runSize, p.get('population.minRun'), p.get('population.maxRun'));
    const caught = targetCatch(p, run);
    history.push({ generation, parentSpawners: parent, ...lakeFor(p, parent), run, catch: caught, spawners: run - caught });
    parent = run - caught;
  }
  return { history };
}

// ---------- Effects on play ----------

/** Food per fry this year (1 when no population is known). */
export const lakeFoodOf = (c: YearConditions): number => c.lakeFood ?? 1;

/** Fishing effort relative to a typical year, from the share of the run taken (catch equation: effort ∝ −ln(1 − h)). */
export function fishingEffort(p: Params, c: YearConditions): number {
  if (c.harvestRate === undefined) return 1;
  const typical = targetCatch(p, 1);
  const e = (h: number) => -Math.log(1 - clamp(h, 0, 0.95));
  return e(c.harvestRate) / Math.max(1e-6, e(typical));
}

/** Gillnet lines across the approach this year: more in big runs, none when the fishery is closed. */
export function netLinesFor(p: Params, c: YearConditions, baseLines: number): number {
  if (c.harvestRate === undefined) return baseLines;
  if (c.harvestRate < p.get('population.closedBelow')) return 0;
  const managed = clamp(Math.round(baseLines * Math.pow(fishingEffort(p, c), p.get('population.netEffortExponent'))), 1, Math.round(p.get('population.maxNetLines')));
  // A changing river's set nets and subsistence nets come on top of the managed fishery's lines.
  return managed + Math.max(0, Math.round(c.setNets ?? 0));
}

/** Plankton in one lake food patch this year. */
export function patchSizeFor(p: Params, c: YearConditions): number {
  return Math.max(3, Math.round(p.get('fry.patchSize') * lakeFoodOf(c)));
}

// ---------- What the player is told ----------

/** Caption id for the lake this year, or null when ordinary or unknown. */
export function lakeCaption(p: Params, c: YearConditions): string | null {
  if (c.fryCrowding === undefined) return null;
  if (c.fryCrowding > p.get('population.crowdedFry')) return 'pop.lakeCrowded';
  if (c.fryCrowding < 1 / p.get('population.crowdedFry')) return 'pop.lakeRoomy';
  return 'pop.lakeOrdinary';
}

/** Caption id for the fishery on this year's run, or null when unknown. */
export function fisheryCaption(p: Params, c: YearConditions): string | null {
  if (c.harvestRate === undefined) return null;
  // Says what the player will meet: the number of nets on the approach.
  const base = p.get('return.netLines');
  // The managed fishery's lines; set nets on a changing river have their own line (change.setNets).
  const lines = netLinesFor(p, { ...c, setNets: 0 }, base);
  if (lines === 0) return 'pop.fisheryClosed';
  if (lines > base) return 'pop.fisheryHeavy';
  if (lines < base) return 'pop.fisheryLight';
  return 'pop.fisheryOrdinary';
}

/** Caption ids for the population lines on a stage card. */
export function populationCaptions(p: Params, stage: string, c: YearConditions): string[] {
  const id = stage === 'fry' ? lakeCaption(p, c) : stage === 'return' ? fisheryCaption(p, c) : null;
  return [...(id ? [id] : []), ...changeCaptions(p, stage, c)];
}

/** Caption ids for the recap: the lake this life grew up in and the fishery it came home through. */
export function recapCaptions(p: Params, c: YearConditions): string[] {
  return [lakeCaption(p, c), fisheryCaption(p, c), ...changeCaptions(p, null, c)].filter((x): x is string => x !== null);
}
