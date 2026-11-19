/**
 * The bloodline across lives: founding fish, records of each life,
 * offspring choice and extinction. Pure data so it can be saved.
 */
import { habitatOffset, makeFish, makeOffspring, populationBv, rollYear } from './genetics';
import type { Difficulty, Params } from './params';
import { Rng } from './rng';
import { HABITATS, TRAIT_IDS, type DeathCause, type Habitat, type FishIdentity, type Sex, type SpawnResult, type StageId, type TraitValues, type YearConditions } from './types';

export const NAMES = [
  'Alder', 'Tamarack', 'Silt', 'Ember', 'Sedge', 'Rill', 'Shale', 'Willow', 'Tern', 'Fern', 'Cobble', 'Riffle', 'Birch', 'Spruce',
  'Kelp', 'Drift', 'Moss', 'Flint', 'Heron', 'Sorrel', 'Ash', 'Aspen', 'Cedar', 'Larch', 'Rowan', 'Brook', 'Marsh', 'Reed',
  'Basalt', 'Talus', 'Eddy', 'Swale', 'Lichen', 'Juniper', 'Bramble', 'Thistle', 'Wren', 'Osprey', 'Lupine', 'Yarrow', 'Fireweed',
  'Cotton', 'Glacier', 'Tundra', 'Harrow', 'Pebble', 'Crane', 'Loon', 'Sable', 'Hazel', 'Quill', 'Rush', 'Tansy', 'Vetch',
] as const;

export type StartPreset = 'quick' | 'custom' | 'jack';

export interface LifeRecord {
  fishId: string;
  name: string;
  sex: Sex;
  generation: number;
  isJack: boolean | null;
  oceanYears: number | null;
  adultSize: number | null;
  conditions: YearConditions;
  /** Every fish played in this life, including siblings that died. */
  deaths: { name: string; stage: StageId; cause: DeathCause }[];
  spawned: boolean;
  result: SpawnResult | null;
  isStray: boolean;
  lockedJack: boolean;
}

export interface Lineage {
  id: string;
  createdAt: string;
  difficulty: Difficulty;
  seed: number;
  rngState: number;
  generation: number;
  current: FishIdentity;
  conditions: YearConditions;
  records: LifeRecord[];
  extinct: boolean;
  usedNames: string[];
}

export function suggestName(rng: Rng, used: readonly string[]): string {
  const free = NAMES.filter((n) => !used.includes(n));
  if (free.length) return rng.pick(free);
  return `${rng.pick(NAMES)} ${['II', 'III', 'IV', 'V'][rng.int(0, 4)] ?? 'II'}`;
}

export interface FoundOptions {
  preset: StartPreset;
  sex: Sex;
  name: string;
  difficulty: Difficulty;
  seed: number;
  habitat?: Habitat;
  /** For custom starts: trait z-scores the player chose (-2..2). */
  custom?: Partial<TraitValues>;
}

export function foundLineage(p: Params, o: FoundOptions): Lineage {
  const rng = new Rng(o.seed);
  const habitat = o.habitat ?? 'creek';
  let bv = populationBv(p, rng, habitat);
  if (o.preset === 'custom' && o.custom) {
    // Custom values are relative to the chosen habitat's population.
    bv = Object.fromEntries(TRAIT_IDS.map((t) => [t, o.custom?.[t] !== undefined ? o.custom[t] + habitatOffset(p, habitat, t) : bv[t]])) as TraitValues;
  }
  const lockedJack = o.preset === 'jack';
  if (lockedJack) bv.jack = p.get('genetics.jackStartBreedingValue');
  const fish = makeFish(p, rng, { sex: lockedJack ? 'M' : o.sex, name: o.name, generation: 1, bv, lockedJack, habitat });
  return {
    id: `L${o.seed.toString(36)}`,
    createdAt: new Date().toISOString(),
    difficulty: o.difficulty,
    seed: o.seed,
    rngState: rng.state,
    generation: 1,
    current: fish,
    conditions: rollYear(p, rng, 1),
    records: [],
    extinct: false,
    usedNames: [o.name],
  };
}

export function lineageRng(l: Lineage): Rng {
  const r = new Rng(l.seed);
  r.state = l.rngState;
  return r;
}

export function siblingsFor(p: Params, l: Lineage): number {
  return p.get(l.difficulty === 'wild' ? 'lineage.siblings.wild' : 'lineage.siblings.fieldGuide');
}

/** Offspring offered after a successful spawn. */
export function offerOffspring(p: Params, l: Lineage, parent: FishIdentity): FishIdentity[] {
  const rng = lineageRng(l);
  const used = [...l.usedNames];
  const kids = makeOffspring(p, rng, parent, p.get('lineage.offspringChoices'), () => {
    const n = suggestName(rng, used);
    used.push(n);
    return n;
  });
  l.rngState = rng.state;
  return kids;
}

export function recordLife(l: Lineage, rec: LifeRecord): void {
  l.records.push(rec);
}

/** Start the next generation with the chosen offspring, in a new year. */
export function advanceGeneration(p: Params, l: Lineage, chosen: FishIdentity, name: string): void {
  const rng = lineageRng(l);
  chosen.name = name;
  l.current = chosen;
  l.generation = chosen.generation;
  l.conditions = rollYear(p, rng, chosen.generation);
  l.usedNames.push(name);
  l.rngState = rng.state;
}

/** Field guide: a stray from another stream carries the line on. */
export function strayRescue(p: Params, l: Lineage, name: string): void {
  const rng = lineageRng(l);
  const sex: Sex = rng.chance(0.5) ? 'F' : 'M';
  // A stray comes from another population, possibly from a different kind of spawning ground.
  const habitat = rng.pick(HABITATS);
  l.current = makeFish(p, rng, { sex, name, generation: l.generation + 1, bv: populationBv(p, rng, habitat), isStray: true, habitat });
  l.generation += 1;
  l.conditions = rollYear(p, rng, l.generation);
  l.usedNames.push(name);
  l.rngState = rng.state;
}

export function markExtinct(l: Lineage): void {
  l.extinct = true;
}
