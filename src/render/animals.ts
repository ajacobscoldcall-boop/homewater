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
import { bell, col, decal, finPatch, GeoBuilder, hash3, keyed, loft, noise3, ringPoint, smooth, surfacePatch, surfaceStrip, type Ring } from './geo';
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
  [-0.5, 1.0, 0.44, 0.43, 0.44],
  [-0.15, 1.02, 0.47, 0.44, 0.46],
  [0.18, 1.08, 0.56, 0.43, 0.45],
  [0.42, 1.1, 0.5, 0.42, 0.4],
  [0.66, 1.16, 0.36, 0.34, 0.3],
  [0.84, 1.2, 0.28, 0.27, 0.24],
];

const BEAR_HEAD: number[][] = [
  [-0.1, 0, 0.24, 0.24, 0.22],
  [0.04, 0.02, 0.27, 0.24, 0.25],
  [0.17, 0.02, 0.25, 0.21, 0.23],
  [0.29, -0.04, 0.17, 0.17, 0.16],
  [0.4, -0.07, 0.13, 0.13, 0.125],
  [0.52, -0.08, 0.11, 0.105, 0.105],
  [0.6, -0.08, 0.085, 0.085, 0.085],
  [0.645, -0.08, 0.03, 0.03, 0.03],
];

const FUR = { base: col(0x5a3b23), dark: col(0x34231a), light: col(0x86623d), muzzle: col(0x8d6e4c) };

function furColor(p: THREE.Vector3, out: THREE.Color, darkness = 0): void {
  const n = noise3(p.x * 6, p.y * 6, p.z * 6);
  const n2 = noise3(p.x * 23 + 4, p.y * 23, p.z * 23);
  out.copy(FUR.base).lerp(FUR.light, Math.max(0, n - 0.45) * 1.1 * (1 - darkness));
  out.lerp(FUR.dark, darkness * 0.8 + 0.25 * (1 - n2));
}

/** Leg along +y from the foot (y=0) to its top; radius keys [h, r]. */
function bearLeg(b: GeoBuilder, m: THREE.Matrix4, keys: number[][], claws: boolean): void {
  const [h0, h1] = span(keys);
  const prev = b.matrix;
  b.matrix = m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  loft(
    b,
    12,
    12,
    (t) => {
      const h = h0 + (h1 - h0) * t;
      const r = keyed(keys, h, 1);
      // The rotation maps loft y to -x: a negative y leans the knee back.
      return { x: h, y: -0.03 * Math.sin(t * Math.PI), top: r, bottom: r, width: r * 0.92 };
    },
    (t, _s, _side, pos, out) => {
      const w = new THREE.Vector3(pos.x, pos.y, pos.z);
      if (b.matrix) w.applyMatrix4(b.matrix);
      furColor(w, out, 0.7 - 0.5 * t);
    },
    { caps: true },
  );
  b.matrix = m;
  // Paw: a flattened pad reaching forward.
  b.add(new THREE.SphereGeometry(1, 12, 8), (q, o) => furColor(q, o, 0.85), new THREE.Matrix4().compose(new THREE.Vector3(0.06, 0.06, 0), new THREE.Quaternion(), new THREE.Vector3(0.2, 0.08, 0.15)));
  if (claws) {
    const claw = col(0xd8cdb2);
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 0.05;
      const cm = new THREE.Matrix4().compose(new THREE.Vector3(0.25, 0.035, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2 - 0.5)), new THREE.Vector3(1, 1, 1));
      b.add(new THREE.ConeGeometry(0.014, 0.1, 5), claw, cm);
    }
  }
  b.matrix = prev;
}

const FRONT_LEG = [
  [0, 0.12],
  [0.12, 0.13],
  [0.3, 0.13],
  [0.55, 0.16],
  [0.8, 0.21],
  [1.0, 0.24],
];
const HIND_LEG = [
  [0, 0.12],
  [0.15, 0.125],
  [0.35, 0.15],
  [0.6, 0.22],
  [0.85, 0.26],
  [1.1, 0.24],
];

