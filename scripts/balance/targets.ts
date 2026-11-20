/**
 * Design-intent bands the report checks the numbers against.
 *
 * These are the simulator's reading of docs/DESIGN.md ("Field guide"
 * forgiving; "Wild" harsher and closer to real odds, but never true odds;
 * most deaths from visible, reactable threats). They are proposals for the
 * owner to confirm, not settled design.
 */
import type { Difficulty } from '../../src/sim/params';
import type { SkillName } from './skills';

export interface Band {
  min: number;
  max: number;
}

/** Death rate of one fish attempting one stage (a sibling resuming counts as a new attempt). */
export const STAGE_DEATH: Record<Difficulty, Record<SkillName, Band>> = {
  fieldGuide: {
    novice: { min: 0.05, max: 0.4 },
    average: { min: 0.02, max: 0.25 },
    skilled: { min: 0, max: 0.12 },
  },
  wild: {
    novice: { min: 0.2, max: 0.65 },
    average: { min: 0.1, max: 0.45 },
    skilled: { min: 0.04, max: 0.25 },
  },
};

/** Chance the whole life (a brood of siblings) reaches spawning. */
export const LIFE_COMPLETION: Record<Difficulty, Record<SkillName, Band>> = {
  fieldGuide: {
    novice: { min: 0.75, max: 1 },
    average: { min: 0.9, max: 1 },
    skilled: { min: 0.97, max: 1 },
  },
  wild: {
    novice: { min: 0.25, max: 0.6 },
    average: { min: 0.45, max: 0.8 },
    skilled: { min: 0.65, max: 0.92 },
  },
};

/** Share of all deaths that come from off-screen chance (rolls the player cannot react to). */
export const OFFSCREEN_SHARE_MAX = 0.35;

/** The advisor's real-world figures (docs/ADVISOR_NOTES.md), as survival fractions. */
export const REAL = {
  eggToEmergence: { min: 0.1, max: 0.2 },
  fryToSmolt: { min: 0.05, max: 0.1 },
  marine: { min: 0.05, max: 0.05 },
  jackShareOfMales: { min: 0.01, max: 0.02 },
};

export function verdict(rate: number, band: Band): 'too easy' | 'too hard' | 'in band' {
  if (rate < band.min) return 'too easy';
  if (rate > band.max) return 'too hard';
  return 'in band';
}

/** For completion rates, higher is easier. */
export function completionVerdict(rate: number, band: Band): 'too easy' | 'too hard' | 'in band' {
  if (rate < band.min) return 'too hard';
  if (rate > band.max) return 'too easy';
  return 'in band';
}
