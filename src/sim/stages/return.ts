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
 *   COAST..L     the home river: riffles with bears, rapids and a falls
 *                (falls.ts), then a fork
 *   wrong mouths lead into short channels that dead-end
 *   L..          the home branch opens into the nursery lake; across it are
 *                the inflowing streams or the beaches, one of them home
 *                (returnLake.ts)
 * Other returning sockeye travel the home river with the player (migrants.ts).
 */
import { yearEffects } from '../genetics';
import { netLinesFor } from '../population';
import { depthOf, swimStep } from '../swim';
import type { Entity } from '../types';
import { distXZ, v3 } from '../vec';
import { heatStress, stepWater } from './returnWater';
import type { World } from '../world';
import { afterSwim, fallsCurrent, fallsFloor, FACE, inFallsZone, initFalls, isLipBear, lipBearHolds, lipBearWarnScale, stepPlayerLeap, type FallsState } from './falls';
import type { Box, StageDef } from './index';
import { stepReturnScent, type ScentLayout } from './returnScent';
import { bearAim, bearStrike, spawnMigrants, stepMigrants } from './migrants';
import { resetHeatToll } from './heatToll';
import { initLake, lakeCurrent, lakeFloor, spawnLakeBears, stepLake, type LakeLayout, type LakeState } from './returnLake';

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
  /** Wrong rivers' smell timer (returnScent.ts). */
  strayTimer?: number;
  /** 0..1: farthest the fish has come up the home river (the renderer's body change reads it). */
  upstream?: number;
  /** The falls and rapids (falls.ts); read through fallsView(). */
  falls?: FallsState;
  riverHalf: number;
  /** The nursery lake at the head of the home branch (returnLake.ts); read through lakeView(). */
  lake?: LakeState;
}

const st = (w: World) => w.stage as unknown as ReturnState;

const isRiffle = (x: number) => x > COAST && !inFallsZone(x) && Math.cos((2 * Math.PI * (x - RIFFLE_PHASE)) / RIFFLE_PERIOD) > 0.5;

