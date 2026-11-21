/**
 * The estuary's look at the end of the smolt run (render only; tuning in
 * estuaryConfig.ts): night into first light, water tinted by its salinity, a
 * shimmering halocline between the fresher top layer and the salt water
 * below, and the last parr marks fading from the player's smolt.
 */
import * as THREE from 'three';
import { haloclineDepth, salinityAt, salinityLayers } from '../sim/stages/estuary';
import type { SmoltView } from '../sim/stages/smolt';
import type { World } from '../sim/world';
import { ESTUARY } from './estuaryConfig';
import { NIGHT } from './nightConfig';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 at night, 1 at full first light, by how far along the run the fish is. */
export function dawnFraction(w: World): number {
  if (w.stageId !== 'smolt') return 0;
  const mouth = w.p.get('smolt.mouthStart');
  return smooth(mouth + ESTUARY.dawnFrom, w.p.get('smolt.estuaryStart') + ESTUARY.dawnTo, w.body.pos.x);
}

/** How strongly the last parr marks still show on the player's smolt (0 gone), in a few steps so the mesh rebuilds rarely. */
export function parrLeft(v: SmoltView | null): number {
  if (!v) return 0;
  const P = ESTUARY.parr;
  const k = 1 - smooth(P.from, v.readyDone, v.ready);
  return (Math.ceil(k * P.steps) / P.steps) * P.strength;
}

export interface DawnLight {
  fog: THREE.Color;
  fogDensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunStrength: number;
  sunDir: THREE.Vector3;
  water: number;
  shafts: number;
  shaftColor: THREE.Color;
  /** How much of the night's glow on the fish is left (1 at night). */
  glow: number;
}

const mixHex = (out: THREE.Color, a: number, b: number, t: number) => out.setHex(a).lerp(new THREE.Color(b), t);

/** The night of the smolt run blended toward first light (t 0..1). */
export function dawnLight(t: number, out?: DawnLight): DawnLight {
  const D = ESTUARY.dawn;
  const o = out ?? { fog: new THREE.Color(), fogDensity: 1, sky: new THREE.Color(), ground: new THREE.Color(), hemi: 0, sun: new THREE.Color(), sunStrength: 0, sunDir: new THREE.Vector3(), water: 0, shafts: 0, shaftColor: new THREE.Color(), glow: 1 };
  const m = (a: number, b: number) => a + (b - a) * t;
  mixHex(o.fog, NIGHT.fog, D.fog, t);
  o.fogDensity = m(NIGHT.fogDensity, D.fogDensity);
  mixHex(o.sky, NIGHT.sky, D.sky, t);
  mixHex(o.ground, NIGHT.ground, D.ground, t);
  o.hemi = m(NIGHT.hemi, D.hemi);
  mixHex(o.sun, NIGHT.moon, D.sun, t);
  o.sunStrength = m(NIGHT.moonStrength, D.sunStrength);
  o.sunDir.set(NIGHT.moonDir[0], NIGHT.moonDir[1], NIGHT.moonDir[2]).lerp(new THREE.Vector3(D.sunDir[0], D.sunDir[1], D.sunDir[2]), t).normalize();
  o.water = m(NIGHT.water, D.water);
  o.shafts = m(NIGHT.shafts, D.shafts);
  mixHex(o.shaftColor, NIGHT.shaftColor, D.shaftColor, t);
  o.glow = m(1, D.glowLeft);
  return o;
}

const FRESH = new THREE.Color(ESTUARY.freshTint);
const SALT = new THREE.Color(ESTUARY.saltTint);
const tmpC = new THREE.Color();

/** Tint the distance toward the water around the camera: tea-brown where fresh, green-grey where salt. */
export function tintBySalinity(fog: THREE.Color, w: World, camera: THREE.Vector3): void {
  if (w.stageId !== 'smolt') return;
  const mouth = w.p.get('smolt.mouthStart');
  const near = smooth(mouth - 10, mouth + 20, camera.x);
  if (near <= 0) return;
  const s = salinityAt(w.p, camera.x, Math.max(0, w.arena.surfaceY - camera.y));
  tmpC.copy(FRESH).lerp(SALT, s);
  // Keep the light level: the tint shifts the hue, and dawn sets the brightness.
  const l = Math.max(0.04, (fog.r + fog.g + fog.b) / 3);
  const tl = Math.max(0.01, (tmpC.r + tmpC.g + tmpC.b) / 3);
  tmpC.multiplyScalar(l / tl);
  fog.lerp(tmpC, ESTUARY.tint * near);
}

/** A soft noise texture for the halocline's shimmer (seeded, so every build is the same). */
function shimmerTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  let seed = 9173;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const grid = Array.from({ length: 8 * 8 }, rnd);
  const g = (i: number, j: number) => grid[((j & 7) << 3) | (i & 7)]!;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * 8;
      const fy = (y / n) * 8;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = fx - i;
      const v = fy - j;
      const s = (a: number) => a * a * (3 - 2 * a);
      const a = g(i, j) + (g(i + 1, j) - g(i, j)) * s(u);
      const b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * s(u);
      const val = a + (b - a) * s(v);
      // Thin bright streaks where the noise crosses the middle: the look of water of two densities mixing.
      const streak = Math.max(0, 1 - Math.abs(val - 0.5) * 9);
      const k = 4 * (y * n + x);
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(255 * streak);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * The halocline: a faint shimmering sheet at the boundary between the fresher top layer and the salt water
 * below, from the river mouth to the sea end, following the sim's halocline depth. Its opacity follows the
 * salinity step across it, so it fades where the layers have mixed.
 */
export function buildHalocline(w: World): THREE.Mesh | null {
  if (w.stageId !== 'smolt') return null;
  const p = w.p;
  const H = ESTUARY.halocline;
  const x0 = p.get('smolt.mouthStart');
  const x1 = w.arena.max.x;
  const z = w.arena.max.z;
  const seg = H.segments;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color(H.colour);
  for (let i = 0; i <= seg; i++) {
    const x = x0 + ((x1 - x0) * i) / seg;
    const y = w.arena.surfaceY - haloclineDepth(p, x);
    const { top, bottom } = salinityLayers(p, x);
    // Faint at the river mouth's thin wedge, strongest where the step is biggest, fading at the far end.
    const a = Math.min(1, Math.max(0, bottom - top) * 2) * smooth(x0, x0 + 25, x) * (1 - smooth(x1 - 25, x1, x));
    for (const zz of [-z - 6, z + 6]) {
      pos.push(x, y, zz);
      col.push(c.r, c.g, c.b, a);
      uv.push(((x - x0) / (x1 - x0)) * H.repeat[0], zz > 0 ? H.repeat[1] : 0);
    }
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({
    map: shimmerTexture(),
    vertexColors: true,
    transparent: true,
    opacity: H.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'halocline';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

/** Drift the halocline's shimmer. */
export function updateHalocline(mesh: THREE.Mesh | null, dt: number): void {
  if (!mesh) return;
  const map = (mesh.material as THREE.MeshBasicMaterial).map;
  if (map) {
    map.offset.x += ESTUARY.halocline.drift * dt;
    map.offset.y += ESTUARY.halocline.drift * 0.4 * dt;
  }
}
