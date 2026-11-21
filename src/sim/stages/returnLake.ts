/**
 * Home through the lake: the last part of the return. Bristol Bay-type
 * sockeye come up the river into their nursery lake, cross it and spawn in
 * the streams that feed it or on its beaches. Here the home branch of the
 * river opens into the lake at its near end; across it are three inflowing
 * streams (creek and river homes) or three stretches of beach (lake-beach
 * homes), and only one of them is home.
 *
 * The crossing's decisions:
 * - Navigation. A plume of home water drifts through the lake from home
 *   toward the outlet. Close to it the fish smells home (scent specks,
 *   state 'lake'); off it the smell is gone and the fish must sweep to find
 *   it again. The other streams and beaches carry their own smell (state
 *   'lakeStray'): faint and close to the shore for a well imprinted fish,
 *   nearly home-strength and reaching far out for a poorly imprinted one
 *   (scentClarity, as in returnScent.ts).
 * - Waiting. The fish reaches the lake before it is ready to spawn and must
 *   wait while its spawning colours come on (`ripe`, 0..1, a game device:
 *   weeks compressed into under a minute). In a warm year the lake's top
 *   layer is warm and the water below the thermocline is cool: waiting deep
 *   costs less fat and lets heat stress ease, cruising the warm shallows
 *   builds it (temperatures in `lakeWater`, read by returnWater.ts).
 * - Bears. A bear fishes the mouth of the home stream (or walks the home
 *   beach), another a wrong one. They reach only shallow water.
 * Fat keeps draining: there is no feeding on the return.
 *
 * Pure simulation, read by the renderer and bots through `lakeView()`.
 * Every number is a param (`return.lake.*`).
 */
import { yearEffects } from '../genetics';
import { worldClarity } from '../imprint';
import { depthOf } from '../swim';
import type { Entity, Vec3 } from '../types';
import { clamp, distXZ, v3 } from '../vec';
import type { World } from '../world';
import { scentBlur, wrongStrength } from './returnScent';

export interface LakeSite {
  kind: 'inflow' | 'beach';
  /** For an inflow: x of its mouth on the far shore and z of its centre line. For a beach: the middle of the stretch, out on the shelf. */
  x: number;
  z: number;
  /** Beach: which side shore (+1 or -1); inflow: 0. */
  side: number;
  /** Half the inflow's width, or half the beach stretch's length. */
  half: number;
  home: boolean;
  /** Plume: from the lake end of the river toward this site, with a sideways bend. */
  bend: number;
}

export interface LakeLayout {
  /** x where the river ends and the lake begins. */
  start: number;
  /** x of the far shore. */
  end: number;
  len: number;
  /** Half the lake's width (z). */
  half: number;
  /** The home branch's band where it enters (z). */
  inletZ0: number;
  inletZ1: number;
  inflowLen: number;
  sites: LakeSite[];
  home: number;
  beach: boolean;
}

export interface LakeState {
  layout: LakeLayout;
  entered: boolean;
  /** 0..1: how far the spawning colours have come on. */
  ripe: number;
  scentTimer: number;
  strayTimer: number;
  /** Seconds since the fish last had home scent around it (for the "lost it" caption). */
  lost: number;
}

interface Host {
  lake?: LakeState;
}

const host = (w: World) => w.stage as unknown as Host;
export const lakeState = (w: World): LakeState | null => (w.stageId === 'return' ? (host(w).lake ?? null) : null);

const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const INFLOW_ZS = [-22, 0, 22];
/** Beach stretches along the side shores, as fractions of the lake's length. */
const BEACH_US = [0.42, 0.8, 0.62];
/** Dry land around the lake rises to this (the sim only needs it above the surface; the scenery reads it). */
const LAND = 1.85;
/** The lake's near shore stands this far past the river's end, so the river runs on a little before it opens out. */
const NEAR = 12;
/** Length of the trough the river cuts out into the lake, curving toward its middle. */
export const INLET_TROUGH = 36;
/** How far into the lake the inflows' troughs reach. */
const INFLOW_TROUGH = 22;

