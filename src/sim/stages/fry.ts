/**
 * Stage 2: fry in the lake. A few authored moments joined by time skips:
 * - lesson: early summer at the weed edge. A Dolly Varden warns, then chases;
 *   the player learns to read the rings and dart into the weeds.
 * - dusk: midsummer evenings. Plankton rises toward the surface as the light
 *   fades; the richest food is high in open water, where the predators hunt.
 * - winter: under the ice. Cold slows the fish, food is scarce, and reserves
 *   must last. Running out burns the summer's growth.
 * - decide: spring. Leave through the outlet now (most sockeye do), or stay a
 *   second year: a bigger fish, but another summer among the predators.
 * - second: the second summer, for fish that stayed.
 *
 * Growth contract: lake growth is recorded in progress.fryBites and
 * progress.fryRichBites (net plain-bite equivalents; see lakeGrowth). The
 * ocean stage turns it into growthPerf in decideMaturation.
 */
import { swimStep } from '../swim';
import type { Entity, LifeProgress } from '../types';
import type { Params } from '../params';
import { clamp, dist, lerp, norm, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

const WEED_EDGE = -19;
/** Past this x the fish is in the outlet current and leaves the lake. */
const OUTLET_X = 25;

export type FryPhase = 'lesson' | 'dusk' | 'winter' | 'decide' | 'second' | 'skip';
type Next = Exclude<FryPhase, 'skip'> | 'done';

interface FryState {
  phase: FryPhase;
  /** What follows the current time skip. */
  next: Next;
  phaseTime: number;
  skipLeft: number;
  /** Total lake growth so far (growth units). */
  growth: number;
  /** Growth at the start of this year, for the spring hint. */
  yearStart: number;
  /** Fractional plain-bite equivalents not yet written to progress. */
  carry: number;
  lakeYears: number;
  stayTime: number;
  lessonTroutId: number;
  lessonDone: boolean;
}

const st = (w: World) => w.stage as unknown as FryState;

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Lake growth (growth units) recorded in a life's progress. */
export function lakeGrowth(p: Params, pr: LifeProgress): number {
  const plainEq = pr.fryBites + (p.get('fry.richPatchMultiplier') - 1) * pr.fryRichBites;
  return Math.max(0, plainEq) * p.get('fry.planktonGrowth');
}

/** Freshwater growth score 0..1 for maturation: lake growth against a full two-year record. */
export function freshwaterScore(p: Params, pr: LifeProgress): number {
  return clamp(lakeGrowth(p, pr) / p.get('fry.fullLakeGrowth'), 0, 1);
}

/** Phase durations are shorter after the first life. */
function dur(w: World, id: string): number {
  return w.p.get(id) * (w.firstLife ? 1 : w.p.get('fry.laterLifeScale'));
}

const inWeeds = (x: number): boolean => x < WEED_EDGE;

/** Add (or remove) growth and keep the progress record in step with it. */
function addGrowth(w: World, g: number, rich = false): void {
  const s = st(w);
  const p = w.p;
  const pr = w.progress;
  s.growth = Math.max(0, s.growth + g);
  if (rich) {
    // A rich bite is recorded exactly; the multiplier is already in lakeGrowth.
    pr.fryBites += 1;
    pr.fryRichBites += 1;
    return;
  }
  s.carry += g / p.get('fry.planktonGrowth');
  while (s.carry >= 1) {
    pr.fryBites += 1;
    s.carry -= 1;
  }
  while (s.carry <= -1 && pr.fryBites > pr.fryRichBites) {
    pr.fryBites -= 1;
    s.carry += 1;
  }
  if (s.carry <= -1) s.carry = -0.999;
}

// ---------- entities ----------

function spawnPatch(w: World, rich: boolean): void {
  const cx = rich ? w.rng.range(-6, 24) : w.rng.range(-18, -10);
  const cz = w.rng.range(-20, 20);
  const n = 12;
  for (let i = 0; i < n; i++) {
    // home.y is the offset from the patch's depth, which changes through the evening.
    const home = v3(cx + w.rng.range(-2.5, 2.5), w.rng.range(-1.5, 1.5), cz + w.rng.range(-2.5, 2.5));
    w.spawn('plankton', v3(home.x, -4 + home.y, home.z), { radius: 0.15, value: rich ? 1 : 0, home });
  }
}

/** Depth of the open-water plankton: deep by day, near the surface at dusk. */
function planktonDepth(w: World): number {
  const s = st(w);
  const p = w.p;
  if (s.phase === 'lesson') return p.get('fry.dayPlanktonDepth') * 0.6;
  if (s.phase === 'dusk' || s.phase === 'second') {
    const k = smooth(0, 0.45, s.phaseTime / dur(w, s.phase === 'dusk' ? 'fry.duskDuration' : 'fry.secondDuration'));
    return lerp(p.get('fry.dayPlanktonDepth'), p.get('fry.duskPlanktonDepth'), k);
  }
  return p.get('fry.dayPlanktonDepth');
}

function spawnTrout(w: World, home = v3(w.rng.range(0, 18), -5, w.rng.range(-15, 15))): Entity {
  const r = w.p.get('fry.troutPatrolRadius');
  return w.spawn('trout', v3(home.x + r, home.y, home.z), { radius: 0.8, state: 'patrol', home, yaw: w.rng.range(0, 6) });
}

function spawnWinterFood(w: World): void {
  w.spawn('plankton', v3(w.rng.range(-26, 26), w.rng.range(-8, -2), w.rng.range(-26, 26)), { radius: 0.15, value: 0, state: 'winter' });
}

function clearMoment(w: World): void {
  for (const e of w.entities) if (e.kind !== 'weed') e.alive = false;
}

function stepTrout(w: World, t: Entity, dt: number, speedScale: number, forceWarn: boolean): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  const d = dist(t.pos, fish);
  const hidden = inWeeds(fish.x);
  t.timer -= dt;
  if (t.state === 'patrol') {
    // Slow circling around a home point.
    const home = t.home ?? v3();
    const r = p.get('fry.troutPatrolRadius');
    const sp = p.get('fry.troutPatrolSpeed') * speedScale;
    t.yaw += (sp / r) * dt;
    const target = v3(home.x + Math.cos(t.yaw) * r, home.y, home.z + Math.sin(t.yaw) * r);
    const dir = norm(sub(target, t.pos));
    t.vel = v3(dir.x * sp, dir.y * sp, dir.z * sp);
    if (!hidden && (forceWarn || d < p.get('fry.troutDetect'))) {
      t.state = 'warn';
      t.timer = t.id === s.lessonTroutId ? p.get('fry.lessonWarning') : p.get('fry.troutWarning');
      w.emit('warning', 'trout');
      w.emitOnce('caption', 'fry.trout');
    }
  } else if (t.state === 'warn') {
    const dir = norm(sub(fish, t.pos));
    t.vel = v3(dir.x * 1.5 * speedScale, dir.y * 1.5 * speedScale, dir.z * 1.5 * speedScale);
    if (t.timer <= 0) {
      t.state = 'chase';
      t.timer = p.get('fry.troutChaseTime');
    }
  } else if (t.state === 'chase') {
    const dir = norm(sub(fish, t.pos));
    const sp = p.get('fry.troutSpeed') * speedScale;
    t.vel = v3(dir.x * sp, dir.y * sp, dir.z * sp);
    if (d < p.get('fry.catchRadius')) {
      w.die('trout');
      return;
    }
    if (hidden || t.timer <= 0) {
      t.state = 'patrol';
      if (hidden) w.emitOnce('caption', 'fry.safeWeeds');
      if (t.id === s.lessonTroutId && !s.lessonDone) {
        s.lessonDone = true;
        s.phaseTime = Math.max(s.phaseTime, dur(w, 'fry.lessonMax') - 4);
        if (hidden) w.emit('caption', 'fry.lessonDone');
      }
    }
  }
  t.pos.x += t.vel.x * dt;
  t.pos.y += t.vel.y * dt;
  t.pos.z += t.vel.z * dt;
  // Predators will not enter the weed bed.
  if (t.pos.x < WEED_EDGE + 1) t.pos.x = WEED_EDGE + 1;
  t.pos.y = Math.min(-0.8, Math.max(w.arena.floor(t.pos.x, t.pos.z) + 0.5, t.pos.y));
  t.pos.x = clamp(t.pos.x, w.arena.min.x, w.arena.max.x);
  t.pos.z = clamp(t.pos.z, w.arena.min.z, w.arena.max.z);
}

