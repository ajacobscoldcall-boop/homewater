/**
 * The return's falls and rapids, in the home river below the fork.
 *
 * Layout along the home river (x upstream, z across from its centre line):
 *   RAPIDS_START..POOL_START  rapids: strong, uneven current over a shallow bed,
 *                             boulders with slack water (eddies) behind them
 *   POOL_START..FACE          the plunge pool: deep, with a standing wave where
 *                             the falling water boils back up
 *   FACE..LIP_END             the falls: a rock step the fish cannot swim up.
 *                             It is passed by a leap: one input, a burst near the
 *                             surface of the plunge pool heading upstream (rise
 *                             as well still works). A fresh press leaps at once;
 *                             a burst held through the run-up leaps at the
 *                             standing wave. Launch speed (the run-up, kept for a
 *                             moment so a fish that has just reached the face
 *                             still leaps), the spot (the low step in the crest,
 *                             the standing wave), depth and the distance from the
 *                             face decide it. A miss says why (missReason).
 *   along one bank            a lower side channel, there from the start behind
 *                             a driftwood jam that clears after a few misses: a
 *                             longer climb up small steps, at a cost in fat.
 *                             Nobody is stuck below the falls forever.
 *   in the rapids             a low ledge by one bank, for one practice leap
 *                             before the falls (optional: the river goes round it).
 *
 * Pure simulation: the renderer and the bots read it through fallsView().
 */
import { depthOf } from '../swim';
import type { Entity, Intent, Vec3 } from '../types';
import { clamp, distXZ, v3 } from '../vec';
import type { World } from '../world';

export const RAPIDS_START = 136;
export const POOL_START = 149;
export const FACE = 156;
export const LIP_END = 157.5;
/** Where the falls' own current and floor give way to the ordinary river again. */
export const FALLS_ZONE: readonly [number, number] = [RAPIDS_START - 3, LIP_END + 5];
/** Width of the side channel along its bank. */
export const CHUTE_W = 1.8;
const CHUTE_X0 = FACE - 2.5;
const CHUTE_X1 = LIP_END + 2;
const NOTCH_HALF = 2;
/** The standing wave sits this far below the face. */
const WAVE_OFFSET = 2.2;
/** The practice ledge in the rapids: a rock shelf by the side channel's bank, barely awash. */
export const PRACTICE_X0 = 140.6;
export const PRACTICE_X1 = 141.6;
/** The ledge runs from this far out from the river's centre line to the bank. */
const PRACTICE_IN = 4.9;
const PRACTICE_TOP = -0.15;

export interface FallsRock {
  x: number;
  /** Across the river, from its centre line. */
  zc: number;
  r: number;
}

/** Hand-placed boulders in the rapids, staggered so there is always slack water a short dash ahead. */
const ROCKS: readonly FallsRock[] = [
  { x: RAPIDS_START + 1.5, zc: -3.6, r: 1.05 },
  { x: RAPIDS_START + 3.4, zc: 2.2, r: 1.15 },
  { x: RAPIDS_START + 5.4, zc: -0.8, r: 1.05 },
  { x: RAPIDS_START + 7.2, zc: 4.2, r: 1.1 },
  { x: RAPIDS_START + 8.8, zc: -4.3, r: 1.0 },
  { x: RAPIDS_START + 10.4, zc: 1.0, r: 1.2 },
  { x: RAPIDS_START + 12.2, zc: -2.5, r: 1.0 },
];

/** A leap: a quadratic arc from launch to landing, timed by the simulation. */
export interface Leap {
  t: number;
  dur: number;
  p0: Vec3;
  c: Vec3;
  p1: Vec3;
  success: boolean;
  /** A hop over the practice ledge in the rapids, not the falls. */
  practice?: boolean;
}

/** Why a leap at the falls missed: too slow, started too deep, too close to the falling water, the wrong spot, or just unlucky. */
export type MissReason = 'slow' | 'deep' | 'close' | 'spot' | 'nearly';
/** Why a burst in the plunge pool started no leap at all. */
export type NoLeapReason = 'deep' | 'slow' | 'heading' | 'tired';

