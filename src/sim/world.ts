/**
 * The simulation world for one life. Pure TypeScript: no rendering, no DOM.
 * The app calls step() at a fixed rate with the player's Intent; the
 * renderer reads the state; the UI drains `events`.
 */
import { makeSibling } from './genetics';
import type { Difficulty, Params } from './params';
import { Rng } from './rng';
import { STAGES, type Arena, type StageDef } from './stages';
import {
  STAGE_IDS,
  type DeathCause,
  type Entity,
  type EntityKind,
  type FishIdentity,
  type Intent,
  type LifeProgress,
  type SimEvent,
  type SimEventType,
  type SpawnResult,
  type StageId,
  type Vec3,
  type YearConditions,
} from './types';
import { v3 } from './vec';

export type WorldStatus = 'playing' | 'dead' | 'stageComplete' | 'lifeComplete';

export interface Body {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  energy: number;
  /** Visual and physical scale, about 1 = adult. */
  scale: number;
  burst: boolean;
  thrust: number;
}

export interface Checkpoint {
  stageIndex: number;
  marker: number;
  progress: LifeProgress;
}

export interface LifeSetup {
  fish: FishIdentity;
  conditions: YearConditions;
  difficulty: Difficulty;
  siblings: number;
  seed: number;
  startStage?: number;
  firstLife?: boolean;
}

export const freshProgress = (): LifeProgress => ({
  yolk: 1,
  fryBites: 0,
  fryRichBites: 0,
  oceanBites: 0,
  growthPerf: 0.5,
  isJack: null,
  oceanYears: null,
  adultSize: null,
  fat: 1,
  imprint: 0,
});

export class World {
  readonly rng: Rng;
  readonly dt: number;
  fish: FishIdentity;
  readonly conditions: YearConditions;
  readonly difficulty: Difficulty;
  readonly firstLife: boolean;
  progress: LifeProgress = freshProgress();
  body: Body = { pos: v3(), vel: v3(), yaw: 0, pitch: 0, energy: 1, scale: 1, burst: false, thrust: 0 };
  stageIndex = 0;
  stageTime = 0;
  time = 0;
  /** Stage-specific scratch state. */
  stage: Record<string, unknown> = {};
  arena!: Arena;
  entities: Entity[] = [];
  events: SimEvent[] = [];
  status: WorldStatus = 'playing';
  deathCause: DeathCause | null = null;
  siblingsLeft: number;
  checkpoint: Checkpoint;
  spawnResult: SpawnResult | null = null;
  private nextEntityId = 1;
  private shownOnce = new Set<string>();

  constructor(
    readonly p: Params,
    setup: LifeSetup,
  ) {
    this.rng = new Rng(setup.seed);
    this.dt = 1 / p.get('sim.stepHz');
    this.fish = setup.fish;
    this.conditions = setup.conditions;
    this.difficulty = setup.difficulty;
    this.firstLife = setup.firstLife ?? false;
    this.siblingsLeft = setup.siblings;
    const start = setup.startStage ?? 0;
    this.checkpoint = { stageIndex: start, marker: 0, progress: { ...this.progress } };
    this.startStage(start, 0);
  }

  get stageId(): StageId {
    return STAGE_IDS[this.stageIndex] as StageId;
  }

  get stageDef(): StageDef {
    return STAGES[this.stageId];
  }

  startStage(index: number, marker: number): void {
    this.stageIndex = index;
    this.stageTime = 0;
    this.stage = {};
    this.entities = [];
    this.status = 'playing';
    this.deathCause = null;
    this.body = { pos: v3(), vel: v3(), yaw: 0, pitch: 0, energy: 1, scale: 1, burst: false, thrust: 0 };
    const def = this.stageDef;
    this.arena = def.arena(this);
    def.init(this, marker);
    this.emit('caption', `${this.stageId}.intro`);
  }

  step(intent: Intent): void {
    if (this.status !== 'playing') return;
    this.time += this.dt;
    this.stageTime += this.dt;
    this.stageDef.step(this, intent, this.dt);
    if (this.entities.length > 400) this.entities = this.entities.filter((e) => e.alive);
  }

  emit(type: SimEventType, key?: string, vars?: Record<string, string | number>): void {
    const ev: SimEvent = { t: this.time, type };
    if (key !== undefined) ev.key = key;
    if (vars !== undefined) ev.vars = vars;
    this.events.push(ev);
  }

