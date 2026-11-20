/**
 * The third-person play camera (render only; reads sim state, never writes it).
 *
 * - Two views (cameraConfig.ts `views`): `chase` (default) hangs low near the fish's depth, a little above,
 *   behind and off to one side, so the fish is seen side-on in silhouette with the surface in view; `high`
 *   hangs behind and above, looking down on the back (the feel pass's view).
 * - Side-on framing (`CameraAim.side`, chase only) for the spawning act, fights and leaps at the falls.
 * - A soft look toward a hot threat (`CameraAim.threat`), off with reduced motion.
 * - Hangs on a boom behind the fish. The boom's heading follows the
 *   fish's with a little lag, so a turn swings the fish across the frame and
 *   shows which way it is going; the gaze looks slightly ahead of the fish.
 * - Never clips: the boom is marched against the scenery's ground (banks
 *   included), the sim's walls, and solid scenery (rocks, logs, roots) through
 *   an optional ray probe. It pulls in when blocked (and rises when pulled in
 *   too far), and eases back out slowly.
 * - Stays under the water surface, which is a hard visual line.
 * - A short shake on a near miss, off with reduced motion.
 *
 * Plain vector maths so it can be unit tested without WebGL. Tuning: cameraConfig.ts.
 */
import { CAMERA, type CameraView } from './cameraConfig';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraBox {
  min: V3;
  max: V3;
}

/** What the camera must stay clear of. */
export interface CameraProbe {
  surfaceY: number;
  /** Height of the ground at (x, z): riverbed and banks. */
  ground(x: number, z: number): number;
  walls?: readonly CameraBox[];
  /** Distance from `from` along unit `dir` to the first solid scenery, or Infinity (up to `max`). */
  rayHit?(from: V3, dir: V3, max: number): number;
}

/** What the camera should frame besides the fish. All optional; the Renderer fills it from sim views each frame. */
export interface CameraAim {
  /** 0..1: how far to swing round to a side-on view (spawning act, fight, leap). Chase view only. */
  side?: number;
  /** A point to centre the side-on view on (e.g. between the fish and a rival), with `spread` extra boom length. */
  centre?: V3 | null;
  spread?: number;
  /** A hot threat to bring on screen, and how strongly (0..1). Pass null while a cinematic shot plays. */
  threat?: V3 | null;
  threatWeight?: number;
}