export interface FallsState {
  /** Across-river offset of the low step in the crest. */
  notchZ: number;
  /** Which bank the side channel runs along. */
  chuteSide: 1 | -1;
  failures: number;
  leaps: number;
  sideOpen: boolean;
  passed: boolean;
  /** The side channel's fat cost has been paid. */
  chutePaid: boolean;
  leap: Leap | null;
  /** The fish was above the falls at the end of the last step. */
  above: boolean;
  /** The last leap's score against the need (1 = just enough), for feedback. */
  lastScore: number;
  /** Why the last leap at the falls missed (null before any miss). */
  lastMiss: MissReason | null;
  /** Misses so far, by reason. */
  missReasons: Partial<Record<MissReason, number>>;
  /** Upstream speed of the run-up, kept a moment after the fish slows (so reaching the face still leaps). */
  runUp: number;
  /** Seconds before another no-leap hint may show. */
  hintT: number;
  /** The practice ledge has been leapt. */
  practiced: boolean;
  /** Practice tries. */
  practiceTries: number;
}

export interface FallsLayout {
  rapidsStart: number;
  poolStart: number;
  face: number;
  lipEnd: number;
  waveX: number;
  /** World z of the low step. */
  notchZ: number;
  notchHalf: number;
  chuteSide: 1 | -1;
  /** World z range of the side channel. */
  chute: [number, number];
  chuteX: [number, number];
  rocks: { x: number; z: number; r: number }[];
  /** The practice ledge: x range and world z range. */
  practiceX: [number, number];
  practiceZ: [number, number];
}

export interface FallsView extends FallsLayout {
  failures: number;
  leaps: number;
  sideOpen: boolean;
  passed: boolean;
  /** 0..1 through the player's leap, or null. */
  leapT: number | null;
  leapSuccess: boolean | null;
  /** The last leap's score against the need (1 = just enough). */
  lastScore: number;
  lastMiss: MissReason | null;
  missReasons: Partial<Record<MissReason, number>>;
  /**
   * How a leap from here, at the run-up's speed, would score against the need
   * (1 = enough to clear; 0 too close to the face), while in the plunge pool
   * below the falls; null elsewhere. The HUD's leap gauge.
   */
  leapPower: number | null;
  /** In the practice ledge's launch water, before it has been leapt. */
  atPractice: boolean;
  practiced: boolean;
  /** Hops tried at the practice ledge. */
  practiceTries: number;
}

interface Host {
  homeMouth: number;
  riverHalf: number;
  falls?: FallsState;
}

const host = (w: World) => w.stage as unknown as Host;
export const fallsState = (w: World): FallsState | null => (w.stageId === 'return' ? (host(w).falls ?? null) : null);

/** Set up the falls for this life. Call before the arena is built. */
export function initFalls(w: World): FallsState {
  const notchSide = w.rng.chance(0.5) ? 1 : -1;
  const f: FallsState = {
    notchZ: notchSide * w.rng.range(1.5, 3.5),
    // The side channel runs along the other bank from the low step.
    chuteSide: notchSide > 0 ? -1 : 1,
    failures: 0,
    leaps: 0,
    sideOpen: false,
    passed: false,
    chutePaid: false,
    leap: null,
    above: false,
    lastScore: 0,
    lastMiss: null,
    missReasons: {},
    runUp: 0,
    hintT: 0,
    practiced: false,
    practiceTries: 0,
  };
  host(w).falls = f;
  return f;
}

export const inFallsZone = (x: number): boolean => x > FALLS_ZONE[0] && x < FALLS_ZONE[1];

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function inChute(f: FallsState, zc: number, half: number): boolean {
  return zc * f.chuteSide >= half - CHUTE_W;
}

/** The practice ledge lies along the side channel's bank, away from the low step and the best line. */
function onPracticeLedge(f: FallsState, x: number, zc: number, half: number, pad = 0): boolean {
  return x > PRACTICE_X0 - pad && x < PRACTICE_X1 + pad && zc * f.chuteSide > PRACTICE_IN - pad && zc * f.chuteSide < half + 1;
}

/**
 * The bed through the falls zone, given the ordinary river bed `base` at this
 * point and the offset `zc` from the river's centre line.
 */