// ---------- moments ----------

function setScale(w: World): void {
  const p = w.p;
  w.body.scale = p.get('fry.startScale') + p.get('fry.scalePerGrowth') * Math.min(st(w).growth, p.get('fry.fullLakeGrowth'));
}

function setup(w: World, phase: Next): void {
  const s = st(w);
  const p = w.p;
  clearMoment(w);
  if (phase === 'done') {
    w.emit('caption', s.lakeYears >= 2 ? 'fry.leaveSecond' : 'fry.leave');
    w.completeStage();
    return;
  }
  s.phase = phase;
  s.phaseTime = 0;
  w.body.vel = v3();
  w.body.pitch = 0;
  setScale(w);
  switch (phase) {
    case 'lesson': {
      w.body.pos = v3(-23, -3, 0);
      w.body.yaw = 0;
      // A patch just outside the weeds, and one Dolly Varden that will come for it.
      for (let i = 0; i < 14; i++) {
        const home = v3(w.rng.range(-17, -12), w.rng.range(-1.2, 1.2), w.rng.range(-3, 3));
        w.spawn('plankton', v3(home.x, -4 + home.y, home.z), { radius: 0.15, value: 0, home });
      }
      s.lessonTroutId = spawnTrout(w, v3(-2, -4, 0)).id;
      s.lessonDone = false;
      break;
    }
    case 'dusk':
    case 'second': {
      w.body.pos = v3(-22, -3, w.rng.range(-6, 6));
      w.body.yaw = 0;
      w.body.energy = 1;
      spawnPatch(w, false);
      spawnPatch(w, false);
      spawnPatch(w, true);
      spawnPatch(w, true);
      spawnPatch(w, true);
      const n = p.get('fry.troutCount') + (phase === 'second' ? p.get('fry.secondYearTrout') : 0);
      for (let i = 0; i < n; i++) spawnTrout(w);
      if (phase === 'second') {
        s.lakeYears = 2;
        s.yearStart = s.growth;
        w.setCheckpoint(2);
        w.emit('caption', 'fry.second');
      }
      break;
    }
    case 'winter': {
      w.body.pos = v3(-14, -6, 0);
      w.body.yaw = 0;
      // Reserves from the summer: a fish that fed well starts the winter fuller.
      const summer = (s.growth - s.yearStart) / p.get('fry.growthTarget');
      w.body.energy = clamp(p.get('fry.winterReserveBase') + p.get('fry.winterReservePerGrowth') * summer, 0.2, 1);
      w.spawn('ice', v3(0, -0.04, 0), { radius: 0, size: v3(w.arena.max.x - w.arena.min.x + 30, 0.1, w.arena.max.z - w.arena.min.z + 30) });
      for (let i = 0; i < p.get('fry.winterFoodCount'); i++) spawnWinterFood(w);
      spawnTrout(w, v3(6, -6, w.rng.range(-10, 10)));
      w.setCheckpoint(1);
      w.emit('caption', 'fry.winterHint');
      break;
    }
    case 'decide': {
      w.body.pos = v3(-12, -3, 0);
      w.body.yaw = 0;
      w.body.energy = 1;
      // The outflowing current, made visible as drifting specks toward the outlet.
      for (let i = 0; i < 70; i++) w.spawn('scent', v3(w.rng.range(-10, 29), w.rng.range(-5, -1.5), w.rng.range(-3, 3)), { radius: 0.1, timer: 9, value: 2 });
      s.stayTime = 0;
      const grew = s.growth - s.yearStart;
      w.emit('caption', 'fry.decide');
      w.emit('caption', grew >= p.get('fry.growthTarget') ? 'fry.decideGrown' : 'fry.decideSmall');
      break;
    }
  }
}