export function createBear(): Animal {
  const material = mat({ roughness: 0.95 });
  const torso = cached('bear-torso', () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(BEAR_TORSO);
    loft(
      b,
      26,
      18,
      (t) => ringFrom(BEAR_TORSO, x0 + (x1 - x0) * t),
      (_t, s, _side, p, out) => {
        furColor(p, out, s < -0.3 ? 0.6 : 0.1);
        // Paler, grizzled tips over the shoulder hump.
        if (s > 0.5) out.lerp(FUR.light, 0.35 * bell(-0.2, 0.6, p.x) * noise3(p.x * 14, p.y * 14, p.z * 14));
      },
      { caps: true, fullness: 0.9 },
    );
    bearLeg(b, new THREE.Matrix4().makeTranslation(0.42, 0, -0.22), FRONT_LEG, true);
    bearLeg(b, new THREE.Matrix4().makeTranslation(-0.7, 0, 0.21), HIND_LEG, false);
    bearLeg(b, new THREE.Matrix4().makeTranslation(-0.7, 0, -0.21), HIND_LEG, false);
    // Short tail.
    b.add(new THREE.SphereGeometry(0.08, 8, 6), (q, o) => furColor(q, o, 0.3), new THREE.Matrix4().makeTranslation(-1.06, 1.12, 0));
    return b.build();
  });
  const head = cached('bear-head', () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(BEAR_HEAD);
    loft(
      b,
      22,
      18,
      (t) => ringFrom(BEAR_HEAD, x0 + (x1 - x0) * t),
      (_t, s, _side, p, out) => {
        furColor(p.clone().add(new THREE.Vector3(0.8, 1.2, 0)), out, 0.15);
        // The muzzle is paler; the mouth line is dark.
        out.lerp(FUR.muzzle, smooth(0.3, 0.42, p.x) * 0.75);
        if (p.x > 0.33 && s < -0.35 && s > -0.62) out.multiplyScalar(0.35);
      },
      { caps: true, fullness: 0.9 },
    );
    const black = col(0x120d0b);
    b.add(new THREE.SphereGeometry(1, 12, 8), black, new THREE.Matrix4().compose(new THREE.Vector3(0.625, -0.04, 0), new THREE.Quaternion(), new THREE.Vector3(0.045, 0.045, 0.06)));
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.024, 8, 6), black, new THREE.Matrix4().makeTranslation(0.27, 0.08, side * 0.135));
      // Small round ears.
      b.add(
        new THREE.SphereGeometry(1, 10, 8),
        (q, o) => (q.x > 0.2 ? o.copy(FUR.dark) : o.copy(FUR.base)),
        new THREE.Matrix4().compose(new THREE.Vector3(0.02, 0.25, side * 0.16), new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.4, 0, 0)), new THREE.Vector3(0.04, 0.075, 0.07)),
      );
    }
    return b.build();
  });
  const arm = cached('bear-arm', () => {
    const b = new GeoBuilder();
    // Built hanging from the shoulder pivot.
    bearLeg(b, new THREE.Matrix4().makeTranslation(0, -0.95, 0), FRONT_LEG, true);
    return b.build();
  });

  const root = new THREE.Group();
  const rig = new THREE.Group();
  const body = new THREE.Mesh(torso, material);
  const headPivot = new THREE.Group();
  headPivot.position.set(0.82, 1.2, 0);
  headPivot.add(new THREE.Mesh(head, material));
  const armPivot = new THREE.Group();
  armPivot.position.set(0.42, 0.95, 0.22);
  armPivot.add(new THREE.Mesh(arm, material));
  rig.add(body, headPivot, armPivot);
  root.add(rig);

  const dir = new THREE.Vector3();
  return wrap('bear', root, (p) => {
    const t = p.t;
    const k = Math.max(0, Math.min(1, p.k ?? 0));
    let lean = 0;
    let swipe = 0;
    let pounce = 0;
    let headDown = 0.25 + 0.08 * Math.sin(t * 0.7);
    let headYaw = 0.35 * Math.sin(t * 0.4);
    if (p.mode === 'warn') {
      // Lean in and fix on the fish, then lunge.
      lean = smooth(0, 0.35, k);
      headDown = 0.25 + 0.45 * lean;
      headYaw = 0;
      swipe = 0.5 * smooth(0.5, 1, k);
      pounce = smooth(0.35, 1, k);
    } else if (p.mode === 'strike') {
      // Paw raised high, then slammed down onto the target.
      lean = 1;
      headDown = 0.75;
      headYaw = 0;
      pounce = 1;
      swipe = k < 0.35 ? 0.5 + 1.9 * smooth(0, 0.35, k) : 2.4 - 1.5 * smooth(0.35, 0.8, k);
    } else if (p.mode === 'rest') {
      pounce = 1 - smooth(0, 1, k);
      lean = pounce * 0.5;
      headDown = 0.35;
    }
    // Rig: turn to face the target and travel towards it.
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    if (p.target && pounce > 0) {
      dir.set(p.target.x, 0, p.target.z);
      const d = dir.length();
      if (d > 1e-3) {
        const yaw = Math.atan2(dir.z, dir.x);
        rig.rotation.y = -yaw * Math.min(1, pounce * 2);
        const travel = Math.max(0, d - 1.35) * pounce;
        rig.position.set((dir.x / d) * travel, 0, (dir.z / d) * travel);
      }
      // Off a high bank, the bear drops into the shallows.
      const surface = p.surface ?? 0;
      if (surface < -0.3) rig.position.y = (surface - 0.75) * smooth(0.2, 0.9, pounce);
    }
    rig.position.y -= 0.08 * lean;
    rig.rotation.z = -0.12 * lean;
    headPivot.rotation.set(0, headYaw, -headDown);
    armPivot.rotation.set(0, 0, swipe);
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
          out.setHex(0x8e969a);
          if (s < -0.15) out.setHex(0xe9e9e4);
          if (p.x > 0.15 && s < 0.4) out.setHex(0xe6e6e0);
        }
        out.multiplyScalar(0.96 + 0.06 * hash3(Math.round(p.x * 60), Math.round(s * 8), 1));
      },
      { caps: true, fullness: 0.9 },
    );
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
    loft(b, 10, 14, (t) => ringFrom(MERG_HEAD, -0.04 + (HX + 0.025 + 0.04) * t), (_t, s, _side, p, out) => headPaint(s, p, out), { caps: true, follow: true });
    return b.build();
  });
  const head = cached(`merg-head-${key}`, () => {
    const b = new GeoBuilder();
    b.matrix = new THREE.Matrix4().makeTranslation(-HX, -HY, 0);
    const x0 = HX - 0.025;
    const x1 = span(MERG_HEAD)[1];
    loft(b, 14, 14, (t) => ringFrom(MERG_HEAD, x0 + (x1 - x0) * t), (_t, s, _side, p, out) => headPaint(s, p, out), { caps: true, follow: true });
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

const SEAL: number[][] = [
  [-0.38, 0.0, 0.03, 0.028, 0.035],
  [-0.3, 0.0, 0.062, 0.058, 0.068],
  [-0.15, 0.005, 0.105, 0.1, 0.112],
  [0.02, 0.01, 0.13, 0.125, 0.13],
  [0.17, 0.015, 0.118, 0.112, 0.112],
  [0.28, 0.02, 0.08, 0.076, 0.078],
  [0.33, 0.026, 0.073, 0.067, 0.071],
  [0.395, 0.031, 0.083, 0.07, 0.081],
  [0.44, 0.027, 0.07, 0.06, 0.068],
  [0.466, 0.013, 0.046, 0.042, 0.048],
  [0.49, 0.007, 0.036, 0.033, 0.038],
  [0.506, 0.005, 0.02, 0.02, 0.022],
  [0.512, 0.005, 0.003, 0.003, 0.003],
];

export function buildSealGeometry(): THREE.BufferGeometry {
  return cached('seal', () => {
    const b = new GeoBuilder();
    const [x0, x1] = span(SEAL);
    const ringAt = (x: number) => ringFrom(SEAL, x);
    const back = col(0x6d7478);
    const side = col(0x9ba1a3);
    const belly = col(0xcac9c0);
    loft(
      b,
      56,
      22,
      (t) => ringAt(x0 + (x1 - x0) * t),
      (_t, s, _sd, p, out) => {
        out.copy(side);
        if (s > 0.2) out.lerp(back, smooth(0.2, 0.8, s));
        if (s < -0.3) out.lerp(belly, smooth(-0.3, -0.8, s));
        // Muzzle and whisker pads a touch paler; dark mouth line.
        if (p.x > 0.455 && s < 0.2) out.lerp(belly, 0.35);
        if (p.x > 0.462 && s < -0.35 && s > -0.55) out.multiplyScalar(0.55);
        out.multiplyScalar(0.94 + 0.1 * noise3(p.x * 40, p.y * 40, p.z * 40));
      },
      { caps: true },
    );
    // Spots: dark, irregular, densest on the back.
    const at = new THREE.Vector3();
    const n = new THREE.Vector3();
    const spot = col(0x2d3133);
    for (let i = 0; i < 150; i++) {
      const x = -0.33 + 0.76 * hash3(i, 3.1, 1.7);
      const s = -0.55 + 1.5 * hash3(i, 8.3, 4.4);
      if (s > 0.95) continue;
      const sd = hash3(i, 1.9, 6.6) < 0.5 ? 1 : -1;
      const r = ringAt(x);
      ringPoint(r, Math.min(0.95, s), sd, at, n);
      const size = 0.006 + 0.01 * hash3(i, 7.7, 2.1);
      decal(b, at, n, size, size * (0.6 + 0.5 * hash3(i, 2, 9)), spot, 6, 0.0015, hash3(i, 4, 4) * 3);
    }
    // Big dark eyes and V-shaped nostrils.
    for (const sd of [-1, 1]) {
      const r = ringAt(0.443);
      ringPoint(r, 0.42, sd, at, n);
      decal(b, at, n, 0.014, 0.012, col(0x050505), 12, 0.002, 0, col(0x1a1a1a));
      const rn = ringAt(0.503);
      ringPoint(rn, 0.45, sd * 0.35, at, n);
      decal(b, at, n, 0.005, 0.0022, col(0x111111), 6, 0.001, sd * 0.7);
    }
    // Hind flippers: held palm to palm, sweeping side to side.
    for (const sd of [-1, 1]) {
      finPatch(
        b,
        (s, o) => o.set(-0.36 - 0.01 * s, (s - 0.5) * 0.045, sd * 0.012),
        (s, o) => {
          const lobe = 0.012 * Math.cos(s * Math.PI * 5);
          o.set(-0.52 - 0.02 * Math.abs(s - 0.5) * 2 + lobe, (s - 0.5) * 0.12, sd * 0.03);
        },
        (_s, r, c) => c.setHex(0x41474a).multiplyScalar(1 - 0.25 * r),
        { rows: 4, cols: 10 },
      );
      // Fore flippers: small, held back against the body.
      finPatch(
        b,
        (s, o) => {
          const r = ringAt(0.2 - 0.04 * s);
          ringPoint(r, -0.55, sd, o);
        },
        (s, o) => {
          const r = ringAt(0.2 - 0.04 * s);
          ringPoint(r, -0.55, sd, o);
          o.x -= 0.075;
          o.y -= 0.03;
          o.z += sd * 0.03;
        },
        (_s, r, c) => c.setHex(r > 0.85 ? 0xb9b1a0 : 0x4a5053),
        { rows: 3, cols: 4, flex: 'paired' },
      );
    }
    return b.build();
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