export function fallsFloor(f: FallsState | undefined, x: number, zc: number, half: number, base: number): number {
  if (!f || !inFallsZone(x)) return base;
  const rapids = -2.1 + 0.15 * Math.cos(x * 1.7 + zc * 0.9);
  if (f && inChute(f, zc, half) && x > CHUTE_X0 && x < CHUTE_X1) {
    // The side channel climbs in small steps.
    const t = (x - CHUTE_X0) / (CHUTE_X1 - CHUTE_X0);
    return -3.2 + 1.9 * Math.floor(t * 4) / 3.5;
  }
  if (x < RAPIDS_START + 1) return base + (rapids - base) * smooth(FALLS_ZONE[0], RAPIDS_START + 1, x);
  if (onPracticeLedge(f, x, zc, half)) return PRACTICE_TOP;
  if (x < POOL_START) return rapids;
  if (x < FACE) {
    // The plunge pool, deepest under the falls.
    const deep = -5.2 + 0.4 * (zc / half) ** 2;
    return rapids + (deep - rapids) * smooth(POOL_START, POOL_START + 3, x);
  }
  // The crest, lower at the notch where the water pours thickest.
  const notch = Math.max(0, 1 - Math.abs(zc - f.notchZ) / NOTCH_HALF);
  const crest = -0.55 - 0.45 * notch;
  if (x <= LIP_END) return crest;
  return crest + (base - crest) * smooth(LIP_END, FALLS_ZONE[1], x);
}

/**
 * The x-velocity of the water in the falls zone (negative, downstream), given
 * the river's base current `c` (positive). Returns null outside the zone.
 */
export function fallsCurrent(w: World, pos: Vec3, zc: number, half: number, c: number): number | null {
  const f = host(w).falls;
  if (!f || !inFallsZone(pos.x)) return null;
  const p = w.p;
  const x = pos.x;
  if (f.sideOpen && inChute(f, zc, half) && x > CHUTE_X0 && x < CHUTE_X1) return -c * p.get('return.chuteCurrent');
  if (x < POOL_START) {
    const t = w.stageTime;
    const ramp = smooth(FALLS_ZONE[0], RAPIDS_START + 1, x);
    // Uneven: lanes of faster and slower water that shift with time.
    const uneven = 1 + p.get('return.rapidsUneven') * Math.sin(0.9 * zc + 1.7 * t) * Math.cos(0.55 * x - 1.1 * t);
    const strong = c * (0.8 + (p.get('return.rapidsCurrent') - 0.8) * ramp) * uneven;
    return -strong * eddyFactor(w, x, zc);
  }
  if (x < FACE) {
    // Water thrown down by the falls runs out along the surface; the deep pool is calmer.
    const near = (x - POOL_START) / (FACE - POOL_START);
    const deep = clamp(-pos.y / 4.5, 0, 1);
    return -c * p.get('return.poolCurrent') * (0.5 + 0.5 * near) * (1 - 0.6 * deep);
  }
  // Above the lip, the water speeds up toward the crest.
  return -c * (1.1 - 0.3 * smooth(LIP_END, FALLS_ZONE[1], x));
}

/** 1 in open water, down to return.eddyFactor in the slack water just behind a boulder. */
export function eddyFactor(w: World, x: number, zc: number): number {
  let k = 1;
  const slack = w.p.get('return.eddyFactor');
  for (const r of ROCKS) {
    const behind = r.x - x;
    if (behind < -r.r * 0.3 || behind > r.r * 3.5) continue;
    const across = Math.abs(zc - r.zc) / (r.r * 1.15);
    if (across >= 1) continue;
    const along = behind < r.r * 2 ? 1 : 1 - (behind - r.r * 2) / (r.r * 1.5);
    k = Math.min(k, 1 - (1 - slack) * along * (1 - across * across));
  }
  return k;
}

export function inEddy(w: World, pos: Vec3): boolean {
  const h = host(w);
  return pos.x > RAPIDS_START - 1 && pos.x < POOL_START && eddyFactor(w, pos.x, pos.z - h.homeMouth) < 0.5;
}

