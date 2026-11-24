/**
 * A freshwater sculpin, built in code: a broad, flat head with eyes on top and
 * a wide mouth, big fan-shaped pectoral fins, two dorsal fins, a long anal fin
 * and a rounded tail, mottled olive-brown with dark saddles and a pale belly.
 * One draw call. The snout is at the origin and the body runs back along -x,
 * one unit long, so the sim's point (the head, probing the gravel) is the
 * model's origin. Pose: `pitch` tips the nose down into the gaps; the pectoral
 * fins are part of the mesh.
 */
import * as THREE from 'three';
import type { Animal, AnimalPose } from './animals';
import { col, decal, finPatch, GeoBuilder, keyed, loft, noise3, smooth as smoothstep, type Ring } from './geo';

// x, centre y, top, bottom, half-width: tail (x = -1) to snout (x = 0).
const BODY: number[][] = [
  [-1.0, 0.03, 0.012, 0.012, 0.008],
  [-0.92, 0.03, 0.03, 0.026, 0.024],
  [-0.7, 0.035, 0.05, 0.036, 0.045],
  [-0.5, 0.038, 0.06, 0.04, 0.07],
  [-0.34, 0.038, 0.062, 0.04, 0.11],
  [-0.2, 0.034, 0.056, 0.036, 0.15],
  [-0.1, 0.03, 0.046, 0.032, 0.15],
  [-0.035, 0.026, 0.03, 0.026, 0.12],
  [0.0, 0.022, 0.008, 0.008, 0.06],
];

const ring = (t: number): Ring => {
  const x = -1 + t;
  return { x, y: keyed(BODY, x, 1), top: keyed(BODY, x, 2), bottom: keyed(BODY, x, 3), width: keyed(BODY, x, 4) };
};

/** Height of the back at x. */
const backAt = (x: number): number => keyed(BODY, x, 1) + keyed(BODY, x, 2);

const OLIVE = col(0x8f7c52);
const DARK = col(0x2e261a);
const BELLY = col(0xcdbf9c);
const FIN = col(0x7a6a4a);

let cachedGeo: THREE.BufferGeometry | null = null;

function buildSculpinGeometry(): THREE.BufferGeometry {
  if (cachedGeo) return cachedGeo;
  const b = new GeoBuilder();
  loft(
    b,
    40,
    18,
    ring,
    (t, s, _side, p, out) => {
      // Mottled back with three or four dark saddles; pale, plain belly.
      const saddle = smoothstep(0.35, 0.8, Math.sin((t * 3.6 + 0.2) * Math.PI * 2) * 0.5 + 0.5);
      const n = noise3(p.x * 40, p.y * 40, p.z * 40);
      out.copy(OLIVE).lerp(DARK, Math.min(1, 0.75 * saddle * (s > -0.2 ? 1 : 0.3) + 0.35 * n));
      out.multiplyScalar(0.8 + 0.4 * noise3(p.x * 110, p.z * 110, 3.1));
      if (s < -0.25) out.lerp(BELLY, Math.min(1, (-s - 0.25) * 1.6));
    },
    { caps: true, fullness: 0.7 },
  );
  // The wide mouth: a dark line round the front of the head.
  for (const side of [1, -1]) {
    const at = new THREE.Vector3(-0.03, 0.012, side * 0.06);
    decal(b, at, new THREE.Vector3(0.3, -0.1, side).normalize(), 0.03, 0.006, DARK, 6, 0.002);
  }
  // Eyes high on the head, looking up and out: dark pupils in a gold ring.
  for (const side of [1, -1]) {
    const at = new THREE.Vector3(-0.115, backAt(-0.115) + 0.004, side * 0.05);
    const n = new THREE.Vector3(0.15, 1, side * 0.7).normalize();
    decal(b, at, n, 0.03, 0.026, col(0x15120d), 12, 0.004, 0, col(0xc9a54e));
  }
  // Fins: barred with dark bands across the rays.
  const fin = (s: number, r: number, out: THREE.Color) => {
    out.copy(FIN).lerp(DARK, 0.6 * smoothstep(0.55, 0.9, Math.sin(r * Math.PI * 3.2 + s * 2) * 0.5 + 0.5));
    if (r > 0.88) out.multiplyScalar(0.85);
  };
  // Pectoral fins: big fans spread out to the sides, resting on the gravel.
  for (const side of [1, -1]) {
    finPatch(
      b,
      (s, o) => o.set(-0.32 + 0.14 * s, 0.012, side * (0.12 + 0.03 * s)),
      (s, o) => {
        // A rounded fan.
        const a2 = (s - 0.5) * 2.4;
        o.set(-0.27 - 0.2 * Math.sin(a2) - 0.04, -0.008, side * (0.13 + 0.2 * Math.cos(a2 * 0.8)));
      },
      fin,
      { rows: 3, cols: 8, flex: 'paired', rays: 10 },
    );
    // Pelvic fins: small, under the chest.
    finPatch(
      b,
      (s, o) => o.set(-0.3 + 0.06 * s, -0.005, side * 0.04),
      (s, o) => o.set(-0.38 + 0.08 * s, -0.03, side * 0.08),
      fin,
      { rows: 2, cols: 3, flex: 'paired' },
    );
  }
  // First dorsal: small and spiny; second dorsal: long and soft.
  finPatch(
    b,
    (s, o) => o.set(-0.44 + 0.14 * s, backAt(-0.44 + 0.14 * s) - 0.004, 0),
    (s, o) => o.set(-0.46 + 0.14 * s, 0.155 - 0.02 * (2 * s - 1) ** 2, 0),
    fin,
    { rows: 3, cols: 5, rays: 5 },
  );
  finPatch(
    b,
    (s, o) => o.set(-0.84 + 0.38 * s, backAt(-0.84 + 0.38 * s) - 0.004, 0),
    (s, o) => o.set(-0.88 + 0.4 * s, 0.14 + 0.01 * Math.sin(s * Math.PI), 0),
    fin,
    { rows: 3, cols: 10, rays: 14 },
  );
  // Anal fin, along the belly.
  finPatch(
    b,
    (s, o) => o.set(-0.84 + 0.3 * s, -0.005, 0),
    (s, o) => o.set(-0.88 + 0.3 * s, -0.05, 0),
    fin,
    { rows: 2, cols: 8, rays: 10 },
  );
  // Rounded tail.
  finPatch(
    b,
    (s, o) => o.set(-0.985, 0.03 + 0.024 * (2 * s - 1), 0),
    (s, o) => {
      const a = (s - 0.5) * 2.2;
      o.set(-1.0 - 0.13 * Math.cos(a), 0.03 + 0.1 * Math.sin(a), 0);
    },
    fin,
    { rows: 3, cols: 8, rays: 9 },
  );
  cachedGeo = b.build();
  cachedGeo.userData.shared = true;
  return cachedGeo;
}

/** The sculpin as an animal (gallery and play). Pose: pitch tips the nose down; t sways it a little. */
export function createSculpin(): Animal {
  const mesh = new THREE.Mesh(buildSculpinGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  const root = new THREE.Group();
  root.add(mesh);
  const a: Animal = {
    kind: 'sculpin',
    root,
    update(p: AnimalPose) {
      mesh.rotation.z = p.pitch ?? 0;
      // A slow side-to-side nosing; quicker while it probes or strikes.
      const quick = p.mode === 'probe' ? 5 : p.mode === 'strike' ? 14 : 2;
      mesh.rotation.y = (p.mode === 'strike' ? 0.12 : 0.05) * Math.sin(p.t * quick);
    },
  };
  root.userData.animal = a;
  root.name = 'sculpin';
  return a;
}
