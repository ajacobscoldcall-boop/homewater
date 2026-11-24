/**
 * The changing river: an optional mode chosen when a lineage is founded (off
 * by default; the main game stays a healthy Bristol Bay-type river with no
 * dams). Over the generations the river changes in four ways:
 *
 * - Warming: the year's river temperature creeps up by `change.warmingRate`
 *   per generation, to at most `change.warmingMax`. It is added to
 *   YearConditions.temperature, so `yearEffects`, the return's water
 *   temperature, heat stress and everything else that reads the year's
 *   temperature respond without new code. Warm water also costs the run a
 *   little (`change.warmRunLoss`).
 * - Logging silt: some years (`change.siltChance`, from `change.siltStart`)
 *   fine silt settles in the spawning gravel. Eggs laid that year survive
 *   less (`siltEggSurvival`, read by the spawning result), and the cohort
 *   they make comes home smaller (`siltRecruit`).
 * - Hatchery strays: from `change.hatcheryStart`, hatchery fish from
 *   elsewhere join the run, a share that grows to `change.hatcheryMax`. They
 *   add to the run but leave fewer young (`hatcheryFitness`), and a mate
 *   drawn from the run carries a little of their poorer homing and less
 *   settled run timing to the player's offspring (`mateShift`).
 * - Fisheries that respond to the run: from `change.fisheryStart`, set nets
 *   and subsistence nets fish open years harder (extra net lines in big
 *   runs, `setNetsFor`, and a lower escapement goal, `change.goalShift`);
 *   when the run falls below `change.closeBelow` of a typical run, managers
 *   restore the goal and the extra nets stay out (`fisheryEased`).
 *
 * Every effect is a placeholder param (`change.*`). Pure and deterministic:
 * all chance goes through the given Rng, and a healthy river draws nothing.
 */
import type { Params } from './params';
import type { Rng } from './rng';
import type { TraitValues, YearConditions } from './types';

export const RIVER_MODES = ['healthy', 'changing'] as const;
export type RiverMode = (typeof RIVER_MODES)[number];