/** Push a body out of the rapids' boulders and the falls' rock step. */
export function pushOut(w: World, pos: Vec3, vel: Vec3, r: number): void {
  const h = host(w);
  const f = h.falls;
  if (!f || !inFallsZone(pos.x)) return;
  const zc = pos.z - h.homeMouth;
  if (Math.abs(zc) > h.riverHalf + 0.5) return;
  for (const rock of ROCKS) {
    const dx = pos.x - rock.x;
    const dz = zc - rock.zc;
    const d = Math.hypot(dx, dz);
    const min = rock.r + r;
    if (d < min && d > 1e-6) {
      pos.x = rock.x + (dx / d) * min;
      pos.z = h.homeMouth + rock.zc + (dz / d) * min;
      const vn = (vel.x * dx + vel.z * dz) / d;
      if (vn < 0) {
        vel.x -= (vn * dx) / d;
        vel.z -= (vn * dz) / d;
      }
    }
  }
  // The practice ledge: a low shelf, passed only by a hop (or by going round it).
  if (onPracticeLedge(f, pos.x, pos.z - h.homeMouth, h.riverHalf, r)) {
    const zl = pos.z - h.homeMouth;
    const inner = PRACTICE_IN - r;
    const pens = [
      { d: pos.x - (PRACTICE_X0 - r), to: () => ((pos.x = PRACTICE_X0 - r), (vel.x = Math.min(0, vel.x))) },
      { d: PRACTICE_X1 + r - pos.x, to: () => ((pos.x = PRACTICE_X1 + r), (vel.x = Math.max(0, vel.x))) },
      { d: zl * f.chuteSide - inner, to: () => ((pos.z = h.homeMouth + f.chuteSide * inner), (vel.z = 0)) },
    ];
    pens.sort((a, b) => a.d - b.d)[0]?.to();
  }
  // The rock step: the whole river, or all but the side channel once it is open.
  if (pos.x > FACE - r && pos.x < LIP_END + r) {
    const edge = h.riverHalf - CHUTE_W;
    const into = zc * f.chuteSide - edge; // > 0 inside the side channel
    if (f.sideOpen && into >= r) return;
    const pens = [
      { d: pos.x - (FACE - r), to: () => ((pos.x = FACE - r), (vel.x = Math.min(0, vel.x))) },
      { d: LIP_END + r - pos.x, to: () => ((pos.x = LIP_END + r), (vel.x = Math.max(0, vel.x))) },
    ];
    if (f.sideOpen) pens.push({ d: r - into, to: () => ((pos.z = h.homeMouth + f.chuteSide * (edge + r)), (vel.z = 0)) });
    pens.sort((a, b) => a.d - b.d)[0]?.to();
  }
}

/** Point on a leap's arc at t in 0..1. */
export function arcAt(l: Leap, t: number, out: Vec3 = v3()): Vec3 {
  const u = 1 - t;
  out.x = u * u * l.p0.x + 2 * u * t * l.c.x + t * t * l.p1.x;
  out.y = u * u * l.p0.y + 2 * u * t * l.c.y + t * t * l.p1.y;
  out.z = u * u * l.p0.z + 2 * u * t * l.c.z + t * t * l.p1.z;
  return out;
}

/** Velocity along a leap's arc at t. */
export function arcVel(l: Leap, t: number, out: Vec3 = v3()): Vec3 {
  const k = 2 / l.dur;
  out.x = k * ((1 - t) * (l.c.x - l.p0.x) + t * (l.p1.x - l.c.x));
  out.y = k * ((1 - t) * (l.c.y - l.p0.y) + t * (l.p1.y - l.c.y));
  out.z = k * ((1 - t) * (l.c.z - l.p0.z) + t * (l.p1.z - l.c.z));
  return out;
}

/** An arc from p0: over the crest to the water above, or up into the falling water and back. */
export function makeLeap(w: World, p0: Vec3, vz: number, success: boolean, height: number): Leap {
  const dur = w.p.get('return.leapTime');
  const apex = success ? 1.3 : 0.25 + 0.75 * clamp(height, 0, 1);
  if (success) {
    const p1 = v3(LIP_END + 2, -1.1, p0.z + vz * 0.25);
    return { t: 0, dur, p0: { ...p0 }, c: v3((p0.x + p1.x) / 2, 2 * apex - (p0.y + p1.y) / 2, (p0.z + p1.z) / 2), p1, success };
  }
  // Up toward the face, then knocked back down into the pool.
  const p1 = v3(Math.max(POOL_START + 1, p0.x - 1.6), -1.4, p0.z + vz * 0.2);
  return { t: 0, dur: dur * 0.9, p0: { ...p0 }, c: v3(Math.min(FACE - 0.4, p0.x + 1.6), 2 * apex - (p0.y + p1.y) / 2, p0.z), p1, success };
}

