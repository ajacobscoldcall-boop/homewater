/**
 * Procedural animals for Homewater, built in code from lofts, fin patches and
 * small primitives (no downloaded models). Each animal is a THREE.Group with
 * an update(pose) hook for simple procedural animation. Parts that move on
 * their own (a bear's head and swiping arm, a gull's wings, a merganser's neck
 * and feet) are separate meshes; everything else is merged, so an animal costs
 * one to five draw calls.
 *
 * Swimmers (orca, salmon shark, harbor seal, char) use the fish swimming
 * material: a travelling wave in the vertex shader. Orcas bend up and down.
 *
 * Conventions: +x is forward, +y is up. Swimmers are built about 1 unit long
 * and scaled by the renderer; the bear, gull and merganser are built at game
 * scale (the salmon is about 1 unit, roughly 0.75 m).
 */
import * as THREE from 'three';
import { bell, col, decal, finPatch, GeoBuilder, hash3, keyed, loft, noise3, ringPoint, smooth, spline, surfacePatch, surfaceStrip, tube, type Ring } from './geo';
import { quality } from './quality';
import { BEAR_STRIKE } from './aboveConfig';
import { createFish, fishMaterial, setSwim, type FishLook } from './fishMesh';

export interface AnimalPose {
  /** Behaviour label from the simulation: 'idle', 'warn', 'strike', 'dive', 'chase', ... */
  mode: string;
  /** Seconds, for idle motion. */
  t: number;
  /** Progress through the current behaviour, 0..1. */
  k?: number;
  /** Swim wave phase and amplitude (swimmers). */
  phase?: number;
  amp?: number;
  /** A point the animal reaches for, in the animal's local frame (bear swipe). */
  target?: THREE.Vector3;
  /** Water surface height in the animal's local frame. */
  surface?: number;
  /** Nose-up (+) or nose-down (-) pitch, radians. */
  pitch?: number;
  opacity?: number;
  /** Jaw opening, radians (bear), overriding the pose's own. */
  jaw?: number;
  /** Height of the ground at (x, z), all in the animal's local frame (bear: where its feet go). Flat at 0 if missing. */
  ground?: (x: number, z: number) => number;
}

export interface Animal {
  kind: string;
  root: THREE.Group;
  update(p: AnimalPose): void;
}

export const animalOf = (o: THREE.Object3D): Animal | undefined => o.userData.animal as Animal | undefined;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = build();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

function mat(opts: { roughness?: number; metalness?: number; transparent?: boolean } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0, side: THREE.DoubleSide, transparent: opts.transparent ?? false });
}

function wrap(kind: string, root: THREE.Group, update: (p: AnimalPose) => void): Animal {
  const a: Animal = { kind, root, update };
  root.userData.animal = a;
  root.name = kind;
  return a;
}

const ringFrom = (keys: number[][], x: number): Ring => ({ x, y: keyed(keys, x, 1), top: keyed(keys, x, 2), bottom: keyed(keys, x, 3), width: keyed(keys, x, 4) });
const span = (keys: number[][]): [number, number] => [keys[0]![0]!, keys[keys.length - 1]![0]!];

/** A fin with a little thickness: two patches offset along a normal, closing towards the tip. */
function thickFin(
  b: GeoBuilder,
  root: (s: number, o: THREE.Vector3) => void,
  tip: (s: number, o: THREE.Vector3) => void,
  normal: THREE.Vector3,
  thick: number,
  paint: (s: number, r: number, face: number, out: THREE.Color) => void,
  opts: { rows?: number; cols?: number; flex?: 'median' | 'paired' | 'none' } = {},
): void {
  for (const face of [-1, 1]) {
    finPatch(
      b,
      (s, o) => {
        root(s, o);
        o.addScaledVector(normal, face * thick * Math.sin(Math.PI * Math.min(1, Math.max(0, s * 0.9 + 0.05))));
      },
      (s, o) => {
        tip(s, o);
        o.addScaledVector(normal, face * thick * 0.12);
      },
      (s, r, c) => paint(s, r, face, c),
      opts,
    );
  }
}

// ---------------------------------------------------------------------------
// Brown bear
// ---------------------------------------------------------------------------

const BEAR_TORSO: number[][] = [
  [-1.05, 0.98, 0.06, 0.06, 0.06],
  [-0.98, 0.98, 0.3, 0.3, 0.3],
  [-0.8, 1.0, 0.42, 0.41, 0.4],
  [-0.5, 1.0, 0.44, 0.44, 0.44],
  [-0.15, 1.02, 0.47, 0.46, 0.46],
  [0.18, 1.08, 0.57, 0.44, 0.45],
  [0.42, 1.1, 0.51, 0.42, 0.4],
  [0.66, 1.16, 0.37, 0.34, 0.3],
  [0.84, 1.2, 0.28, 0.27, 0.24],
];

/** Head with the upper jaw: the muzzle's underside is cut back so the lower jaw (a separate mesh) can open. */
const BEAR_HEAD: number[][] = [
  [-0.1, 0, 0.24, 0.24, 0.22],
  [0.04, 0.02, 0.27, 0.24, 0.26],
  [0.17, 0.03, 0.25, 0.19, 0.235],
  [0.29, -0.03, 0.17, 0.12, 0.16],
  [0.4, -0.06, 0.13, 0.085, 0.125],
  [0.52, -0.075, 0.11, 0.07, 0.105],
  [0.6, -0.075, 0.088, 0.06, 0.085],
  [0.645, -0.075, 0.03, 0.03, 0.03],
];
/** Lower jaw, from its hinge forward. */
const BEAR_JAW: number[][] = [
  [0.06, -0.1, 0.07, 0.08, 0.15],
  [0.22, -0.14, 0.05, 0.065, 0.12],
  [0.38, -0.15, 0.035, 0.05, 0.088],
  [0.52, -0.15, 0.028, 0.035, 0.066],
  [0.575, -0.145, 0.012, 0.012, 0.025],
];
const JAW_HINGE = new THREE.Vector3(0.1, -0.08, 0);
/** Hip joint: the hind legs hang from here and stay upright when the bear pitches forward. */
const HIP = new THREE.Vector3(-0.7, 1.0, 0);
const UP = new THREE.Vector3(0, 1, 0);
/** Forefeet, forward of the bear's origin (the hind feet are at HIP.x). */
export const BEAR_FORE_X = 0.47;
const FORE_X = BEAR_FORE_X;
/** In a plunge the forelegs reach this far forward of straight down (radians): ahead of the chest, behind the jaws. */
const PLUNGE_PAWS = 0.22;

const FUR = { base: col(0x5a3b23), dark: col(0x2e1f16), light: col(0x9a7650), tip: col(0xb89a6e), muzzle: col(0x9a7a56), sole: col(0x1a1513), claw: col(0xd6c8a8), clawTip: col(0x8b8170) };

/**
 * Fur colour: clumps of guard hair lying along `flow` (the direction the fur
 * grows), darker in the creases between clumps, with paler tips where
 * `grizzle` is high (hump and back).
 */
function furColor(p: THREE.Vector3, out: THREE.Color, darkness = 0, grizzle = 0, flow: 'body' | 'leg' = 'body'): void {
  const n = noise3(p.x * 6, p.y * 6, p.z * 6);
  const streak = flow === 'body' ? noise3(p.x * 7, p.y * 34, p.z * 34) : noise3(p.x * 34, p.y * 7, p.z * 34);
  const clump = noise3(p.x * 19 + 4, p.y * 19, p.z * 19);
  out.copy(FUR.base).lerp(FUR.light, Math.max(0, n - 0.45) * 1.1 * (1 - darkness));
  out.lerp(FUR.dark, Math.min(1, darkness * 0.8 + 0.5 * Math.max(0, 0.5 - streak) + 0.2 * (1 - clump)));
  if (grizzle > 0) out.lerp(FUR.tip, grizzle * smooth(0.5, 0.8, streak * 0.6 + clump * 0.5));
}

/**
 * A tuft of shaggy fur: a narrow folded card from the skin outwards, bent back
 * along the fur's flow. Breaks the smooth silhouette along the back, hump,
 * belly and the backs of the legs.
 */