/** Lay out the lake (called from the return's init, after the river). */
export function initLake(w: World, homeMouth: number, homeSide: 1 | -1, riverHalf: number): LakeState {
  const p = w.p;
  const start = p.get('return.length');
  const len = p.get('return.lake.length');
  const half = p.get('return.lake.halfWidth');
  const beach = w.fish.habitat === 'beach';
  const inletZ0 = homeMouth + (homeSide > 0 ? 1 : -riverHalf);
  const inletZ1 = homeMouth + (homeSide > 0 ? riverHalf : -1);
  const inletSide = Math.sign((inletZ0 + inletZ1) / 2) || homeSide;
  const home = w.rng.int(0, 3);
  const sites: LakeSite[] = [];
  for (let i = 0; i < 3; i++) {
    const bend = w.rng.range(-1, 1) * p.get('return.lake.plumeBend');
    if (beach) {
      // Two stretches on the shore across from where the river comes in, one on its own side.
      const side = i === 2 ? inletSide : -inletSide;
      const shelf = p.get('return.lake.beachDepth') * 0.6;
      const u = BEACH_US[i]! * len;
      sites.push({ kind: 'beach', x: start + u, z: side * beachZ(basinU(len, u), half, shelf, p.get('return.lake.shelfDepth')), side, half: p.get('return.lake.beachHalf'), home: i === home, bend });
    } else {
      sites.push({ kind: 'inflow', x: start + len, z: INFLOW_ZS[i]!, side: 0, half: p.get('return.lake.inflowHalf'), home: i === home, bend });
    }
  }
  const layout: LakeLayout = { start, end: start + len, len, half, inletZ0, inletZ1, inflowLen: p.get('return.lake.inflowLength'), sites, home, beach };
  const s: LakeState = { layout, entered: false, ripe: 0, scentTimer: 0, strayTimer: 0, lost: 0 };
  host(w).lake = s;
  return s;
}

/** Bears: one fishes home (the stream's mouth, or walks its stretch of beach), one a wrong site. */
export function spawnLakeBears(w: World): void {
  const s = lakeState(w);
  if (!s) return;
  const { sites, home, half } = s.layout;
  const wrong = sites.filter((q) => !q.home);
  const bearSites = [sites[home]!, wrong[w.rng.int(0, wrong.length)]!];
  for (const q of bearSites) {
    if (q.kind === 'inflow') {
      const side = w.rng.chance(0.5) ? 1 : -1;
      w.spawn('bear', v3(q.x + 1.5, 0.8, q.z + side * (q.half + 1.2)), { radius: 1.2, size: v3(0, 0, side) });
    } else {
      w.spawn('bear', v3(q.x, 0.8, q.side * (half - 0.6)), { radius: 1.2, size: v3(0, 0, q.side), value: q.x });
    }
  }
}

/** z of a beach stretch's middle: out on the shelf where the water is `depth` deep. */
function beachZ(du: number, half: number, depth: number, shelf: number): number {
  for (let z = half; z > half * 0.6; z -= 0.05) if (-shelfFloor(du, z / half, shelf) >= depth) return z;
  return half * 0.92;
}

/** Normalised position along the basin (-1 at the near shore, 1 at the far shore) from u = x - start. */
const basinU = (len: number, u: number) => {
  const a = (len - NEAR) / 2;
  return (u - NEAR - a) / a;
};

/** The inlet trough's centre line: from the river's end toward the middle of the lake. Returns along (0..1), distance and half-width there. */
export function inletAt(lay: LakeLayout, u: number, z: number): { t: number; d: number; hw: number } {
  const zc = (lay.inletZ0 + lay.inletZ1) / 2;
  const bu = INLET_TROUGH;
  const bz = -0.6 * zc;
  const t = clamp((u * bu + (z - zc) * bz) / (bu * bu + bz * bz), 0, 1);
  const d = Math.hypot(u - bu * t, z - zc - bz * t);
  return { t, d, hw: (lay.inletZ1 - lay.inletZ0) / 2 + 0.5 + 3.5 * t };
}

const SHELF = 0.1;
const DROP = 0.32;

/** Floor of the open lake by its normalised position (du, dz in -1..1), without troughs. */
function shelfFloor(du: number, dz: number, shelf = 2.8, deep = 11): number {
  const r = Math.pow(du ** 4 + dz ** 4, 0.25);
  if (r >= 1) return 0.25 + Math.min(LAND - 0.25, (r - 1) * 14);
  const t1 = smooth(1, 1 - SHELF, r);
  const t2 = smooth(1 - SHELF, 1 - SHELF - DROP, r);
  return 0.25 - (shelf + 0.25) * t1 - (deep - shelf) * t2;
}

/**
 * Height of the lake's bottom at (x, z), for x past the river's end. `riverEnd`
 * is the river's own floor at its last cross-section, so the inlet continues it.
 */