/** A small hop over the practice ledge, or up against it and back. */
function makeHop(w: World, p0: Vec3, success: boolean): Leap {
  const dur = w.p.get('return.leapTime') * 0.7;
  const p1 = success ? v3(PRACTICE_X1 + 1.2, -1.0, p0.z) : v3(p0.x - 1, -1.2, p0.z);
  const cx = success ? (p0.x + p1.x) / 2 : Math.min(PRACTICE_X0 - 0.3, p0.x + 0.8);
  const apex = success ? 0.7 : 0.25;
  return { t: 0, dur, p0: { ...p0 }, c: v3(cx, 2 * apex - (p0.y + p1.y) / 2, p0.z), p1, success, practice: true };
}

/** The parts of a leap's score from here: speed, the spot (low step, standing wave), depth, and help on later tries. */
export function leapParts(w: World, pos: Vec3, speed: number) {
  const p = w.p;
  const f = host(w).falls;
  const zc = pos.z - host(w).homeMouth;
  const min = p.get('return.leapMinSpeed');
  const full = p.get('return.leapFullSpeed');
  const speedScore = clamp((speed - min) / (full - min), 0, 1);
  const notch = f ? Math.max(0, 1 - Math.abs(zc - f.notchZ) / p.get('return.leapNotchReach')) : 0;
  const wave = Math.max(0, 1 - Math.abs(pos.x - (FACE - WAVE_OFFSET)) / p.get('return.leapWaveReach'));
  const good = p.get('return.leapDepth');
  const deep = clamp((w.arena.surfaceY - pos.y - good) / (p.get('return.leapDepthMax') - good), 0, 1);
  // Field guide: from the second try on, the leap gets a little help (none on Wild).
  const assist = f && f.leaps > 0 ? p.get(w.difficulty === 'wild' ? 'return.leapAssist.wild' : 'return.leapAssist.fieldGuide') : 0;
  return {
    speed: speedScore,
    spot: p.get('return.leapNotchBonus') * notch + p.get('return.leapWaveBonus') * wave,
    spotMax: p.get('return.leapNotchBonus') + p.get('return.leapWaveBonus'),
    deep: p.get('return.leapDeepPenalty') * deep,
    assist,
    tooClose: FACE - pos.x < p.get('return.leapTooClose'),
  };
}

/** How good a leap from here would be: speed, then the spot, less depth. 1 clears a typical falls. */
export function leapScore(w: World, pos: Vec3, speed: number): number {
  if (!host(w).falls) return 0;
  const q = leapParts(w, pos, speed);
  return q.speed + q.spot - q.deep + q.assist;
}

/** Chance a leap with this score clears the falls: certain well above the need, hopeless well below. */
export function leapChance(w: World, score: number, tooClose: boolean): number {
  if (tooClose) return 0;
  const need = w.p.get('return.leapNeed');
  const slack = w.p.get('return.leapSlack');
  return clamp(0.5 + (score - need) / slack, 0, 1);
}

/** Why a leap with these parts missed: the biggest shortfall, or bad luck when it was good enough. */
export function missReason(w: World, q: ReturnType<typeof leapParts>): MissReason {
  if (q.tooClose) return 'close';
  const score = q.speed + q.spot - q.deep + q.assist;
  if (score >= w.p.get('return.leapNeed') - 0.25 * w.p.get('return.leapSlack')) return 'nearly';
  const losses: [MissReason, number][] = [
    ['slow', 1 - q.speed],
    ['deep', q.deep],
    ['spot', q.spotMax - q.spot],
  ];
  return losses.sort((a, b) => b[1] - a[1])[0]![0];
}

/** The player can launch from here: in the plunge pool, below the face. */
export function inLaunchZone(w: World, pos: Vec3): boolean {
  const h = host(w);
  const zc = pos.z - h.homeMouth;
  // Not in the side channel's lane: there is no falls to leap there, only the jam (or, once open, the way up).
  const lane = h.falls ? inChute(h.falls, zc, h.riverHalf) : false;
  return pos.x > FACE - w.p.get('return.leapZone') && pos.x < FACE && Math.abs(zc) < h.riverHalf && !lane;
}

