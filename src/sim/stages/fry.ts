/**
 * Stage 2: fry in the lake. A few authored moments joined by time skips:
 * - lesson: early summer at the weed edge. A Dolly Varden warns, then chases;
 *   the player learns to read the rings and dart into the weeds.
 * - summer: lake days the player lives through (fryDay): daylight, when the
 *   plankton sinks into deep, cold, dark water and so should the fry; dusk and
 *   dawn, when the plankton rises and the best feeding is up high in the
 *   half-light; night, too dark to feed or to be seen. Dolly Varden patrol the
 *   weed edge and the deep water, and see farther in brighter water; mergansers
 *   hunt from the surface over the shallows and near the top (deep water is the
 *   escape). Warm water near the surface and in the shallows burns growth; cold
 *   deep water costs nothing but makes each bite count for less.
 * - winter: under the ice. Cold slows the fish, food is scarce, and reserves
 *   must last. Running out burns the summer's growth.
 * - decide: spring. Leave through the outlet now (most sockeye do), or stay a
 *   second year: a bigger fish, but another summer among the predators.
 * - second: the second summer (more lake days), for fish that stayed.
 *
 * Growth contract: lake growth is recorded in progress.fryBites and
 * progress.fryRichBites (net plain-bite equivalents; see lakeGrowth). The
 * ocean stage turns it into growthPerf in decideMaturation.
 */
import { fillImprint, stepFryImprint } from '../imprint';
import { swimStep } from '../swim';
import { patchSizeFor } from '../population';
import type { Entity, LifeProgress } from '../types';
import type { Params } from '../params';
import { curvedChase, personalityOf } from '../personality';
import { clamp, dist, distXZ, lerp, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

const WEED_EDGE = -19;
/** Past this x the fish is in the outlet current and leaves the lake. */
const OUTLET_X = 25;

/** Where the teaching char and the weed-edge char circle. */
const EDGE_CHAR = v3(-12, -3.5, 0);

export type FryPhase = 'lesson' | 'summer' | 'winter' | 'decide' | 'second' | 'skip';
/** The time of day in a summer lake day. */
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
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
  /** Lake days since the summer began (whole days plus the fraction of the current one, from dawn). */
  clock: number;
  /** The clock at which this summer ends (the start of a dawn: the last night is over). */
  clockEnd: number;
  /** Seconds of daylight exposure (near the surface or in the shallows) left before a merganser comes. */
  mergTimer: number;
  /** The char that keeps to the weed edge (the others follow the plankton up and down). */
  edgeCharId: number;
  /** Growth lost to warm water this summer, for the caption. */
  warmLost: number;
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
  // Food per fry this year: fewer plankton per patch when the lake is crowded with fry (population.ts).
  const n = patchSizeFor(w.p, w.conditions);
  for (let i = 0; i < n; i++) {
    // home.y is the offset from the patch's depth, which changes through the evening.
    const home = v3(cx + w.rng.range(-2.5, 2.5), w.rng.range(-1.5, 1.5), cz + w.rng.range(-2.5, 2.5));
    // Never inside the weed shelf or the lake bed, where the fry can't reach.
    const y = Math.max(-4 + home.y, w.arena.floor(home.x, home.z) + 0.6);
    w.spawn('plankton', v3(home.x, Math.min(-0.5, y), home.z), { radius: 0.15, value: rich ? 1 : 0, home });
  }
}

export interface FryDay {
  tod: TimeOfDay;
  /** 0..1 daylight at the surface. */
  light: number;
  /** 0..1: how far the plankton has sunk toward its daytime depth (1 by day, 0 from mid-dusk to mid-dawn). */
  sunk: number;
}

/**
 * One lake day, from the start of dawn (c = 0) to the end of night (c = 1): the light, and how far down the plankton is.
 * Pure, so the renderer, the guide, the bots and the tests read the same day.
 */
export function fryDay(p: Params, clock: number): FryDay {
  const c = clock - Math.floor(clock);
  const dawn = p.get('fry.dawnShare');
  const day = dawn + p.get('fry.dayShare');
  const dusk = day + p.get('fry.duskShare');
  const night = p.get('fry.nightLight');
  if (c < dawn) return { tod: 'dawn', light: lerp(night, 1, smooth(0, dawn, c)), sunk: smooth(dawn * 0.5, dawn, c) };
  if (c < day) return { tod: 'day', light: 1, sunk: 1 };
  if (c < dusk) return { tod: 'dusk', light: lerp(1, night, smooth(day, dusk, c)), sunk: 1 - smooth(day, day + (dusk - day) * 0.5, c) };
  return { tod: 'night', light: night, sunk: 0 };
}

