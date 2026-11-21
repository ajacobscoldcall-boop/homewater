/**
 * The bloodline across lives: founding fish, records of each life,
 * offspring choice and extinction. Pure data so it can be saved.
 */
import { habitatOffset, makeFish, makeOffspring, populationBv } from './genetics';
import { nextYear, seedPopulation, type Population } from './population';
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
  /** Every fish played in this life, including siblings that died; `where: 'lake'` for a death on the lake crossing at the end of the return (schema 7). */
  deaths: { name: string; stage: StageId; cause: DeathCause; where?: 'lake' }[];
  spawned: boolean;
  result: SpawnResult | null;
  isStray: boolean;
  lockedJack: boolean;
  /** The played fish's breeding values (null in records from saves before schema 3). */
  bv: TraitValues | null;
  habitat: Habitat;
  /** Offspring offered after this life's spawn, the chosen one included (schema 3). */
  offspring: OffspringNote[];
  /** Which offspring carried the line on, once chosen. */
  chosenId: string | null;
  /** Years the fish spent in the nursery lake (1 or 2), for the life route map; null when not known (schema 6). */
  lakeYears?: number | null;
}

/** What is kept of an offspring on offer, chosen or not, for the family tree and trait history. */
export interface OffspringNote {
  id: string;
  name: string;
  sex: Sex;
  bv: TraitValues;
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
  /** A line founded by a stray after another line died out in the same river (schema 3). */
  ancestor: { id: string; name: string } | null;
  /** The river's run, carried from generation to generation (schema 4). */
  population: Population;
}

/** A lineage is known by its founder's name. */
export const lineageName = (l: Lineage): string => l.usedNames[0] ?? l.records[0]?.name ?? l.current.name;

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
  const population = seedPopulation(p, rng);
  const conditions = nextYear(p, rng, population, 1);
  return {
    id: `L${o.seed.toString(36)}`,
    createdAt: new Date().toISOString(),
    difficulty: o.difficulty,
    seed: o.seed,
    rngState: rng.state,
    generation: 1,
    current: fish,
    conditions,
    records: [],
    extinct: false,
    usedNames: [o.name],
    ancestor: null,
    population,
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
  const last = l.records.at(-1);
  if (last && last.generation === parent.generation) last.offspring = kids.map((k) => ({ id: k.id, name: k.name, sex: k.sex, bv: { ...k.bv } }));
  return kids;
}

/**
 * The year the next generation will live through, without changing the line:
 * advanceGeneration rolls exactly this year (the same rng state and run history),
 * whichever offspring is chosen. For the offspring cards.
 */
export function peekNextYear(p: Params, l: Lineage, generation = l.generation + 1): YearConditions {
  const population: Population = { history: l.population.history.map((y) => ({ ...y })) };
  return nextYear(p, lineageRng(l), population, generation);
}

export function recordLife(l: Lineage, rec: LifeRecord): void {
  l.records.push(rec);
}

/** Start the next generation with the chosen offspring, in a new year. */
export function advanceGeneration(p: Params, l: Lineage, chosen: FishIdentity, name: string): void {
  const rng = lineageRng(l);
  const last = l.records.at(-1);
  if (last && last.generation === chosen.generation - 1) {
    last.chosenId = chosen.id;
    const note = last.offspring.find((o) => o.id === chosen.id);
    if (note) note.name = name;
  }
  chosen.name = name;
  l.current = chosen;
  l.generation = chosen.generation;
  l.conditions = nextYear(p, rng, l.population, chosen.generation);
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
  // The stray joins this river's run, so the population carries on.
  l.conditions = nextYear(p, rng, l.population, l.generation);
  l.usedNames.push(name);
  l.rngState = rng.state;
}

/**
 * After a line dies out (Wild), a new line can start from a stray that has
 * joined the same river: it comes from another population but spawns here.
 */
export function foundFromStray(p: Params, extinct: Lineage, seed: number, name: string): Lineage {
  const rng = new Rng(seed);
  const origin = rng.pick(HABITATS);
  const sex: Sex = rng.chance(0.5) ? 'F' : 'M';
  const fish = makeFish(p, rng, { sex, name, generation: 1, bv: populationBv(p, rng, origin), isStray: true, habitat: extinct.current.habitat });
  // Same river: the run's history carries on from the line that died out, renumbered so this line's first generation is 1.
  const last = extinct.population.history.at(-1)?.generation ?? 0;
  const population: Population = { history: extinct.population.history.map((y) => ({ ...y, generation: y.generation - last })) };
  const conditions = nextYear(p, rng, population, 1);
  return {
    id: `L${seed.toString(36)}`,
    createdAt: new Date().toISOString(),
    difficulty: extinct.difficulty,
    seed,
    rngState: rng.state,
    generation: 1,
    current: fish,
    conditions,
    records: [],
    extinct: false,
    usedNames: [name],
    ancestor: { id: extinct.id, name: lineageName(extinct) },
    population,
  };
}

export function markExtinct(l: Lineage): void {
  l.extinct = true;
}
