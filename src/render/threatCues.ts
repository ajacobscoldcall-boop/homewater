/**
 * Natural threat cues (render only; reads sim state, never writes it).
 *
 * - The startle: when a predator first warns or turns to strike near the fish, the player's fish flinches
 *   away from it (a quick turn, roll and tail beat). Shown in both views.
 * - Documentary view (access().documentaryView): a soft shadow on the bed under a warning predator that swims;
 *   home scent drawn as a faint shimmer in the water instead of specks. (The magnetic track's softer
 *   Documentary look is in trackGlow.ts.) The sim's entities, positions and timings are unchanged; only the drawing is.
 *
 * Tuning: threatCuesConfig at the bottom of this file is presentation, not params.json.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Entity } from '../sim/types';
import { type ActiveThreat, SWIMMERS } from './threats';
import { CAMERA } from './cameraConfig';

export const CUES = {
  /** Startle: only for threats within this many units of the fish. */
  startleRange: 22,
  /** Predator shadow on the bed: size per kind (world units), opacity, and the deepest water it shows through. */
  shadow: { size: { trout: 2.6, seal: 3.6, orca: 9, shark: 5, merganser: 1.8 } as Record<string, number>, opacity: 0.5, hotOpacity: 0.7, maxDepth: 14 },
  /** Home scent as a shimmer: sprite size (times the speck's size), opacity and flicker. */
  scent: { size: 9, opacity: 0.16, flicker: 0.35, colour: 0xd9fff0 },
} as const;

/** A soft round spot, white with alpha falling off to the edge (one texture for every soft cue). */
function softTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r, 2) * (3 - 2 * (1 - r)) * (1 - r);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
}

const tmpM = new THREE.Matrix4();

export class ThreatCues {
  /** Startle state: seconds left, and which way (+1 / -1) the fish flinches. */
  private startleLeft = 0;
  private startleSide = 1;
  private known = new Map<number, boolean>();
  private readonly tex = softTexture();
  /** Documentary view's soft sprites for scent and track, swapped onto those instanced meshes. */
  readonly softGeo = new THREE.PlaneGeometry(1, 1);
  readonly scentMat = new THREE.MeshBasicMaterial({ color: CUES.scent.colour, map: this.tex, transparent: true, opacity: CUES.scent.opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  private shadows: THREE.InstancedMesh;
  private defaults = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }>();
  /** Whether Documentary view is on this frame. */
  doc = false;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, map: this.tex, transparent: true, opacity: CUES.shadow.opacity, depthWrite: false }), 12);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 0;
    scene.add(this.shadows);
  }

  /** A new stage: forget what was seen. */
  reset(): void {
    this.known.clear();
    this.startleLeft = 0;
    this.defaults.clear();
  }

  /** Each frame, before entities are written. */
  update(w: World, threats: readonly ActiveThreat[], dt: number, doc: boolean, ground: (x: number, z: number) => number): void {
    this.doc = doc;
    this.startleLeft = Math.max(0, this.startleLeft - dt);
    const fish = w.body.pos;
    const seen = new Set<number>();
    let n = 0;
    const m = tmpM;
    for (const t of threats) {
      if (t.tell || t.opening || t.kind === 'rival' || t.id < 0) continue;
      seen.add(t.id);
      const was = this.known.get(t.id);
      const near = Math.hypot(t.at.x - fish.x, t.at.y - fish.y, t.at.z - fish.z) < CUES.startleRange;
      if (near && (was === undefined || (t.hot && !was)) && w.status === 'playing') {
        this.startleLeft = CAMERA.startle.length;
        // Away from the threat: which side of the fish's heading is it on?
        const hx = Math.cos(w.body.yaw);
        const hz = Math.sin(w.body.yaw);
        const cross = hx * (t.at.z - fish.z) - hz * (t.at.x - fish.x);
        this.startleSide = cross > 0 ? -1 : 1;
      }
      this.known.set(t.id, t.hot);
      if (doc && SWIMMERS.has(t.kind) && n < this.shadows.instanceMatrix.count) {
        const g = ground(t.at.x, t.at.z);
        if (Number.isFinite(g) && t.at.y - g < CUES.shadow.maxDepth) {
          const s = CUES.shadow.size[t.kind] ?? 2.5;
          m.makeScale(s, 1, s * 0.7);
          m.setPosition(t.at.x, g + 0.05, t.at.z);
          this.shadows.setMatrixAt(n++, m);
        }
      }
    }
    for (const id of [...this.known.keys()]) if (!seen.has(id)) this.known.delete(id);
    this.shadows.count = n;
    this.shadows.instanceMatrix.needsUpdate = true;
    (this.shadows.material as THREE.MeshBasicMaterial).opacity = threats.some((t) => t.hot && SWIMMERS.has(t.kind)) ? CUES.shadow.hotOpacity : CUES.shadow.opacity;
  }

  /** Startle pose for the player's fish: extra yaw (rad), roll (rad) and tail amplitude, all 0 when calm. */
  startle(): { yaw: number; roll: number; tail: number } {
    if (this.startleLeft <= 0) return { yaw: 0, roll: 0, tail: 0 };
    const s = CAMERA.startle;
    const k = this.startleLeft / s.length; // 1 at the flinch, 0 when done
    const env = Math.sin(Math.PI * Math.min(1, (1 - k) * 3)) * k + k * k * 0.3; // fast in, slower out
    return { yaw: this.startleSide * s.yaw * env, roll: this.startleSide * s.roll * env, tail: s.tail * k };
  }

  /** Swap the scent instanced mesh between specks and soft sprites. */
  applyLook(meshes: Map<string, { mesh: THREE.InstancedMesh }>): void {
    for (const kind of ['scent']) {
      const inst = meshes.get(kind);
      if (!inst) continue;
      let d = this.defaults.get(kind);
      if (!d || (d.geo !== inst.mesh.geometry && inst.mesh.geometry !== this.softGeo)) {
        d = { geo: inst.mesh.geometry, mat: inst.mesh.material };
        this.defaults.set(kind, d);
      }
      const geo = this.doc ? this.softGeo : d.geo;
      const mat = this.doc ? this.scentMat : d.mat;
      if (inst.mesh.geometry !== geo) inst.mesh.geometry = geo;
      if (inst.mesh.material !== mat) inst.mesh.material = mat;
    }
  }

  /** Documentary view: pose a scent entity as a soft sprite facing the camera. */
  writeSoft(w: World, e: Entity, camera: THREE.Camera, q: THREE.Quaternion, s: THREE.Vector3): void {
    q.copy(camera.quaternion);
    const flick = 1 + CUES.scent.flicker * Math.sin(w.time * 3.1 + e.id * 1.7);
    const base = Math.max(0.3, (e.timer ?? 1) / 9) * (0.4 + 0.6 * (e.value ?? 1));
    s.setScalar(CUES.scent.size * 0.09 * base * flick);
  }
}