const lived = (s: FryState): boolean => s.phase === 'summer' || s.phase === 'second';

/** The summer's lake day, or null outside the lived days (lesson, winter, spring). */
function today(w: World): FryDay | null {
  const s = st(w);
  return lived(s) ? fryDay(w.p, s.clock) : null;
}

/** Depth of the open-water plankton: deep by day, up near the surface from dusk through the night to dawn. */
function planktonDepth(w: World): number {
  const s = st(w);
  const p = w.p;
  if (s.phase === 'lesson') return p.get('fry.dayPlanktonDepth') * 0.6;
  const d = today(w);
  if (d) return lerp(p.get('fry.duskPlanktonDepth'), p.get('fry.dayPlanktonDepth'), d.sunk);
  return p.get('fry.dayPlanktonDepth');
}

/** Daylight reaching a depth (0..1): the surface's light, dimming with depth. */
export function lightAtDepth(p: Params, surfaceLight: number, depth: number): number {
  return surfaceLight * Math.exp(-Math.max(0, depth) / p.get('fry.lightDepth'));
}

/** Warm water: near the surface, or anywhere over the sunlit weed shallows. */
export function warmWater(p: Params, x: number, depth: number): boolean {
  return depth < p.get('fry.warmDepth') || x < WEED_EDGE;
}

/** Surface light now (1 outside the lived days except winter). */
function surfaceLight(w: World): number {
  const s = st(w);
  if (s.phase === 'winter') return w.p.get('fry.winterLight');
  return today(w)?.light ?? 1;
}

/** How far a Dolly Varden sees the fry: its full range in bright water, much less in the dark and the deep. */
function charSight(w: World): number {
  const p = w.p;
  const depth = w.arena.surfaceY - w.body.pos.y;
  const lit = lightAtDepth(p, surfaceLight(w), depth);
  const floor = p.get('fry.detectFloor');
  // Sight falls off steeply as the light goes: in the half-light a char must come close to see a fry.
  return p.get('fry.troutDetect') * (floor + (1 - floor) * Math.pow(lit, p.get('fry.sightCurve')));
}

function spawnTrout(w: World, home = v3(w.rng.range(0, 18), -5, w.rng.range(-15, 15))): Entity {
  const r = w.p.get('fry.troutPatrolRadius');
  return w.spawn('trout', v3(home.x + r, home.y, home.z), { radius: 0.8, state: 'patrol', home, yaw: w.rng.range(0, 6) });
}

