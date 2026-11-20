/**
 * Stage 5: the return, built around navigation (advisor: the most interesting
 * challenge). At sea, salmon follow the magnetic field: here, a faint track
 * the fish can sense when it is close to it. Near the coast, the usual
 * mistakes are overshooting and entering the wrong river. In the river,
 * fish test a branch by smell and back out if it is wrong.
 *
 * Layout (x upstream):
 *   0..COAST     open coastal water, with gillnet lines across the approach
 *   COAST        the coastline, with three river mouths
 *   COAST..L     the home river: riffles with bears, then a fork
 *   wrong mouths lead into short channels that dead-end
 */
import { yearEffects } from '../genetics';
import { depthOf, swimStep } from '../swim';
import type { Entity } from '../types';
import { distXZ, v3 } from '../vec';
import type { World } from '../world';
import type { Box, StageDef } from './index';

const COAST = 90;
const HALF = 40;
const RIVER_HALF = 7;
const WRONG_HALF = 3.5;
const WRONG_LEN = 30;
const MOUTHS = [-26, 0, 26];
const FORK = 175;
const DEAD_END = 205;
const RIFFLE_PERIOD = 34;
const RIFFLE_PHASE = COAST + 26;

interface ReturnState {
  homeMouth: number;
  homeSide: 1 | -1;
  prevX: number;
  netXs: number[];
  scentTimer: number;
  trackTimer: number;
  /** Bend of the magnetic track: start z and a mid-course offset. */
  trackStartZ: number;
  trackBend: number;
  hookPulls?: number;
  wasBursting?: boolean;
}

const st = (w: World) => w.stage as unknown as ReturnState;

const isRiffle = (x: number) => x > COAST && Math.cos((2 * Math.PI * (x - RIFFLE_PHASE)) / RIFFLE_PERIOD) > 0.5;

function floorAt(x: number, z: number, homeMouth: number): number {
  if (x < COAST) return -12 + 7 * Math.max(0, (x - 40) / (COAST - 40));
  const zc = z - homeMouth;
  if (Math.abs(zc) <= RIVER_HALF + 0.5) {
    const base = -3.3 + 1.4 * Math.cos((2 * Math.PI * (x - RIFFLE_PHASE)) / RIFFLE_PERIOD);
    return base + 0.6 * (zc / RIVER_HALF) ** 2;
  }
  return -2.6;
}

/** Everything that is not water above the coastline: banks, dead ends, the fork divider. */
function walls(L: number, homeMouth: number, homeSide: 1 | -1): Box[] {
  const H = 2;
  const free: [number, number, number][] = []; // [zMin, zMax, xEnd]
  for (const m of MOUTHS) {
    if (m === homeMouth) free.push([m - RIVER_HALF, m + RIVER_HALF, L]);
    else free.push([m - WRONG_HALF, m + WRONG_HALF, COAST + WRONG_LEN]);
  }
  free.sort((a, b) => a[0] - b[0]);
  const out: Box[] = [];
  let z = -HALF;
  for (const [z0, z1, xEnd] of free) {
    if (z0 > z) out.push({ min: v3(COAST, -20, z), max: v3(L, H, z0) });
    // The dead end of a wrong river.
    if (xEnd < L) out.push({ min: v3(xEnd, -20, z0), max: v3(L, H, z1) });
    z = z1;
  }
  if (z < HALF) out.push({ min: v3(COAST, -20, z), max: v3(L, H, HALF) });
  // The fork in the home river, and its wrong branch's dead end.
  out.push({ min: v3(FORK, -20, homeMouth - 1), max: v3(L, H, homeMouth + 1) });
  const wrong = -homeSide;
  const zMin = wrong > 0 ? homeMouth + 1 : homeMouth - RIVER_HALF;
  const zMax = wrong > 0 ? homeMouth + RIVER_HALF : homeMouth - 1;
  out.push({ min: v3(DEAD_END, -20, zMin), max: v3(L, H, zMax) });
  return out;
}

/** The magnetic track: from the start, curving toward the home mouth. */
export function trackZ(w: World, x: number): number {
  const s = st(w);
  const t = Math.min(1, Math.max(0, x / COAST));
  const straight = s.trackStartZ + (s.homeMouth - s.trackStartZ) * t;
  return straight + s.trackBend * Math.sin(Math.PI * t);
}

function inGap(w: World, x: number, z: number): boolean {
  return w.live('netGap').some((g) => Math.abs(g.pos.x - x) < 0.5 && Math.abs(g.pos.z - z) < g.radius);
}