function furTuft(b: GeoBuilder, at: THREE.Vector3, normal: THREE.Vector3, flow: THREE.Vector3, len: number, width: number, root: THREE.Color, tip: THREE.Color, lift = 1): void {
  const n = normal.clone().normalize();
  const f = flow.clone().addScaledVector(n, -flow.dot(n)).normalize();
  const side = new THREE.Vector3().crossVectors(n, f).normalize();
  const base = at.clone().addScaledVector(n, -len * 0.15).addScaledVector(f, -len * 0.2);
  const mid = at.clone().addScaledVector(n, len * 0.16).addScaledVector(f, len * 0.45);
  const end = at.clone().addScaledVector(n, len * 0.2 * lift).addScaledVector(f, len);
  const half = width / 2;
  const mc = root.clone().lerp(tip, 0.5);
  const i0 = b.v(base.x - side.x * half, base.y - side.y * half, base.z - side.z * half, root);
  const i1 = b.v(base.x + side.x * half, base.y + side.y * half, base.z + side.z * half, root);
  const ridge = mid.clone().addScaledVector(n, width * 0.18);
  const i2 = b.v(mid.x - side.x * half * 0.7, mid.y - side.y * half * 0.7, mid.z - side.z * half * 0.7, mc);
  const i3 = b.v(ridge.x, ridge.y, ridge.z, mc);
  const i4 = b.v(mid.x + side.x * half * 0.7, mid.y + side.y * half * 0.7, mid.z + side.z * half * 0.7, mc);
  const i5 = b.v(end.x, end.y, end.z, tip);
  // A shallow V in section, so it catches light from both sides.
  b.tri(i0, i3, i2);
  b.tri(i0, i1, i3);
  b.tri(i1, i4, i3);
  b.tri(i2, i3, i5);
  b.tri(i3, i4, i5);
}

/** Leg centre lines from the paw up, in the leg's own x-y plane (x forward). Keys: [t, x, y, depth, width]. */
const FRONT_LEG: number[][] = [
  [0, 0.03, 0.08, 0.075, 0.08],
  [0.12, 0.0, 0.17, 0.07, 0.075],
  [0.3, -0.01, 0.34, 0.095, 0.09],
  [0.48, -0.05, 0.54, 0.135, 0.11],
  [0.6, -0.1, 0.66, 0.15, 0.115],
  [0.78, -0.04, 0.86, 0.2, 0.15],
  [1, 0.06, 1.12, 0.23, 0.17],
];
const HIND_LEG: number[][] = [
  [0, -0.08, 0.08, 0.07, 0.075],
  [0.15, -0.08, 0.19, 0.08, 0.08],
  [0.35, -0.02, 0.37, 0.11, 0.1],
  [0.55, 0.06, 0.58, 0.18, 0.15],
  [0.75, 0.01, 0.82, 0.25, 0.19],
  [1, -0.07, 1.1, 0.26, 0.2],
];

function bearLeg(b: GeoBuilder, m: THREE.Matrix4, keys: number[][], front: boolean, lo: boolean): void {
  const prev = b.matrix;
  b.matrix = prev ? prev.clone().multiply(m) : m.clone();
  const pts = keys.map((k) => [k[1]!, k[2]!]);
  const c = { x: 0, y: 0 };
  tube(
    b,
    lo ? 10 : 18,
    lo ? 10 : 14,
    (t) => {
      spline(pts, t, c);
      // Clumpy fur breaks the outline a little.
      const shag = 1 + 0.06 * (noise3(t * 9, front ? 1 : 5, 0) - 0.5);
      return { x: c.x, y: c.y, depth: keyed(keys, t, 3) * shag, width: keyed(keys, t, 4) * shag };
    },
    (t, s, _side, p, out) => {
      furColor(p, out, 0.75 - 0.6 * t + (s < -0.3 ? 0.1 : 0), 0, 'leg');
    },
    { caps: true, fullness: 0.85 },
  );
  // The paw: a broad pad, toes in an arc and a dark sole.
  const sole = (q: THREE.Vector3, o: THREE.Color) => {
    if (q.y < -0.35) o.copy(FUR.sole);
    else furColor(q, o, 0.85, 0, 'leg');
  };
  const pawX = front ? 0.05 : -0.01;
  const pawL = front ? 0.13 : 0.19;
  const pawW = front ? 0.13 : 0.115;
  b.add(new THREE.SphereGeometry(1, lo ? 10 : 14, lo ? 6 : 10), sole, new THREE.Matrix4().compose(new THREE.Vector3(pawX, 0.065, 0), new THREE.Quaternion(), new THREE.Vector3(pawL, 0.07, pawW)));
  const toeR = front ? 0.042 : 0.036;
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.36;
    const tx = pawX + pawL * 0.95 * Math.cos(a);
    const tz = pawW * 0.92 * Math.sin(a);
    b.add(new THREE.SphereGeometry(1, 8, 6), sole, new THREE.Matrix4().compose(new THREE.Vector3(tx, 0.05, tz), new THREE.Quaternion(), new THREE.Vector3(toeR, toeR * 0.9, toeR * 0.85)));
    // Claws: long, pale and curved on the forepaws (for digging), short on the hind feet.
    const cl = front ? 0.15 : 0.06;
    const dir = new THREE.Vector3(Math.cos(a * 0.8), 0, Math.sin(a * 0.8));
    const yaw = -Math.atan2(dir.z, dir.x);
    const segs = front ? 3 : 2;
    let cx = tx + dir.x * toeR * 0.7;
    let cy = 0.06;
    let cz = tz + dir.z * toeR * 0.7;
    for (let k = 0; k < segs; k++) {
      const pitch = 0.05 - (0.75 * k) / Math.max(1, segs - 1);
      const sl = cl / segs;
      const r0 = (front ? 0.02 : 0.015) * (1 - k / segs);
      const r1 = (front ? 0.02 : 0.015) * (1 - (k + 1) / segs) + 0.0015;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch - Math.PI / 2, 'YXZ'));
      const ax = new THREE.Vector3(Math.cos(pitch), Math.sin(pitch), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const mid = new THREE.Vector3(cx, cy, cz).addScaledVector(ax, sl / 2);
      const g = new THREE.CylinderGeometry(r1, r0, sl, 5);
      b.add(g, (qq, o) => o.copy(FUR.claw).lerp(FUR.clawTip, Math.max(0, (k + (qq.y / sl + 0.5)) / segs)), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
      cx += ax.x * sl;
      cy += ax.y * sl;
      cz += ax.z * sl;
    }
  }
  // Shaggy fur hanging off the back of the leg (elbow or thigh).
  if (!lo) {
    const at = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const flow = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < 9; i++) {
      const t = 0.42 + 0.5 * (i / 8);
      spline(pts, t, c);
      const d = keyed(keys, t, 3);
      const zs = (hash3(i, front ? 3 : 7, 1) - 0.5) * keyed(keys, t, 4) * 1.4;
      at.set(c.x - d * 0.92, c.y, zs);
      nrm.set(-1, -0.2, zs * 2);
      furTuft(b, at, nrm, flow, 0.09 + 0.05 * hash3(i, 2, 5), 0.06, FUR.dark, FUR.base);
    }
  }
  b.matrix = prev;
}

/** Tufts over a loft: along the dorsal line and hump, down the flanks' lower edge, and under the belly. */
function bodyTufts(b: GeoBuilder, ringAt: (x: number) => Ring, x0: number, x1: number, count: number, sMin: number, sMax: number, len: number, seed: number, flowDown: number, lift = 1): void {
  const at = new THREE.Vector3();
  const n = new THREE.Vector3();
  const flow = new THREE.Vector3();
  const root = new THREE.Color();
  const tip = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * ((i + hash3(i, seed, 1) * 0.8) / count);
    const s = sMin + (sMax - sMin) * hash3(i, seed, 2);
    const side = hash3(i, seed, 3) < 0.5 ? -1 : 1;
    ringPoint(ringAt(x), s, side, at, n);
    flow.set(-1, -flowDown, 0);
    furColor(at, root, 0.3);
    furColor(at, tip, 0.05, s > 0.5 ? 0.6 : 0.2);
    furTuft(b, at, n, flow, len * (0.7 + 0.6 * hash3(i, seed, 4)), len * 0.85, root, tip, lift * (0.6 + 0.8 * hash3(i, seed, 5)));
  }
}