/** In the water just below the practice ledge, where a hop can start. */
function inPracticeZone(w: World, f: FallsState, pos: Vec3): boolean {
  const h = host(w);
  const zc = (pos.z - h.homeMouth) * f.chuteSide;
  return pos.x > PRACTICE_X0 - w.p.get('return.practiceZone') && pos.x < PRACTICE_X0 && zc > PRACTICE_IN - 0.3 && zc < h.riverHalf;
}

/**
 * Advance the player's leap, if one is under way. Returns true while the fish
 * is in the air (the stage then skips ordinary swimming for this step).
 */
export function stepPlayerLeap(w: World, dt: number): boolean {
  const f = fallsState(w);
  const l = f?.leap;
  if (!f || !l) return false;
  l.t = Math.min(1, l.t + dt / l.dur);
  arcAt(l, l.t, w.body.pos);
  arcVel(l, l.t, w.body.vel);
  w.body.pitch = clamp(Math.atan2(w.body.vel.y, Math.hypot(w.body.vel.x, w.body.vel.z)), -1.2, 1.2);
  w.body.burst = false;
  w.body.thrust = 1;
  if (l.t < 1) return true;
  f.leap = null;
  f.runUp = 0;
  const p = w.p;
  if (l.practice) {
    if (l.success) {
      f.practiced = true;
      w.body.vel = v3(1.5, 0, 0);
      w.emit('caption', 'return.practiceLeap');
    } else {
      w.body.vel = v3(-3, -1, 0);
      w.emit('caption', 'return.practiceMiss');
    }
    return true;
  }
  if (l.success) {
    f.passed = true;
    w.body.vel = v3(1.5, 0, 0);
    w.emitOnce('caption', 'return.firstLeap');
    w.setCheckpoint(2);
  } else {
    f.failures += 1;
    // The falling water knocks the fish back and down.
    w.body.vel = v3(-4, -1.5, 0);
    w.body.energy = Math.max(0, w.body.energy - p.get('return.leapFailEnergy'));
    w.progress.fat = Math.max(0, w.progress.fat - p.get('return.leapFailFat'));
    if (!f.sideOpen && f.failures >= Math.round(p.get('return.fallsSideAfter'))) {
      f.sideOpen = true;
      w.emit('caption', 'return.sideChannel');
    } else if (f.lastMiss) {
      // Say exactly why, every miss.
      w.emit('caption', `return.leapMiss.${f.lastMiss}`);
    }
  }
  return true;
}

/** Say why a burst in the pool started no leap (not too often). */
function hint(w: World, f: FallsState, why: NoLeapReason): void {
  if (f.hintT > 0) return;
  f.hintT = w.p.get('return.leapHintGap');
  w.emit('caption', `return.noLeap.${why}`);
}

/**
 * Start a leap, if the player asks for one where one can start. One input: a
 * burst. Below the white water a burst builds speed; held, it leaps at the
 * standing wave; a fresh press leaps anywhere in the white water; bursting
 * while rising leaps anywhere in the launch zone once the fish is moving fast
 * (as rising and bursting together always did); a fish that runs into the face
 * still leaps, with the speed it had a moment before.
 */