  /** Emit a caption or warning only the first time in this world. */
  emitOnce(type: SimEventType, key: string, vars?: Record<string, string | number>): void {
    if (this.shownOnce.has(key)) return;
    this.shownOnce.add(key);
    this.emit(type, key, vars);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  spawn(kind: EntityKind, pos: Vec3, extra: Partial<Entity> = {}): Entity {
    const e: Entity = { id: this.nextEntityId++, kind, pos, vel: v3(), yaw: 0, radius: 0.5, state: 'idle', timer: 0, alive: true, ...extra };
    this.entities.push(e);
    return e;
  }

  live(kind: EntityKind): Entity[] {
    return this.entities.filter((e) => e.alive && e.kind === kind);
  }

  die(cause: DeathCause): void {
    if (this.status !== 'playing') return;
    this.status = 'dead';
    this.deathCause = cause;
    this.emit('death', `death.${cause}`);
  }

  /** Mark a mid-stage checkpoint the next sibling resumes from. */
  setCheckpoint(marker: number): void {
    if (this.checkpoint.stageIndex === this.stageIndex && this.checkpoint.marker >= marker) return;
    this.checkpoint = { stageIndex: this.stageIndex, marker, progress: { ...this.progress } };
    this.emit('checkpoint', `${this.stageId}.checkpoint`);
  }

  completeStage(): void {
    if (this.status !== 'playing') return;
    this.status = 'stageComplete';
    this.emit('stageComplete', this.stageId);
  }

  /** Move to the next stage after a stageComplete. Returns false at the end of life. */
  advance(): boolean {
    if (this.status !== 'stageComplete') return false;
    const next = this.stageIndex + 1;
    if (next >= STAGE_IDS.length) return false;
    this.checkpoint = { stageIndex: next, marker: 0, progress: { ...this.progress } };
    this.startStage(next, 0);
    return true;
  }

  canContinueWithSibling(): boolean {
    return this.status === 'dead' && this.siblingsLeft > 0;
  }

  /** Replace a dead fish with a sibling at the last checkpoint. */
  continueWithSibling(name: string): FishIdentity {
    if (!this.canContinueWithSibling()) throw new Error('No sibling available');
    this.siblingsLeft -= 1;
    const sib = makeSibling(this.p, this.rng, this.fish, name);
    // Siblings share the fate decided so far (jack status, ocean years) from the checkpoint.
    this.fish = sib;
    this.progress = { ...this.checkpoint.progress };
    // One-time captions are per fish: a sibling sees them again.
    this.shownOnce.clear();
    this.startStage(this.checkpoint.stageIndex, this.checkpoint.marker);
    return sib;
  }

  finishLife(result: SpawnResult): void {
    if (this.status !== 'playing') return;
    this.spawnResult = result;
    this.status = 'lifeComplete';
    this.emit('lifeComplete');
  }

  /** Resume a saved life at a checkpoint. */
  restore(cp: Checkpoint): void {
    this.checkpoint = { stageIndex: cp.stageIndex, marker: cp.marker, progress: { ...cp.progress } };
    this.progress = { ...cp.progress };
    this.startStage(cp.stageIndex, cp.marker);
  }

  /** Playtest helper: finish the current stage as a success. */
  debugComplete(): void {
    if (this.status !== 'playing') return;
    this.stageDef.debugComplete(this);
  }

  /** Playtest helper: jump to a stage with plausible progress. */
  debugJumpTo(index: number): void {
    for (let i = 0; i < index; i++) {
      const def = STAGES[STAGE_IDS[i] as StageId];
      def.fillProgress?.(this);
    }
    this.checkpoint = { stageIndex: index, marker: 0, progress: { ...this.progress } };
    this.startStage(index, 0);
  }

  /** A short readable summary for the playtest feedback button. */
  summary(): Record<string, unknown> {
    return {
      stage: this.stageId,
      stageTime: Number(this.stageTime.toFixed(1)),
      status: this.status,
      deathCause: this.deathCause,
      fish: { name: this.fish.name, sex: this.fish.sex, generation: this.fish.generation, lockedJack: this.fish.lockedJack, z: this.fish.z },
      progress: this.progress,
      conditions: this.conditions,
      difficulty: this.difficulty,
      siblingsLeft: this.siblingsLeft,
      body: { pos: this.body.pos, energy: Number(this.body.energy.toFixed(2)) },
    };
  }
}
