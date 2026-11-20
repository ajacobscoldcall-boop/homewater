/**
 * The ocean food patch: a swarm of krill with a few small fish and the odd
 * small squid mixed in. Sockeye at sea feed mainly on zooplankton such as
 * krill, plus squid and small fish.
 *
 * The simulation's food entities (kind 'herring', one per bite) are unchanged:
 * each one is drawn here as a little cloud of krill around its position, and
 * some carry a small fish or a squid instead of their usual few krill. When the
 * player eats an entity, its cloud vanishes with it. Render only.
 *
 * Krill are drawn larger than life (a few centimetres in the wild) so the swarm
 * reads from behind the fish.
 */
import * as THREE from 'three';
import type { Entity } from '../sim/types';
import { buildFishGeometry } from './fishMesh';
import { col, GeoBuilder } from './geo';

/** Most food entities the sim keeps alive at once (matches the old instance cap). */
const MAX_PATCHES = 160;
/** Krill drawn around each food entity. */
const KRILL_PER = 14;
/** Radius of each entity's cloud; inside the sim's eating distance, so it vanishes when eaten. */
const CLOUD = 0.6;
const KRILL_LEN = 0.16;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Small deterministic hash in [0, 1) for per-entity and per-krill variety. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One krill, head toward +x, about 1 unit long (scaled down when drawn). */
export function krillGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const shell = col(0xf2a093);
  const gut = col(0xd9604f);
  const eye = col(0x1a0d0d);
  const leg = col(0xf7c2b4);
  const m = new THREE.Matrix4();
  // Carapace: a slim ellipsoid at the front, reddish gut showing through.
  b.add(new THREE.SphereGeometry(1, 10, 6), (p, out) => out.copy(shell).lerp(gut, p.y < 0.1 && p.x > -0.3 ? 0.55 : 0), m.compose(tmpP.set(0.18, 0, 0), tmpQ.identity(), tmpS.set(0.3, 0.12, 0.11)));
  // Abdomen: tapering segments curving slightly down to the tail fan.
  for (let i = 0; i < 4; i++) {
    const r = 0.1 - i * 0.018;
    b.add(new THREE.SphereGeometry(1, 8, 5), shell, m.compose(tmpP.set(-0.12 - i * 0.14, -0.02 - i * 0.012, 0), tmpQ.identity(), tmpS.set(0.1, r, r * 0.95)));
  }
  // Tail fan.
  b.add(new THREE.ConeGeometry(0.07, 0.14, 6), shell, m.compose(tmpP.set(-0.72, -0.07, 0), tmpQ.setFromEuler(tmpE.set(0, 0, Math.PI / 2)), tmpS.set(1, 1, 0.35)));
  // Black eyes, the most visible part of a real krill.
  for (const z of [-0.075, 0.075]) b.add(new THREE.SphereGeometry(0.05, 6, 4), eye, m.compose(tmpP.set(0.44, 0.03, z), tmpQ.identity(), tmpS.set(1, 1, 1)));
  // Antennae, swept back.
  for (const z of [-0.04, 0.04]) b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 3), leg, m.compose(tmpP.set(0.62, 0.1, z * 2), tmpQ.setFromEuler(tmpE.set(z * 3, 0, -1.25)), tmpS.set(1, 1, 1)));
  // Feathery legs under the body.
  for (let i = 0; i < 5; i++) b.add(new THREE.CylinderGeometry(0.01, 0.006, 0.16, 3), leg, m.compose(tmpP.set(0.3 - i * 0.09, -0.14, 0), tmpQ.setFromEuler(tmpE.set(0, 0, 0.35)), tmpS.set(1, 1, 1)));
  return b.build();
}

/** A small squid, head toward +x, about 1 unit long. */
export function squidGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const body = col(0xe9b2a0);
  const spots = col(0xa8473a);
  const m = new THREE.Matrix4();
  const paint = (p: THREE.Vector3, out: THREE.Color) => out.copy(body).lerp(spots, Math.sin(p.x * 40) * Math.sin(p.z * 37) > 0.55 ? 0.7 : 0.1);
  // Mantle: a long cone, tip at the back.
  b.add(new THREE.ConeGeometry(0.13, 0.62, 10, 1), paint, m.compose(tmpP.set(-0.12, 0, 0), tmpQ.setFromEuler(tmpE.set(0, 0, Math.PI / 2)), tmpS.set(1, 1, 1)));
  // Fins near the tip.
  b.add(new THREE.SphereGeometry(1, 8, 4), body, m.compose(tmpP.set(-0.36, 0, 0), tmpQ.identity(), tmpS.set(0.1, 0.015, 0.16)));
  // Head with large eyes.
  b.add(new THREE.SphereGeometry(1, 8, 6), body, m.compose(tmpP.set(0.22, 0, 0), tmpQ.identity(), tmpS.set(0.09, 0.09, 0.1)));
  for (const z of [-0.08, 0.08]) b.add(new THREE.SphereGeometry(0.04, 6, 4), col(0x101418), m.compose(tmpP.set(0.24, 0.02, z), tmpQ.identity(), tmpS.set(1, 1, 1)));
  // Arms, trailing forward and slightly spread.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.018, 0.3, 4), body, m.compose(tmpP.set(0.43, Math.sin(a) * 0.035, Math.cos(a) * 0.035), tmpQ.setFromEuler(tmpE.set(a, 0, -Math.PI / 2 + Math.sin(a) * 0.12)), tmpS.set(1, 1, 1)));
  }
  return b.build();
}

