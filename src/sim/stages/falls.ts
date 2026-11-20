/**
 * The return's falls and rapids, in the home river below the fork.
 *
 * Layout along the home river (x upstream, z across from its centre line):
 *   RAPIDS_START..POOL_START  rapids: strong, uneven current over a shallow bed,
 *                             boulders with slack water (eddies) behind them
 *   POOL_START..FACE          the plunge pool: deep, with a standing wave where
 *                             the falling water boils back up
 *   FACE..LIP_END             the falls: a rock step the fish cannot swim up.
 *                             It is passed by a leap: burst and rise together
 *                             near the surface of the plunge pool. Launch speed,
 *                             the spot (the low step in the crest, the standing
 *                             wave) and the distance from the face decide it.
 *   along one bank            a lower side channel that opens after several
 *                             failed leaps: a longer climb up small steps, at a
 *                             cost in fat. Nobody is stuck below the falls forever.
 *
 * Pure simulation: the renderer and the bots read it through fallsView().
 */
import { depthOf } from '../swim';
import type { Intent, Vec3 } from '../types';
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
const WAVE_HALF = 1.2;
/** The standing wave sits this far below the face. */
const WAVE_OFFSET = 2.2;

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
}

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

/** How good a leap from here would be: speed, then the spot. 1 clears a typical falls. */
export function leapScore(w: World, pos: Vec3, speed: number): number {
  const p = w.p;
  const f = host(w).falls;
  if (!f) return 0;
  const zc = pos.z - host(w).homeMouth;
  const min = p.get('return.leapMinSpeed');
  const full = p.get('return.leapFullSpeed');
  const speedScore = clamp((speed - min) / (full - min), 0, 1);
  const notch = Math.max(0, 1 - Math.abs(zc - f.notchZ) / NOTCH_HALF);
  const wave = Math.max(0, 1 - Math.abs(pos.x - (FACE - WAVE_OFFSET)) / WAVE_HALF);
  return speedScore + p.get('return.leapNotchBonus') * notch + p.get('return.leapWaveBonus') * wave;
}

/** Chance a leap with this score clears the falls: certain well above the need, hopeless well below. */
export function leapChance(w: World, score: number, tooClose: boolean): number {
  if (tooClose) return 0;
  const need = w.p.get('return.leapNeed');
  const slack = w.p.get('return.leapSlack');
  return clamp(0.5 + (score - need) / slack, 0, 1);
}

/** The player can launch from here: in the plunge pool, below the face. */
export function inLaunchZone(w: World, pos: Vec3): boolean {
  const h = host(w);
  return pos.x > FACE - w.p.get('return.leapZone') && pos.x < FACE && Math.abs(pos.z - h.homeMouth) < h.riverHalf;
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
  const p = w.p;
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
    } else {
      w.emitOnce('caption', 'return.leapFail');
    }
  }
  return true;
}

/**
 * After ordinary swimming: start a leap if the player bursts up through the
 * surface in the plunge pool; keep the fish out of rocks and the step; the
 * side channel's cost; rest in eddies; captions.
 */
export function afterSwim(w: World, intent: Intent, burst: boolean, dt: number): void {
  const f = fallsState(w);
  if (!f) return;
  const h = host(w);
  const b = w.body;
  const p = w.p;
  const zc = b.pos.z - h.homeMouth;
  const inRiver = Math.abs(zc) <= h.riverHalf + 0.5 && b.pos.x > RAPIDS_START - 10;
  if (!inRiver) return;
  const r = 0.3 * b.scale;

  if (b.pos.x > RAPIDS_START - 2 && b.pos.x < POOL_START) w.emitOnce('caption', 'return.rapids');
  if (b.pos.x > POOL_START + 1 && b.pos.x < FACE) w.emitOnce('caption', 'return.falls');
  if (inEddy(w, b.pos) && !burst) {
    b.energy = Math.min(1, b.energy + p.get('return.eddyRegen') * dt);
    w.emitOnce('caption', 'return.eddy');
  }

  // A leap: bursting and rising at the surface of the plunge pool, heading upstream.
  const rising = intent.rise || b.pitch > 0.35;
  if (!f.above && inLaunchZone(w, b.pos) && burst && rising && depthOf(w) < p.get('return.leapDepth') && b.vel.x > 1) {
    const score = leapScore(w, b.pos, b.vel.x);
    const tooClose = FACE - b.pos.x < p.get('return.leapTooClose');
    const success = w.rng.chance(leapChance(w, score, tooClose));
    f.leaps += 1;
    f.lastScore = tooClose ? 0 : score / p.get('return.leapNeed');
    b.energy = Math.max(0, b.energy - p.get('return.leapEnergy'));
    f.leap = makeLeap(w, b.pos, b.vel.z, success, tooClose ? 0.3 : score / p.get('return.leapNeed'));
    return;
  }

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
  };
}

/** Distance across the water from a point to the low step's best launch spot. */
export const distToBestSpot = (w: World, pos: Vec3): number => {
  const lay = fallsLayout(w);
  return lay ? distXZ(pos, v3(lay.waveX, 0, lay.notchZ)) : Infinity;
};
