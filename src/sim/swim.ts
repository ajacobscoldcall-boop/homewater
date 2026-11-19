/** Swimming physics shared by every swimming stage. */
import type { Intent, Vec3 } from './types';
import { clamp, headingVec, len } from './vec';
import type { World } from './world';

export interface SwimOptions {
  /** Multiplier on thrust (e.g. low fat). */
  thrustScale?: number;
  /** Disable vertical movement (gravel stage). */
  fixed?: boolean;
}

export interface SwimResult {
  thrust: number;
  burst: boolean;
}

export function swimStep(w: World, intent: Intent, dt: number, opts: SwimOptions = {}): SwimResult {
  const p = w.p;
  const b = w.body;
  if (opts.fixed) {
    b.vel = { x: 0, y: 0, z: 0 };
    return { thrust: 0, burst: false };
  }
  const sens = p.get('swim.mouseSensitivity');
  b.yaw += intent.turn * p.get('swim.turnRate') * dt + intent.mouseX * sens;
  const maxPitch = p.get('swim.maxPitch');
  b.pitch = clamp(b.pitch - intent.mouseY * sens, -maxPitch, maxPitch);
  // Rise and dive ease the pitch toward up/down when no mouse is used.
  if (intent.rise) b.pitch = clamp(b.pitch + 1.5 * dt, -maxPitch, maxPitch);
  if (intent.dive) b.pitch = clamp(b.pitch - 1.5 * dt, -maxPitch, maxPitch);
  if (!intent.rise && !intent.dive && intent.mouseY === 0) b.pitch *= 1 - Math.min(1, 0.8 * dt);

  const exhausted = b.energy < p.get('energy.exhaustedBelow');
  const forward = clamp(intent.forward, 0, 1);
  const burst = intent.burst && forward > 0 && !exhausted;
  const sizeBonus = 1 + p.get('swim.sizeSpeedBonus') * (b.scale - 0.6);
  const thrustMag =
    p.get('swim.thrust') * sizeBonus * forward * (burst ? p.get('swim.burstMultiplier') : 1) * (exhausted ? 0.5 : 1) * (opts.thrustScale ?? 1);

  const h = headingVec(b.yaw, b.pitch);
  const drag = p.get('swim.drag');
  const current = currentAt(w, b.pos);
  const acc: Vec3 = { x: h.x * thrustMag, y: h.y * thrustMag, z: h.z * thrustMag };
  const vt = p.get('swim.verticalThrust');
  if (intent.rise) acc.y += vt;
  if (intent.dive) acc.y -= vt;
  if (intent.hold) {
    // Push back against the current to hold station.
    const hold = p.get('swim.holdThrust') * drag;
    acc.x -= current.x * hold;
    acc.y -= current.y * hold;
    acc.z -= current.z * hold;
  }
  acc.x -= (b.vel.x - current.x) * drag;
  acc.y -= (b.vel.y - current.y) * drag;
  acc.z -= (b.vel.z - current.z) * drag;

  b.vel.x += acc.x * dt;
  b.vel.y += acc.y * dt;
  b.vel.z += acc.z * dt;
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;

  // Energy: swimming costs a little, bursting a lot; rest recovers.
  if (burst) b.energy -= p.get('energy.burstCost') * dt;
  else b.energy += p.get('energy.regen') * (1 - 0.4 * forward) * dt;
  b.energy -= p.get('energy.swimCost') * forward * dt;
  b.energy = clamp(b.energy, 0, 1);

  constrain(w);
  b.burst = burst;
  b.thrust = forward;
  return { thrust: forward, burst };
}

export function currentAt(w: World, pos: Vec3): Vec3 {
  const c = w.arena.current(pos);
  const f = w.conditions.flow;
  return { x: c.x * f, y: c.y * f, z: c.z * f };
}

/** Keep the fish inside the arena: bounds, floor, surface and walls. */
export function constrain(w: World): void {
  const b = w.body;
  const a = w.arena;
  const r = 0.3 * b.scale;
  b.pos.x = clamp(b.pos.x, a.min.x + r, a.max.x - r);
  b.pos.z = clamp(b.pos.z, a.min.z + r, a.max.z - r);
  const floor = a.floor(b.pos.x, b.pos.z) + r;
  if (b.pos.y < floor) {
    b.pos.y = floor;
    if (b.vel.y < 0) b.vel.y = 0;
  }
  const top = a.surfaceY - r;
  if (b.pos.y > top) {
    b.pos.y = top;
    if (b.vel.y > 0) b.vel.y = 0;
  }
  for (const wall of a.walls ?? []) {
    const { min, max } = wall;
    if (b.pos.x > min.x - r && b.pos.x < max.x + r && b.pos.z > min.z - r && b.pos.z < max.z + r && b.pos.y < max.y) {
      // Push out along the axis of least penetration (x or z).
      const pens = [
        { d: b.pos.x - (min.x - r), ax: 'x', to: min.x - r },
        { d: max.x + r - b.pos.x, ax: 'x', to: max.x + r },
        { d: b.pos.z - (min.z - r), ax: 'z', to: min.z - r },
        { d: max.z + r - b.pos.z, ax: 'z', to: max.z + r },
      ].sort((u, v) => u.d - v.d);
      const best = pens[0];
      if (best) {
        if (best.ax === 'x') {
          b.pos.x = best.to;
          b.vel.x = 0;
        } else {
          b.pos.z = best.to;
          b.vel.z = 0;
        }
      }
    }
  }
}

export const speedOf = (w: World): number => len(w.body.vel);
export const depthOf = (w: World): number => w.arena.surfaceY - w.body.pos.y;