export function createBear(): Animal {
  const material = mat({ roughness: 0.95 });
  const lo = quality.fishDetail === 'low';
  const key = lo ? 'lo' : 'hi';
  const torsoRing = (x: number) => ringFrom(BEAR_TORSO, x);
  const torso = cached(`bear-torso-${key}`, () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(BEAR_TORSO);
    loft(
      b,
      lo ? 26 : 44,
      lo ? 18 : 30,
      (t) => torsoRing(x0 + (x1 - x0) * t),
      (_t, s, _side, p, out) => {
        // Grizzled guard hairs over the hump and back; darker under the belly.
        const hump = bell(-0.35, 0.75, p.x);
        furColor(p, out, s < -0.3 ? 0.55 : 0.08, s > 0.35 ? 0.35 + 0.65 * hump * smooth(0.35, 0.8, s) : 0);
        // Fur clumps: a small outward push, so the silhouette isn't smooth.
        const r = torsoRing(p.x);
        const push = 0.022 * (noise3(p.x * 6, p.y * 22, p.z * 22) - 0.45) * bell(x0, x1, p.x);
        const dy = p.y - r.y;
        const l = Math.hypot(dy, p.z) || 1;
        p.y += (dy / l) * push;
        p.z += (p.z / l) * push;
      },
      { caps: true, fullness: 0.9 },
    );
    // Shag: a ragged line along the back and hump, a fringe under the belly, and the rump.
    const n = lo ? 0.6 : 1;
    bodyTufts(b, torsoRing, -0.95, 0.8, Math.round(240 * n), 0.8, 1, 0.1, 1, 0.25, 1.0);
    bodyTufts(b, torsoRing, -0.25, 0.6, Math.round(60 * n), 0.5, 0.95, 0.12, 2, 0.1, 0.7);
    bodyTufts(b, torsoRing, -0.85, 0.55, Math.round(110 * n), -1, -0.72, 0.12, 3, 1.6, 1.5);
    bodyTufts(b, torsoRing, -0.98, -0.75, Math.round(30 * n), -0.6, 0.7, 0.1, 4, 0.6, 1.2);
    // Short tail.
    b.add(new THREE.SphereGeometry(0.08, 8, 6), (q, o) => furColor(q, o, 0.3), new THREE.Matrix4().makeTranslation(-1.06, 1.12, 0));
    return b.build();
  });
  const hindlegs = cached(`bear-hindlegs-${key}`, () => {
    const b = new GeoBuilder();
    // Built hanging from the hip pivot, so they stay planted when the bear pitches forward.
    for (const z of [-0.21, 0.21]) bearLeg(b, new THREE.Matrix4().makeTranslation(0, -HIP.y, z), HIND_LEG, false, lo);
    return b.build();
  });
  const forelegs = cached(`bear-forelegs-${key}`, () => {
    const b = new GeoBuilder();
    // Built hanging from the shoulder pivot.
    for (const z of [-0.22, 0.22]) bearLeg(b, new THREE.Matrix4().makeTranslation(0, -0.95, z), FRONT_LEG, true, lo);
    return b.build();
  });
  const headRing = (x: number) => ringFrom(BEAR_HEAD, x);
  const head = cached(`bear-head-${key}`, () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(BEAR_HEAD);
    loft(
      b,
      lo ? 22 : 30,
      lo ? 18 : 24,
      (t) => headRing(x0 + (x1 - x0) * t),
      (_t, s, side, p, out) => {
        furColor(p.clone().add(new THREE.Vector3(0.8, 1.2, 0)), out, 0.15, 0.25 * smooth(0.0, -0.1, p.x));
        // The muzzle is paler; darker fur round the eyes; the lips are dark.
        out.lerp(FUR.muzzle, smooth(0.3, 0.44, p.x) * 0.75);
        const ex = (p.x - 0.27) / 0.07;
        const ey = (p.y - 0.07) / 0.05;
        if (side !== 0) out.lerp(FUR.dark, 0.55 * Math.max(0, 1 - ex * ex - ey * ey));
        if (p.x > 0.3 && s < -0.55) out.lerp(col(0x231915), smooth(-0.55, -0.85, s));
      },
      { caps: true, fullness: 0.9 },
    );
    const black = col(0x120d0b);
    // Nose: a black pad with nostrils.
    b.add(new THREE.SphereGeometry(1, 14, 10), (q, o) => o.copy(black).lerp(col(0x3b3330), q.y > 0.5 ? 0.4 : 0), new THREE.Matrix4().compose(new THREE.Vector3(0.628, -0.05, 0), new THREE.Quaternion(), new THREE.Vector3(0.045, 0.045, 0.065)));
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.012, 6, 4), col(0x030303), new THREE.Matrix4().makeTranslation(0.668, -0.055, side * 0.028));
      // Small dark eyes with a glint.
      b.add(new THREE.SphereGeometry(0.024, 10, 8), (q, o) => o.copy(q.y > 0.012 && q.x > 0.008 ? col(0x6a5a50) : col(0x0d0907)), new THREE.Matrix4().makeTranslation(0.27, 0.075, side * 0.142));
      // Upper canines, just showing at the lip.
      b.add(new THREE.ConeGeometry(0.012, 0.05, 5), FUR.claw, new THREE.Matrix4().compose(new THREE.Vector3(0.55, -0.14, side * 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)), new THREE.Vector3(1, 1, 1)));
      // Small round ears, dark inside, set on a furry crown.
      b.add(
        new THREE.SphereGeometry(1, 12, 8),
        (q, o) => (q.x > 0.2 ? o.copy(FUR.dark) : furColor(q, o, 0.2, 0.4)),
        new THREE.Matrix4().compose(new THREE.Vector3(0.02, 0.25, side * 0.16), new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.4, 0, 0)), new THREE.Vector3(0.045, 0.08, 0.075)),
      );
    }
    // Ruff: shaggy cheeks and the fur over the crown and neck.
    if (!lo) {
      bodyTufts(b, headRing, -0.08, 0.16, 36, -0.6, 0.6, 0.1, 6, 0.2);
      bodyTufts(b, headRing, -0.08, 0.1, 14, 0.7, 1, 0.08, 7, -0.2);
    }
    return b.build();
  });
  const jaw = cached(`bear-jaw-${key}`, () => {
    const b = new GeoBuilder();
    b.matrix = new THREE.Matrix4().makeTranslation(-JAW_HINGE.x, -JAW_HINGE.y, 0);
    const [x0, x1] = span(BEAR_JAW);
    loft(
      b,
      lo ? 10 : 16,
      lo ? 12 : 16,
      (t) => ringFrom(BEAR_JAW, x0 + (x1 - x0) * t),
      (_t, s, _side, p, out) => {
        furColor(p.clone().add(new THREE.Vector3(0.8, 1.2, 0)), out, 0.25);
        out.lerp(FUR.muzzle, smooth(0.3, 0.5, p.x) * 0.5);
        // Inside of the mouth.
        if (s > 0.55) out.setHex(0x4a2523);
        else if (s > 0.35) out.setHex(0x231915);
      },
      { caps: true, fullness: 0.85 },
    );
    for (const side of [-1, 1]) b.add(new THREE.ConeGeometry(0.011, 0.045, 5), FUR.claw, new THREE.Matrix4().makeTranslation(0.52, -0.12, side * 0.045));
    return b.build();
  });

  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.name = 'rig';
  const body = new THREE.Mesh(torso, material);
  const headPivot = new THREE.Group();
  headPivot.name = 'head';
  headPivot.position.set(0.82, 1.2, 0);
  headPivot.add(new THREE.Mesh(head, material));
  const jawPivot = new THREE.Group();
  jawPivot.position.copy(JAW_HINGE);
  jawPivot.add(new THREE.Mesh(jaw, material));
  // Where a caught fish is held: between the jaws, just behind the canines.
  const mouth = new THREE.Object3D();
  mouth.name = 'mouth';
  mouth.position.set(0.47, -0.15, 0);
  headPivot.add(jawPivot, mouth);
  const forePivot = new THREE.Group();
  forePivot.position.set(0.42, 0.95, 0);
  forePivot.add(new THREE.Mesh(forelegs, material));
  const hindPivot = new THREE.Group();
  hindPivot.position.copy(HIP);
  hindPivot.add(new THREE.Mesh(hindlegs, material));
  rig.add(body, headPivot, forePivot, hindPivot);
  root.add(rig);

  const dir = new THREE.Vector3();
  const stand = new THREE.Vector3();
  const reach = new THREE.Vector3();
  const shift = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const hip = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const defaultTarget = new THREE.Vector3(1.9, -0.35, 0);
  const flat = () => 0;
  // Where the forepaws are, for the splash they make breaking the surface.
  for (const side of [-1, 1]) {
    const paw = new THREE.Object3D();
    paw.name = 'paw';
    paw.position.set(0.08, -0.86, side * 0.22);
    forePivot.add(paw);
  }
  return wrap('bear', root, (p) => {
    const t = p.t;
    const k = Math.max(0, Math.min(1, p.k ?? 0));
    let lean = 0;
    let fore = 0;
    let pounce = 0;
    let plunge = 0;
    let gape = 0.0;
    let headDown = 0.25 + 0.08 * Math.sin(t * 0.7);
    let headYaw = 0.35 * Math.sin(t * 0.4);
    if (p.mode === 'warn') {
      // Lean in and fix on the fish, a forepaw lifting.
      lean = smooth(0, 0.35, k);
      headDown = 0.25 + 0.45 * lean;
      headYaw = 0;
      fore = 0.3 * smooth(0.5, 1, k);
      pounce = smooth(0.35, 1, k);
    } else if (p.mode === 'strike') {
      // Rear up a moment, then dive head and forepaws first into the water.
      lean = 1;
      pounce = 1;
      headYaw = 0;
      const rear = bell(-0.1, 0.4, k);
      plunge = smooth(0.12, 0.5, k);
      fore = 0.7 * rear;
      headDown = 0.7 - 0.5 * rear;
      gape = 0.08 + 0.3 * smooth(0.25, 0.5, k);
    } else if (p.mode === 'rest') {
      pounce = 1 - smooth(0, 1, k);
      plunge = 1 - smooth(0, 0.45, k);
      lean = pounce * 0.5;
      headDown = 0.35;
      gape = 0.2 * plunge;
    }
    if (p.jaw !== undefined) gape = p.jaw;
    const target = p.target ?? defaultTarget;
    const surface = p.surface ?? -Infinity;
    const ground = p.ground ?? flat;
    // Face the target.
    rig.rotation.set(0, 0, 0);
    dir.set(target.x, 0, target.z);
    const d = dir.length();
    if (d > 1e-3) dir.divideScalar(d);
    else dir.set(1, 0, 0);
    const yaw = Math.atan2(dir.z, dir.x);
    const yawNow = -yaw * Math.min(1, pounce * 2);
    // Walk towards it, on the ground, until close enough to lunge or until the
    // water at the forefeet is as deep as the bear will wade.
    const deepAt = (s: number) => surface - ground(dir.x * (s + FORE_X), dir.z * (s + FORE_X)) > BEAR_STRIKE.wade;
    let travel = 0;
    if (pounce > 0) {
      const want = Math.max(0, d - BEAR_STRIKE.reach);
      for (let s = 0; ; s = Math.min(want, s + 0.08)) {
        if (s > 0 && deepAt(s)) break;
        travel = s;
        if (s >= want) break;
      }
      travel *= pounce;
    }
    const turned = yaw * Math.min(1, pounce * 2);
    const fx = Math.cos(turned);
    const fz = Math.sin(turned);
    const footing = (s: number) => {
      const gh = ground(dir.x * s + fx * HIP.x, dir.z * s + fz * HIP.x);
      const gf = ground(dir.x * s + fx * FORE_X, dir.z * s + fz * FORE_X);
      // Down a bank the body tips nose-down with the slope. On a bank steeper than
      // that, the forefeet stay planted at the edge and the hind legs stand into the bank.
      const sl = Math.max(BEAR_STRIKE.slopePitch[0], Math.min(BEAR_STRIKE.slopePitch[1], Math.atan2(gh - gf, FORE_X - HIP.x)));
      stand.set(dir.x * s, gf + Math.tan(sl) * (FORE_X - HIP.x), dir.z * s);
      return sl;
    };
    const slope = footing(travel);
    stand.y -= 0.08 * lean;
    headPivot.rotation.set(0, headYaw * (1 - plunge), -(headDown + (0.9 - headDown) * plunge));
    jawPivot.rotation.set(0, 0, -gape);
    // Pitch nose-down about the hips; the hind legs stay planted.
    const place = (pitch: number, at: THREE.Vector3) => {
      rig.rotation.set(0, yawNow, -pitch);
      rig.position.set(0, 0, 0);
      rig.updateMatrix();
      pivot.copy(HIP).applyMatrix4(rig.matrix);
      rig.position.copy(at).add(hip.copy(HIP).applyAxisAngle(UP, yawNow)).sub(pivot);
      rig.updateMatrix();
      hindPivot.rotation.set(0, 0, pitch);
    };
    const standPitch = slope * Math.min(1, pounce * 2) + 0.12 * lean;
    place(standPitch, stand);
    let pitch = standPitch;
    if (plunge > 0) {
      // Lunge: pitch nose-down about the hips until the jaws reach the target's
      // depth (or as deep as the bear can reach without going in), and push
      // forward off the hind feet to close the last of the distance.
      const mouthAt = (pt: number, at: THREE.Vector3) => {
        place(pt, at);
        headPivot.updateMatrix();
        m.multiplyMatrices(rig.matrix, headPivot.matrix);
        return reach.copy(mouth.position).applyMatrix4(m);
      };
      let lo = standPitch;
      let hi = Math.max(standPitch + 0.3, BEAR_STRIKE.maxPitch);
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (mouthAt(mid, stand).y > target.y) lo = mid;
        else hi = mid;
      }
      const solved = (lo + hi) / 2;
      mouthAt(solved, stand);
      const short = (target.x - reach.x) * dir.x + (target.z - reach.z) * dir.z;
      const push = Math.max(-BEAR_STRIKE.lunge, Math.min(BEAR_STRIKE.lunge, short));
      shift.set(dir.x * push, 0, dir.z * push);
      pitch = standPitch + (solved - standPitch) * plunge;
      place(pitch, shift.multiplyScalar(plunge).add(stand));
    }
    // Forepaws hang straight down standing, and reach down and forward into the water in a strike.
    forePivot.rotation.set(0, 0, pitch * (1 - plunge) + fore + (PLUNGE_PAWS + pitch - fore) * plunge);
    // Breathing.
    body.scale.set(1, 1 + 0.01 * Math.sin(t * 1.6), 1 + 0.015 * Math.sin(t * 1.6));
  });
}

