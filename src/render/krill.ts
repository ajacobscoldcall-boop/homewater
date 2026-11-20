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
 * Everything is drawn at life size (scale audit, scaleConfig.ts): krill about
 * 2 cm, the small fish and squid about 8-10 cm, beside a 60 cm salmon. A real
 * swarm is dense, so each food point carries a cloud of a dozen to two dozen
 * krill (by scenery detail), drawn with a lean model in play.
 */
import * as THREE from 'three';
import type { Entity } from '../sim/types';
import { buildFishGeometry } from './fishMesh';
import { col, GeoBuilder } from './geo';
import { softPointsMaterial } from './midwater';
import { quality } from './quality';
import { MODEL_SCALE } from './scaleConfig';

/** Most food entities the sim keeps alive at once (matches the old instance cap). */
const MAX_PATCHES = 160;
/** Most krill drawn around each food entity (High detail). */
const KRILL_MAX = Math.max(...MODEL_SCALE.krillPer);

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

/**
 * One krill, head toward +x, about 1.3 units long without its antennae (scaled down when drawn).
 * `lean`: the play model, with fewer vertices and no antennae or legs, which are under a pixel at life size.
 */
export function krillGeometry(opts: { lean?: boolean } = {}): THREE.BufferGeometry {
  const lean = opts.lean ?? false;
  const b = new GeoBuilder();
  const shell = col(0xf2a093);
  const gut = col(0xd9604f);
  const eye = col(0x1a0d0d);
  const leg = col(0xf7c2b4);
  const m = new THREE.Matrix4();
  // Carapace: a slim ellipsoid at the front, reddish gut showing through.
  b.add(new THREE.SphereGeometry(1, lean ? 6 : 10, lean ? 4 : 6), (p, out) => out.copy(shell).lerp(gut, p.y < 0.1 && p.x > -0.3 ? 0.55 : 0), m.compose(tmpP.set(0.18, 0, 0), tmpQ.identity(), tmpS.set(0.3, 0.12, 0.11)));
  // Abdomen: tapering segments curving slightly down to the tail fan.
  for (let i = 0; i < 4; i++) {
    if (lean && i === 3) break;
    const r = 0.1 - i * 0.018;
    b.add(new THREE.SphereGeometry(1, lean ? 5 : 8, lean ? 3 : 5), shell, m.compose(tmpP.set(-0.12 - i * 0.14, -0.02 - i * 0.012, 0), tmpQ.identity(), tmpS.set(0.1, r, r * 0.95)));
  }
  // Tail fan.
  b.add(new THREE.ConeGeometry(0.07, 0.14, lean ? 4 : 6), shell, m.compose(tmpP.set(-0.72, -0.07, 0), tmpQ.setFromEuler(tmpE.set(0, 0, Math.PI / 2)), tmpS.set(1, 1, 0.35)));
  // Black eyes, the most visible part of a real krill.
  for (const z of [-0.075, 0.075]) b.add(new THREE.SphereGeometry(lean ? 0.06 : 0.05, lean ? 4 : 6, lean ? 3 : 4), eye, m.compose(tmpP.set(0.44, 0.03, z), tmpQ.identity(), tmpS.set(1, 1, 1)));
  if (lean) return b.build();
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
  /** The rest of the swarm: life-size specks round each food point (one draw). */
  private haze: THREE.Points;
  private hazePos: Float32Array;
  private hazeColour: Float32Array;
  private hazeSize: Float32Array;
  private hazeAlpha: Float32Array;

  constructor(fog = new THREE.FogExp2(0x123d5a, 0.03)) {
    const krillMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0,
      transparent: true,
      opacity: 0.78,
      emissive: new THREE.Color(0x7a2a20),
    });
    this.krill = new THREE.InstancedMesh(krillGeometry({ lean: true }), krillMat, MAX_PATCHES * KRILL_MAX);
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
    const max = MAX_PATCHES * Math.max(...MODEL_SCALE.krillHaze);
    const geo = new THREE.BufferGeometry();
    this.hazePos = new Float32Array(max * 3);
    this.hazeColour = new Float32Array(max * 3);
    this.hazeSize = new Float32Array(max);
    this.hazeAlpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.hazePos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.hazeColour, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.hazeSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.hazeAlpha, 1));
    for (let i = 0; i < max; i++) {
      const h = hash(i * 0.731);
      this.hazeColour.set([1, 0.6 + 0.12 * h, 0.52 + 0.1 * h], i * 3);
      this.hazeSize[i] = MODEL_SCALE.krillSpeck * (0.75 + 0.5 * hash(i * 1.913));
      this.hazeAlpha[i] = 0.55 + 0.35 * hash(i * 2.377);
    }
    geo.setDrawRange(0, 0);
    this.haze = new THREE.Points(geo, softPointsMaterial(fog));
    this.haze.frustumCulled = false;
    this.group.add(this.haze);
  }

  /** Place the swarm around the given food entities. `t` is the stage clock in seconds; px from midwater.pixelsPerUnit. */
  update(food: readonly Entity[], t: number, px = 400, fogDensity = 0.03): void {
    let nk = 0;
    let nf = 0;
    let ns = 0;
    const n = Math.min(food.length, MAX_PATCHES);
    const per = MODEL_SCALE.krillPer[quality.envDetail] ?? KRILL_MAX;
    const cloud = MODEL_SCALE.krillCloud;
    for (let i = 0; i < n; i++) {
      const e = food[i]!;
      const kind = hash(e.id * 1.37);
      if (kind < 0.12) {
        // A small fish swimming with the swarm.
        // Facing the way it swims (the sim's yaw follows its velocity, flocking.ts).
        tmpP.set(e.pos.x, e.pos.y, e.pos.z);
        tmpQ.setFromAxisAngle(UP, -e.yaw);
        tmpS.setScalar(MODEL_SCALE.foodFish * (1 + 0.04 * Math.sin(t * 9 + e.id)));
        this.fish.setMatrixAt(nf++, tmpM.compose(tmpP, tmpQ, tmpS));
      } else if (kind < 0.18) {
        // The odd small squid, jetting in short pulses.
        const jet = Math.max(0, Math.sin(t * 2.2 + e.id));
        tmpP.set(e.pos.x, e.pos.y + 0.03 * jet, e.pos.z);
        tmpQ.setFromAxisAngle(UP, -e.yaw + Math.PI);
        const sq = MODEL_SCALE.squid;
        tmpS.set(sq * (1 + 0.12 * jet), sq * (1 - 0.1 * jet), sq * (1 - 0.1 * jet));
        this.squid.setMatrixAt(ns++, tmpM.compose(tmpP, tmpQ, tmpS));
      }
      // Krill around every entity (fewer around a fish or squid).
      const count = kind < 0.18 ? per >> 1 : per;
      for (let k = 0; k < count; k++) {
        const seed = e.id * 31 + k;
        const h1 = hash(seed);
        const h2 = hash(seed + 0.5);
        const h3 = hash(seed + 0.25);
        // A point in the cloud, drifting slowly on its own small loop.
        const r = cloud * Math.cbrt(h1);
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
        const len = MODEL_SCALE.krill * (0.8 + 0.4 * h3);
        tmpS.set(len * (1 + 0.06 * beat), len * (1 - 0.08 * beat), len);
        this.krill.setMatrixAt(nk, tmpM.compose(tmpP, tmpQ, tmpS));
        this.krill.setColorAt(nk, tmpC.setRGB(1, 0.86 + 0.14 * h2, 0.86 + 0.14 * h1));
        nk++;
      }
    }
    // The haze: many more krill round each point, as soft specks drifting on their own loops.
    const hazePer = MODEL_SCALE.krillHaze[quality.envDetail] ?? 30;
    let nh = 0;
    for (let i = 0; i < n; i++) {
      const e = food[i]!;
      for (let k = 0; k < hazePer; k++) {
        const seed = e.id * 53 + k + 0.5;
        const h1 = hash(seed);
        const h2 = hash(seed + 0.37);
        const h3 = hash(seed + 0.71);
        const r = cloud * 1.15 * Math.cbrt(h1);
        const th = h2 * Math.PI * 2 + t * (0.2 + 0.3 * h3);
        const ph = Math.acos(2 * h3 - 1);
        const o = nh * 3;
        this.hazePos[o] = e.pos.x + r * Math.sin(ph) * Math.cos(th);
        this.hazePos[o + 1] = e.pos.y + r * Math.cos(ph) * 0.7 + 0.04 * Math.sin(t * 1.1 + seed);
        this.hazePos[o + 2] = e.pos.z + r * Math.sin(ph) * Math.sin(th);
        nh++;
      }
    }
    const hg = this.haze.geometry;
    hg.setDrawRange(0, nh);
    (hg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    const hm = this.haze.material as THREE.ShaderMaterial;
    hm.uniforms.uPx!.value = px;
    hm.uniforms.uFogDensity!.value = fogDensity;
    this.krill.count = nk;
    this.fish.count = nf;
    this.squid.count = ns;
    for (const m of [this.krill, this.fish, this.squid]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