function crossNet(w: World, lineX: number): void {
  const p = w.p;
  if (inGap(w, lineX, w.body.pos.z)) return;
  const size = (w.progress.adultSize ?? 1) + (w.fish.sex === 'M' ? p.get('return.maleNetBonus') : 0);
  const mesh = p.get('return.meshSize');
  const band = p.get('return.meshSlipBand');
  if (size < mesh - band) {
    w.emitOnce('caption', 'return.netSlip');
    return;
  }
  const catchChance = size > mesh + band ? 1 : (size - (mesh - band)) / (2 * band);
  if (w.rng.chance(catchChance)) w.die('gillnet');
  else {
    // Squeezed through the mesh: the renderer draws net marks from this.
    w.emit('graze', 'net');
    w.emitOnce('caption', 'return.netSlip');
  }
}

/**
 * Anglers' lures swing across the pools. A fish that touches one is hooked
 * and must burst repeatedly (Shift) to break free before it is landed.
 */
function stepLures(w: World, intent: { burst: boolean; actionPressed: boolean; burstPressed?: boolean }, dt: number): void {
  const p = w.p;
  const fish = w.body.pos;
  const s = st(w);
  for (const lure of w.live('lure')) {
    const home = lure.home ?? lure.pos;
    if (lure.state === 'swing') {
      // An arc across the current, then a recast.
      lure.value = (lure.value ?? 0) + dt * p.get('return.lureSpeed');
      const a = Math.sin(lure.value);
      lure.pos = v3(home.x - 2 + 1.5 * Math.cos(lure.value * 0.5), -1.0 - 0.8 * (1 - Math.abs(a)), s.homeMouth + a * (RIVER_HALF - 1.5));
      if (Math.hypot(lure.pos.x - fish.x, lure.pos.y - fish.y, lure.pos.z - fish.z) < p.get('return.lureRadius')) {
        lure.state = 'hooked';
        lure.timer = p.get('return.hookTime');
        s.hookPulls = 0;
        w.emit('warning', 'hooked');
        w.emitOnce('caption', 'return.hooked');
      } else if (Math.hypot(lure.pos.x - fish.x, lure.pos.z - fish.z) < 7) {
        w.emitOnce('caption', 'return.angler');
      }
    } else if (lure.state === 'hooked') {
      lure.timer -= dt;
      lure.pos = v3(fish.x + 0.4, fish.y, fish.z);
      // Each fresh burst is a pull against the line.
      const pulling = (intent.burst && !s.wasBursting) || !!intent.burstPressed;
      s.wasBursting = intent.burst;
      if (pulling || intent.actionPressed) s.hookPulls = (s.hookPulls ?? 0) + 1;
      w.progress.fat = Math.max(0, w.progress.fat - p.get('return.hookFatCost') * dt);
      if ((s.hookPulls ?? 0) >= p.get('return.hookPulls')) {
        lure.state = 'free';
        lure.timer = p.get('return.lureRest');
        w.emit('caption', 'return.unhooked');
      } else if (lure.timer <= 0) {
        w.die('angler');
        return;
      }
    } else {
      lure.timer -= dt;
      lure.pos = v3(home.x, 1, home.z);
      if (lure.timer <= 0) lure.state = 'swing';
    }
  }
}

function stepBear(w: World, bear: Entity, dt: number): void {
  const p = w.p;
  const fish = w.body.pos;
  bear.timer -= dt;
  const s = st(w);
  if (bear.state === 'idle') {
    if (Math.abs(fish.x - bear.pos.x) < 12 && fish.x < bear.pos.x + 4) {
      const warn = p.get('return.bearWarning');
      bear.state = 'warn';
      bear.timer = warn;
      const tx = fish.x + w.body.vel.x * warn;
      const tz = Math.max(s.homeMouth - RIVER_HALF + 0.5, Math.min(s.homeMouth + RIVER_HALF - 0.5, fish.z + w.body.vel.z * warn));
      bear.home = v3(tx, 0, tz);
      w.emit('warning', 'bear');
      w.emitOnce('caption', 'return.bear');
    }
  } else if (bear.state === 'warn' && bear.timer <= 0) {
    bear.state = 'strike';
    bear.timer = 0.6;
    const target = bear.home ?? fish;
    const bonus = p.get('return.bearDepthBodyBonus') * Math.max(0, w.fish.z.bodyDepth) + yearEffects(p, w.fish, w.conditions).bearReach;
    const radius = p.get('return.bearStrikeRadius') * (0.75 + 0.35 * (w.progress.adultSize ?? 1));
    if (distXZ(target, fish) < radius && depthOf(w) < p.get('return.bearReachDepth') + bonus) w.die('bear');
  } else if (bear.state === 'strike' && bear.timer <= 0) {
    bear.state = 'rest';
    bear.timer = w.p.get('return.bearRest');
  } else if (bear.state === 'rest' && bear.timer <= 0) {
    bear.state = 'idle';
  }
}