// ---------------------------------------------------------------------------
// Gull
// ---------------------------------------------------------------------------

const GULL_BODY: number[][] = [
  [-0.36, 0.03, 0.02, 0.018, 0.03],
  [-0.26, 0.01, 0.06, 0.065, 0.075],
  [-0.06, 0, 0.09, 0.1, 0.1],
  [0.1, 0.015, 0.085, 0.085, 0.085],
  [0.2, 0.05, 0.06, 0.06, 0.06],
  [0.26, 0.085, 0.06, 0.058, 0.056],
  [0.32, 0.1, 0.064, 0.058, 0.058],
  [0.37, 0.095, 0.045, 0.042, 0.042],
  [0.395, 0.09, 0.016, 0.016, 0.016],
];
const GULL_BILL: number[][] = [
  [0.37, 0.088, 0.017, 0.019, 0.013],
  [0.43, 0.085, 0.012, 0.016, 0.009],
  [0.48, 0.078, 0.009, 0.012, 0.006],
  [0.5, 0.07, 0.003, 0.004, 0.003],
];

function gullWing(face: number): THREE.BufferGeometry {
  return cached(`gull-wing-${face}`, () => {
    const b = new GeoBuilder();
    const lead = (s: number, o: THREE.Vector3) => {
      const x = s < 0.45 ? 0.06 + 0.1 * (s / 0.45) : 0.16 - 0.36 * Math.pow((s - 0.45) / 0.55, 1.3);
      o.set(x, 0.05 * Math.sin(Math.PI * Math.min(1, s * 1.6)) * (1 - s) + face * 0.004, 0.9 * s);
    };
    const trail = (s: number, o: THREE.Vector3) => {
      const x = s < 0.45 ? -0.14 + 0.06 * (s / 0.45) : -0.08 - 0.12 * ((s - 0.45) / 0.55);
      const tip = new THREE.Vector3();
      lead(s, tip);
      o.set(s > 0.95 ? tip.x - 0.01 : x, tip.y, 0.9 * s - (s > 0.6 ? 0.04 * (s - 0.6) : 0));
    };
    const grey = col(0x9ba6ae);
    const under = col(0xe7eaec);
    const black = col(0x17181a);
    finPatch(
      b,
      lead,
      trail,
      (s, r, c) => {
        c.copy(face > 0 ? grey : under);
        // White trailing edge; black wingtips with white "mirror" spots.
        if (face > 0 && r > 0.8 && s < 0.75) c.setHex(0xf4f5f5);
        if (s > (face > 0 ? 0.74 : 0.8)) {
          c.copy(black);
          if (s > 0.86 && s < 0.94 && r > 0.25 && r < 0.75) c.setHex(0xf0f0f0);
        }
      },
      { rows: 4, cols: 14, flex: 'none' },
    );
    return b.build();
  });
}

export function createGull(): Animal {
  const material = mat({ roughness: 0.7 });
  const body = cached('gull-body', () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(GULL_BODY);
    loft(
      b,
      22,
      14,
      (t) => ringFrom(GULL_BODY, x0 + (x1 - x0) * t),
      (_t, s, _side, p, out) => {
        out.setHex(0xf3f4f3);
        // Grey mantle on the back between the wings.
        if (s > 0.45 && p.x < 0.18 && p.x > -0.3) out.setHex(0x9ba6ae);
      },
      { caps: true, follow: true },
    );
    const [b0, b1] = span(GULL_BILL);
    loft(
      b,
      8,
      8,
      (t) => ringFrom(GULL_BILL, b0 + (b1 - b0) * t),
      (_t, s, _side, p, out) => {
        out.setHex(0xe7c33f);
        // Red spot on the lower bill near the tip.
        if (p.x > 0.445 && p.x < 0.48 && s < -0.2) out.setHex(0xc8322a);
      },
      { caps: true },
    );
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.011, 8, 6), col(0x111111), new THREE.Matrix4().makeTranslation(0.335, 0.117, side * 0.046));
      // Tucked pink legs.
      b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), col(0xd99a8c), new THREE.Matrix4().compose(new THREE.Vector3(-0.12, -0.08, side * 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.2)), new THREE.Vector3(1, 1, 1)));
    }
    // Tail fan.
    finPatch(
      b,
      (s, o) => o.set(-0.33, 0.03, (s - 0.5) * 0.06),
      (s, o) => o.set(-0.47 + 0.02 * Math.abs(s - 0.5), 0.025, (s - 0.5) * 0.17),
      (_s, _r, c) => c.setHex(0xf3f4f3),
      { rows: 2, cols: 6, flex: 'none' },
    );
    return b.build();
  });
  const root = new THREE.Group();
  const bodyMesh = new THREE.Mesh(body, material);
  const wings: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.06, 0.06, side * 0.07);
    const inner = new THREE.Group();
    inner.scale.z = side;
    inner.add(new THREE.Mesh(gullWing(1), material), new THREE.Mesh(gullWing(-1), material));
    pivot.add(inner);
    wings.push(pivot);
  }
  const rig = new THREE.Group();
  rig.add(bodyMesh, ...wings);
  root.add(rig);
  return wrap('gull', root, (p) => {
    const diving = p.mode === 'strike' || p.mode === 'dive';
    const fold = diving ? 1 : 0;
    const flap = diving ? 0.15 : 0.55 * Math.sin(p.t * 6.5);
    rig.rotation.z = diving ? -1.25 : 0.05 * Math.sin(p.t * 6.5 + 1);
    wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      // Raise or lower about the body axis, sweep back about the vertical.
      w.rotation.set(-side * flap, -side * fold * 1.15, 0, 'YXZ');
    });
  });
}