export function lakeFloor(w: World, lay: LakeLayout, x: number, z: number, riverEnd: (z: number) => number): number {
  const p = w.p;
  const u = x - lay.start;
  let f = shelfFloor(basinU(lay.len, u), z / lay.half, p.get('return.lake.shelfDepth'), p.get('return.lake.depth'));
  // The river's mouth: a trough continuing the home branch out into the lake.
  if (u < INLET_TROUGH + 8) {
    const { t, d, hw } = inletAt(lay, u, z);
    if (d < hw) {
      const trough = riverEnd(clamp(z, lay.inletZ0, lay.inletZ1)) * (1 - t) - 6.5 * t + 1.2 * Math.max(0, 1 - (hw - d) / 1.2);
      f = Math.min(f, trough);
    }
  }
  // Inflowing streams: a channel up from the far shore, ending in a dead end (only home goes on).
  for (const q of lay.sites) {
    if (q.kind !== 'inflow' || Math.abs(z - q.z) > q.half + 0.5) continue;
    const zc = Math.abs(z - q.z) / (q.half + 0.5);
    const bed = -p.get('return.lake.inflowDepth') * (1 - 0.35 * zc * zc);
    if (u > lay.len - INFLOW_TROUGH && u < lay.len + lay.inflowLen) f = Math.min(f, bed + 0.5 * smooth(lay.len, lay.len + lay.inflowLen, u));
  }
  return f;
}

/** Water velocity in the lake: the river's current fading out of the inlet, a little outflow from each stream. */
export function lakeCurrent(w: World, lay: LakeLayout, pos: Vec3, riverCurrent: number): Vec3 {
  const u = pos.x - lay.start;
  if (u < INLET_TROUGH + 8) {
    const { t, d, hw } = inletAt(lay, u, pos.z);
    if (d < hw + 0.5) {
      // Along the trough, out into the lake (away from the river), fading as it spreads.
      const zc = (lay.inletZ0 + lay.inletZ1) / 2;
      const n = Math.hypot(INLET_TROUGH, 0.6 * zc) || 1;
      const k = riverCurrent * 0.8 * (1 - smooth(0, 1, t));
      return v3((-k * INLET_TROUGH) / n, 0, (k * 0.6 * zc) / n);
    }
  }
  for (const q of lay.sites) {
    if (q.kind === 'inflow' && Math.abs(pos.z - q.z) < q.half && u > lay.len - 6) return v3(-w.p.get('return.lake.inflowCurrent') * smooth(lay.len - 6, lay.len + 2, u), 0, 0);
  }
  return v3(0, 0, 0);
}

/** Where the plume of a site's water runs: from the river's mouth (t = 0) to the site (t = 1). */
export function plumeAt(lay: LakeLayout, q: LakeSite, t: number, out: Vec3 = v3()): Vec3 {
  const a = v3(lay.start + 10, 0, (lay.inletZ0 + lay.inletZ1) / 2);
  const b = siteWater(q);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const n = Math.hypot(dx, dz) || 1;
  const bend = q.bend * Math.sin(Math.PI * t);
  out.x = a.x + dx * t - (dz / n) * bend;
  out.y = 0;
  out.z = a.z + dz * t + (dx / n) * bend;
  return out;
}

/** A point in open water just off the site: where its plume starts. */
export function siteWater(q: LakeSite): Vec3 {
  return q.kind === 'inflow' ? v3(q.x - 6, 0, q.z) : v3(q.x, 0, q.z - q.side * 4);
}

const plumeLen = (lay: LakeLayout, q: LakeSite) => {
  let d = 0;
  const a = v3();
  const b = v3();
  plumeAt(lay, q, 0, a);
  for (let i = 1; i <= 12; i++) {
    plumeAt(lay, q, i / 12, b);
    d += Math.hypot(b.x - a.x, b.z - a.z);
    a.x = b.x;
    a.z = b.z;
  }
  return d;
};

/** The point of a plume nearest (x, z): its t and distance. */
export function nearestOnPlume(lay: LakeLayout, q: LakeSite, x: number, z: number): { t: number; d: number } {
  let best = { t: 0, d: Infinity };
  const pt = v3();
  for (let i = 0; i <= 40; i++) {
    plumeAt(lay, q, i / 40, pt);
    const d = Math.hypot(pt.x - x, pt.z - z);
    if (d < best.d) best = { t: i / 40, d };
  }
  return best;
}