function floorAt(x: number, z: number, homeMouth: number, falls?: FallsState): number {
  if (x < COAST) return -12 + 7 * Math.max(0, (x - 40) / (COAST - 40));
  const zc = z - homeMouth;
  if (Math.abs(zc) <= RIVER_HALF + 0.5) {
    const base = -3.3 + 1.4 * Math.cos((2 * Math.PI * (x - RIFFLE_PHASE)) / RIFFLE_PERIOD);
    return fallsFloor(falls, x, zc, RIVER_HALF, base + 0.6 * (zc / RIVER_HALF) ** 2);
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
  // Past the fork a bear works one branch: it can't reach across the divider into the other.
  const branchSide = bear.pos.x > FORK ? Math.sign(bear.pos.z - s.homeMouth) : 0;
  const sameBranch = branchSide === 0 || Math.sign(fish.z - s.homeMouth) === branchSide;
  if (bear.state === 'idle') {
    // The lip bear holds off on Field guide's first tries at the falls, and warns longer on Wild (falls.ts).
    if (Math.abs(fish.x - bear.pos.x) < 12 && fish.x < bear.pos.x + 4 && sameBranch && !lipBearHolds(w, bear)) {
      const warn = p.get('return.bearWarning') * lipBearWarnScale(w, bear);
      bear.state = 'warn';
      bear.timer = warn;
      const tx = fish.x + w.body.vel.x * warn;
      const lo = branchSide > 0 ? s.homeMouth + 1.5 : s.homeMouth - RIVER_HALF + 0.5;
      const hi = branchSide < 0 ? s.homeMouth - 1.5 : s.homeMouth + RIVER_HALF - 0.5;
      const tz = Math.max(lo, Math.min(hi, fish.z + w.body.vel.z * warn));
      // Among other migrants, the bear may go for one of them instead (migrants.ts).
      bear.home = bearAim(w, bear, v3(tx, 0, tz), p.get('return.bearReachDepth'), branchSide, FORK);
      w.emit('warning', 'bear');
      w.emitOnce('caption', 'return.bear');
      if (isLipBear(bear) && s.falls && !s.falls.passed) w.emitOnce('caption', 'return.lipBear');
    }
  } else if (bear.state === 'warn' && bear.timer <= 0) {
    bear.state = 'strike';
    bear.timer = 0.6;
    const target = bear.home ?? fish;
    const bonus = p.get('return.bearDepthBodyBonus') * Math.max(0, w.fish.z.bodyDepth) + yearEffects(p, w.fish, w.conditions).bearReach;
    const radius = p.get('return.bearStrikeRadius') * (0.75 + 0.35 * (w.progress.adultSize ?? 1));
    const inReach = sameBranch && distXZ(target, fish) < radius && depthOf(w) < p.get('return.bearReachDepth') + bonus;
    // A swipe among other migrants takes only one fish (migrants.ts).
    if (bearStrike(w, bear, target, radius, p.get('return.bearReachDepth'), inReach, branchSide, FORK)) w.die('bear');
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
    // The river ends at L; the lake and its streams lie beyond (returnLake.ts).
    const end = L + w.p.get('return.lake.length') + w.p.get('return.lake.inflowLength') + 1;
    const riverEnd = (z: number) => floorAt(L, z, homeMouth, s.falls);
    return {
      kind: 'bayCreek',
      min: v3(0, -13, -HALF),
      max: v3(end, 0, HALF),
      surfaceY: 0,
      water: 'fresh',
      floor: (x, z) => (s.lake && x > L ? lakeFloor(w, s.lake.layout, x, z, riverEnd) : floorAt(x, z, homeMouth, s.falls)),
      current: (pos) => {
        if (pos.x < COAST) return v3(-0.4, 0, 0);
        const c = w.p.get('return.current');
        if (s.lake && pos.x > L) return lakeCurrent(w, s.lake.layout, pos, c);
        const inHome = Math.abs(pos.z - homeMouth) <= RIVER_HALF;
        // Rapids, plunge pool and the falls' crest have their own water (falls.ts).
        const falls = inHome ? fallsCurrent(w, pos, pos.z - homeMouth, RIVER_HALF, c) : null;
        if (falls !== null) return v3(falls * yearEffects(w.p, w.fish, w.conditions).flowFactor, 0, 0);
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
    resetHeatToll(w);
    const L = p.get('return.length');
    const homeMouth = w.rng.pick(MOUTHS);
    const homeSide: 1 | -1 = w.rng.chance(0.5) ? 1 : -1;
    // The track starts away from home, so the fish must sense its way.
    const trackStartZ = w.rng.range(-30, 30);
    const s: ReturnState = { homeMouth, homeSide, prevX: 0, netXs: [], scentTimer: 0, trackTimer: 0, trackStartZ, trackBend: w.rng.range(-10, 10), riverHalf: RIVER_HALF };
    w.stage = s as unknown as Record<string, unknown>;
    const falls = initFalls(w);
    const lake = initLake(w, homeMouth, homeSide, RIVER_HALF);
    w.arena = returnStage.arena(w);
    w.body.scale = w.progress.adultSize ?? 1;
    w.body.yaw = 0;
    if (marker === 0) {
      w.progress.fat = 1;
      w.body.pos = v3(3, -5, trackStartZ);
    } else if (marker === 3) {
      // A sibling taking over where the river opens into the lake.
      w.body.pos = v3(L + 8, -3, (lake.layout.inletZ0 + lake.layout.inletZ1) / 2);
      w.progress.fat = Math.max(w.progress.fat, p.get('return.resumeFat'));
      falls.passed = true;
      falls.above = true;
      s.upstream = 1;
    } else if (marker === 2) {
      // A sibling taking over above the falls.
      w.body.pos = v3(FACE + 4, -2, homeMouth);
      w.progress.fat = Math.max(w.progress.fat, p.get('return.resumeFat'));
      falls.passed = true;
      falls.above = true;
    } else {
      w.body.pos = v3(COAST + 4, -2.5, homeMouth);
      // A sibling taking over at the river mouth is a different fish: it arrives with its own reserves, not the last one's empty tank.
      w.progress.fat = Math.max(w.progress.fat, p.get('return.resumeFat'));
    }
    s.prevX = w.body.pos.x;

    // Gillnet lines across the approach to the coast, with gaps.
    // The fishery fishes harder in big runs and closes in small ones (population.ts).
    const lines = netLinesFor(p, w.conditions, p.get('return.netLines'));
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
      const coin = w.rng.chance(0.5) ? 1 : -1;
      // Past the fork, bears fish the home branch from its outer bank.
      const side = x > FORK - 2 ? homeSide : coin;
      // Bears like falls: the riffle bear nearest the falls waits at the lip, on the side of the low step.
      if (inFallsZone(x)) w.spawn('bear', v3(FACE + 0.5, 0.8, homeMouth + Math.sign(falls.notchZ) * (RIVER_HALF + 0.6)), { radius: 1.2 });
      else w.spawn('bear', v3(x, 0.8, homeMouth + side * (RIVER_HALF + 0.6)), { radius: 1.2 });
    }
    // Anglers fish the pools between riffles (advisor: gillnets and anglers are the human pressures).
    const anglers = p.get('return.anglers');
    for (let i = 0; i < anglers; i++) {
      const x = RIFFLE_PHASE + RIFFLE_PERIOD * (i + 0.5);
      if (x > FORK - 6) break;
      w.spawn('lure', v3(x, -1.2, homeMouth), { radius: 0.5, state: 'swing', home: v3(x, -1.2, homeMouth), value: w.rng.range(0, 6) });
    }
    spawnLakeBears(w);
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
    // In the air over the falls the leap carries the fish (falls.ts); otherwise it swims.
    const leaping = stepPlayerLeap(w, dt);
    // Water temperature and oxygen where the fish is (returnWater.ts): warm water burns fat and slows recovery, low oxygen weakens the burst.
    const water = stepWater(w, dt, intent.forward < 0.3 && !intent.burst);
    // Heat stress builds a lasting toll carried to the grounds (heatToll.ts); only full stress in extreme water kills here.
    if (water.lethal) {
      w.die('heat');
      return;
    }
    const stressed = 1 - p.get('return.water.stressThrust') * heatStress(w);
    const r = leaping
      ? { thrust: 1, burst: false }
      : swimStep(w, intent, dt, {
          thrustScale: (lowFat ? 0.7 : 1) * ye.thrustFactor * stressed,
          burstScale: water.effects.burstFactor,
          regenScale: water.effects.regenFactor,
        });
    if (!leaping) afterSwim(w, intent, r.burst, dt);
    const fish = w.body.pos;
    const L = p.get('return.length');

    // Fat: salmon stop eating on the return. Warm water is harder.
    const heat = ye.temperature * water.effects.fatFactor;
    // Through the rapids and at the falls the fish works in bursts and holds in slack water between them,
    // so its swimming there costs less fat than open-river swimming (the base burn is unchanged).
    const effort = s.falls && inFallsZone(fish.x) && Math.abs(fish.z - s.homeMouth) < RIVER_HALF + 2 ? p.get('return.fallsEffortFat') : 1;
    // In the still lake there is no current to hold against: the burn is lower (returnLake.ts).
    const still = s.lake && fish.x > L ? p.get('return.lake.fatDrainFactor') : 1;
    const drain = still * p.get('return.fatDrainBase') * heat + still * effort * (p.get('return.fatDrainSwim') * r.thrust + (r.burst ? p.get('return.fatDrainBurst') : 0));
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
    const inRiver = fish.x > COAST + 2 && fish.x < L;
    const inWrongRiver = inRiver && Math.abs(fish.z - s.homeMouth) > RIVER_HALF + 1;
    if (inWrongRiver) w.emitOnce('caption', 'return.wrongRiver');
    if (inRiver && !inWrongRiver) {
      w.emitOnce('caption', 'return.rightRiver');
      w.setCheckpoint(1);
      spawnMigrants(w);
    }

    for (const bear of w.live('bear')) {
      if (s.lake && bear.pos.x > L) continue; // the lake's bears (returnLake.ts)
      stepBear(w, bear, dt);
      if (w.status !== 'playing') return;
    }
    stepLures(w, intent, dt);
    if (w.status !== 'playing') return;
    stepMigrants(w, dt, FORK, COAST);

    // Home scent and the wrong rivers' smells, shaped by imprinting (returnScent.ts).
    stepReturnScent(w, scentLayout(w, L), s, dt);
    if (fish.x > FORK + 6 && fish.x < L && Math.abs(fish.z - s.homeMouth) <= RIVER_HALF && Math.sign(fish.z - s.homeMouth) !== s.homeSide) w.emitOnce('caption', 'return.wrongBranch');

    if (fish.x > COAST && Math.abs(fish.z - s.homeMouth) <= RIVER_HALF) s.upstream = Math.max(s.upstream ?? 0, Math.min(1, (fish.x - COAST) / (L - COAST)));

    // Across the lake to home (returnLake.ts): the stage ends there.
    stepLake(w, dt);
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
  /** x where the river ends and the lake begins. */
  riverEnd: number;
  lake: LakeLayout | null;
}

export function returnLayout(w: World): ReturnLayout | null {
  if (w.stageId !== 'return') return null;
  const s = st(w);
  return { coast: COAST, fork: FORK, homeMouth: s.homeMouth, homeSide: s.homeSide, riverHalf: RIVER_HALF, riverEnd: w.p.get('return.length'), lake: s.lake?.layout ?? null };
}

export { isRiffle };

function scentLayout(w: World, L: number): ScentLayout {
  const s = st(w);
  return { coast: COAST, fork: FORK, length: L, riverHalf: RIVER_HALF, homeMouth: s.homeMouth, homeSide: s.homeSide, wrongMouths: MOUTHS.filter((m) => m !== s.homeMouth), wrongHalf: WRONG_HALF, wrongLen: WRONG_LEN };
}

/** 0..1: how far up the home river the fish has come (for the renderer's gradual body change); 0 at sea. */
export function returnUpstream(w: World): number {
  if (w.stageId !== 'return') return 0;
  return st(w).upstream ?? 0;
}