export const returnStage: StageDef = {
  id: 'return',
  arena: (w) => {
    const L = w.p.get('return.length');
    const s = w.stage as unknown as Partial<ReturnState>;
    const homeMouth = s.homeMouth ?? 0;
    return {
      kind: 'bayCreek',
      min: v3(0, -13, -HALF),
      max: v3(L, 0, HALF),
      surfaceY: 0,
      water: 'fresh',
      floor: (x, z) => floorAt(x, z, homeMouth),
      current: (pos) => {
        if (pos.x < COAST) return v3(-0.4, 0, 0);
        const c = w.p.get('return.current');
        const inHome = Math.abs(pos.z - homeMouth) <= RIVER_HALF;
        const edge = inHome ? 1 - 0.5 * (Math.abs(pos.z - homeMouth) / RIVER_HALF) ** 2 : 0.6;
        const lowWater = w.conditions.flow < 0.9 ? 1.1 : 1;
        const timing = yearEffects(w.p, w.fish, w.conditions).flowFactor;
        return v3(-c * (isRiffle(pos.x) ? 1.25 : 0.8) * edge * lowWater * timing, 0, 0);
      },
      walls: walls(L, homeMouth, s.homeSide ?? 1),
    };
  },
  init(w, marker) {
    const p = w.p;
    const L = p.get('return.length');
    const homeMouth = w.rng.pick(MOUTHS);
    const homeSide: 1 | -1 = w.rng.chance(0.5) ? 1 : -1;
    // The track starts away from home, so the fish must sense its way.
    const trackStartZ = w.rng.range(-30, 30);
    const s: ReturnState = { homeMouth, homeSide, prevX: 0, netXs: [], scentTimer: 0, trackTimer: 0, trackStartZ, trackBend: w.rng.range(-10, 10) };
    w.stage = s as unknown as Record<string, unknown>;
    w.arena = returnStage.arena(w);
    w.body.scale = w.progress.adultSize ?? 1;
    w.body.yaw = 0;
    if (marker === 0) {
      w.progress.fat = 1;
      w.body.pos = v3(3, -5, trackStartZ);
    } else {
      w.body.pos = v3(COAST + 4, -2.5, homeMouth);
      // A sibling taking over at the river mouth is a different fish: it arrives with its own reserves, not the last one's empty tank.
      w.progress.fat = Math.max(w.progress.fat, p.get('return.resumeFat'));
    }
    s.prevX = w.body.pos.x;

    // Gillnet lines across the approach to the coast, with gaps.
    const lines = p.get('return.netLines');
    const gaps = p.get('return.netGaps');
    for (let i = 0; i < lines; i++) {
      const x = lines > 1 ? 52 + (i * 22) / (lines - 1) : 60;
      s.netXs.push(x);
      w.spawn('netLine', v3(x, 0, 0), { size: v3(0.2, 7, HALF * 2) });
      for (let g = 0; g < gaps; g++) {
        const z = w.rng.range(-HALF + 4, HALF - 4);
        w.spawn('netGap', v3(x, 0, z), { radius: 1.8 });
      }
    }
    // Bears at the riffles of the home river.
    for (let x = RIFFLE_PHASE; x < L - 10; x += RIFFLE_PERIOD) {
      if (x < COAST + 15) continue;
      const side = w.rng.chance(0.5) ? 1 : -1;
      w.spawn('bear', v3(x, 0.8, homeMouth + side * (RIVER_HALF + 0.6)), { radius: 1.2 });
    }
    // Anglers fish the pools between riffles (advisor: gillnets and anglers are the human pressures).
    const anglers = p.get('return.anglers');
    for (let i = 0; i < anglers; i++) {
      const x = RIFFLE_PHASE + RIFFLE_PERIOD * (i + 0.5);
      if (x > FORK - 6) break;
      w.spawn('lure', v3(x, -1.2, homeMouth), { radius: 0.5, state: 'swing', home: v3(x, -1.2, homeMouth), value: w.rng.range(0, 6) });
    }
    if (marker === 0) {
      w.emit('caption', 'return.track');
      if (w.firstLife) w.emit('caption', 'return.fatHint');
    }
    if (w.conditions.temperature > 1.12 && w.conditions.flow < 0.9) w.emit('caption', 'return.heat');
  },
  step(w, intent, dt) {
    const p = w.p;
    const s = st(w);
    const lowFat = w.progress.fat < 0.15;
    const ye = yearEffects(p, w.fish, w.conditions);
    const r = swimStep(w, intent, dt, { thrustScale: (lowFat ? 0.7 : 1) * ye.thrustFactor });
    const fish = w.body.pos;
    const L = p.get('return.length');

    // Fat: salmon stop eating on the return. Warm, low water is harder.
    const heat = ye.temperature * (w.conditions.flow < 0.9 && fish.x > COAST ? 1.2 : 1);
    const drain = p.get('return.fatDrainBase') * heat + p.get('return.fatDrainSwim') * r.thrust + (r.burst ? p.get('return.fatDrainBurst') : 0);
    w.progress.fat = Math.max(0, w.progress.fat - drain * dt);
    if (w.progress.fat < 0.25) w.emitOnce('caption', 'return.lowFat');
    if (w.progress.fat <= 0) {
      w.die('exhaustion');
      return;
    }

    for (const x of s.netXs) {
      const moved = Math.abs(fish.x - s.prevX) < 5; // ignore teleports (playtest tools)
      if (moved && ((s.prevX < x && fish.x >= x) || (s.prevX > x && fish.x <= x))) {
        crossNet(w, x);
        if (w.status !== 'playing') return;
      }
    }
    if (s.netXs.length && fish.x > Math.max(...s.netXs) + 3) w.emitOnce('caption', 'return.pastNets');
    s.prevX = fish.x;

    // The magnetic track: markers appear ahead along it when the fish is close.
    s.trackTimer -= dt;
    if (fish.x < COAST - 2 && s.trackTimer <= 0) {
      s.trackTimer = 0.12;
      const off = Math.abs(fish.z - trackZ(w, fish.x));
      const sense = Math.max(0, 1 - off / 9);
      if (sense > 0) {
        const tx = Math.min(COAST - 1, fish.x + w.rng.range(2, 16));
        w.spawn('track', v3(tx, w.rng.range(-4.5, -1.5), trackZ(w, tx) + w.rng.range(-0.6, 0.6)), { radius: 0.2, timer: 1.4, value: sense });
      }
      if (off > 14) w.emitOnce('caption', 'return.lostTrack');
    }
    for (const m of w.live('track')) {
      m.timer -= dt;
      if (m.timer <= 0) m.alive = false;
    }

    // Overshooting along the coast, and wrong rivers.
    if (fish.x > COAST - 15 && fish.x < COAST && Math.abs(fish.z - s.homeMouth) > 13) w.emitOnce('caption', 'return.overshoot');
    const inWrongRiver = fish.x > COAST + 2 && Math.abs(fish.z - s.homeMouth) > RIVER_HALF + 1;
    if (inWrongRiver) w.emitOnce('caption', 'return.wrongRiver');
    if (fish.x > COAST + 2 && !inWrongRiver) {
      w.emitOnce('caption', 'return.rightRiver');
      w.setCheckpoint(1);
    }

    for (const bear of w.live('bear')) {
      stepBear(w, bear, dt);
      if (w.status !== 'playing') return;
    }
    stepLures(w, intent, dt);
    if (w.status !== 'playing') return;

    // Home scent drifts down the home river and out of its mouth.
    s.scentTimer -= dt;
    const homing = Math.max(0.25, Math.min(1, 0.65 + 0.3 * w.fish.z.homing));
    if (s.scentTimer <= 0) {
      s.scentTimer = 0.22 / homing;
      const sx = Math.min(L - 2, Math.max(fish.x + 6, COAST + 2) + w.rng.range(0, 34));
      const branch = sx > FORK ? s.homeSide * w.rng.range(1.8, RIVER_HALF - 1) : w.rng.range(-RIVER_HALF + 1, RIVER_HALF - 1);
      w.spawn('scent', v3(sx, w.rng.range(-2.5, -0.5), s.homeMouth + branch), { radius: 0.2, timer: 9, value: homing });
    }
    for (const sc of w.live('scent')) {
      sc.timer -= dt;
      sc.pos.x -= 1.6 * dt;
      if (sc.pos.x < FORK && sc.pos.x > COAST) sc.pos.z = s.homeMouth + (sc.pos.z - s.homeMouth) * (1 - 0.4 * dt);
      if (sc.pos.x < COAST) sc.pos.z += Math.sin(sc.id + w.stageTime) * 0.6 * dt;
      if (sc.timer <= 0 || sc.pos.x < COAST - 18) sc.alive = false;
    }
    if (fish.x > FORK + 6 && Math.abs(fish.z - s.homeMouth) <= RIVER_HALF && Math.sign(fish.z - s.homeMouth) !== s.homeSide) w.emitOnce('caption', 'return.wrongBranch');

    if (fish.x >= L - 4 && Math.sign(fish.z - s.homeMouth) === s.homeSide) {
      w.emit('caption', 'return.arrive');
      w.completeStage();
    }
  },
  debugComplete(w) {
    w.progress.fat = Math.max(0.4, w.progress.fat);
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.fat = 0.45;
  },
};

export interface ReturnLayout {
  coast: number;
  fork: number;
  homeMouth: number;
  homeSide: number;
  riverHalf: number;
}

export function returnLayout(w: World): ReturnLayout | null {
  if (w.stageId !== 'return') return null;
  const s = st(w);
  return { coast: COAST, fork: FORK, homeMouth: s.homeMouth, homeSide: s.homeSide, riverHalf: RIVER_HALF };
}

export { isRiffle };