// ---------------------------------------------------------------------------
// Common merganser
// ---------------------------------------------------------------------------

const MERG_BODY: number[][] = [
  [-0.42, 0.07, 0.012, 0.01, 0.018],
  [-0.36, 0.06, 0.045, 0.045, 0.065],
  [-0.2, 0.045, 0.085, 0.09, 0.115],
  [0.0, 0.045, 0.095, 0.1, 0.125],
  [0.13, 0.055, 0.085, 0.09, 0.105],
  [0.21, 0.075, 0.06, 0.07, 0.07],
  [0.25, 0.09, 0.03, 0.035, 0.03],
];
/** Neck and head, built along x from the neck base pivot; curved upward. */
const MERG_HEAD: number[][] = [
  [-0.04, 0.0, 0.05, 0.055, 0.05],
  [0.03, 0.06, 0.038, 0.038, 0.035],
  [0.08, 0.12, 0.045, 0.04, 0.04],
  [0.13, 0.145, 0.055, 0.045, 0.045],
  [0.19, 0.14, 0.045, 0.038, 0.038],
  [0.22, 0.132, 0.02, 0.02, 0.02],
];
/** Neck centre line, from the breast to inside the head (its pivot is at HX, HY on MERG_HEAD). */
const MERG_NECK: number[][] = [
  [-0.05, -0.012],
  [-0.005, 0.03],
  [0.035, 0.08],
  [0.072, 0.115],
  [0.098, 0.13],
];

/**
 * A female merganser's folded wing lying along the side: feather groups shaded
 * from front to back (rows of scalloped coverts, the white speculum, long grey
 * tertials and dark primaries crossing over the rump).
 */
function femaleWings(b: GeoBuilder, ringAt: (x: number) => Ring): void {
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const grey = col(0x7f878b);
  const dark = col(0x55595c);
  const pale = col(0xb3b9bb);
  const white = col(0xeeeeea);
  const prim = col(0x3f4245);
  for (const side of [-1, 1]) {
    b.grid(28, 8, (i, j, o) => {
      const u = i / 28;
      const v = j / 8;
      const x = 0.12 - 0.44 * u;
      // The wing narrows to a point at the primaries' tips.
      const top = 0.8 - 0.1 * u;
      const bot = 0.12 + 0.5 * smooth(0.6, 1, u);
      const sv = top - (top - bot) * v;
      ringPoint(ringAt(x), sv, side, p, n);
      const edge = 1 - 4 * (v - 0.5) * (v - 0.5);
      o.p.copy(p).addScaledVector(n, 0.0025 + 0.01 * smooth(0.55, 1, u) * edge + 0.003 * smooth(0.7, 1, v));
      const c = o.c;
      if (u > 0.68) {
        // Primaries: dark, with pale shaft lines between the feathers.
        c.copy(prim);
        if ((v * 4) % 1 < 0.14) c.lerp(dark, 0.6).multiplyScalar(1.25);
      } else if (u > 0.47 && v > 0.42) {
        // Speculum: a white patch on the secondaries, with a thin dark bar in front.
        c.copy(white);
        if (u < 0.5) c.copy(dark);
      } else if (u > 0.47) {
        // Tertials: long grey feathers with paler edges.
        c.copy(grey).lerp(pale, (v * 3) % 1 > 0.8 ? 0.6 : 0);
      } else {
        // Coverts: rows of small feathers, each with a scalloped pale fringe and a darker base.
        const rows = 7;
        const row = Math.floor(u * rows);
        const f = (u * rows) % 1;
        const scallop = 0.78 + 0.14 * Math.abs(Math.sin(v * Math.PI * 4 + row * 0.9));
        c.copy(grey).lerp(dark, 0.18 * (1 - f));
        if (f > scallop) c.lerp(pale, 0.55);
      }
      c.multiplyScalar(0.96 + 0.06 * hash3(i, j, side));
    });
  }
}

const MERG_BILL: number[][] = [
  [0.205, 0.128, 0.016, 0.016, 0.013],
  [0.27, 0.124, 0.011, 0.011, 0.008],
  [0.33, 0.118, 0.008, 0.008, 0.006],
  [0.345, 0.11, 0.004, 0.006, 0.004],
];

export function createMerganser(male: boolean): Animal {
  const material = mat({ roughness: 0.75 });
  const key = male ? 'm' : 'f';
  const body = cached(`merg-body-${key}`, () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(MERG_BODY);
    loft(
      b,
      22,
      16,
      (t) => ringFrom(MERG_BODY, x0 + (x1 - x0) * t),
      (_t, s, _side, p, out) => {
        if (male) {
          // White body with a black back and grey rump.
          out.setHex(0xf2eee6);
          if (s > 0.55 && p.x > -0.2) out.setHex(0x17191a);
          if (p.x < -0.2 && s > 0.1) out.setHex(0x8b9093);
          // Black edge to the folded wing.
          if (s > 0.38 && s < 0.55 && p.x > -0.2 && p.x < 0.1) out.setHex(0x2a2c2d);
        } else {
          // Grey above, white below and on the breast, with soft edges.
          out.setHex(0x8e969a);
          const white = Math.max(smooth(-0.05, -0.3, s), smooth(0.1, 0.2, p.x) * smooth(0.45, 0.15, s));
          out.lerp(col(0xe9e9e4), white);
        }
        out.multiplyScalar(0.96 + 0.06 * hash3(Math.round(p.x * 60), Math.round(s * 8), 1));
      },
      { caps: true, fullness: 0.9 },
    );
    if (!male) femaleWings(b, (x) => ringFrom(MERG_BODY, x));
    // Short grey tail.
    finPatch(
      b,
      (s, o) => o.set(-0.38, 0.07, (s - 0.5) * 0.05),
      (s, o) => o.set(-0.5 + 0.02 * Math.abs(s - 0.5), 0.085, (s - 0.5) * 0.12),
      (_s, _r, c) => c.setHex(0x6f7579),
      { rows: 2, cols: 5, flex: 'none' },
    );
    return b.build();
  });
  // Neck and head are separate so the head can stay level when the neck stretches.
  const HX = 0.08;
  const HY = keyed(MERG_HEAD, HX, 1);
  const headPaint = (s: number, p: THREE.Vector3, out: THREE.Color) => {
    if (male) {
      // Dark, glossy green head; white lower neck.
      out.setHex(p.y > 0.05 ? 0x10291d : 0xf2eee6);
      if (p.y > 0.11 && s > 0.3) out.setHex(0x1b4a33);
    } else {
      // Rusty head and upper neck with a sharp edge; white chin.
      out.setHex(p.y > 0.045 ? 0x9b4c26 : 0xe6e6e0);
      if (p.x > 0.13 && s < -0.55 && p.y > 0.1) out.setHex(0xf2efe8);
    }
  };
  const neckGeo = cached(`merg-neck-${key}`, () => {
    const b = new GeoBuilder();
    // A smooth tube that bends up from the breast into the head (it ends inside the head).
    const c = { x: 0, y: 0 };
    tube(
      b,
      16,
      14,
      (t) => {
        spline(MERG_NECK, t, c);
        const r = 0.056 - 0.02 * smooth(0, 0.7, t);
        return { x: c.x, y: c.y, depth: r, width: r * 0.92 };
      },
      (_t, s, _side, p, out) => headPaint(s, p, out),
      { caps: true },
    );
    return b.build();
  });
  const head = cached(`merg-head-${key}`, () => {
    const b = new GeoBuilder();
    b.matrix = new THREE.Matrix4().makeTranslation(-HX, -HY, 0);
    // The head starts behind the neck's end, with a rounded back of the skull.
    const x0 = HX - 0.005;
    const x1 = span(MERG_HEAD)[1];
    loft(
      b,
      16,
      14,
      (t) => {
        const x = x0 + (x1 - x0) * t;
        const r = ringFrom(MERG_HEAD, x);
        const k = Math.sqrt(Math.max(0.04, 1 - Math.pow(Math.max(0, x0 + 0.03 - x) / 0.03, 2)));
        return { ...r, top: r.top * k, bottom: r.bottom * k, width: r.width * k };
      },
      (_t, s, _side, p, out) => headPaint(s, p, out),
      { caps: true },
    );
    const [b0, b1] = span(MERG_BILL);
    loft(
      b,
      8,
      8,
      (t) => ringFrom(MERG_BILL, b0 + (b1 - b0) * t),
      (_t, _s, _side, p, out) => out.setHex(p.x > 0.33 ? 0x1a1a1a : male ? 0xc8261e : 0xb8402a),
      { caps: true },
    );
    for (const side of [-1, 1]) b.add(new THREE.SphereGeometry(0.009, 8, 6), col(0x0b0b0b), new THREE.Matrix4().makeTranslation(0.17, 0.158, side * 0.036));
    if (!male) {
      // Shaggy crest at the back of the head.
      for (let i = 0; i < 9; i++) {
        const a = -0.6 + (i / 8) * 1.2;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(0.105 - 0.012 * Math.abs(a), 0.172 + 0.014 * Math.cos(a) - 0.01 * Math.abs(a), Math.sin(a) * 0.028),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(a * 0.7, 0, Math.PI / 2 + 0.3 + 0.2 * hash3(i, 1, 1))),
          new THREE.Vector3(1, 1, 1),
        );
        b.add(new THREE.ConeGeometry(0.02, 0.11 + 0.03 * hash3(i, 2, 2), 5), col(0x8a4220), m);
      }
    }
    return b.build();
  });
  const foot = cached('merg-foot', () => {
    const b = new GeoBuilder();
    const orange = col(0xe0702a);
    b.add(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 6), orange, new THREE.Matrix4().makeTranslation(0, -0.035, 0));
    // Webbed foot pointing back.
    finPatch(
      b,
      (s, o) => o.set(-0.005, -0.07, (s - 0.5) * 0.01),
      (s, o) => o.set(-0.075 + 0.015 * Math.abs(s - 0.5), -0.075, (s - 0.5) * 0.07),
      (_s, _r, c) => c.copy(orange),
      { rows: 2, cols: 4, flex: 'none' },
    );
    return b.build();
  });
  const root = new THREE.Group();
  const rig = new THREE.Group();
  const bodyMesh = new THREE.Mesh(body, material);
  const neck = new THREE.Group();
  neck.position.set(0.2, 0.08, 0);
  const headPivot = new THREE.Group();
  headPivot.position.set(HX, HY, 0);
  headPivot.add(new THREE.Mesh(head, material));
  neck.add(new THREE.Mesh(neckGeo, material), headPivot);
  const feet: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(-0.14, -0.035, side * 0.06);
    f.add(new THREE.Mesh(foot, material));
    feet.push(f);
  }
  rig.add(bodyMesh, neck, ...feet);
  root.add(rig);
  return wrap('merganser', root, (p) => {
    const under = p.mode === 'dive' || p.mode === 'chase' || p.mode === 'swim';
    const kick = under ? 13 : 4;
    feet.forEach((f, i) => {
      const ph = p.t * kick + i * Math.PI;
      // Paddle strokes: swing back hard, recover tucked.
      f.rotation.set(0, 0, (under ? -0.9 : -0.3) + (under ? 0.7 : 0.35) * Math.sin(ph));
      if (under) f.position.y = -0.02;
    });
    // Neck: upright when floating, stretched forward when hunting underwater.
    const stretch = under ? 1 : 0;
    neck.rotation.z = -0.85 * stretch + (under ? 0 : 0.05 * Math.sin(p.t * 1.3));
    headPivot.rotation.z = 0.8 * stretch;
    neck.position.x = 0.2 + 0.02 * stretch;
    const pitch = p.pitch ?? (p.mode === 'dive' ? -0.9 : p.mode === 'surface' ? 0.6 : 0);
    rig.rotation.z = pitch;
    rig.position.y = p.mode === 'float' || p.mode === 'warn' ? 0.012 * Math.sin(p.t * 2.2) : 0;
  });
}