/** What had changed in the river in one generation, kept with the population year (saves schema 8). */
export interface ChangeYear {
  /** Generations since the river began to change (1 = the line's first). */
  age: number;
  /** Added to the year's temperature multiplier (1 = ordinary; return.water.yearTemp °C per unit). */
  warming: number;
  /** Fine silt in the spawning gravel this year. */
  silt: boolean;
  /** Share of the run that is hatchery strays (0..1). */
  hatchery: number;
  /** Extra set-net and subsistence lines on the approach this year. */
  setNets: number;
  /** How far the escapement goal was lowered this year (fraction of a typical run). */
  goalShift: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const isChanging = (mode: RiverMode | undefined): boolean => mode === 'changing';

/** Warming after `age` generations of change. */
export function warmingAt(p: Params, age: number): number {
  return clamp(p.get('change.warmingRate') * Math.max(0, age - p.get('change.warmingStart') + 1), 0, p.get('change.warmingMax'));
}

/** Hatchery strays' share of the run after `age` generations of change. */
export function hatcheryAt(p: Params, age: number): number {
  return clamp(p.get('change.hatcheryRate') * Math.max(0, age - p.get('change.hatcheryStart') + 1), 0, p.get('change.hatcheryMax'));
}

/** Whether the fisheries have grown by this age. */
export const fisheryGrown = (p: Params, age: number): boolean => age >= p.get('change.fisheryStart');

/** Managers ease off (restore the goal, keep set nets out) after a small run. */
export const fisheryEased = (p: Params, lastRun: number): boolean => lastRun < p.get('change.closeBelow');

/**
 * Roll what the river is like this generation. `prev` is the last generation's
 * change (none before the river began to change); `lastRun` the last
 * generation's run, which the fishery responds to. Draws once (the silt roll),
 * and only once silt can happen.
 */
export function rollChange(p: Params, rng: Rng, prev: ChangeYear | undefined, lastRun: number): ChangeYear {
  const age = (prev?.age ?? 0) + 1;
  const silt = age >= p.get('change.siltStart') ? rng.chance(p.get('change.siltChance')) : false;
  const grown = fisheryGrown(p, age) && !fisheryEased(p, lastRun);
  return {
    age,
    warming: warmingAt(p, age),
    silt,
    hatchery: hatcheryAt(p, age),
    setNets: 0,
    goalShift: grown ? p.get('change.goalShift') : 0,
  };
}

/** Extra set-net lines for this year's run: none in a run no bigger than typical, up to `change.setNetLines` in a big one. */
export function setNetsFor(p: Params, c: ChangeYear, run: number): number {
  if (c.goalShift <= 0) return 0;
  const over = clamp((run - 1) / Math.max(0.05, p.get('change.setNetRun') - 1), 0, 1);
  return Math.round(p.get('change.setNetLines') * over);
}

/** Multiplier on recruits from spawners of a changed year: hatchery fish leave fewer young, silt smothers eggs, warm water costs fish. */
export function recruitFactor(p: Params, parent: ChangeYear | undefined, now: ChangeYear | undefined): number {
  let f = 1;
  if (parent) {
    f *= 1 - parent.hatchery * (1 - p.get('change.hatcheryFitness'));
    if (parent.silt) f *= p.get('change.siltRecruit');
  }
  if (now) f *= Math.exp(-p.get('change.warmRunLoss') * now.warming);
  return f;
}

/** Year conditions for a changed generation: the warming added to the year's temperature, and the rest as flags. */
export function applyChange(c: YearConditions, ch: ChangeYear | undefined): YearConditions {
  if (!ch) return c;
  const out: YearConditions = { ...c, temperature: c.temperature + ch.warming, warming: ch.warming, hatchery: ch.hatchery, setNets: ch.setNets };
  if (ch.silt) out.silt = true;
  return out;
}

/** Egg survival multiplier on the spawning grounds this year (1 unless silt has settled in the gravel). */
export const siltEggSurvival = (p: Params, c: YearConditions): number => (c.silt ? p.get('change.siltEggSurvival') : 1);

/**
 * How a mate drawn from this year's run differs, on average, from the river's
 * own fish: hatchery strays home less faithfully, and their run timing is less
 * settled (a spread around the river's timing, drawn only when there are strays).
 */
export function mateShift(p: Params, rng: Rng, c: YearConditions): Partial<TraitValues> {
  const h = c.hatchery ?? 0;
  if (h <= 0) return {};
  return { homing: -h * p.get('change.hatcheryHoming'), runTiming: h * p.get('change.hatcheryTiming') * rng.normal(0, 1) };
}

// ---------- What the player is told ----------

/** Caption ids for what has changed this year, by stage card (null stage: all of them, for the recap). */
export function changeCaptions(p: Params, stage: string | null, c: YearConditions): string[] {
  const out: string[] = [];
  const warm = (c.warming ?? 0) >= p.get('change.warmingShown');
  const all = stage === null;
  if (warm && (all || stage === 'return')) out.push('change.warming');
  if (c.silt && (all || stage === 'egg' || stage === 'spawn')) out.push('change.silt');
  if ((c.hatchery ?? 0) > 0 && (all || stage === 'spawn')) out.push('change.hatchery');
  if ((c.setNets ?? 0) > 0 && (all || stage === 'return')) out.push('change.setNets');
  return out;
}

/** Everything that has changed in the river since a line began, for one plain line. */
export interface ChangeSummary {
  generations: number;
  /** Warming now, in °C on the return. */
  warmerC: number;
  siltYears: number;
  /** Hatchery strays' share of the run now (0..1). */
  hatchery: number;
  setNetYears: number;
  /** Years the managers eased off after a small run, once the fisheries had grown. */
  easedYears: number;
}

export function summarizeChange(p: Params, years: readonly (ChangeYear | undefined)[]): ChangeSummary | null {
  const changed = years.filter((y): y is ChangeYear => !!y);
  const last = changed.at(-1);
  if (!last) return null;
  return {
    generations: changed.length,
    warmerC: last.warming * p.get('return.water.yearTemp'),
    siltYears: changed.filter((y) => y.silt).length,
    hatchery: last.hatchery,
    setNetYears: changed.filter((y) => y.setNets > 0).length,
    easedYears: changed.filter((y) => fisheryGrown(p, y.age) && y.goalShift === 0).length,
  };
}