/** Draws the ocean food patch around the sim's food entities. */
export class FoodSwarm {
  readonly group = new THREE.Group();
  private krill: THREE.InstancedMesh;
  private fish: THREE.InstancedMesh;
  private squid: THREE.InstancedMesh;

  constructor() {
    const krillMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0,
      transparent: true,
      opacity: 0.78,
      emissive: new THREE.Color(0x7a2a20),
    });
    this.krill = new THREE.InstancedMesh(krillGeometry(), krillMat, MAX_PATCHES * KRILL_PER);
    this.fish = new THREE.InstancedMesh(
      buildFishGeometry({ depth: 0.9, hump: 0, kype: 0, yolk: 0 }, 'herring', { lod: 'low' }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }),
      MAX_PATCHES,
    );
    this.squid = new THREE.InstancedMesh(squidGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, transparent: true, opacity: 0.85 }), MAX_PATCHES);
    for (const m of [this.krill, this.fish, this.squid]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  /** Place the swarm around the given food entities. `t` is the stage clock in seconds. */
  update(food: readonly Entity[], t: number): void {
    let nk = 0;
    let nf = 0;
    let ns = 0;
    const n = Math.min(food.length, MAX_PATCHES);
    for (let i = 0; i < n; i++) {
      const e = food[i]!;
      const kind = hash(e.id * 1.37);
      if (kind < 0.12) {
        // A small fish swimming with the swarm.
        tmpP.set(e.pos.x, e.pos.y, e.pos.z);
        tmpQ.setFromAxisAngle(UP, -e.yaw + Math.PI);
        tmpS.setScalar(0.3 * (1 + 0.04 * Math.sin(t * 9 + e.id)));
        this.fish.setMatrixAt(nf++, tmpM.compose(tmpP, tmpQ, tmpS));
      } else if (kind < 0.18) {
        // The odd small squid, jetting in short pulses.
        const jet = Math.max(0, Math.sin(t * 2.2 + e.id));
        tmpP.set(e.pos.x, e.pos.y + 0.1 * jet, e.pos.z);
        tmpQ.setFromAxisAngle(UP, -e.yaw + Math.PI);
        tmpS.set(0.45 * (1 + 0.12 * jet), 0.45 * (1 - 0.1 * jet), 0.45 * (1 - 0.1 * jet));
        this.squid.setMatrixAt(ns++, tmpM.compose(tmpP, tmpQ, tmpS));
      }
      // Krill around every entity (fewer around a fish or squid).
      const count = kind < 0.18 ? KRILL_PER >> 1 : KRILL_PER;
      for (let k = 0; k < count; k++) {
        const seed = e.id * 31 + k;
        const h1 = hash(seed);
        const h2 = hash(seed + 0.5);
        const h3 = hash(seed + 0.25);
        // A point in the cloud, drifting slowly on its own small loop.
        const r = CLOUD * Math.cbrt(h1);
        const th = h2 * Math.PI * 2 + t * (0.25 + 0.3 * h3);
        const ph = Math.acos(2 * h3 - 1);
        tmpP.set(
          e.pos.x + r * Math.sin(ph) * Math.cos(th),
          e.pos.y + r * Math.cos(ph) * 0.7 + 0.05 * Math.sin(t * 1.3 + seed),
          e.pos.z + r * Math.sin(ph) * Math.sin(th),
        );
        // Heads roughly along the swarm's drift, each with its own wobble.
        tmpE.set(0.3 * Math.sin(t * 0.7 + seed), -e.yaw + Math.PI + (h2 - 0.5) * 1.4 + 0.2 * Math.sin(t + seed), 0.25 * (h1 - 0.5));
        tmpQ.setFromEuler(tmpE);
        // Swimming legs beat fast: a quick pulse in length and girth.
        const beat = Math.sin(t * (9 + 4 * h1) + seed * 2.1);
        const len = KRILL_LEN * (0.8 + 0.4 * h3);
        tmpS.set(len * (1 + 0.06 * beat), len * (1 - 0.08 * beat), len);
        this.krill.setMatrixAt(nk, tmpM.compose(tmpP, tmpQ, tmpS));
        this.krill.setColorAt(nk, tmpC.setRGB(1, 0.86 + 0.14 * h2, 0.86 + 0.14 * h1));
        nk++;
      }
    }
    this.krill.count = nk;
    this.fish.count = nf;
    this.squid.count = ns;
    for (const m of [this.krill, this.fish, this.squid]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
