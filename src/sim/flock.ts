/**
 * Schools: flocking for the smolt run's school-mates and the ocean food patch.
 *
 * Each member steers by a weighted sum of:
 * - its place in the school (a goal the stage gives it, with an optional
 *   goal velocity to keep up with a moving formation),
 * - separation from close neighbours,
 * - alignment with the neighbours' heading,
 * - cohesion toward the neighbours' centre,
 * - flight from threats nearby.
 *
 * A threat that is striking makes every member within reach burst straight
 * away from it at speed (the "flash expansion" seen in real schools); while a
 * member is flashing its place in the school barely pulls on it, and once the
 * burst is over it swims back and the school regroups.
 *
 * Pure and deterministic: no randomness, members are read from a snapshot
 * taken at the start of the step and visited in array order. Members keep
 * their flash in the entity's own `state` ('flash' or 'school') and `timer`
 * (seconds left), which the renderer reads for body angle and speed.
 */
import type { Params } from './params';
import type { Entity, Vec3 } from './types';

export interface FlockTuning {
  /** Cruising speed limit (u/s). */
  maxSpeed: number;
  /** How hard a member steers back to its place (1/s). */
  anchor: number;
  /** Share of `anchor` left while flashing. */
  flashAnchor: number;
  separation: number;
  sepRadius: number;
  alignment: number;
  cohesion: number;
  neighbourRadius: number;
  /** Steady avoidance of a threat nearby (u/s at the threat). */
  flee: number;
  fleeRadius: number;
  /** Burst speed away from a striking threat (u/s), and how long it lasts (s). */
  flashSpeed: number;
  flashTime: number;
  /** How fast velocity follows the desired velocity (1/s). */
  response: number;
}

export interface Threat {
  pos: Vec3;
  /** Striking now: sets off a flash expansion in members within `fleeRadius`. */
  striking: boolean;
}

export interface FlockGoal {
  pos: Vec3;
  vel?: Vec3;
}

/** Tuning from params under a prefix, e.g. `flock.smolt.*`. */
export function flockTuning(p: Params, prefix: string): FlockTuning {
  const g = (k: string) => p.get(`${prefix}.${k}`);
  return {
    maxSpeed: g('maxSpeed'),
    anchor: g('anchor'),
    flashAnchor: g('flashAnchor'),
    separation: g('separation'),
    sepRadius: g('sepRadius'),
    alignment: g('alignment'),
    cohesion: g('cohesion'),
    neighbourRadius: g('neighbourRadius'),
    flee: g('flee'),
    fleeRadius: g('fleeRadius'),
    flashSpeed: g('flashSpeed'),
    flashTime: g('flashTime'),
    response: g('response'),
  };
}

/** Is this member bursting away from a strike right now? */
export const isFlashing = (e: Entity): boolean => e.state === 'flash' && e.timer > 0;

/**
 * Advance one step of flocking. Writes each member's `vel` (its own swimming,
 * not counting any current) and its flash state. Positions are left to the
 * stage, which adds currents and keeps members inside the arena.
 */
export function flockStep(members: readonly Entity[], goal: (e: Entity) => FlockGoal, threats: readonly Threat[], t: FlockTuning, dt: number): void {
  const n = members.length;
  if (!n) return;
  // Snapshot, so the result does not depend on the order members are visited in.
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const vz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const m = members[i] as Entity;
    px[i] = m.pos.x;
    py[i] = m.pos.y;
    pz[i] = m.pos.z;
    vx[i] = m.vel.x;
    vy[i] = m.vel.y;
    vz[i] = m.vel.z;
  }
  const nr2 = t.neighbourRadius * t.neighbourRadius;
  const k = Math.min(1, t.response * dt);
  for (let i = 0; i < n; i++) {
    const m = members[i] as Entity;
    // Flash: set off by any striking threat in reach, pointing straight away from it.
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let struck = false;
    for (const th of threats) {
      const dx = px[i]! - th.pos.x;
      const dy = py[i]! - th.pos.y;
      const dz = pz[i]! - th.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= t.fleeRadius || d < 1e-6) continue;
      const w = 1 - d / t.fleeRadius;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
      fz += (dz / d) * w;
      if (th.striking) struck = true;
    }
    if (struck) {
      m.state = 'flash';
      m.timer = t.flashTime;
    } else if (m.state === 'flash') {
      m.timer = Math.max(0, m.timer - dt);
      if (m.timer <= 0) m.state = 'school';
    } else if (m.state !== 'school') {
      m.state = 'school';
      m.timer = 0;
    }
    const flashing = m.state === 'flash';
    // Neighbours.
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let ax = 0;
    let ay = 0;
    let az = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let count = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = px[i]! - px[j]!;
      const dy = py[i]! - py[j]!;
      const dz = pz[i]! - pz[j]!;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > nr2) continue;
      const d = Math.sqrt(d2);
      if (d < t.sepRadius && d > 1e-6) {
        const w = 1 - d / t.sepRadius;
        sx += (dx / d) * w;
        sy += (dy / d) * w;
        sz += (dz / d) * w;
      }
      ax += vx[j]!;
      ay += vy[j]!;
      az += vz[j]!;
      cx += px[j]!;
      cy += py[j]!;
      cz += pz[j]!;
      count++;
    }
    const g = goal(m);
    const anchor = t.anchor * (flashing ? t.flashAnchor : 1);
    let wx = (g.pos.x - px[i]!) * anchor + (g.vel?.x ?? 0);
    let wy = (g.pos.y - py[i]!) * anchor + (g.vel?.y ?? 0);
    let wz = (g.pos.z - pz[i]!) * anchor + (g.vel?.z ?? 0);
    wx += sx * t.separation;
    wy += sy * t.separation;
    wz += sz * t.separation;
    if (count) {
      wx += (ax / count - vx[i]!) * t.alignment + (cx / count - px[i]!) * t.cohesion;
      wy += (ay / count - vy[i]!) * t.alignment + (cy / count - py[i]!) * t.cohesion;
      wz += (az / count - vz[i]!) * t.alignment + (cz / count - pz[i]!) * t.cohesion;
    }
    const fl = Math.hypot(fx, fy, fz);
    if (fl > 1e-6) {
      // Flashing: a burst straight away from the threat; otherwise steady avoidance.
      const s = flashing ? t.flashSpeed : t.flee * Math.min(1, fl);
      wx += (fx / fl) * s;
      wy += (fy / fl) * s;
      wz += (fz / fl) * s;
    }
    const cap = flashing ? Math.max(t.maxSpeed, t.flashSpeed) : t.maxSpeed;
    const sp = Math.hypot(wx, wy, wz);
    if (sp > cap) {
      wx *= cap / sp;
      wy *= cap / sp;
      wz *= cap / sp;
    }
    // A flash is a reflex: the burst takes hold at once; otherwise velocity eases toward the wish.
    const kk = struck ? 1 : k;
    m.vel = { x: vx[i]! + (wx - vx[i]!) * kk, y: vy[i]! + (wy - vy[i]!) * kk, z: vz[i]! + (wz - vz[i]!) * kk };
  }
}

/** Mean distance of members from their centre: how spread out the school is. */
export function schoolSpread(members: readonly Entity[]): number {
  if (!members.length) return 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const m of members) {
    cx += m.pos.x;
    cy += m.pos.y;
    cz += m.pos.z;
  }
  cx /= members.length;
  cy /= members.length;
  cz /= members.length;
  let s = 0;
  for (const m of members) s += Math.hypot(m.pos.x - cx, m.pos.y - cy, m.pos.z - cz);
  return s / members.length;
}
