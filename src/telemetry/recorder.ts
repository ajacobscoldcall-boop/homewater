/**
 * The play log's recorder: turns what App already sees each frame (the world,
 * the SimEvents it drained, the renderer's near-miss count) into life and
 * stage-attempt records. Pure: no DOM, no storage, no network; the clock and
 * the settings come in from outside, so it runs in unit tests against a real
 * World. It only reads the world, never writes it.
 */
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { PLAYLOG } from './config';
import { PLAYLOG_VERSION, type LifeLog, type PlayLogSettings, type Role, type StageAttempt } from './types';

export interface RecorderOptions {
  /** Wall clock in milliseconds since the epoch. */
  now: () => number;
  settings: () => PlayLogSettings;
  /** Called when a life's record changes in a way worth keeping: `ended` when an attempt or the life has just closed. */
  onChange: (life: LifeLog, ended: boolean) => void;
  /** Overrides for tests. */
  sampleEvery?: number;
  maxSamples?: number;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;

export function roleOf(w: World): Role {
  if (w.fish.sex === 'F') return 'female';
  if (w.fish.lockedJack || w.progress.isJack === true) return 'jack';
  return w.progress.isJack === false ? 'male' : 'male (undecided)';
}

function markerOf(w: World): number {
  return w.checkpoint.stageIndex === w.stageIndex ? w.checkpoint.marker : 0;
}

export class PlayLogRecorder {
  private world: World | null = null;
  private life: LifeLog | null = null;
  private attempt: StageAttempt | null = null;
  private nextSample = 0;
  private sampleEvery: number;
  private readonly maxSamples: number;
  private lastHits = 0;
  private lastSeen = 0;
  private lastStageTime = 0;

  constructor(private readonly o: RecorderOptions) {
    this.sampleEvery = o.sampleEvery ?? PLAYLOG.sampleEvery;
    this.maxSamples = o.maxSamples ?? PLAYLOG.maxSamples;
  }

  /** The life being recorded, if any. */
  get current(): LifeLog | null {
    return this.life;
  }

  /**
   * One call per batch of drained events (every playing frame, and every
   * stepSim). `hits` is the renderer's running near-miss count.
   */
  observe(w: World | null, events: SimEvent[], hits = 0): void {
    if (!w) return;
    const now = this.o.now();
    if (w !== this.world) this.startLife(w, now, hits);
    const life = this.life;
    if (!life) return;
    // A new attempt: none open and the fish is playing (a new stage, a sibling, a debug jump).
    let a = this.attempt;
    if (a && (a.stageIndex !== w.stageIndex || a.fish !== w.fish.name || w.stageTime + 1e-6 < this.lastStageTime)) {
      this.closeAttempt('unfinished', w, now);
      a = null;
    }
    if (!a && w.status === 'playing') a = this.openAttempt(w, now, hits);
    if (!a) return;
    // Play time: frame gaps, without pauses (observe isn't called while paused).
    const gap = (now - this.lastSeen) / 1000;
    if (gap > 0) a.playSeconds += Math.min(gap, PLAYLOG.maxFrameGap);
    this.lastSeen = now;
    this.lastStageTime = w.stageTime;
    for (const ev of events) {
      if (ev.type !== 'warning') continue;
      const kind = ev.key ?? 'unknown';
      a.warnings[kind] = (a.warnings[kind] ?? 0) + 1;
      if (a.warningTimes.length < PLAYLOG.maxMoments) a.warningTimes.push([r1(w.stageTime), kind]);
    }
    if (hits < this.lastHits) this.lastHits = hits; // the tracker was reset
    if (hits > this.lastHits) {
      a.nearMisses += hits - this.lastHits;
      if (a.nearMissTimes.length < PLAYLOG.maxMoments) a.nearMissTimes.push(r1(w.stageTime));
      this.lastHits = hits;
    }
    while (w.stageTime >= this.nextSample) {
      this.sample(a, w);
      this.nextSample += this.sampleEvery;
    }
    if (w.status === 'dead') this.closeAttempt('died', w, now);
    else if (w.status === 'stageComplete') this.closeAttempt('completed', w, now);
    else if (w.status === 'lifeComplete') this.closeAttempt('spawned', w, now);
    else this.o.onChange(life, false);
  }