/** Begin a time skip: the scene fades, the moment is cleared, then `next` is set up. */
function skipTo(w: World, next: Next, captionId: string): void {
  const s = st(w);
  clearMoment(w);
  s.phase = 'skip';
  s.next = next;
  s.phaseTime = 0;
  s.skipLeft = w.p.get('fry.skipSeconds');
  w.body.vel = v3();
  w.emit('caption', captionId);
}

function feed(w: World): void {
  const p = w.p;
  const fish = w.body.pos;
  const depth = planktonDepth(w);
  for (const e of w.entities) {
    if (!e.alive || e.kind !== 'plankton') continue;
    if (dist(e.pos, fish) < 0.9) {
      e.alive = false;
      if (e.state === 'winter') {
        addGrowth(w, p.get('fry.winterBiteGrowth'));
        w.body.energy = Math.min(1, w.body.energy + p.get('fry.winterBiteEnergy'));
      } else {
        const rich = e.value === 1;
        addGrowth(w, p.get('fry.planktonGrowth') * (rich ? p.get('fry.richPatchMultiplier') : 1), rich);
      }
      w.emit('eat');
    } else if (e.state === 'winter') {
      e.pos.y += Math.sin(w.stageTime * 0.5 + e.id) * 0.002;
    } else if (e.value === 1 && e.home) {
      // Open-water plankton follows the light: deep by day, high at dusk.
      const want = -depth + e.home.y + Math.sin(w.stageTime * 0.7 + e.id) * 0.25;
      e.pos.y += (want - e.pos.y) * Math.min(1, 0.8 * w.dt);
    } else {
      e.pos.y += Math.sin(w.stageTime * 0.7 + e.id) * 0.004;
    }
  }
}