function spawnWinterFood(w: World): void {
  const x = w.rng.range(-26, 26);
  const z = w.rng.range(-26, 26);
  const y = Math.min(-0.8, Math.max(w.rng.range(-8, -2), w.arena.floor(x, z) + 0.6));
  w.spawn('plankton', v3(x, y, z), { radius: 0.15, value: 0, state: 'winter' });
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
    // The open-water char follow the plankton: deep by day, higher from dusk to dawn. One keeps to the weed edge.
    const d0 = today(w);
    const y = d0 && t.id !== s.edgeCharId ? -lerp(p.get('fry.charNightDepth'), p.get('fry.charDayDepth'), d0.sunk) : home.y;
    const target = v3(home.x + Math.cos(t.yaw) * r, y, home.z + Math.sin(t.yaw) * r);
    const dir = norm(sub(target, t.pos));
    t.vel = v3(dir.x * sp, dir.y * sp, dir.z * sp);
    if (!hidden && (forceWarn || d < charSight(w))) {
      t.state = 'warn';
      t.timer = t.id === s.lessonTroutId ? p.get('fry.lessonWarning') : p.get('fry.troutWarning');
      w.emit('warning', 'trout');
      w.emitOnce('caption', 'fry.trout');
      // Deep water by day is darker, not empty.
      if (today(w)?.tod === 'day' && w.arena.surfaceY - fish.y > p.get('fry.warmDepth')) w.emitOnce('caption', 'fry.charDeep');
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
    // In dim water a char that falls far enough behind loses sight of the fry (not the teaching char).
    const lost = t.id !== s.lessonTroutId && d > charSight(w) * p.get('fry.chaseSight');
    if (hidden || lost || t.timer <= 0) {
      t.state = 'patrol';
      if (hidden) w.emitOnce('caption', 'fry.safeWeeds');
      else if (lost) w.emitOnce('caption', 'fry.charLost');
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

// ---------- mergansers ----------

/** Within a merganser's reach: in the shallows over the weeds, or not deep enough in open water. */
function inBirdReach(w: World): boolean {
  return w.arena.surfaceY - w.body.pos.y < w.p.get('fry.mergReach');
}

/**
 * Mergansers hunt from the surface by daylight and in the half-light. Time spent within reach in the light brings
 * one: it lands and paddles toward the fry (its shape against the bright surface and the ripples are the warning),
 * then dives and chases. Going deeper than it can follow is the escape; the weeds do not hide a fry from above.
 */
function stepMergansers(w: World, dt: number): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  const light = surfaceLight(w);
  const hunting = light >= p.get('fry.mergMinLight');
  if (hunting && inBirdReach(w) && w.live('merganser').length === 0) {
    s.mergTimer -= dt * light;
    if (s.mergTimer <= 0) {
      s.mergTimer = p.get('fry.mergInterval') * w.rng.range(0.7, 1.3);
      const a = w.body.yaw + w.rng.range(-0.9, 0.9);
      const r = w.rng.range(5, 8);
      const at = v3(clamp(fish.x + Math.cos(a) * r, w.arena.min.x + 1, w.arena.max.x - 1), 0, clamp(fish.z + Math.sin(a) * r, w.arena.min.z + 1, w.arena.max.z - 1));
      const m = w.spawn('merganser', at, { radius: 0.6, state: 'warn', timer: p.get('fry.mergWarning') });
      m.timer *= personalityOf(w, m).patience;
      w.emit('warning', 'merganser');
      w.emitOnce('caption', 'fry.merganser');
    }
  }
  for (const m of w.live('merganser')) {
    m.timer -= dt;
    const reach = p.get('fry.mergReach');
    if (m.state === 'warn') {
      // Paddling toward the spot above the fry.
      const to = v3(fish.x - m.pos.x, 0, fish.z - m.pos.z);
      const len = Math.hypot(to.x, to.z);
      const sp = len > 1 ? p.get('fry.mergPaddle') : 0;
      m.vel = v3((to.x / Math.max(len, 1e-6)) * sp, 0, (to.z / Math.max(len, 1e-6)) * sp);
      if (m.timer <= 0) {
        if (inBirdReach(w) && distXZ(m.pos, fish) < p.get('fry.mergStrikeRange')) {
          m.state = 'dive';
          m.timer = 0.5;
        } else {
          // Nothing within reach: it swims off.
          m.state = 'leave';
          m.timer = 3;
        }
      }
    } else if (m.state === 'dive') {
      m.vel = v3(m.vel.x * 0.5, -4, m.vel.z * 0.5);
      if (m.timer <= 0) {
        m.state = 'chase';
        m.timer = p.get('fry.mergChase');
      }
    } else if (m.state === 'chase') {
      const me = personalityOf(w, m);
      const d = sub(fish, m.pos);
      m.vel = scale(curvedChase(d.x, d.y, d.z, me.angle, p.get('behaviour.curveCloseAt')), p.get('fry.mergSpeed') * me.speed);
      if (dist(m.pos, fish) < p.get('fry.catchRadius')) {
        w.die('merganser');
        return;
      }
      if (!inBirdReach(w)) {
        // Too deep to follow.
        m.state = 'surface';
        m.timer = 1.5;
        w.emitOnce('caption', 'fry.mergDeep');
      } else if (m.timer <= 0) {
        m.state = 'surface';
        m.timer = 1.5;
      }
    } else if (m.state === 'surface') {
      m.vel = v3(m.vel.x * 0.3, 3, m.vel.z * 0.3);
      if (m.timer <= 0 && m.pos.y >= -0.1) {
        m.state = 'leave';
        m.timer = 3;
      }
    } else {
      // Leaving: paddles away from the fry, then flies off.
      const away = norm(v3(m.pos.x - fish.x, 0, m.pos.z - fish.z));
      m.vel = scale(away, p.get('fry.mergPaddle') * 1.5);
      if (m.timer <= 0) m.alive = false;
    }
    m.pos.x = clamp(m.pos.x + m.vel.x * dt, w.arena.min.x, w.arena.max.x);
    // It can only go as deep as it can reach, and never into the bed.
    m.pos.y = Math.min(0, Math.max(-reach, w.arena.floor(m.pos.x, m.pos.z) + 0.3, m.pos.y + m.vel.y * dt));
    m.pos.z = clamp(m.pos.z + m.vel.z * dt, w.arena.min.z, w.arena.max.z);
    if (m.state === 'warn' || m.state === 'leave') m.pos.y = 0;
  }
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
      s.edgeCharId = s.lessonTroutId;
      s.lessonDone = false;
      break;
    }
    case 'summer':
    case 'second': {
      w.body.pos = v3(-22, -3, w.rng.range(-6, 6));
      w.body.yaw = 0;
      w.body.energy = 1;
      // The summer starts in the day and ends after its last night.
      s.clock = p.get('fry.summerStart');
      s.clockEnd = phase === 'second' ? p.get('fry.secondDays') : p.get('fry.summerDays');
      s.mergTimer = p.get('fry.mergInterval') * w.rng.range(0.5, 1);
      s.warmLost = 0;
      spawnPatch(w, false);
      spawnPatch(w, false);
      spawnPatch(w, true);
      spawnPatch(w, true);
      spawnPatch(w, true);
      // One char keeps to the weed edge; the others roam the open water, following the plankton.
      s.edgeCharId = spawnTrout(w, v3(EDGE_CHAR.x, EDGE_CHAR.y, w.rng.range(-8, 8))).id;
      const n = p.get('fry.troutCount') - 1 + (phase === 'second' ? p.get('fry.secondYearTrout') : 0);
      for (let i = 0; i < n; i++) spawnTrout(w, v3(w.rng.range(0, 18), -p.get('fry.charDayDepth'), w.rng.range(-15, 15)));
      w.emit('caption', 'fry.day');
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

/** Share of a bite's growth: less in the dark (fry feed by sight) and in cold deep water. 1 outside the lived days. */
function biteScale(w: World): number {
  const p = w.p;
  const d = today(w);
  if (!d) return 1;
  const night = p.get('fry.nightLight');
  const sight = clamp((d.light - night) / Math.max(1e-6, p.get('fry.sightLight') - night), 0, 1);
  const depth = w.arena.surfaceY - w.body.pos.y;
  const cold = warmWater(p, w.body.pos.x, depth) ? 1 : p.get('fry.coldBite');
  return lerp(p.get('fry.nightBite'), 1, sight) * cold;
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
        const g = p.get('fry.planktonGrowth') * (rich ? p.get('fry.richPatchMultiplier') : 1);
        // A fry feeds by sight, and grows less from a bite eaten in cold water.
        const k = biteScale(w);
        if (k >= 1) addGrowth(w, g, rich);
        else addGrowth(w, g * k);
      }
      w.emit('eat');
    } else if (e.state === 'winter') {
      e.pos.y += Math.sin(w.stageTime * 0.5 + e.id) * 0.002;
    } else if (e.value === 1 && e.home) {
      // Open-water plankton follows the light: deep by day, up from dusk through the night to dawn.
      const want = -depth + e.home.y + Math.sin(w.stageTime * 0.7 + e.id) * 0.25;
      e.pos.y += (want - e.pos.y) * Math.min(1, 0.8 * w.dt);
    } else {
      e.pos.y += Math.sin(w.stageTime * 0.7 + e.id) * 0.004;
    }
  }
}

