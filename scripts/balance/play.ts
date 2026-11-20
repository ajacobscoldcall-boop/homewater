/**
 * Plays whole lives and whole lineages with a bot, through the public World
 * and lineage API only, the same way src/app/App.ts drives them.
 */
import paramFile from '../../src/data/params.json';
import { randomPopulationYear } from '../../src/sim/population';
import { advanceGeneration, foundLineage, markExtinct, offerOffspring, recordLife, siblingsFor, strayRescue } from '../../src/sim/lineage';
import { Params, type Difficulty, type ParamFile } from '../../src/sim/params';
import { Rng } from '../../src/sim/rng';
import { alevinView } from '../../src/sim/stages/egg';
import { returnLayout } from '../../src/sim/stages/return';
import { roleOf } from '../../src/sim/stages/spawn';
import { STAGE_IDS, TRAIT_IDS, type FishIdentity, type Intent, type StageId, type TraitValues, type YearConditions } from '../../src/sim/types';
import { World } from '../../src/sim/world';
import { Bot } from './bots';
import { SKILLS, type SkillName } from './skills';

export const FILE = paramFile as ParamFile;

/**
 * What-if overrides for trying proposed changes without editing params.json:
 * base values by id, and difficulty multipliers by "difficulty:id".
 */
export interface Overrides {
  values: Record<string, number>;
  mults: Record<string, number>;
}
let overrides: Overrides = { values: {}, mults: {} };
const paramCache = new Map<Difficulty, Params>();

export function setOverrides(o: Overrides): void {
  overrides = o;
  paramCache.clear();
}

export const paramsFor = (d: Difficulty): Params => {
  let p = paramCache.get(d);
  if (!p) {
    p = new Params(FILE, d);
    const ids = new Set([...Object.keys(overrides.values), ...Object.keys(overrides.mults).filter((k) => k.startsWith(`${d}:`)).map((k) => k.slice(d.length + 1))]);
    for (const id of ids) {
      const entry = p.entries.get(id);
      if (!entry) throw new Error(`Unknown parameter "${id}"`);
      const base = overrides.values[id] ?? entry.value;
      const mult = overrides.mults[`${d}:${id}`] ?? FILE.difficulty[d]?.[id] ?? 1;
      p.set(id, base * mult);
    }
    paramCache.set(d, p);
  }
  return p;
};

/** A stage attempt longer than this is a stuck bot, not a result. */
const MAX_ATTEMPT_SECONDS = 400;

export type Outcome = 'ok' | 'dead' | 'timeout';

/** One fish's try at one stage (a sibling resuming at a checkpoint is a new attempt). */
export interface Attempt {
  stage: StageId;
  /** Checkpoint marker the attempt started from (return: 1 = inside the home river). */
  marker: number;
  outcome: Outcome;
  cause?: string;
  /** Return stage only: where the fish died ('sea' before the coast, 'river' after). */
  where?: 'sea' | 'river';
  seconds: number;
  /** Ocean stage, males: whether this fish matured as a jack (decided before the late-ocean roll). */
  jack?: boolean;
  /** Egg stage: share of the brood-mates in the nest that emerged with the player (completed attempts). */
  brood?: number;
  /** Where a stuck bot was when the attempt was stopped (for debugging bots). */
  stuckAt?: [number, number, number];
}

export interface LifeResult {
  difficulty: Difficulty;
  skill: SkillName;
  sex: 'F' | 'M';
  /** Brood size: the first fish plus its siblings. */
  brood: number;
  completed: boolean;
  timeout: boolean;
  /** Stage where the last fish of the brood died. */
  failedAt?: StageId;
  fishUsed: number;
  attempts: Attempt[];
  isJack: boolean | null;
  oceanYears: number | null;
  adultSize: number | null;
  role?: string;
  /** Relative fitness of the spawner, when the life completed. */
  fitness?: number;
  playSeconds: number;
  conditions: YearConditions;
  /** The fish that spawned (or the last one played). */
  fish: FishIdentity;
}

export interface LifeSetupOpts {
  difficulty: Difficulty;
  skill: SkillName;
  fish: FishIdentity;
  conditions: YearConditions;
  siblings: number;
  seed: number;
  firstLife?: boolean;
  /** Start at this stage (role experiments). */
  startStage?: number;
  /** Called after every step (debugging bots). */
  onStep?: (w: World, i: Intent) => void;
}