/** True when the fish is at a site: up an inflow's channel, or in the shallows of a stretch of beach. */
export function atSite(w: World, lay: LakeLayout, q: LakeSite, pos: Vec3): boolean {
  if (q.kind === 'inflow') return pos.x > lay.end + 3 && Math.abs(pos.z - q.z) < q.half + 0.5;
  const water = w.arena.surfaceY - w.arena.floor(pos.x, pos.z);
  return Math.abs(pos.x - q.x) < q.half && Math.sign(pos.z) === q.side && Math.abs(pos.z) > lay.half * 0.75 && water < w.p.get('return.lake.beachDepth');
}

/** Seconds of waiting for the colours to come on. */
export function ripenTime(w: World): number {
  return w.p.get('return.lake.ripenTime') * (w.firstLife ? 1 : w.p.get('return.lake.ripenLater'));
}

/** In the lake (past the river's end)? */
export const inLake = (lay: LakeLayout, x: number) => x > lay.start;

/** One step of the crossing. Returns true if the stage ended (death or arrival). */
export function stepLake(w: World, dt: number): boolean {
  const s = lakeState(w);
  if (!s) return false;
  const lay = s.layout;
  const fish = w.body.pos;
  const p = w.p;
  if (!s.entered && fish.x > lay.start + 6) {
    s.entered = true;
    w.setCheckpoint(3);
    w.emit('caption', lay.beach ? 'return.lake.enterBeach' : 'return.lake.enter');
    w.emit('caption', 'return.lake.wait');
    if (yearEffects(p, w.fish, w.conditions).temperature > 1.05 || w.conditions.flow < 0.9) w.emitOnce('caption', 'return.lake.warm');
  }
  if (s.entered) {
    const before = s.ripe;
    s.ripe = Math.min(1, s.ripe + dt / Math.max(1, ripenTime(w)));
    if (before < 1 && s.ripe >= 1) w.emit('caption', 'return.lake.ready');
  }
  stepLakeScent(w, s, dt);
  for (const bear of w.live('bear')) {
    if (bear.pos.x < lay.start) continue;
    if (stepLakeBear(w, s, bear, dt)) return true;
  }
  if (!inLake(lay, fish.x)) return false;

  for (const q of lay.sites) {
    if (!atSite(w, lay, q, fish)) continue;
    if (!q.home) {
      w.emitOnce('caption', q.kind === 'inflow' ? 'return.lake.wrongInflow' : 'return.lake.wrongBeach');
      continue;
    }
    if (s.ripe < 1) {
      w.emitOnce('caption', 'return.lake.notReady');
      continue;
    }
    w.emit('caption', lay.beach ? 'return.arriveBeach' : 'return.arrive');
    w.completeStage();
    return true;
  }
  return false;
}

/** Home scent across the lake, and the other sites' smells. */
function stepLakeScent(w: World, s: LakeState, dt: number): void {
  const p = w.p;
  const lay = s.layout;
  const fish = w.body.pos;
  const inside = fish.x > lay.start - 8;
  const c = worldClarity(w);
  const blur = scentBlur(w, c);
  const home = lay.sites[lay.home]!;
  const width = p.get('return.lake.plumeWidth');
  if (inside) {
    s.scentTimer -= dt;
    const near = nearestOnPlume(lay, home, fish.x, fish.z);
    if (s.scentTimer <= 0) {
      s.scentTimer = p.get('imprint.scentInterval') / c;
      if (near.d < width * (1 + blur)) {
        // A speck ahead along the plume, scattered more for an unclear fish.
        const t = clamp(near.t + w.rng.range(0.02, 0.22), 0, 1);
        const at = plumeAt(lay, home, t);
        const spread = 1.5 + 4 * blur;
        w.spawn('scent', v3(at.x + w.rng.range(-spread, spread), w.rng.range(-5.5, -0.8), at.z + w.rng.range(-spread, spread)), { radius: 0.2, timer: 9, value: c, state: 'lake' });
      }
    }
    s.lost = near.d < width * (1 + blur) ? 0 : s.lost + dt;
    if (s.entered && s.lost > 4) w.emitOnce('caption', 'return.lake.lostScent');

    // Each other site's own smell, near its shore: further out and stronger for an unclear fish.
    s.strayTimer -= dt;
    if (s.strayTimer <= 0) {
      s.strayTimer = p.get('imprint.wrongInterval');
      const reach = p.get('return.lake.wrongReachBase') + p.get('return.lake.wrongReachLoss') * (1 - c);
      const strength = wrongStrength(w, c);
      for (const q of lay.sites) {
        if (q.home) continue;
        const L = plumeLen(lay, q);
        const into = w.rng.range(0, Math.min(L, reach));
        const at = plumeAt(lay, q, clamp(1 - into / L, 0, 1));
        if (distXZ(at, fish) > 45) continue;
        w.spawn('scent', v3(at.x + w.rng.range(-2, 2), w.rng.range(-5, -0.8), at.z + w.rng.range(-2, 2)), { radius: 0.2, timer: 9, state: 'lakeStray', value: strength * (1 - into / Math.max(1, reach)), home: siteWater(q) });
      }
    }
  }
  const flicker = blur * p.get('imprint.scentFlicker');
  for (const sc of w.entities) {
    if (!sc.alive || sc.kind !== 'scent' || (sc.state !== 'lake' && sc.state !== 'lakeStray')) continue;
    sc.timer -= dt;
    // Lake water drifts slowly toward the outlet.
    sc.pos.x -= 0.35 * dt;
    sc.pos.z += Math.sin(sc.id * 1.37 + w.stageTime * 0.7) * (0.3 + blur * p.get('imprint.scentNoise') * 0.3) * dt;
    if (sc.state === 'lakeStray') sc.value = Math.max(0, (sc.value ?? 0) - p.get('imprint.wrongFadeRate') * 0.5 * dt);
    else sc.value = c * (1 - flicker * (0.5 + 0.5 * Math.sin(w.stageTime * 3.1 + sc.id * 2.3)));
    if (sc.timer <= 0 || (sc.value ?? 0) <= 0.02 || !inside) sc.alive = false;
  }
}