// ---------------------------------------------------------------------------
// Swimmers: harbor seal, orca, salmon shark, char
// ---------------------------------------------------------------------------

/** Harbor seal: a plump, tapering body, a visible neck, a round skull and a short, dog-like muzzle with whisker pads. */
const SEAL: number[][] = [
  [-0.4, 0.0, 0.02, 0.018, 0.026],
  [-0.34, 0.0, 0.043, 0.04, 0.05],
  [-0.22, 0.004, 0.084, 0.08, 0.094],
  [-0.05, 0.01, 0.12, 0.118, 0.124],
  [0.1, 0.014, 0.126, 0.122, 0.124],
  [0.2, 0.018, 0.104, 0.098, 0.098],
  [0.27, 0.025, 0.074, 0.07, 0.07],
  [0.315, 0.031, 0.064, 0.058, 0.061],
  [0.36, 0.039, 0.074, 0.062, 0.072],
  [0.405, 0.042, 0.079, 0.061, 0.077],
  [0.443, 0.034, 0.066, 0.055, 0.066],
  [0.466, 0.02, 0.046, 0.047, 0.052],
  [0.49, 0.013, 0.036, 0.038, 0.045],
  [0.508, 0.01, 0.024, 0.026, 0.031],
  [0.518, 0.01, 0.004, 0.004, 0.004],
];

export function buildSealGeometry(): THREE.BufferGeometry {
  const lo = quality.fishDetail === 'low';
  return cached(`seal-${lo ? 'lo' : 'hi'}`, () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(SEAL);
    const ringAt = (x: number) => ringFrom(SEAL, x);
    const back = col(0x666d72);
    const side = col(0x98a0a3);
    const belly = col(0xcac9c0);
    loft(
      b,
      lo ? 40 : 64,
      lo ? 16 : 24,
      (t) => ringAt(x0 + (x1 - x0) * t),
      (_t, s, _sd, p, out) => {
        out.copy(side);
        if (s > 0.2) out.lerp(back, smooth(0.2, 0.8, s));
        if (s < -0.3) out.lerp(belly, smooth(-0.3, -0.8, s));
        // Muzzle and whisker pads paler; a darker crown; dark mouth line under the muzzle.
        if (p.x > 0.46 && s < 0.35) out.lerp(belly, 0.45 * smooth(0.46, 0.48, p.x));
        if (p.x > 0.35 && p.x < 0.45 && s > 0.55) out.lerp(back, 0.4);
        if (p.x > 0.47 && s < -0.4 && s > -0.6) out.multiplyScalar(0.5);
        out.multiplyScalar(0.94 + 0.1 * noise3(p.x * 40, p.y * 40, p.z * 40));
      },
      { caps: true },
    );
    // Spots: dark, irregular, densest on the back; a few pale rings.
    const at = new THREE.Vector3();
    const n = new THREE.Vector3();
    const spot = col(0x2d3133);
    const ringC = col(0xb9bdbb);
    const count = lo ? 90 : 160;
    for (let i = 0; i < count; i++) {
      const x = -0.33 + 0.75 * hash3(i, 3.1, 1.7);
      if (x > 0.44) continue;
      const s = -0.55 + 1.5 * hash3(i, 8.3, 4.4);
      if (s > 0.95) continue;
      const sd = hash3(i, 1.9, 6.6) < 0.5 ? 1 : -1;
      ringPoint(ringAt(x), Math.min(0.95, s), sd, at, n);
      const size = (0.005 + 0.009 * hash3(i, 7.7, 2.1)) * (x > 0.3 ? 0.7 : 1);
      const pale = hash3(i, 5.5, 5.5) < 0.12;
      decal(b, at, n, size, size * (0.6 + 0.5 * hash3(i, 2, 9)), pale ? ringC : spot, 8, 0.0015, hash3(i, 4, 4) * 3, pale ? spot : undefined);
    }
    for (const sd of [-1, 1]) {
      // Big dark eyes, set forward on the round skull, with a glint.
      ringPoint(ringAt(0.44), 0.36, sd, at, n);
      n.x += 0.35;
      decal(b, at, n.normalize(), 0.0145, 0.0125, col(0x060606), 12, 0.0022, 0, col(0x222222));
      at.addScaledVector(n, 0.0028).add(new THREE.Vector3(0.003, 0.004, 0));
      decal(b, at, n, 0.0025, 0.0025, col(0xd8dcdc), 6, 0.0005);
      // Ear opening: a small dark hole behind the eye (no ear flap).
      ringPoint(ringAt(0.395), 0.4, sd, at, n);
      decal(b, at, n, 0.0035, 0.003, col(0x1d1f20), 6, 0.0012);
      // V-shaped nostrils on top of the muzzle tip: slits that meet at the bottom.
      at.set(0.515, 0.024, sd * 0.0085);
      n.set(0.75, 0.6, sd * 0.25).normalize();
      decal(b, at, n, 0.0075, 0.0022, col(0x111111), 8, 0.0012, sd * 1.05);
      // Whisker pads: rows of follicle dots, then the whiskers, pale and swept back.
      const wc = col(0xe8e4d8);
      const rows = lo ? 2 : 3;
      const per = lo ? 3 : 4;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < per; k++) {
          const px = 0.484 + 0.009 * k;
          const ps = -0.05 - 0.18 * r - 0.04 * k;
          ringPoint(ringAt(px), ps, sd, at, n);
          if (!lo) decal(b, at, n, 0.0016, 0.0016, col(0x5c5f5e), 5, 0.0008);
          const len = 0.065 + 0.03 * hash3(r, k, 3) - 0.008 * k;
          const dir = new THREE.Vector3(-0.2 - 0.15 * r, -0.12 - 0.12 * r + 0.08 * k, sd * 0.95).normalize();
          const bend = new THREE.Vector3(-0.9, -0.3, 0);
          whisker(b, at, dir, bend, len, 0.0017, wc);
        }
      }
      // Two whiskers above each eye.
      for (let k = 0; k < 2; k++) {
        ringPoint(ringAt(0.452 + 0.006 * k), 0.62, sd, at, n);
        whisker(b, at, new THREE.Vector3(-0.2, 0.6, sd * 0.6).normalize(), new THREE.Vector3(-0.6, -0.1, 0), 0.035, 0.0013, wc);
      }
    }
    const flipper = col(0x3e4447);
    // Hind flippers: held palm to palm, fan-shaped with the outer digits longest; dark digit ridges and claws.
    for (const sd of [-1, 1]) {
      thickFin(
        b,
        (s, o) => o.set(-0.37 - 0.015 * s, (s - 0.5) * 0.04, sd * 0.012),
        (s, o) => {
          const e = Math.abs(s - 0.5) * 2;
          const digit = 0.006 * Math.cos(s * Math.PI * 8);
          o.set(-0.53 + 0.035 * (1 - e * e) - 0.012 * e + digit, (s - 0.5) * 0.15, sd * 0.03);
        },
        new THREE.Vector3(0, 0, 1),
        0.0035,
        (s, r, _f, c) => {
          c.copy(flipper).multiplyScalar(1 - 0.2 * r);
          // Digits: darker lines along the flipper, webbing between them a touch paler.
          if (Math.abs(Math.cos(s * Math.PI * 8)) > 0.85 && r > 0.15) c.multiplyScalar(0.75);
          else c.lerp(col(0x6a7174), 0.25 * r);
        },
        { rows: lo ? 3 : 5, cols: lo ? 8 : 16 },
      );
      // Fore flippers: short, thick paddles held back against the chest, with dark claws.
      thickFin(
        b,
        (s, o) => {
          ringPoint(ringAt(0.2 - 0.05 * s), -0.55, sd, o);
        },
        (s, o) => {
          ringPoint(ringAt(0.2 - 0.05 * s), -0.55, sd, o);
          const round = Math.sin(Math.PI * s);
          o.x -= 0.075 + 0.012 * round - 0.02 * s;
          o.y -= 0.05 + 0.008 * round;
          o.z += sd * (0.045 + 0.008 * round);
        },
        new THREE.Vector3(0, 1, 0),
        0.005,
        (s, r, _f, c) => {
          c.copy(flipper).lerp(side, 0.2 * (1 - r));
          if (r > 0.86 && Math.abs(Math.sin(s * Math.PI * 5)) > 0.6) c.setHex(0x1a1b1b);
        },
        { rows: lo ? 3 : 5, cols: lo ? 5 : 10, flex: 'paired' },
      );
    }
    return b.build();
  });
}