export interface FishPose {
  pos: V3;
  vel: V3;
  yaw: number;
  pitch: number;
  scale: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const follow = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const heading = (yaw: number, pitch: number, out: V3): V3 => {
  // Same convention as the sim's headingVec.
  const c = Math.cos(pitch);
  out.x = Math.cos(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = Math.sin(yaw) * c;
  return out;
};

/** True if a point is inside the ground or a wall (with a margin). */
export function blockedAt(p: V3, probe: CameraProbe, margin: number): boolean {
  if (p.y < probe.ground(p.x, p.z) + margin) return true;
  for (const b of probe.walls ?? []) {
    if (p.x > b.min.x - margin && p.x < b.max.x + margin && p.z > b.min.z - margin && p.z < b.max.z + margin && p.y < b.max.y + margin && p.y > b.min.y - margin) return true;
  }
  return false;
}

/** How far a point is from the ground and the walls (0 if inside). */
export function clearanceAt(p: V3, probe: CameraProbe): number {
  let c = p.y - probe.ground(p.x, p.z);
  for (const b of probe.walls ?? []) {
    if (p.y > b.max.y || p.y < b.min.y) continue;
    const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
    const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
    c = Math.min(c, Math.hypot(dx, dz));
  }
  return Math.max(0, c);
}

/**
 * How far along a boom from `origin` (unit `dir`, length `len`) the camera can
 * go without entering the ground, a wall or solid scenery.
 */
export function clearLength(origin: V3, dir: V3, len: number, probe: CameraProbe, margin: number = CAMERA.margin, samples: number = CAMERA.samples): number {
  const at = (t: number, out: V3) => {
    out.x = origin.x + dir.x * t;
    out.y = origin.y + dir.y * t;
    out.z = origin.z + dir.z * t;
    return out;
  };
  const p = { x: 0, y: 0, z: 0 };
  // The fish may be lying right on the bed or against a wall: the margin grows from what it has there,
  // so the start of the boom is never "blocked" just for being next to the fish.
  const start = Math.max(0, Math.min(margin, clearanceAt(origin, probe) - 0.01));
  const marginAt = (t: number) => Math.min(margin, start + 0.3 * t);
  let clear = len;
  let lo = 0;
  for (let i = 1; i <= samples; i++) {
    const t = (i / samples) * len;
    if (blockedAt(at(t, p), probe, marginAt(t))) {
      // Refine between the last clear sample and this one.
      let hi = t;
      for (let k = 0; k < 5; k++) {
        const mid = (lo + hi) / 2;
        if (blockedAt(at(mid, p), probe, marginAt(mid))) hi = mid;
        else lo = mid;
      }
      clear = lo;
      break;
    }
    lo = t;
  }
  if (probe.rayHit) {
    const d = probe.rayHit(origin, dir, len + margin);
    if (Number.isFinite(d)) clear = Math.min(clear, Math.max(0, d - margin));
  }
  return clear;
}

export class CameraRig {
  readonly pos: V3 = { x: 0, y: 0, z: 0 };
  readonly look: V3 = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private pitch = 0;
  private pivot: V3 = { x: 0, y: 0, z: 0 };
  private boom = -1;
  private started = false;
  private shakeLeft = 0;
  private shakeAmp = 0;
  private shakeT = 0;
  // Scratch.
  private h: V3 = { x: 0, y: 0, z: 0 };
  private hf: V3 = { x: 0, y: 0, z: 0 };
  private end: V3 = { x: 0, y: 0, z: 0 };
  private end2: V3 = { x: 0, y: 0, z: 0 };
  /** Sideways swing of the boom (rad) around something blocking the view. */
  private dodge = 0;
  private dir: V3 = { x: 0, y: 0, z: 0 };
  private lookWant: V3 = { x: 0, y: 0, z: 0 };
  /** Which view the rig shows. */
  view: CameraView = 'chase';
  /** Which side of the fish the chase view sits on (+1 / -1), chosen for open water when it snaps. */
  private sideSign = 1;
  /** Smoothed side-on framing (0..1), threat swing (rad) and threat look (0..1). */
  private sideOn = 0;
  /** Smoothed yaw of the boom off the tail axis (rad), so a change of side swings round rather than jumping. */
  private baseYaw = 0;
  private framing = false;
  private swing = 0;
  private threatLook = 0;
  private lastThreat: V3 = { x: 0, y: 0, z: 0 };
  private centre: V3 = { x: 0, y: 0, z: 0 };

  /** Snap to the fish on the next update (a new stage, a teleport). */
  reset(): void {
    this.started = false;
  }

  /** A near miss: shake for a moment (strength 0..1). Ignored with reduced motion by update(). */
  shake(strength: number): void {
    this.shakeLeft = CAMERA.shake.length;
    this.shakeAmp = Math.max(this.shakeLeft > 0 ? this.shakeAmp : 0, Math.min(1, strength));
  }

  get shaking(): boolean {
    return this.shakeLeft > 0;
  }

  /** How far the view is swung round to side-on (0..1), for tests and the debug panel. */
  get sideOnShare(): number {
    return this.sideOn;
  }

  /** The boom's current swing toward a threat (rad). */
  get threatSwing(): number {
    return this.swing;
  }

  update(f: FishPose, dt: number, probe: CameraProbe, reducedMotion: boolean, aim: CameraAim = {}): void {
    const c = CAMERA;
    const v = c.views[this.view];
    const snap = !this.started;
    const fh = heading(f.yaw, f.pitch, this.hf);
    // Side-on framing and the threat swing, smoothed.
    const sideWant = this.view === 'chase' ? Math.max(0, Math.min(1, aim.side ?? 0)) : 0;
    let swingWant = 0;
    let lookWant = 0;
    const t = aim.threat;
    if (t && !reducedMotion && (aim.threatWeight ?? 1) > 0) {
      const dist = Math.hypot(t.x - f.pos.x, t.z - f.pos.z);
      if (dist < c.threat.range) {
        const wgt = Math.max(0, Math.min(1, aim.threatWeight ?? 1));
        const bearing = Math.atan2(t.z - f.pos.z, t.x - f.pos.x);
        const delta = wrap(bearing - (this.yaw + this.sideSign * v.side));
        swingWant = Math.max(-c.threat.maxSwing, Math.min(c.threat.maxSwing, delta * c.threat.swingShare)) * wgt;
        lookWant = wgt;
        this.lastThreat.x = t.x;
        this.lastThreat.y = t.y;
        this.lastThreat.z = t.z;
      }
    }
    if (snap) {
      this.sideOn = sideWant;
      this.swing = 0;
      this.threatLook = 0;
    } else {
      this.sideOn += (sideWant - this.sideOn) * follow(reducedMotion ? c.frame.followReduced : c.frame.follow, dt);
      const k = follow(c.threat.follow, dt);
      this.swing += (swingWant - this.swing) * k;
      this.threatLook += (lookWant - this.threatLook) * k;
    }
    const side = this.sideOn;
    if (snap) {
      this.yaw = f.yaw;
      this.pitch = f.pitch * v.pitchShare;
      this.pivot.x = f.pos.x;
      this.pivot.y = f.pos.y;
      this.pivot.z = f.pos.z;
      this.boom = -1;
      this.shakeLeft = 0;
      this.dodge = 0;
    } else {
      this.yaw += wrap(f.yaw - this.yaw) * follow(reducedMotion ? c.yawFollowReduced : c.yawFollow, dt);
      this.pitch += (f.pitch * v.pitchShare * (1 - side) - this.pitch) * follow(c.pitchFollow, dt);
      const k = follow(c.pivotFollow, dt);
      this.pivot.x += (f.pos.x - this.pivot.x) * k;
      this.pivot.y += (f.pos.y - this.pivot.y) * k;
      this.pivot.z += (f.pos.z - this.pivot.z) * k;
    }
    // The origin of the boom: the (smoothed) fish, kept under the surface line.
    const top = probe.surfaceY - c.surfaceMargin;
    const o = this.pivot;
    // ...and out of the ground: the drawn banks can stand a little above the sim's bed at the edges.
    o.y = Math.min(top, Math.max(o.y, probe.ground(o.x, o.z) + c.margin * 0.5));

    // Where the camera wants to be: behind the fish, off to its side (chase), swung round further for side-on
    // framing and toward a threat, and aside by `dodge` when blocked; under the surface.
    const spread = side * Math.max(0, aim.spread ?? 0);
    const d = (v.boom.perScale * f.scale + v.boom.base) * (1 + c.frame.longer * side) + spread;
    const up = v.boom.up + (c.frame.up - v.boom.up) * side;
    const back = v.boom.back;
    // Which side: open water when the stage starts, and again when a framed moment begins (side-on wants room).
    const trySide = (sign: number, angle: number) => {
      const h = heading(this.yaw + sign * angle, this.pitch, this.h);
      const e = { x: o.x - h.x * d * back, y: Math.min(top, o.y + up * d), z: o.z - h.z * d * back };
      return this.march(o, e, probe).clear;
    };
    if (snap && v.side > 0) this.sideSign = trySide(-1, v.side) > trySide(1, v.side) + 0.05 ? -1 : 1;
    const framing = sideWant > 0;
    if (framing && !this.framing && !snap) {
      const a = c.frame.angle;
      const here = trySide(this.sideSign, a);
      if (trySide(-this.sideSign, a) > here + 0.3) this.sideSign = -this.sideSign;
    }
    this.framing = framing;
    const baseWant = this.sideSign * (v.side + (c.frame.angle - v.side) * side);
    if (snap) this.baseYaw = baseWant;
    else this.baseYaw += (baseWant - this.baseYaw) * follow(reducedMotion ? c.frame.followReduced : c.frame.follow, dt);
    const baseYaw = this.baseYaw + this.swing;
    const boomTo = (yawOffset: number, end: V3): V3 => {
      const h = heading(this.yaw + baseYaw + yawOffset, this.pitch, this.h);
      end.x = o.x - h.x * d * back;
      end.y = o.y - h.y * d * back + up * d;
      end.z = o.z - h.z * d * back;
      end.y = Math.min(top, Math.max(probe.ground(end.x, end.z) + c.margin, end.y));
      return end;
    };
    const end = boomTo(this.dodge, this.end);

    // March the boom; if it has to pull in a long way, try rising instead.
    const tryRise = (b: { clear: number; len: number; dir: V3 }, e: V3) => {
      if (b.clear >= c.minBoom * b.len) return b;
      const baseY = e.y;
      let best = b;
      for (let i = 1; i <= 3; i++) {
        e.y = Math.min(top, baseY + ((top - baseY) * i) / 3);
        const t = this.march(o, e, probe);
        if (t.clear > best.clear) best = t;
        if (t.clear >= c.minBoom * t.len) break;
      }
      return best;
    };
    let best = tryRise(this.march(o, end, probe), end);
    // Still cramped (a bank or rock right behind): swing the boom aside, smoothly, towards open water.
    let dodgeWant = this.dodge;
    if (best.clear < c.dodge.below * best.len) {
      let bestClear = best.clear;
      for (const off of c.dodge.offsets) {
        const e = boomTo(off, this.end2);
        const t = tryRise(this.march(o, e, probe), e);
        if (t.clear > bestClear + 0.05) {
          bestClear = t.clear;
          dodgeWant = off;
        }
      }
    } else if (this.dodge !== 0) {
      // Clear again: come back behind the fish once straight behind is open too.
      const e = boomTo(0, this.end2);
      const t = this.march(o, e, probe);
      if (t.clear >= c.dodge.below * t.len) dodgeWant = 0;
    }
    if (snap) this.dodge = dodgeWant;
    else this.dodge += (dodgeWant - this.dodge) * follow(c.dodge.follow, dt);
    if (Math.abs(this.dodge) < 1e-3 && dodgeWant === 0) this.dodge = 0;
    if (dodgeWant !== this.dodge) best = tryRise(this.march(o, boomTo(this.dodge, end), probe), end);
    const { clear, len } = best;
    const dir = this.dir;
    dir.x = best.dir.x;
    dir.y = best.dir.y;
    dir.z = best.dir.z;
    // Ease the boom out slowly, pull it in fast, and never past the clear length.
    const soft = Math.max(0, clear - c.margin);
    if (this.boom < 0 || snap) this.boom = clear;
    else if (soft < this.boom) this.boom += (soft - this.boom) * follow(c.pullIn, dt);
    else this.boom += (Math.min(soft, len) - this.boom) * follow(c.easeOut, dt);
    this.boom = Math.min(this.boom, clear);

    this.pos.x = o.x + dir.x * this.boom;
    this.pos.y = o.y + dir.y * this.boom;
    this.pos.z = o.z + dir.z * this.boom;

    // Shake (never with reduced motion), then the hard lines again.
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      this.shakeT += dt;
      if (!reducedMotion) {
        const decay = this.shakeLeft / c.shake.length;
        const a = c.shake.amp * (f.scale + 0.5) * this.shakeAmp * decay * decay;
        const w = c.shake.freq * Math.PI * 2 * this.shakeT;
        this.pos.x += a * Math.sin(w);
        this.pos.y += a * Math.sin(w * 1.31 + 1.7);
        this.pos.z += a * Math.sin(w * 0.87 + 0.6);
      }
    }
    this.pos.y = Math.min(top, Math.max(this.pos.y, probe.ground(this.pos.x, this.pos.z) + c.margin * 0.5));

    // Gaze: a little ahead of the fish, along its own heading and its travel.
    const la = { ...v.look, ...c.lookLead };
    const ahead = (la.perScale * f.scale + la.base) * (1 - 0.6 * side);
    let lx = f.vel.x * la.velLead;
    let ly = f.vel.y * la.velLead;
    let lz = f.vel.z * la.velLead;
    const lead = Math.hypot(lx, ly, lz);
    if (lead > la.maxLead) {
      const s = la.maxLead / lead;
      lx *= s;
      ly *= s;
      lz *= s;
    }
    const lw = this.lookWant;
    lw.x = f.pos.x + fh.x * ahead + lx;
    lw.y = f.pos.y + fh.y * ahead + ly - la.down * ahead;
    lw.z = f.pos.z + fh.z * ahead + lz;
    // Side-on framing: centre on what is framed (the fish and a rival, say).
    const cen = aim.centre;
    if (cen && side > 0) {
      this.centre.x = cen.x;
      this.centre.y = cen.y;
      this.centre.z = cen.z;
    }
    if (side > 1e-3) {
      const ce = cen ? this.centre : f.pos;
      lw.x += (ce.x - lw.x) * side;
      lw.y += (ce.y - lw.y) * side;
      lw.z += (ce.z - lw.z) * side;
    }
    // Threat: look part of the way toward it.
    if (this.threatLook > 1e-3) {
      const th = this.lastThreat;
      const dx = th.x - lw.x;
      const dy = th.y - lw.y;
      const dz = th.z - lw.z;
      const dl = Math.hypot(dx, dy, dz);
      const m = Math.min(c.threat.lookShare * dl, c.threat.maxLook * Math.max(this.boom, 0)) * this.threatLook;
      if (dl > 1e-6) {
        lw.x += (dx / dl) * m;
        lw.y += (dy / dl) * m;
        lw.z += (dz / dl) * m;
      }
    }
    if (snap) {
      this.look.x = lw.x;
      this.look.y = lw.y;
      this.look.z = lw.z;
    } else {
      const k = follow(c.lookFollow, dt);
      this.look.x += (lw.x - this.look.x) * k;
      this.look.y += (lw.y - this.look.y) * k;
      this.look.z += (lw.z - this.look.z) * k;
    }
    this.started = true;
  }

  private march(o: V3, end: V3, probe: CameraProbe): { clear: number; len: number; dir: V3 } {
    const dx = end.x - o.x;
    const dy = end.y - o.y;
    const dz = end.z - o.z;
    const len = Math.max(1e-6, Math.hypot(dx, dy, dz));
    const dir = { x: dx / len, y: dy / len, z: dz / len };
    return { clear: clearLength(o, dir, len, probe), len, dir };
  }
}