/** The summer's clock, the captions at each turn of the day, and the cost of warm water. */
function stepDay(w: World, dt: number): void {
  const s = st(w);
  const p = w.p;
  const before = fryDay(p, s.clock).tod;
  s.clock += dt / dur(w, 'fry.dayLength');
  const d = fryDay(p, s.clock);
  if (d.tod !== before) {
    if (d.tod === 'dusk') w.emitOnce('caption', 'fry.dusk');
    else if (d.tod === 'night') w.emitOnce('caption', 'fry.night');
    else if (d.tod === 'dawn') w.emitOnce('caption', 'fry.dawn');
    else w.emitOnce('caption', 'fry.dayAgain');
  }
  // Warm water near the surface and over the shallows burns growth; the cold deep costs nothing.
  const depth = w.arena.surfaceY - w.body.pos.y;
  if (warmWater(p, w.body.pos.x, depth)) {
    const g = p.get('fry.warmCost') * dt;
    addGrowth(w, -g);
    s.warmLost += g;
    if (d.tod === 'day' && s.warmLost > p.get('fry.warmCaptionAfter')) w.emitOnce('caption', 'fry.warm');
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
  /** Time of day in a lived summer day; null in the lesson, winter, spring and skips. */
  tod: TimeOfDay | null;
  /** Lake days lived this summer (whole days and the fraction of today), and when the summer ends. */
  clock: number;
  clockEnd: number;
  /** The fish is in warm water (near the surface or over the shallows), which burns growth in summer. */
  warm: boolean;
  /** The fish is within a merganser's reach. */
  birdReach: boolean;
  /** How far a Dolly Varden would see the fish from here, now. */
  charSight: number;
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
    // A lived summer opens in daylight.
    if (ph === 'summer' || ph === 'second') return ph === s.phase ? fryDay(p, s.clock).light : 1;
    return 1;
  };
  if (s.phase === 'skip') {
    // Fade down and back up across the skip.
    const t = 1 - s.skipLeft / p.get('fry.skipSeconds');
    fade = 1 - Math.abs(1 - 2 * t);
    light = 0.08 + 0.92 * Math.abs(1 - 2 * t) * (t < 0.5 ? 1 : phaseLight(s.next));
  } else light = phaseLight(s.phase);
  const depth = w.arena.surfaceY - w.body.pos.y;
  const d = today(w);
  return {
    phase: s.phase,
    next: s.next,
    light,
    fade,
    lakeYears: s.lakeYears,
    growth: s.growth,
    inWeeds: inWeeds(w.body.pos.x),
    outletX: OUTLET_X,
    weedEdge: WEED_EDGE,
    tod: d?.tod ?? null,
    clock: s.clock ?? 0,
    clockEnd: s.clockEnd ?? 0,
    warm: warmWater(p, w.body.pos.x, depth),
    birdReach: depth < p.get('fry.mergReach'),
    charSight: charSight(w),
  };
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
      next: 'summer',
      phaseTime: 0,
      skipLeft: 0,
      growth: g,
      yearStart: marker >= 2 ? g : 0,
      carry: 0,
      lakeYears: marker >= 2 ? 2 : 1,
      stayTime: 0,
      lessonTroutId: -1,
      lessonDone: false,
      clock: 0,
      clockEnd: 0,
      mergTimer: 0,
      edgeCharId: -1,
      warmLost: 0,
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
    if (s.phase === 'lesson' || lived(s)) stepFryImprint(w, dt);
    if (lived(s)) {
      stepDay(w, dt);
      stepMergansers(w, dt);
      if (w.status !== 'playing') return;
    }

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
        if (s.phaseTime >= dur(w, 'fry.lessonMax') && !w.live('trout').some((t) => t.state === 'chase' || t.state === 'warn')) skipTo(w, 'summer', 'fry.summer');
        break;
      case 'summer':
      case 'second': {
        const left = w.live('plankton');
        // The rich swarms come up from the deep in the evening; by day the food that is left sinks and thins out.
        const sunk = today(w)?.sunk ?? 1;
        if (sunk < 0.5) {
          if (left.filter((e) => e.value === 1).length < p.get('fry.risenFood')) spawnPatch(w, true);
          if (left.filter((e) => e.value === 0).length < 6) spawnPatch(w, false);
        } else {
          for (const e of left) if (w.rng.chance(p.get('fry.dayThinning') * dt)) e.alive = false;
          if (left.filter((e) => e.value === 0).length < p.get('fry.dayFood')) spawnPatch(w, false);
        }
        const busy = w.live('trout').some((t) => t.state === 'chase') || w.live('merganser').some((m) => m.state === 'dive' || m.state === 'chase');
        if (s.clock >= s.clockEnd && !busy) {
          if (s.phase === 'summer') skipTo(w, 'winter', 'fry.winter');
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
    fillImprint(w, 'fry');
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.fryBites = 10;
    w.progress.fryRichBites = 5;
    fillImprint(w, 'fry');
  },
};

/** Growth this year relative to a good year's growth (HUD bar). */
export const fryGrowth = (w: World): number => {
  if (w.stageId !== 'fry') return 0;
  const s = st(w);
  return (s.growth - (s.yearStart ?? 0)) / w.p.get('fry.growthTarget');
};