/**
 * A bear at a stream mouth or on a beach. It notices a fish in the shallows
 * near its spot, warns (the same warning as in the river), and swipes at
 * where the fish will be, but only within reach of the shore and only into
 * shallow water. Returns true if it took the player.
 */
function stepLakeBear(w: World, s: LakeState, bear: Entity, dt: number): boolean {
  const p = w.p;
  const fish = w.body.pos;
  const lay = s.layout;
  bear.timer -= dt;
  const beach = bear.value !== undefined;
  const reachDepth = p.get('return.bearReachDepth') + p.get('return.bearDepthBodyBonus') * Math.max(0, w.fish.z.bodyDepth) + yearEffects(p, w.fish, w.conditions).bearReach;
  if (bear.state === 'idle') {
    // On a beach the bear walks its stretch, slowly.
    if (beach) {
      const q = lay.sites.find((x) => Math.abs(x.x - (bear.value ?? 0)) < 0.1);
      const span = q ? q.half : 8;
      bear.pos.x = (bear.value ?? bear.pos.x) + span * 0.8 * Math.sin(w.stageTime * 0.08 + bear.id);
    }
    const near = Math.hypot(fish.x - bear.pos.x, fish.z - bear.pos.z) < p.get('return.lake.bearNotice');
    if (near && depthOf(w) < reachDepth + 1) {
      const warn = p.get('return.bearWarning');
      bear.state = 'warn';
      bear.timer = warn;
      const tx = fish.x + w.body.vel.x * warn;
      const tz = fish.z + w.body.vel.z * warn;
      // Only so far out from where it stands.
      const dx = tx - bear.pos.x;
      const dz = tz - bear.pos.z;
      const d = Math.hypot(dx, dz);
      const k = Math.min(1, p.get('return.lake.bearReach') / Math.max(1e-6, d));
      bear.home = v3(bear.pos.x + dx * k, 0, bear.pos.z + dz * k);
      w.emit('warning', 'bear');
      w.emitOnce('caption', 'return.lake.bear');
    }
  } else if (bear.state === 'warn' && bear.timer <= 0) {
    bear.state = 'strike';
    bear.timer = 0.6;
    const radius = p.get('return.bearStrikeRadius') * (0.75 + 0.35 * (w.progress.adultSize ?? 1));
    if (distXZ(bear.home!, fish) < radius && depthOf(w) < reachDepth) {
      w.die('bear');
      return true;
    }
  } else if (bear.state === 'strike' && bear.timer <= 0) {
    bear.state = 'rest';
    bear.timer = p.get('return.bearRest');
  } else if (bear.state === 'rest' && bear.timer <= 0) {
    bear.state = 'idle';
  }
  return false;
}

/**
 * Fellow migrants in the lake: each heads for a site of its own (a third
 * for the player's home), deep, and leaves the scene there. Returns true when
 * it moved the migrant (migrants.ts skips its river behaviour).
 */