function tryLeap(w: World, f: FallsState, intent: Intent): boolean {
  const b = w.body;
  const p = w.p;
  const practice = !f.practiced && inPracticeZone(w, f, b.pos);
  if (!practice && !inLaunchZone(w, b.pos)) return false;
  const wants = intent.burst || intent.burstPressed;
  if (!wants) return false;
  const depth = depthOf(w);
  const upstream = Math.cos(b.yaw) >= p.get('return.leapHeading');
  const launch = Math.max(b.vel.x, f.runUp);
  const fresh = intent.burstPressed;
  const waveX = FACE - WAVE_OFFSET;
  // A burst below the white water builds speed. Held, it leaps at the standing wave; a fresh press leaps anywhere
  // in the white water; bursting while rising (as before) leaps anywhere in the launch zone once moving fast.
  const inWhite = practice ? b.pos.x > PRACTICE_X0 - 1.6 : b.pos.x >= waveX - p.get('return.leapWaveReach');
  const atLine = practice ? b.pos.x > PRACTICE_X0 - 1.2 : b.pos.x >= waveX - 0.25 * p.get('return.leapWaveReach');
  // Rising while bursting leaps only once moving fast (half way to full speed), so a climb from deep doesn't throw away the run-up.
  const fast = p.get('return.leapMinSpeed') + 0.5 * (p.get('return.leapFullSpeed') - p.get('return.leapMinSpeed'));
  const pitched = (intent.rise || b.pitch > 0.35) && launch >= fast;
  const atFace = !practice && FACE - b.pos.x < p.get('return.leapTooClose') + 0.4;
  const now = (fresh && inWhite) || atLine || pitched || atFace;
  if (!now) return false;
  const explicit = fresh || atFace;
  if (b.energy < p.get('energy.exhaustedBelow')) return hint(w, f, 'tired'), false;
  if (!upstream) return explicit && hint(w, f, 'heading'), false;
  if (depth > p.get('return.leapDepthMax')) return explicit && hint(w, f, 'deep'), false;
  if (launch < p.get('return.leapStartSpeed')) return explicit && hint(w, f, 'slow'), false;

  b.energy = Math.max(0, b.energy - p.get('return.leapEnergy'));
  if (practice) {
    f.practiceTries += 1;
    const ok = launch >= p.get('return.practiceSpeed') && depth <= p.get('return.leapDepthMax');
    f.leap = makeHop(w, b.pos, ok);
    return true;
  }
  const q = leapParts(w, b.pos, launch);
  const score = q.speed + q.spot - q.deep + q.assist;
  const success = w.rng.chance(leapChance(w, score, q.tooClose));
  f.leaps += 1;
  const need = p.get('return.leapNeed');
  f.lastScore = q.tooClose ? 0 : score / need;
  if (!success) {
    f.lastMiss = missReason(w, q);
    f.missReasons[f.lastMiss] = (f.missReasons[f.lastMiss] ?? 0) + 1;
  }
  w.emit('leap', success ? 'clear' : f.lastMiss ?? 'miss');
  f.leap = makeLeap(w, b.pos, b.vel.z, success, q.tooClose ? 0.3 : score / need);
  return true;
}

/**
 * After ordinary swimming: start a leap if the player bursts near the surface
 * of the plunge pool (or at the practice ledge); keep the fish out of rocks and
 * the step; the side channel's cost; rest in eddies and the deep pool; captions.
 */
export function afterSwim(w: World, intent: Intent, burst: boolean, dt: number): void {
  const f = fallsState(w);
  if (!f) return;
  const h = host(w);
  const b = w.body;
  const p = w.p;
  f.hintT = Math.max(0, f.hintT - dt);
  const zc = b.pos.z - h.homeMouth;
  const inRiver = Math.abs(zc) <= h.riverHalf + 0.5 && b.pos.x > RAPIDS_START - 10;
  if (!inRiver) return;
  const r = 0.3 * b.scale;

  if (b.pos.x > RAPIDS_START - 2 && b.pos.x < POOL_START) w.emitOnce('caption', 'return.rapids');
  if (!f.practiced && b.pos.x > PRACTICE_X0 - 6 && b.pos.x < PRACTICE_X0) w.emitOnce('caption', 'return.practice');
  if (b.pos.x > POOL_START + 1 && b.pos.x < FACE) w.emitOnce('caption', 'return.falls');
  if (inEddy(w, b.pos) && !burst) {
    b.energy = Math.min(1, b.energy + p.get('return.eddyRegen') * dt);
    w.emitOnce('caption', 'return.eddy');
  }
  // Resting deep in the plunge pool, under the outflow, is quicker than in the rapids.
  const inPool = b.pos.x > POOL_START && b.pos.x < FACE && !f.above;
  if (inPool && !burst && depthOf(w) > p.get('return.leapDepth')) b.energy = Math.min(1, b.energy + p.get('return.poolRegen') * dt);

  // The run-up: upstream speed, held a moment after the fish slows.
  if (inPool || (b.pos.x > PRACTICE_X0 - 6 && b.pos.x < PRACTICE_X1)) f.runUp = Math.max(b.vel.x, f.runUp - p.get('return.leapRunDecay') * dt);
  else f.runUp = 0;

  if (!f.above && !f.leap && tryLeap(w, f, intent)) return;

  pushOut(w, b.pos, b.vel, r);

  // The side channel: a long climb against fast water, paid for in fat.
  if (f.sideOpen && inChute(f, zc, h.riverHalf) && b.pos.x > LIP_END && !f.above && !f.chutePaid) {
    f.chutePaid = true;
    f.passed = true;
    w.progress.fat = Math.max(0, w.progress.fat - p.get('return.chuteFatCost'));
    w.emit('caption', 'return.chuteUp');
    w.setCheckpoint(2);
  }
  f.above = b.pos.x > LIP_END;
}

