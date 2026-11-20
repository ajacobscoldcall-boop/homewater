/**
 * Quantitative genetics on standardized traits.
 *
 * Each trait has a breeding value (bv) and an expressed value (z).
 * Population: z ~ N(0, 1), heritability h2 = VA / (VA + VE).
 *   bv ~ N(0, sqrt(h2)) in the population; z = bv + N(0, sqrt(1 - h2)).
 * Offspring bv = mid-parent bv + segregation noise N(0, sqrt(h2 / 2)).
 *
 * Jack maturation uses a threshold model: a male becomes a jack when
 * liability = z.jack + growthEffect * growthZ exceeds a threshold set so
 * that the population rate matches the habitat's base jack rate.
 */
import type { Params } from './params';
import { inverseNormalCdf, type Rng } from './rng';
import { TRAIT_IDS, type FishIdentity, type Habitat, type Sex, type TraitId, type TraitValues, type YearConditions } from './types';

export const h2 = (p: Params, t: TraitId): number => p.get(`genetics.h2.${t}`);

const mapTraits = (f: (t: TraitId) => number): TraitValues =>
  Object.fromEntries(TRAIT_IDS.map((t) => [t, f(t)])) as TraitValues;

/** Population differences between habitats: river and beach fish are larger and deeper-bodied. */
export function habitatOffset(p: Params, habitat: Habitat, t: TraitId): number {
  if (habitat === 'creek') return 0;
  if (t === 'bodyDepth') return p.get(`habitat.depthOffset.${habitat}`);
  if (t === 'size') return p.get(`habitat.sizeOffset.${habitat}`);
  return 0;
}

export function populationBv(p: Params, rng: Rng, habitat: Habitat = 'creek'): TraitValues {
  return mapTraits((t) => habitatOffset(p, habitat, t) + rng.normal(0, Math.sqrt(h2(p, t))));
}

export function express(p: Params, rng: Rng, bv: TraitValues): TraitValues {
  return mapTraits((t) => bv[t] + rng.normal(0, Math.sqrt(1 - h2(p, t))));
}

export function childBv(p: Params, rng: Rng, mother: TraitValues, father: TraitValues): TraitValues {
  return mapTraits((t) => (mother[t] + father[t]) / 2 + rng.normal(0, Math.sqrt(h2(p, t) / 2)));
}

export const newFishId = (rng: Rng): string => `f${rng.int(0, 2 ** 31).toString(36)}${rng.int(0, 2 ** 31).toString(36)}`;

export interface NewFishOptions {
  sex: Sex;
  name: string;
  generation: number;
  bv: TraitValues;
  habitat?: Habitat;
  lockedJack?: boolean;
  isStray?: boolean;
  parentId?: string;
}

export function makeFish(p: Params, rng: Rng, o: NewFishOptions): FishIdentity {
  const fish: FishIdentity = {
    id: newFishId(rng),
    name: o.name,
    sex: o.sex,
    generation: o.generation,
    bv: o.bv,
    z: express(p, rng, o.bv),
    habitat: o.habitat ?? 'creek',
    lockedJack: o.lockedJack ?? false,
    isStray: o.isStray ?? false,
  };
  if (o.parentId) fish.parentId = o.parentId;
  return fish;
}

/** Threshold on jack liability for the given base rate and growth effect. */
export function jackThreshold(p: Params, habitat: Habitat): number {
  const base = p.get(`genetics.jackBaseRate.${habitat}`);
  const ge = p.get('genetics.jackGrowthEffect');
  return inverseNormalCdf(1 - base) * Math.sqrt(1 + ge * ge);
}

/** growthPerf in 0..1 mapped to a growth z-score, centred on a typical fish's growth so the habitat base rate holds for typical growth. */
export const growthZ = (growthPerf: number, sizeZ: number, reference = 0.5): number => (growthPerf - reference) * 2 + 0.5 * sizeZ;

export function becomesJack(p: Params, fish: FishIdentity, growthPerf: number): boolean {
  if (fish.sex !== 'M') return false;
  if (fish.lockedJack) return true;
  const liability = fish.z.jack + p.get('genetics.jackGrowthEffect') * growthZ(growthPerf, fish.z.size, p.get('genetics.jackGrowthReference'));
  return liability > jackThreshold(p, fish.habitat);
}

export function oceanYearsFor(p: Params, fish: FishIdentity, isJack: boolean): number {
  if (isJack) return 1;
  // The share of non-jacks that spend two years at sea; the rest spend three.
  return fish.z.oceanAge < inverseNormalCdf(p.get('life.oceanAge2Share')) ? 2 : 3;
}

export function adultSize(p: Params, fish: FishIdentity, oceanYears: number, growthPerf: number, cond: YearConditions): number {
  const base = p.get(`size.oceanYear${oceanYears}`);
  const s = base + p.get('size.traitEffect') * fish.z.size + p.get('size.feedingEffect') * (growthPerf - 0.5) * 2;
  return Math.max(0.3, s / Math.sqrt(cond.oceanCrowding));
}