export function lakeMigrant(w: World, m: Entity, dt: number): boolean {
  const s = lakeState(w);
  if (!s || m.pos.x < s.layout.start - 1) return false;
  const lay = s.layout;
  const q = lay.sites[m.id % lay.sites.length]!;
  const goal = q.kind === 'inflow' ? v3(lay.end + lay.inflowLen * 0.6, -1.4, q.z) : v3(q.x + ((m.id % 5) - 2) * 2, -1.2, q.z);
  const water = siteWater(q);
  const far = distXZ(m.pos, water) > 6;
  const t = far ? v3(water.x, -4.5 - (m.id % 3), water.z) : goal;
  const dx = t.x - m.pos.x;
  const dy = t.y - m.pos.y;
  const dz = t.z - m.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (!far && d < 1.5) {
    m.alive = false;
    return true;
  }
  const sp = w.p.get('return.migrantSpeed') * 0.75 * (m.value ?? 1);
  const k = d > 1e-6 ? Math.min(sp, d) / d : 0;
  const a = Math.min(1, 1.5 * dt);
  m.vel.x += (dx * k - m.vel.x) * a;
  m.vel.y += (dy * k - m.vel.y) * a;
  m.vel.z += (dz * k - m.vel.z) * a;
  const nx = m.pos.x + m.vel.x * dt;
  const nz = m.pos.z + m.vel.z * dt;
  // Never onto the shore.
  if (w.arena.floor(nx, nz) < w.arena.surfaceY - 0.8) {
    m.pos.x = nx;
    m.pos.z = nz;
  }
  m.pos.y = clamp(m.pos.y + m.vel.y * dt, w.arena.floor(m.pos.x, m.pos.z) + 0.35, w.arena.surfaceY - 0.35);
  const yaw = Math.atan2(m.vel.z, m.vel.x);
  m.yaw += Math.atan2(Math.sin(yaw - m.yaw), Math.cos(yaw - m.yaw)) * Math.min(1, 3 * dt);
  return true;
}

/** Water in the lake: a warm top layer over cool water below the thermocline; streams run at river temperature. */
export function lakeWater(w: World, lay: LakeLayout, pos: Vec3, riverTemp: number, warmth: number, day: number): number {
  const p = w.p;
  if (pos.x > lay.end) return riverTemp + day;
  // The river's own water in its trough, before it spreads into the lake.
  const u = pos.x - lay.start;
  if (u < INLET_TROUGH) {
    const { t, d, hw } = inletAt(lay, u, pos.z);
    if (d < hw) return riverTemp + day + p.get('return.lake.surfaceWarm') * warmth * smooth(0.5, 1, t);
  }
  const surfaceT = riverTemp + day + p.get('return.lake.surfaceWarm') * warmth;
  const water = Math.max(0.1, w.arena.surfaceY - w.arena.floor(pos.x, pos.z));
  const depth = Math.max(0, w.arena.surfaceY - pos.y);
  const thermo = p.get('return.lake.thermocline');
  const span = p.get('return.lake.thermoSpan');
  const deepT = Math.min(surfaceT, p.get('return.lake.deepTemp'));
  // Shallows warm through: the cool layer is only where the lake is deep enough to hold it.
  const cool = smooth(thermo - span / 2, thermo + span / 2, depth) * smooth(thermo, thermo + span, water);
  const shallow = p.get('return.lake.shallowWarm') * warmth * smooth(p.get('return.lake.beachDepth') + 1, 0.5, water);
  return surfaceT + shallow + (deepT - surfaceT) * cool;
}

export interface LakeView {
  layout: LakeLayout;
  entered: boolean;
  ripe: number;
  /** Seconds the colours still need. */
  ripeLeft: number;
  /** True while the fish is in the lake (or up one of its streams). */
  inside: boolean;
}

export function lakeView(w: World): LakeView | null {
  const s = lakeState(w);
  if (!s) return null;
  return { layout: s.layout, entered: s.entered, ripe: s.ripe, ripeLeft: (1 - s.ripe) * ripenTime(w), inside: inLake(s.layout, w.body.pos.x) };
}

/** Which way a lake bear faces the water along z (+1: it stands on the + side). Null for river bears. */
export function lakeBearOut(w: World, bear: Entity): number | null {
  const s = lakeState(w);
  if (!s || bear.pos.x < s.layout.start) return null;
  return bear.size?.z ?? null;
}