/** The bear that waits on the falls' lip. */
export const isLipBear = (bear: Entity): boolean => bear.pos.x > FACE - 1 && bear.pos.x < LIP_END + 3;

/**
 * On Field guide the lip bear leaves the player alone for the first tries at the falls, and does not
 * turn on a fish that got over within them as it lands above the lip.
 */
export function lipBearHolds(w: World, bear: Entity): boolean {
  const f = fallsState(w);
  if (!f || !isLipBear(bear)) return false;
  const grace = w.p.get(w.difficulty === 'wild' ? 'return.lipBearGrace.wild' : 'return.lipBearGrace.fieldGuide');
  return f.passed ? grace > 0 && f.leaps <= grace : f.leaps < grace;
}

/** The lip bear's warning, as a multiple of the river bears' (longer on Wild, where it is clearer). */
export const lipBearWarnScale = (w: World, bear: Entity): number => (fallsState(w) && isLipBear(bear) ? w.p.get('return.lipBearWarning') : 1);

/** The leap gauge: a leap from here at the run-up's speed against the need; null outside the pool. */
export function leapPower(w: World): number | null {
  const f = fallsState(w);
  if (!f || f.passed || f.above) return null;
  const b = w.body;
  if (b.pos.x < POOL_START - 1 || b.pos.x > FACE || Math.abs(b.pos.z - host(w).homeMouth) > host(w).riverHalf) return null;
  const q = leapParts(w, b.pos, Math.max(b.vel.x, f.runUp));
  if (q.tooClose || b.pos.x < FACE - w.p.get('return.leapZone')) return Math.max(0, q.speed * 0.5);
  return clamp((q.speed + q.spot - q.deep + q.assist) / w.p.get('return.leapNeed'), 0, 1.5);
}

export function fallsLayout(w: World): FallsLayout | null {
  const f = fallsState(w);
  if (!f) return null;
  const h = host(w);
  const hm = h.homeMouth;
  const inner = hm + f.chuteSide * (h.riverHalf - CHUTE_W);
  const outer = hm + f.chuteSide * h.riverHalf;
  return {
    rapidsStart: RAPIDS_START,
    poolStart: POOL_START,
    face: FACE,
    lipEnd: LIP_END,
    waveX: FACE - WAVE_OFFSET,
    notchZ: hm + f.notchZ,
    notchHalf: NOTCH_HALF,
    chuteSide: f.chuteSide,
    chute: [Math.min(inner, outer), Math.max(inner, outer)],
    chuteX: [CHUTE_X0, CHUTE_X1],
    rocks: ROCKS.map((r) => ({ x: r.x, z: hm + r.zc, r: r.r })),
    practiceX: [PRACTICE_X0, PRACTICE_X1],
    practiceZ: f.chuteSide > 0 ? [hm + PRACTICE_IN, hm + h.riverHalf] : [hm - h.riverHalf, hm - PRACTICE_IN],
  };
}

/** What the renderer, HUD and bots may read about the falls. */
export function fallsView(w: World): FallsView | null {
  const lay = fallsLayout(w);
  const f = fallsState(w);
  if (!lay || !f) return null;
  return {
    ...lay,
    failures: f.failures,
    leaps: f.leaps,
    sideOpen: f.sideOpen,
    passed: f.passed,
    leapT: f.leap ? f.leap.t : null,
    leapSuccess: f.leap ? f.leap.success : null,
    lastScore: f.lastScore,
    lastMiss: f.lastMiss,
    missReasons: { ...f.missReasons },
    leapPower: f.leap ? null : leapPower(w),
    atPractice: !f.practiced && inPracticeZone(w, f, w.body.pos),
    practiced: f.practiced,
    practiceTries: f.practiceTries,
  };
}

/** Distance across the water from a point to the low step's best launch spot. */
export const distToBestSpot = (w: World, pos: Vec3): number => {
  const lay = fallsLayout(w);
  return lay ? distXZ(pos, v3(lay.waveX, 0, lay.notchZ)) : Infinity;
};