export function playLife(o: LifeSetupOpts): { result: LifeResult; world: World } {
  const p = paramsFor(o.difficulty);
  const w = new World(p, { fish: o.fish, conditions: o.conditions, difficulty: o.difficulty, siblings: o.siblings, seed: o.seed, firstLife: o.firstLife ?? false });
  if (o.startStage) w.debugJumpTo(o.startStage);
  const bot = new Bot(SKILLS[o.skill], (o.seed ^ 0x5bd1e995) >>> 0);
  const attempts: Attempt[] = [];
  let fishUsed = 1;
  let timeout = false;
  let role: string | undefined;
  const maxSteps = Math.round(MAX_ATTEMPT_SECONDS / w.dt);
  let sibName = 0;
  for (;;) {
    bot.begin();
    const marker = w.checkpoint.stageIndex === w.stageIndex ? w.checkpoint.marker : 0;
    if (w.stageId === 'spawn') role = roleOf(w);
    let steps = 0;
    while (w.status === 'playing' && steps < maxSteps) {
      const it = bot.act(w);
      w.step(it);
      o.onStep?.(w, it);
      steps++;
      if ((steps & 255) === 0) w.drainEvents();
    }
    w.drainEvents();
    const a: Attempt = { stage: w.stageId, marker, outcome: w.status === 'dead' ? 'dead' : w.status === 'playing' ? 'timeout' : 'ok', seconds: w.stageTime };
    if (w.status === 'dead') {
      a.cause = w.deathCause ?? 'unknown';
      if (w.stageId === 'return') {
        const L = returnLayout(w);
        a.where = L && w.body.pos.x < L.coast ? 'sea' : 'river';
      }
    }
    const av = alevinView(w);
    if (av && w.status === 'stageComplete' && av.broodTotal > 0) a.brood = 1 - av.broodLost / av.broodTotal;
    if (w.stageId === 'ocean' && w.fish.sex === 'M' && w.progress.isJack !== null && (w.status !== 'dead' || w.deathCause === 'sea')) a.jack = w.progress.isJack;
    if (w.status === 'playing') a.stuckAt = [w.body.pos.x, w.body.pos.y, w.body.pos.z].map((v) => Math.round(v * 10) / 10) as [number, number, number];
    attempts.push(a);
    if (w.status === 'playing') {
      timeout = true;
      break;
    }
    if (w.status === 'lifeComplete') break;
    if (w.status === 'stageComplete') {
      if (!w.advance()) break;
      continue;
    }
    // Dead.
    if (!w.canContinueWithSibling()) break;
    w.continueWithSibling(`Sib${++sibName}`);
    fishUsed++;
  }
  const last = attempts[attempts.length - 1];
  const result: LifeResult = {
    difficulty: o.difficulty,
    skill: o.skill,
    sex: o.fish.sex,
    brood: o.siblings + 1,
    completed: w.status === 'lifeComplete',
    timeout,
    fishUsed,
    attempts,
    isJack: w.progress.isJack,
    oceanYears: w.progress.oceanYears,
    adultSize: w.progress.adultSize,
    playSeconds: attempts.reduce((s, x) => s + x.seconds, 0),
    conditions: o.conditions,
    fish: w.fish,
  };
  if (role) result.role = role;
  if (!result.completed && last) result.failedAt = last.stage;
  if (w.spawnResult) result.fitness = w.spawnResult.relativeFitness;
  return { result, world: w };
}

/** A single life with a freshly founded fish of random sex in a random year. */
export function playSingleLife(difficulty: Difficulty, skill: SkillName, index: number, baseSeed: number, onStep?: LifeSetupOpts['onStep']): LifeResult {
  const p = paramsFor(difficulty);
  const seed = hashSeed(baseSeed, difficulty, skill, index);
  const r = new Rng(seed);
  const sex = r.chance(0.5) ? 'F' : 'M';
  const l = foundLineage(p, { preset: 'quick', sex, name: 'Bal', difficulty, seed: r.int(1, 2 ** 31) });
  // Alternate pink-salmon years so both crowded and quiet oceans are sampled.
  const conditions = randomPopulationYear(p, r, 1 + (index % 2));
  const opts: LifeSetupOpts = { difficulty, skill, fish: l.current, conditions, siblings: siblingsFor(p, l), seed: r.int(1, 2 ** 31) };
  if (onStep) opts.onStep = onStep;
  return playLife(opts).result;
}

