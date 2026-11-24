/**
 * The ocean as a journey (Track 2.6): the route and seasons of the years at sea,
 * and how ocean temperature, season and crowding set the food. Pure functions,
 * no randomness of their own (the stage passes rolls in), so they are unit tested
 * and shared by the stage, the HUD's ocean map and the balance bots.
 *
 * The route: out along the coast from the river mouth in the first summer, over
 * the shelf edge in the first autumn (where the maturation reveal happens, as the
 * advisor's notes say the path is set after the first fall at sea), offshore into
 * the open North Pacific, a loop through the seasons for each year at sea, with
 * the winters far out, and the turn for home in the last spring.
 *
 * Each season is one encounter in a scene with two food patches: one near the
 * surface and one deep (the arena is the advisor's top 20-40 m). The season's
 * predator hunts where the food is thickest, so the choice is rich and risky or
 * lean and safer. Food by season, ocean warmth and the "predators follow the food"
 * rule are game devices (params `ocean.*`, placeholders); see docs/ADVISOR_NOTES.md.
 */
import type { Params } from '../params';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** Where on the route a season is spent (also drives the open-water look). */
export type SeaPlace = 'coast' | 'shelf' | 'offshore' | 'gyre' | 'homeward';
/** The season's encounter: a predator, the pink salmon, or the turn for home. */
export type Encounter = 'seal' | 'orca' | 'shark' | 'pinks' | 'home';
/** Ocean warmth for one year at sea. */
export type Warmth = 'cool' | 'typical' | 'warm';

export interface SeasonPlan {
  /** Year at sea, from 1. */
  year: number;
  season: Season;
  place: SeaPlace;
  encounter: Encounter;
}

/** The first year up to the maturation reveal: summer along the coast, autumn on the shelf edge. */
export function firstYearPlan(crowded: boolean): SeasonPlan[] {
  return [
    { year: 1, season: 'summer', place: 'coast', encounter: 'seal' },
    // A crowded (pink) year: the pinks are the autumn's encounter; otherwise an orca.
    { year: 1, season: 'autumn', place: 'shelf', encounter: crowded ? 'pinks' : 'orca' },
  ];
}

/**
 * The seasons after the reveal, for a fish that spends `years` years at sea in all:
 * the first winter far out, then spring, summer, autumn and winter for each extra
 * year, and the last spring's turn for home. Encounters rotate so a long life
 * meets every predator.
 */
export function laterPlan(years: number, crowded: boolean): SeasonPlan[] {
  const out: SeasonPlan[] = [{ year: 1, season: 'winter', place: 'gyre', encounter: 'shark' }];
  for (let y = 2; y <= years; y++) {
    out.push({ year: y, season: 'spring', place: 'offshore', encounter: 'orca' });
    // In a crowded generation the pinks come back in the second summer; otherwise a seal, and an orca in the third.
    out.push({ year: y, season: 'summer', place: 'offshore', encounter: crowded && y === 2 ? 'pinks' : y === 2 ? 'seal' : 'orca' });
    out.push({ year: y, season: 'autumn', place: 'offshore', encounter: y % 2 === 0 ? 'shark' : 'orca' });
    out.push({ year: y, season: 'winter', place: 'gyre', encounter: y % 2 === 0 ? 'orca' : 'shark' });
  }
  out.push({ year: years + 1, season: 'spring', place: 'homeward', encounter: 'home' });
  return out;
}

/** The whole route for a fish whose years at sea are known (or the first year alone if not). */
export function fullPlan(years: number | null, crowded: boolean): SeasonPlan[] {
  return years === null ? firstYearPlan(crowded) : [...firstYearPlan(crowded), ...laterPlan(years, crowded)];
}

/** Index in the full plan of the season after the reveal (the first winter). */
export const AFTER_REVEAL = 2;

/** Roll one year's ocean warmth from a uniform 0..1 draw. */
export function warmthFrom(p: Params, u: number): Warmth {
  if (u < p.get('ocean.warmChance')) return 'warm';
  if (u < p.get('ocean.warmChance') + p.get('ocean.coolChance')) return 'cool';
  return 'typical';
}

/** Food in a season relative to a typical summer: season, ocean warmth and pink crowding. */
export function seasonFood(p: Params, plan: SeasonPlan, warmth: Warmth, crowded: boolean): number {
  let f = p.get(`ocean.food.${plan.season}`);
  if (warmth === 'warm') f *= p.get('ocean.warmFood');
  else if (warmth === 'cool') f *= p.get('ocean.coolFood');
  // Pink salmon feed in the same waters in summer and autumn of a crowded year.
  if (crowded && (plan.season === 'summer' || plan.season === 'autumn')) f *= p.get('ocean.crowdedFood');
  return f;
}

/** Share of the season's food in the patch near the surface (the rest is deep). */
export function shallowShare(p: Params, season: Season): number {
  return p.get(`ocean.shallowShare.${season}`);
}

/** Which patch the season's predator hunts: where the food is thickest. */
export function huntsShallow(p: Params, plan: SeasonPlan): boolean {
  if (plan.encounter === 'seal') return true;
  if (plan.encounter === 'shark') return false;
  return shallowShare(p, plan.season) >= 0.5;
}

/**
 * Drawn and swimming size along the route. The fish enters the sea at
 * `ocean.entryScale`, reaches the one-year size (`size.oceanYear1`) by the end of
 * its first winter, and its own adult size (once known) by the turn for home.
 * `done` is the share of seasons finished; `feed` (0..1, 0.5 typical) nudges it.
 */
export function sizeOnRoute(p: Params, plan: readonly SeasonPlan[], index: number, adult: number | null, feed: number): number {
  const entry = p.get('ocean.entryScale');
  const year1 = p.get('size.oceanYear1');
  const nudge = 1 + p.get('ocean.feedSizeNudge') * (Math.max(0, Math.min(1, feed)) - 0.5);
  // First year: entry size to the one-year size across summer, autumn and winter.
  if (index <= AFTER_REVEAL || adult === null) {
    const k = Math.min(1, index / (AFTER_REVEAL + 1));
    return (entry + (year1 - entry) * k) * (index === 0 ? 1 : nudge);
  }
  // Later: from the one-year size to the adult size by the last season.
  const last = plan.length - 1;
  const k = Math.min(1, (index - AFTER_REVEAL) / Math.max(1, last - AFTER_REVEAL));
  const s = year1 + (adult - year1) * k;
  return index >= last ? adult : s * nudge;
}

/** Map captions and labels for a season, by stable caption id. */
export function seasonCaption(plan: SeasonPlan): string {
  if (plan.place === 'coast') return 'ocean.coast';
  if (plan.place === 'shelf') return 'ocean.shelf';
  if (plan.place === 'homeward') return 'ocean.turnHome';
  return plan.season === 'autumn' ? 'ocean.autumnLater' : `ocean.${plan.season}`;
}