/** A whisker: a thin tapering strip that curves back, visible from both sides. */
function whisker(b: GeoBuilder, at: THREE.Vector3, dir: THREE.Vector3, bend: THREE.Vector3, len: number, width: number, c: THREE.Color): void {
  const steps = 4;
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const p = new THREE.Vector3();
  b.grid(steps, 1, (i, j, o) => {
    const t = i / steps;
    p.copy(at).addScaledVector(dir, len * t).addScaledVector(bend, len * t * t * 0.5);
    const w = width * (1 - 0.85 * t) * (j === 0 ? -1 : 1);
    o.p.copy(p).addScaledVector(up, w);
    o.c.copy(c);
  });
}

export function createSeal(): Animal {
  const material = fishMaterial({ transparent: true, roughness: 0.55, metalness: 0.05 });
  const mesh = new THREE.Mesh(buildSealGeometry(), material);
  const root = new THREE.Group();
  root.add(mesh);
  return wrap('seal', root, (p) => {
    setSwim(mesh, p.phase ?? p.t * 6, p.amp ?? 0.1);
    material.opacity = p.opacity ?? 1;
    root.rotation.z = p.pitch ?? 0;
  });
}

const ORCA: number[][] = [
  [-0.45, 0.0, 0.026, 0.024, 0.012],
  [-0.4, 0.0, 0.04, 0.038, 0.02],
  [-0.33, 0.0, 0.058, 0.056, 0.032],
  [-0.24, 0.0, 0.085, 0.083, 0.062],
  [-0.1, 0.0, 0.11, 0.11, 0.1],
  [0.08, 0.0, 0.125, 0.125, 0.12],
  [0.22, 0.0, 0.118, 0.118, 0.115],
  [0.34, -0.004, 0.098, 0.096, 0.096],
  [0.42, -0.008, 0.077, 0.072, 0.074],
  [0.47, -0.012, 0.052, 0.047, 0.05],
  [0.495, -0.014, 0.022, 0.02, 0.022],
  [0.5, -0.014, 0.002, 0.002, 0.002],
];

/** Orca colour pattern on the body: white chin and belly, flank patch, grey saddle. The eye patch is a separate surface patch. */
function orcaPaint(x: number, s: number, out: THREE.Color): void {
  out.setHex(0x0c0d10);
  // White chin and throat, narrowing into a belly stripe.
  const bellyEdge = x > 0.3 ? -0.4 : x > 0.04 ? -0.4 - 0.52 * smooth(0.3, 0.08, x) : -0.92;
  const edge = bellyEdge;
  const along = smooth(-0.37, -0.33, x) * smooth(0.495, 0.47, x);
  out.lerp(col(0xeef0ef), smooth(edge + 0.09, edge - 0.09, s) * along);
  // Grey saddle patch behind the dorsal fin.
  if (s > 0.55 && x < 0.0 && x > -0.15) out.lerp(col(0x8b9399), 0.75 * Math.pow(bell(-0.15, 0.0, x), 1.5) * smooth(0.55, 0.9, s));
}

export function buildOrcaGeometry(): THREE.BufferGeometry {
  return cached('orca', () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(ORCA);
    const ringAt = (x: number) => ringFrom(ORCA, x);
    loft(
      b,
      120,
      48,
      (t) => ringAt(x0 + (x1 - x0) * t),
      (_t, s, _sd, p, out) => orcaPaint(p.x, s, out),
      { caps: true },
    );
    const black = col(0x0c0d10);
    const at = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const sd of [-1, 1]) {
      // Eye patch: an oval above and behind the eye, tilted up towards the back.
      surfacePatch(b, ringAt, 0.352, 0.34, sd, (a) => {
        const dx = 0.05 * Math.cos(a);
        const ds = 0.115 * Math.sin(a) * (1 - 0.25 * Math.cos(a));
        return [dx, ds - dx * 1.7];
      }, col(0xeef0ef), { rings: 4, segs: 28 });
      // Flank patch: a white lobe sweeping up the side behind the dorsal fin.
      surfacePatch(b, ringAt, -0.165, -0.52, sd, (a) => {
        const up = Math.max(0, Math.sin(a));
        const dx = 0.115 * Math.cos(a) * (1 - 0.55 * up);
        const ds = 0.4 * Math.sin(a) * (Math.sin(a) < 0 ? 0.9 : 1);
        return [dx - up * 0.1, ds];
      }, col(0xeef0ef), { rings: 5, segs: 32, lift: 0.002 });
      ringPoint(ringAt(0.412), 0.1, sd, at, n);
      decal(b, at, n, 0.007, 0.006, col(0x020202), 8, 0.001);
    }
    // Tall, nearly straight dorsal fin (adult male).
    const finTop = ringAt(0.04).top;
    thickFin(
      b,
      (s, o) => {
        const x = 0.11 - 0.17 * s;
        o.set(x, ringAt(x).top - 0.006, 0);
      },
      (s, o) => o.set(0.035 - 0.012 * s + 0.006 * Math.sin(Math.PI * s), finTop + 0.205 - 0.004 * s, 0),
      new THREE.Vector3(0, 0, 1),
      0.009,
      (_s, _r, _f, c) => c.copy(black),
      { rows: 6, cols: 6 },
    );
    // Big rounded pectoral flippers.
    for (const sd of [-1, 1]) {
      thickFin(
        b,
        (s, o) => {
          const r = ringAt(0.27 - 0.06 * s);
          ringPoint(r, -0.62, sd, o);
        },
        (s, o) => {
          const r = ringAt(0.27 - 0.06 * s);
          ringPoint(r, -0.62, sd, o);
          const round = Math.sin(Math.PI * s);
          o.x += -0.07 - 0.04 * s + 0.01 * round;
          o.y -= 0.06 + 0.012 * round;
          o.z += sd * (0.1 + 0.025 * round);
        },
        new THREE.Vector3(0, 1, 0),
        0.006,
        (_s, _r, _f, c) => c.copy(black),
        { rows: 5, cols: 6, flex: 'paired' },
      );
      // Flukes: horizontal, black above and white below, with a notch.
      thickFin(
        b,
        (s, o) => o.set(-0.405 - 0.06 * s, 0, sd * 0.004),
        (s, o) => {
          if (s < 0.6) {
            // Leading edge, swept back to a pointed tip.
            const u = s / 0.6;
            o.set(-0.405 - 0.125 * Math.pow(u, 1.3), 0.004 * u, sd * (0.015 + 0.15 * Math.pow(u, 0.85)));
          } else {
            // Trailing edge, curving back in to the notch.
            const u = (s - 0.6) / 0.4;
            o.set(-0.53 + 0.065 * u - 0.012 * Math.sin(Math.PI * u), 0.004 * (1 - u), sd * (0.165 * (1 - u) + 0.004 * u));
          }
        },
        new THREE.Vector3(0, 1, 0),
        0.005,
        (_s, _r, face, c) => c.setHex(face > 0 ? 0x0c0d10 : 0xe2e5e4),
        { rows: 4, cols: 14 },
      );
    }
    return b.build();
  });
}

