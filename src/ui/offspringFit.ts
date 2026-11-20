/**
 * What an offspring's traits would mean in the coming year, and which one a
 * Field guide player is pointed to. Pure: no DOM, no captions text (caption
 * IDs only), so unit tests can check the rule.
 *
 * Traits are the inherited breeding values against the home population's
 * average (genetics.habitatOffset), in the population's standard deviation of
 * breeding values (sqrt(h2)). The year rules follow yearEffects/yearFavours in
 * src/sim/genetics.ts (advisor round 2: bet hedging).
 */
import { h2, habitatOffset, yearFavours } from '../sim/genetics';
import type { Params } from '../sim/params';
import type { FishIdentity, Sex, TraitId, TraitValues, YearConditions } from '../sim/types';
import { RECAP } from './recapConfig';

/** Traits shown on a card, by sex (the jack leaning only matters to males, the egg trade-off to females). */
export function shownTraits(sex: Sex): TraitId[] {
  return ['size', 'bodyDepth', 'runTiming', 'homing', 'oceanAge', sex === 'M' ? 'jack' : 'eggTradeoff'];
}

/** A breeding value against the home population's average, in population SDs, clamped to the bar range. */
export function traitScore(p: Params, bv: TraitValues, habitat: FishIdentity['habitat'], t: TraitId): number {
  const sd = Math.sqrt(Math.max(1e-6, h2(p, t)));
  const v = (bv[t] - habitatOffset(p, habitat, t)) / sd;
  const lim = RECAP.fit.barLimit;
  return Math.max(-lim, Math.min(lim, v));
}

interface FitRule {
  /** yearFavours caption id. */
  favour: string;
  trait: TraitId;
  /** +1: a higher value helps this year; -1: a lower value helps. */
  sign: 1 | -1;
  males?: boolean;
  /** Only the harmful side counts (yearEffects clamps body depth at 0: a streamlined body is no better than an average one). */
  harmOnly?: boolean;
}

/** Which traits each kind of year rewards or punishes (yearEffects, spawn's jack frequency rules). */
export const FIT_RULES: readonly FitRule[] = [
  { favour: 'year.warm', trait: 'runTiming', sign: -1 },
  { favour: 'year.cool', trait: 'runTiming', sign: 1 },
  { favour: 'year.highWater', trait: 'runTiming', sign: 1 },
  { favour: 'year.highWater', trait: 'bodyDepth', sign: -1, harmOnly: true },
  { favour: 'year.lowWater', trait: 'bodyDepth', sign: -1, harmOnly: true },
  { favour: 'year.bigRun', trait: 'jack', sign: 1, males: true },
  { favour: 'year.smallRun', trait: 'jack', sign: -1, males: true },
];

export interface FitPart {
  /** Caption id of the plain line, e.g. offspring.fit.warm.runTiming.good. */
  id: string;
  /** Positive helps, negative hurts. */
  value: number;
}

export interface Fit {
  /** Sum of the parts: above 0 suits the year. */
  score: number;
  parts: FitPart[];
  /** The one line for the card: the strongest part, or a neutral line. */
  line: string;
}

export function fitFor(p: Params, fish: Pick<FishIdentity, 'sex' | 'bv' | 'habitat'>, cond: YearConditions): Fit {
  const favours = yearFavours(cond);
  const parts: FitPart[] = [];
  for (const r of FIT_RULES) {
    if (!favours.includes(r.favour)) continue;
    if (r.males && fish.sex !== 'M') continue;
    let v = r.sign * traitScore(p, fish.bv, fish.habitat, r.trait);
    if (r.harmOnly) v = Math.min(0, v);
    if (v === 0) continue;
    parts.push({ id: `offspring.fit.${r.favour.slice(5)}.${r.trait}.${v > 0 ? 'good' : 'poor'}`, value: v });
  }
  parts.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const score = parts.reduce((s, x) => s + x.value, 0);
  const strong = parts.find((x) => Math.abs(x.value) >= RECAP.fit.lineMin);
  const neutral = favours.length === 1 && (favours[0] === 'year.ordinary' || favours[0] === 'year.crowded') ? 'offspring.fit.ordinary' : 'offspring.fit.neutral';
  return { score, parts, line: strong?.id ?? neutral };
}

export interface Suggestion {
  index: number;
  /** Caption id of the reason (the suggested fish's strongest helpful trait). */
  reason: string;
}

/** The best fit for the coming year, when one clearly stands out; otherwise none. */
export function suggestOffspring(p: Params, kids: readonly Pick<FishIdentity, 'sex' | 'bv' | 'habitat'>[], cond: YearConditions): Suggestion | null {
  if (!kids.length) return null;
  const fits = kids.map((k) => fitFor(p, k, cond));
  const order = fits.map((f, i) => i).sort((a, b) => fits[b]!.score - fits[a]!.score);
  const best = order[0]!;
  const f = fits[best]!;
  const second = order.length > 1 ? fits[order[1]!]!.score : -Infinity;
  if (f.score < RECAP.fit.suggestMin || f.score - second < RECAP.fit.suggestMargin) return null;
  const reason = f.parts.find((x) => x.value > 0);
  return reason ? { index: best, reason: reason.id } : null;
}