  /** Close what is open (leaving to the title, closing the tab, switching the log off). */
  finish(): void {
    if (this.attempt && this.world) this.closeAttempt('unfinished', this.world, this.o.now());
    this.world = null;
    this.life = null;
  }

  private startLife(w: World, now: number, hits: number): void {
    this.finish();
    this.world = w;
    this.lastHits = hits;
    const settings = this.o.settings();
    this.life = {
      id: `${w.fish.id}-${now.toString(36)}`,
      version: PLAYLOG_VERSION,
      startedAt: new Date(now).toISOString(),
      endedAt: null,
      difficulty: w.difficulty,
      habitat: w.fish.habitat,
      sex: w.fish.sex,
      role: roleOf(w),
      lockedJack: w.fish.lockedJack,
      isStray: w.fish.isStray,
      generation: w.fish.generation,
      firstLife: w.firstLife,
      partial: w.stageIndex > 0 || w.stageTime > 1 || markerOf(w) > 0,
      conditions: { ...w.conditions },
      siblingsAtStart: w.siblingsLeft,
      settings,
      outcome: 'unfinished',
      attempts: [],
    };
  }

  private openAttempt(w: World, now: number, hits: number): StageAttempt {
    const a: StageAttempt = {
      stage: w.stageId,
      stageIndex: w.stageIndex,
      fish: w.fish.name,
      role: roleOf(w),
      startMarker: markerOf(w),
      endMarker: markerOf(w),
      startedAt: new Date(now).toISOString(),
      endedAt: null,
      simSeconds: 0,
      playSeconds: 0,
      outcome: 'unfinished',
      deathCause: null,
      endPos: [0, 0, 0],
      endFat: 1,
      endEnergy: 1,
      siblingsLeft: w.siblingsLeft,
      settings: this.o.settings(),
      warnings: {},
      warningTimes: [],
      nearMisses: 0,
      nearMissTimes: [],
      trace: [],
    };
    this.attempt = a;
    this.life?.attempts.push(a);
    this.sampleEvery = this.o.sampleEvery ?? PLAYLOG.sampleEvery;
    this.nextSample = Math.floor(w.stageTime);
    this.lastStageTime = w.stageTime;
    this.lastSeen = now;
    this.lastHits = hits;
    return a;
  }

  private sample(a: StageAttempt, w: World): void {
    const p = w.body.pos;
    a.trace.push([r1(w.stageTime), r1(p.x), r1(p.y), r1(p.z), r2(w.body.energy), r2(w.progress.fat)]);
    if (a.trace.length > this.maxSamples) {
      a.trace = a.trace.filter((_, i) => i % 2 === 0);
      this.sampleEvery *= 2;
    }
  }

  private closeAttempt(outcome: StageAttempt['outcome'], w: World, now: number): void {
    const a = this.attempt;
    const life = this.life;
    if (!a || !life) return;
    this.attempt = null;
    const p = w.body.pos;
    a.outcome = outcome;
    a.endedAt = new Date(now).toISOString();
    a.simSeconds = r1(w.stageTime);
    a.playSeconds = r1(a.playSeconds);
    a.endMarker = w.stageIndex === a.stageIndex ? markerOf(w) : a.endMarker;
    a.endPos = [r1(p.x), r1(p.y), r1(p.z)];
    a.endFat = r2(w.progress.fat);
    a.endEnergy = r2(w.body.energy);
    a.siblingsLeft = w.siblingsLeft;
    a.role = roleOf(w);
    if (outcome === 'died') a.deathCause = w.deathCause;
    // The life's role and sex follow the fish carrying it (a sibling takes over after a death).
    life.role = a.role;
    life.sex = w.fish.sex;
    if (outcome === 'spawned') life.outcome = 'spawned';
    else if (outcome === 'died' && w.siblingsLeft <= 0) life.outcome = 'broodLost';
    if (life.outcome !== 'unfinished') life.endedAt = a.endedAt;
    this.o.onChange(life, true);
  }
}