export interface FryView {
  phase: FryPhase;
  next: Next;
  /** Light level 0..1 for the renderer. */
  light: number;
  /** 0..1: how far into darkness a time skip has faded the scene (0 outside skips). */
  fade: number;
  lakeYears: number;
  growth: number;
  inWeeds: boolean;
  outletX: number;
  weedEdge: number;
}

export function fryView(w: World): FryView | null {
  if (w.stageId !== 'fry') return null;
  const s = st(w);
  if (!s.phase) return null;
  const p = w.p;
  let light = 1;
  let fade = 0;
  const phaseLight = (ph: FryPhase | Next): number => {
    if (ph === 'winter') return p.get('fry.winterLight');
    if (ph === 'dusk' || ph === 'second') {
      const k = smooth(0.2, 0.7, s.phaseTime / dur(w, ph === 'dusk' ? 'fry.duskDuration' : 'fry.secondDuration'));
      return lerp(1, p.get('fry.duskLight'), ph === s.phase ? k : 0);
    }
    return 1;
  };
  if (s.phase === 'skip') {
    // Fade down and back up across the skip.
    const t = 1 - s.skipLeft / p.get('fry.skipSeconds');
    fade = 1 - Math.abs(1 - 2 * t);
    light = 0.08 + 0.92 * Math.abs(1 - 2 * t) * (t < 0.5 ? 1 : phaseLight(s.next));
  } else light = phaseLight(s.phase);
  return { phase: s.phase, next: s.next, light, fade, lakeYears: s.lakeYears, growth: s.growth, inWeeds: inWeeds(w.body.pos.x), outletX: OUTLET_X, weedEdge: WEED_EDGE };
}