/** Spawning-role experiment: start at the spawning grounds as a given role. */
export function playSpawnRole(difficulty: Difficulty, skill: SkillName, role: 'female' | 'largeMale' | 'jack', index: number, baseSeed: number): LifeResult {
  const p = paramsFor(difficulty);
  const seed = hashSeed(baseSeed, difficulty, `${skill}/${role}`, index);
  const r = new Rng(seed);
  for (let tries = 0; tries < 200; tries++) {
    const l = foundLineage(p, { preset: role === 'jack' ? 'jack' : 'quick', sex: role === 'female' ? 'F' : 'M', name: 'Bal', difficulty, seed: r.int(1, 2 ** 31) });
    const conditions = randomPopulationYear(p, r, 1 + (index % 2));
    const out = playLife({ difficulty, skill, fish: l.current, conditions, siblings: 0, seed: r.int(1, 2 ** 31), startStage: 5 });
    // A quick-start male occasionally matures as a jack; redraw until the role matches.
    if (out.result.role === role) return out.result;
  }
  throw new Error(`could not draw a ${role}`);
}

export interface GenerationRow {
  lineage: number;
  generation: number;
  sex: 'F' | 'M';
  isStray: boolean;
  isJack: boolean | null;
  completed: boolean;
  failedAt?: StageId;
  fishUsed: number;
  brood: number;
  bv: TraitValues;
  conditions: YearConditions;
  fitness?: number;
}

export interface LineageResult {
  difficulty: Difficulty;
  skill: SkillName;
  generations: GenerationRow[];
  extinctAt: number | null;
  strays: number;
  timeouts: number;
}

/** A multi-generation run: offspring picked at random from the three offered. */
export function playLineage(difficulty: Difficulty, skill: SkillName, index: number, gens: number, baseSeed: number): LineageResult {
  const p = paramsFor(difficulty);
  const seed = hashSeed(baseSeed, difficulty, `lineage/${skill}`, index);
  const r = new Rng(seed);
  const l = foundLineage(p, { preset: 'quick', sex: r.chance(0.5) ? 'F' : 'M', name: 'Line', difficulty, seed: r.int(1, 2 ** 31) });
  const out: LineageResult = { difficulty, skill, generations: [], extinctAt: null, strays: 0, timeouts: 0 };
  let names = 0;
  for (let g = 0; g < gens; g++) {
    const played = l.current;
    const { result, world } = playLife({
      difficulty,
      skill,
      fish: played,
      conditions: l.conditions,
      siblings: siblingsFor(p, l),
      seed: r.int(1, 2 ** 31),
      firstLife: l.records.length === 0,
    });
    if (result.timeout) out.timeouts++;
    const row: GenerationRow = {
      lineage: index,
      generation: played.generation,
      sex: played.sex,
      isStray: played.isStray,
      isJack: result.isJack,
      completed: result.completed,
      fishUsed: result.fishUsed,
      brood: result.brood,
      bv: { ...played.bv },
      conditions: l.conditions,
    };
    if (result.failedAt) row.failedAt = result.failedAt;
    if (result.fitness !== undefined) row.fitness = result.fitness;
    out.generations.push(row);
    recordLife(l, {
      fishId: world.fish.id,
      name: world.fish.name,
      sex: world.fish.sex,
      generation: world.fish.generation,
      isJack: world.progress.isJack,
      oceanYears: world.progress.oceanYears,
      adultSize: world.progress.adultSize,
      conditions: world.conditions,
      deaths: [],
      spawned: result.completed,
      result: world.spawnResult,
      isStray: world.fish.isStray,
      lockedJack: world.fish.lockedJack,
      bv: { ...world.fish.bv },
      habitat: world.fish.habitat,
      offspring: [],
      chosenId: null,
    });
    if (g === gens - 1) break;
    if (result.completed) {
      const kids = offerOffspring(p, l, world.fish);
      const kid = kids[r.int(0, kids.length)];
      if (!kid) throw new Error('no offspring');
      advanceGeneration(p, l, kid, `K${++names}`);
    } else if (difficulty === 'fieldGuide') {
      strayRescue(p, l, `S${++names}`);
      out.strays++;
    } else {
      markExtinct(l);
      out.extinctAt = played.generation;
      break;
    }
  }
  return out;
}

export function hashSeed(base: number, ...parts: (string | number)[]): number {
  let h = (base ^ 0x811c9dc5) >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x2f, 0x01000193) >>> 0;
  }
  return h || 1;
}

export { STAGE_IDS, TRAIT_IDS };