/** Share of the year's males that are jacks, for frequency-dependent success. */
export function yearJackFraction(p: Params, habitat: Habitat, cond: YearConditions): number {
  return Math.min(0.9, p.get(`genetics.jackBaseRate.${habitat}`) * cond.runSize);
}

/**
 * Conditions for the year a generation lives through. Ocean crowding
 * alternates with the generation (pink salmon are abundant every other
 * year), plus noise.
 */
export function rollYear(p: Params, rng: Rng, generation = 1): YearConditions {
  const f = (sd: number) => Math.max(0.4, 1 + rng.normal(0, sd));
  const pink = p.get('year.pinkAmplitude') * (generation % 2 === 0 ? 1 : -1);
  return {
    flow: f(p.get('year.flowSd')),
    temperature: f(p.get('year.tempSd')),
    oceanCrowding: Math.max(0.5, f(p.get('year.crowdingSd')) + pink),
    runSize: f(p.get('year.runSizeSd')),
  };
}

/** Offspring of the player's fish and a mate drawn from the population. */
export function makeOffspring(
  p: Params,
  rng: Rng,
  parent: FishIdentity,
  count: number,
  names: () => string,
): FishIdentity[] {
  const mate = populationBv(p, rng, parent.habitat);
  // A jack father passes on jack-leaning genes; the mate is a typical population fish.
  const [mother, father] = parent.sex === 'F' ? [parent.bv, mate] : [mate, parent.bv];
  const sexes: Sex[] = [];
  for (let i = 0; i < count; i++) sexes.push(rng.chance(0.5) ? 'F' : 'M');
  // Make sure the player can choose either sex when offered more than one fish.
  if (count >= 2) {
    if (!sexes.includes('F')) sexes[0] = 'F';
    if (!sexes.includes('M')) sexes[sexes.length - 1] = 'M';
  }
  return sexes.map((sex) =>
    makeFish(p, rng, {
      sex,
      name: names(),
      generation: parent.generation + 1,
      bv: childBv(p, rng, mother, father),
      habitat: parent.habitat,
      parentId: parent.id,
    }),
  );
}

/** Siblings share parents; re-draw segregation and environment around the fish's own values. */
export function makeSibling(p: Params, rng: Rng, fish: FishIdentity, name: string): FishIdentity {
  const bv = mapTraits((t) => fish.bv[t] + rng.normal(0, Math.sqrt(h2(p, t) / 4)));
  const sib = makeFish(p, rng, {
    sex: fish.sex,
    name,
    generation: fish.generation,
    bv,
    habitat: fish.habitat,
    lockedJack: fish.lockedJack,
    isStray: fish.isStray,
  });
  if (fish.parentId) sib.parentId = fish.parentId;
  return sib;
}

/** A trait shown to players as a word, from its z-score. */
export function describeZ(z: number, low: string, mid: string, high: string): string {
  return z < -0.6 ? low : z > 0.6 ? high : mid;
}

/**
 * Bet hedging: the year's conditions interact with a fish's traits, so the
 * same traits can thrive one year and fail the next (advisor).
 */
export interface YearEffects {
  /** Temperature this fish meets on the return. Later runs meet warmer water. */
  temperature: number;
  /** Multiplier on river current. Earlier runs meet higher flows. */
  flowFactor: number;
  /** Multiplier on thrust. Deep bodies work harder in high water. */
  thrustFactor: number;
  /** Extra bear reach in low water for deep-bodied fish. */
  bearReach: number;
}

export function yearEffects(p: Params, fish: FishIdentity, cond: YearConditions): YearEffects {
  const timing = Math.max(-2, Math.min(2, fish.z.runTiming));
  const depth = Math.max(0, Math.min(2, fish.z.bodyDepth));
  return {
    temperature: cond.temperature * Math.max(0.5, 1 + p.get('year.timingTemp') * timing * Math.sign(cond.temperature - 1 || 1)),
    flowFactor: Math.max(0.5, 1 - p.get('year.timingFlow') * timing * (cond.flow > 1 ? 1 : 0)),
    thrustFactor: Math.max(0.6, 1 - p.get('year.depthFlowDrag') * depth * Math.max(0, cond.flow - 1)),
    bearReach: p.get('year.lowWaterBear') * Math.max(0, 1 - cond.flow) * depth,
  };
}

/** Caption ids describing which kinds of fish this year favours. */
export function yearFavours(cond: YearConditions): string[] {
  const out: string[] = [];
  if (cond.temperature > 1.1) out.push('year.warm');
  if (cond.temperature < 0.9) out.push('year.cool');
  if (cond.flow > 1.1) out.push('year.highWater');
  if (cond.flow < 0.9) out.push('year.lowWater');
  if (cond.runSize > 1.15) out.push('year.bigRun');
  if (cond.runSize < 0.85) out.push('year.smallRun');
  if (cond.oceanCrowding > 1.08) out.push('year.crowded');
  return out.length ? out : ['year.ordinary'];
}