export const fryStage: StageDef = {
  id: 'fry',
  arena: () => ({
    kind: 'lake',
    min: v3(-30, -12, -30),
    max: v3(30, 0, 30),
    surfaceY: 0,
    water: 'fresh',
    floor: (x, z) => {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const shelf = x < WEED_EDGE ? 5 : 0;
      return -11 + 7 * smooth(20, 30, edge) + shelf;
    },
    current: () => v3(),
  }),
  init(w, marker) {
    w.body.pos = v3(-25, -3, 0);
    w.body.yaw = 0;
    w.body.energy = Math.min(1, 0.6 + 0.4 * w.progress.yolk);
    // A sibling resuming mid-stage carries on with the growth recorded at the checkpoint.
    const g = lakeGrowth(w.p, w.progress);
    const s: FryState = {
      phase: 'lesson',
      next: 'dusk',
      phaseTime: 0,
      skipLeft: 0,
      growth: g,
      yearStart: marker >= 2 ? g : 0,
      carry: 0,
      lakeYears: marker >= 2 ? 2 : 1,
      stayTime: 0,
      lessonTroutId: -1,
      lessonDone: false,
    };
    w.stage = s as unknown as Record<string, unknown>;
    for (let i = 0; i < 46; i++) {
      w.spawn('weed', v3(w.rng.range(-30, WEED_EDGE), -6, w.rng.range(-29, 29)), { radius: 0.3, value: w.rng.range(0.5, 1) });
    }
    setup(w, marker === 1 ? 'winter' : marker >= 2 ? 'second' : 'lesson');
    if (marker === 0 && w.firstLife) w.emit('caption', 'fry.controls');
  },
  step(w, intent, dt) {
    const s = st(w);
    const p = w.p;
    s.phaseTime += dt;
    if (s.phase === 'skip') {
      s.skipLeft -= dt;
      w.body.vel = v3();
      if (s.skipLeft <= 0) setup(w, s.next);
      return;
    }
    const winter = s.phase === 'winter';
    const e0 = w.body.energy;
    swimStep(w, intent, dt, winter ? { thrustScale: p.get('fry.winterThrust') } : {});
    if (winter) {
      // Cold and hungry: little recovery, and every movement costs reserves.
      const gained = w.body.energy - e0;
      if (gained > 0) w.body.energy = e0 + gained * p.get('fry.winterRegenScale');
      w.body.energy -= (p.get('fry.winterDrain') + p.get('fry.winterSwimDrain') * w.body.thrust) * dt;
      w.body.energy = clamp(w.body.energy, 0, 1);
      if (w.body.energy <= p.get('energy.exhaustedBelow')) {
        addGrowth(w, -p.get('fry.starveLoss') * dt);
        w.emitOnce('caption', 'fry.starving');
      }
      if (w.live('plankton').length < p.get('fry.winterFoodCount') && w.rng.chance(dt / 3)) spawnWinterFood(w);
    }
    feed(w);
    setScale(w);

    const speedScale = winter ? p.get('fry.winterPredatorSpeed') : 1;
    for (const t of w.live('trout')) {
      const force = s.phase === 'lesson' && t.id === s.lessonTroutId && !s.lessonDone && s.phaseTime >= p.get('fry.lessonDelay');
      stepTrout(w, t, dt, speedScale, force);
      if (w.status !== 'playing') return;
    }

    switch (s.phase) {
      case 'lesson':
        if (s.phaseTime > 1 && s.phaseTime - dt <= 1) w.emit('caption', 'fry.lesson');
        if (w.live('plankton').length < 4) {
          for (let i = 0; i < 8; i++) {
            const home = v3(w.rng.range(-17, -12), w.rng.range(-1.2, 1.2), w.rng.range(-3, 3));
            w.spawn('plankton', v3(home.x, -4 + home.y, home.z), { radius: 0.15, value: 0, home });
          }
        }
        if (s.phaseTime >= dur(w, 'fry.lessonMax') && !w.live('trout').some((t) => t.state === 'chase' || t.state === 'warn')) skipTo(w, 'dusk', 'fry.dusk');
        break;
      case 'dusk':
      case 'second': {
        const left = w.live('plankton');
        if (left.filter((e) => e.value === 1).length < 6) spawnPatch(w, true);
        if (left.filter((e) => e.value === 0).length < 6) spawnPatch(w, false);
        const end = dur(w, s.phase === 'dusk' ? 'fry.duskDuration' : 'fry.secondDuration');
        const busy = w.live('trout').some((t) => t.state === 'chase');
        if (s.phaseTime >= end && !busy) {
          if (s.phase === 'dusk') skipTo(w, 'winter', 'fry.winter');
          else skipTo(w, 'done', 'fry.secondWinter');
        }
        break;
      }
      case 'winter': {
        const busy = w.live('trout').some((t) => t.state === 'chase');
        if (s.phaseTime >= dur(w, 'fry.winterDuration') && !busy) skipTo(w, 'decide', 'fry.iceOut');
        break;
      }
      case 'decide': {
        for (const sp of w.live('scent')) {
          sp.pos.x += 2.2 * dt;
          if (sp.pos.x > 29.5) sp.pos.x = -10;
        }
        if (w.body.pos.x >= OUTLET_X) {
          setup(w, 'done');
          return;
        }
        s.stayTime = inWeeds(w.body.pos.x) ? s.stayTime + dt : 0;
        if (s.stayTime >= p.get('fry.stayHold')) {
          w.emit('caption', 'fry.stay');
          skipTo(w, 'second', 'fry.secondSummer');
        } else if (s.phaseTime >= p.get('fry.decideMax')) {
          setup(w, 'done');
        }
        break;
      }
    }
  },
  debugComplete(w) {
    w.progress.fryBites = 10;
    w.progress.fryRichBites = 5;
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.fryBites = 10;
    w.progress.fryRichBites = 5;
  },
};

/** Growth this year relative to a good year's growth (HUD bar). */
export const fryGrowth = (w: World): number => {
  if (w.stageId !== 'fry') return 0;
  const s = st(w);
  return (s.growth - (s.yearStart ?? 0)) / w.p.get('fry.growthTarget');
};