export function createOrca(): Animal {
  const material = fishMaterial({ vertical: true, roughness: 0.35, metalness: 0.05 });
  const mesh = new THREE.Mesh(buildOrcaGeometry(), material);
  const root = new THREE.Group();
  root.add(mesh);
  return wrap('orca', root, (p) => {
    setSwim(mesh, p.phase ?? p.t * 3, p.amp ?? 0.04);
    root.rotation.z = p.pitch ?? 0;
  });
}

const SHARK: number[][] = [
  [-0.4, 0.0, 0.02, 0.02, 0.03],
  [-0.32, 0.0, 0.04, 0.036, 0.045],
  [-0.16, 0.0, 0.1, 0.088, 0.09],
  [0.04, 0.0, 0.138, 0.12, 0.122],
  [0.2, 0.002, 0.126, 0.108, 0.11],
  [0.32, 0.006, 0.096, 0.08, 0.085],
  [0.42, 0.012, 0.06, 0.045, 0.054],
  [0.48, 0.017, 0.03, 0.022, 0.027],
  [0.51, 0.02, 0.004, 0.004, 0.004],
];

export function buildSharkGeometry(): THREE.BufferGeometry {
  return cached('shark', () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(SHARK);
    const ringAt = (x: number) => ringFrom(SHARK, x);
    const dark = col(0x222d36);
    const white = col(0xecefed);
    loft(
      b,
      80,
      28,
      (t) => ringAt(x0 + (x1 - x0) * t),
      (_t, s, _sd, p, out) => {
        // Dark back sharply set off from a white belly with dusky blotches.
        const edge = -0.15 + 0.12 * Math.sin(p.x * 18);
        out.copy(white).lerp(dark, smooth(edge - 0.08, edge + 0.08, s));
        if (s < edge - 0.1 && p.x < 0.3) out.lerp(col(0x5f6870), 0.65 * smooth(0.56, 0.7, noise3(p.x * 28, s * 6, p.z * 28)));
        // Underslung mouth.
        if (p.x > 0.36 && p.x < 0.45 && s < -0.62 && s > -0.85) out.setHex(0x2a2020);
        out.multiplyScalar(0.96 + 0.06 * noise3(p.x * 50, p.y * 50, p.z * 50));
      },
      { caps: true },
    );
    const at = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const sd of [-1, 1]) {
      // Large black eye.
      ringPoint(ringAt(0.405), 0.22, sd, at, n);
      decal(b, at, n, 0.011, 0.01, col(0x030303), 10, 0.0015);
      // Five gill slits in front of the pectoral fin.
      for (let i = 0; i < 5; i++) {
        const x = 0.33 - i * 0.017;
        surfaceStrip(b, () => ringAt(x), -0.55, 0.3 - 0.04 * i, sd, 0.0022, col(0x14191d), 6, 0.0015);
      }
    }
    const finPaint = (_s: number, r: number, face: number, c: THREE.Color) => c.copy(dark).multiplyScalar(face > 0 || r < 0.5 ? 1 : 1.05);
    // First dorsal: tall, swept back, concave trailing edge.
    thickFin(
      b,
      (s, o) => {
        const x = 0.12 - 0.17 * s;
        o.set(x, ringAt(x).top - 0.005, 0);
      },
      (s, o) => o.set(0.0 - 0.06 * s * s + 0.02 * (1 - s), ringAt(0.04).top + 0.16 - 0.14 * s * s, 0),
      new THREE.Vector3(0, 0, 1),
      0.007,
      finPaint,
      { rows: 6, cols: 7 },
    );
    // Tiny second dorsal and anal fins.
    for (const up of [1, -1]) {
      finPatch(
        b,
        (s, o) => {
          const x = -0.265 - 0.03 * s;
          const r = ringAt(x);
          o.set(x, r.y + up * (up > 0 ? r.top : r.bottom) * 0.9, 0);
        },
        (s, o) => {
          const x = -0.285 - 0.025 * s;
          const r = ringAt(x);
          o.set(x, r.y + up * ((up > 0 ? r.top : r.bottom) + 0.022 * (1 - s)), 0);
        },
        (_s, _r, c) => c.copy(dark),
        { rows: 2, cols: 3 },
      );
    }
    // Lunate tail: a high, nearly symmetrical crescent with a keel on the peduncle.
    finPatch(
      b,
      (s, o) => o.set(-0.39, (s * 2 - 1) * 0.022, 0),
      (s, o) => {
        const e = s * 2 - 1;
        o.set(-0.43 - 0.15 * Math.pow(Math.abs(e), 1.25) - (e > 0 ? 0.01 : 0), e * (e > 0 ? 0.21 : 0.19), 0);
      },
      (_s, _r, c) => c.copy(dark),
      { rows: 6, cols: 14 },
    );
    for (const sd of [-1, 1]) {
      // Long pectoral fins, dark above.
      thickFin(
        b,
        (s, o) => {
          const r = ringAt(0.24 - 0.07 * s);
          ringPoint(r, -0.55, sd, o);
        },
        (s, o) => {
          const r = ringAt(0.24 - 0.07 * s);
          ringPoint(r, -0.55, sd, o);
          o.x += -0.19 + 0.12 * s;
          o.y -= 0.075 - 0.03 * s;
          o.z += sd * (0.16 - 0.06 * s);
        },
        new THREE.Vector3(0, 1, 0),
        0.005,
        (_s, r, face, c) => c.copy(face > 0 ? dark : white).lerp(dark, face > 0 ? 0 : smooth(0.7, 1, r)),
        { rows: 5, cols: 5, flex: 'paired' },
      );
      // Small pelvic fins.
      finPatch(
        b,
        (s, o) => {
          const r = ringAt(-0.13 - 0.04 * s);
          ringPoint(r, -0.85, sd, o);
        },
        (s, o) => {
          const r = ringAt(-0.13 - 0.04 * s);
          ringPoint(r, -0.85, sd, o);
          o.x -= 0.04;
          o.y -= 0.025 * (1 - s * 0.5);
          o.z += sd * 0.02;
        },
        (_s, _r, c) => c.copy(dark),
        { rows: 2, cols: 3, flex: 'paired' },
      );
    }
    return b.build();
  });
}

export function createShark(): Animal {
  const material = fishMaterial({ roughness: 0.5, metalness: 0.05 });
  const mesh = new THREE.Mesh(buildSharkGeometry(), material);
  const root = new THREE.Group();
  root.add(mesh);
  return wrap('shark', root, (p) => {
    setSwim(mesh, p.phase ?? p.t * 5, p.amp ?? 0.05);
    root.rotation.z = p.pitch ?? 0;
  });
}

/** Dolly Varden char: pale spots on a dark olive back, white-edged lower fins. */
export function createChar(): Animal {
  return fishAnimal('char', 'char', { depth: 0.9, hump: 0, kype: 0.15, yolk: 0 });
}

/** Any salmon look as an animal (for the gallery and the spawning rivals). */
export function fishAnimal(kind: string, look: FishLook, shape: { depth: number; hump: number; kype: number; yolk: number }): Animal {
  const mesh = createFish(shape, look);
  const root = new THREE.Group();
  root.add(mesh);
  return wrap(kind, root, (p) => {
    setSwim(mesh, p.phase ?? p.t * 5, p.amp ?? 0.05);
    root.rotation.z = p.pitch ?? 0;
  });
}

/** For the gallery and tests: every animal factory by name. */
export const ANIMALS: Record<string, () => Animal> = {
  bear: createBear,
  orca: createOrca,
  shark: createShark,
  seal: createSeal,
  gull: createGull,
  mergMale: () => createMerganser(true),
  mergFemale: () => createMerganser(false),
  char: createChar,
};
