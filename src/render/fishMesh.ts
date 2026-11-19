/**
 * Procedural salmon (and other fish) built by lofting elliptical cross-sections
 * along the body. Swimming is a travelling wave added in the vertex shader.
 * Shape and colour come from parameters, so traits and life stage change the
 * body without new assets.
 */
import * as THREE from 'three';

export type FishLook =
  | 'alevin'
  | 'fry'
  | 'smolt'
  | 'ocean'
  | 'returnSilver'
  | 'returnBlush'
  | 'spawnMale'
  | 'spawnFemale'
  | 'spawnJack'
  | 'trout'
  | 'orca'
  | 'seal'
  | 'shark'
  | 'herring';

export interface FishShape {
  /** Body depth multiplier (deep-bodied > 1). */
  depth: number;
  /** Hump height (spawning males). */
  hump: number;
  /** Hooked jaw length (spawning males). */
  kype: number;
  /** Yolk sac size (alevin). */
  yolk: number;
}

const ALONG = 44;
const AROUND = 18;

const col = (hex: number) => new THREE.Color(hex);

interface Palette {
  back: THREE.Color;
  side: THREE.Color;
  belly: THREE.Color;
  head?: THREE.Color;
  marks?: THREE.Color;
  patch?: THREE.Color;
}

const PALETTES: Record<FishLook, Palette> = {
  alevin: { back: col(0xb9a48e), side: col(0xd8c3ad), belly: col(0xf08a3c) },
  fry: { back: col(0x5d6b45), side: col(0x9aa784), belly: col(0xdfe3d6), marks: col(0x4b553a) },
  smolt: { back: col(0x3c5f6b), side: col(0xd7e1e4), belly: col(0xf4f6f6) },
  ocean: { back: col(0x2b4f73), side: col(0xc9d6dc), belly: col(0xf2f4f5) },
  returnSilver: { back: col(0x3f5868), side: col(0xcfd8dc), belly: col(0xf0f2f2) },
  returnBlush: { back: col(0x6a4a4a), side: col(0xc98f86), belly: col(0xe6d6d0), head: col(0x6f7a5a) },
  spawnMale: { back: col(0xa11f19), side: col(0xd2372b), belly: col(0xb84a3a), head: col(0x5e7029) },
  spawnFemale: { back: col(0x9e2a22), side: col(0xc8402f), belly: col(0xc56a55), head: col(0x6b7a3a) },
  spawnJack: { back: col(0x9c2d24), side: col(0xc74a37), belly: col(0xc77a62), head: col(0x6d7c3b) },
  trout: { back: col(0x4b5a36), side: col(0x9c9a6a), belly: col(0xe0d8b8), marks: col(0x2c2a1c) },
  orca: { back: col(0x0d0f12), side: col(0x15181c), belly: col(0xf0f2f2), patch: col(0xf0f2f2) },
  herring: { back: col(0x30566e), side: col(0xd8e2e6), belly: col(0xf5f7f7) },
  shark: { back: col(0x3b4c5c), side: col(0x6f8090), belly: col(0xe8ecee) },
  seal: { back: col(0x4a4f52), side: col(0x7d8285), belly: col(0xa9aaa6), marks: col(0x2e3133) },
};

/** u = 0 at the tail tip, 1 at the snout. */
function profile(u: number, s: FishShape, look: FishLook): { top: number; bottom: number; width: number } {
  const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.8);
  let top = 0.11 * body * s.depth;
  let bottom = 0.1 * body * s.depth;
  let width = 0.075 * body;
  // Caudal fin: tall and thin near the tail.
  if (u < 0.12) {
    const f = 1 - u / 0.12;
    top += 0.13 * f;
    bottom += 0.13 * f;
    width = Math.max(0.006, width * (1 - f));
  }
  // Dorsal fin.
  if (u > 0.5 && u < 0.62) top += 0.05 * Math.sin(((u - 0.5) / 0.12) * Math.PI);
  // Adipose fin: the small fleshy fin between the dorsal fin and the tail, present on wild salmon.
  if (look !== 'orca' && look !== 'seal' && look !== 'shark' && u > 0.2 && u < 0.26) top += 0.025 * Math.sin(((u - 0.2) / 0.06) * Math.PI);
  // Anal and pelvic fins.
  if (look !== 'orca' && u > 0.17 && u < 0.29) bottom += 0.035 * Math.sin(((u - 0.17) / 0.12) * Math.PI);
  if (look !== 'orca' && u > 0.44 && u < 0.52) bottom += 0.02 * Math.sin(((u - 0.44) / 0.08) * Math.PI);
  // Spawning hump.
  if (s.hump > 0 && u > 0.45 && u < 0.85) top += s.hump * 0.1 * Math.sin(((u - 0.45) / 0.4) * Math.PI);
  // Yolk sac.
  if (s.yolk > 0 && u > 0.45 && u < 0.85) bottom += s.yolk * 0.12 * Math.sin(((u - 0.45) / 0.4) * Math.PI);
  if (look === 'seal') {
    top *= 1.3;
    bottom *= 1.3;
    width *= 1.6;
  }
  if (look === 'shark') {
    top *= 1.1;
    width *= 1.2;
    if (u > 0.5 && u < 0.62) top += 0.1 * Math.sin(((u - 0.5) / 0.12) * Math.PI);
  }
  if (look === 'orca') {
    top *= 1.25;
    bottom *= 1.15;
    width *= 1.5;
    if (u > 0.5 && u < 0.62) top += 0.12 * Math.sin(((u - 0.5) / 0.12) * Math.PI);
  }
  return { top, bottom, width };
}

/** Advisor: tail shape and eye size change across the life cycle. */
const FORK: Partial<Record<FishLook, number>> = { alevin: 0.02, fry: 0.07, smolt: 0.07, herring: 0.07, ocean: 0.05, returnSilver: 0.05, returnBlush: 0.04, spawnFemale: 0.025, spawnMale: 0.02, spawnJack: 0.035, trout: 0.015 };
const EYE: Partial<Record<FishLook, number>> = { alevin: 1.9, fry: 1.6, smolt: 1.3, herring: 1.3, spawnMale: 0.85, spawnFemale: 0.95 };

function colorAt(u: number, v: number, pal: Palette, look: FishLook, out: THREE.Color): void {
  // v: -1 belly .. +1 back.
  if (v > 0.35) out.copy(pal.side).lerp(pal.back, Math.min(1, (v - 0.35) / 0.5));
  else if (v < -0.4) out.copy(pal.side).lerp(pal.belly, Math.min(1, (-v - 0.4) / 0.4));
  else out.copy(pal.side);
  if (pal.head && u > 0.8) out.lerp(pal.head, Math.min(1, (u - 0.8) / 0.06));
  if (pal.marks) {
    // Faint parr marks or trout spots along the side.
    const mark = look === 'trout' || look === 'seal' ? Math.sin(u * 70) * Math.sin(v * 9) > 0.75 : Math.abs(v) < 0.35 && Math.sin(u * 42) > 0.55;
    if (mark && u > 0.15 && u < 0.85) out.lerp(pal.marks, look === 'trout' ? 0.8 : 0.35);
  }
  if (pal.patch && u > 0.7 && u < 0.82 && v > 0.1 && v < 0.5) out.copy(pal.patch);
  // Eye: bigger in young fish.
  const eye = EYE[look] ?? 1;
  if (u > 0.915 - 0.02 * eye && u < 0.915 + 0.02 * eye && v > 0.3 - 0.15 * eye && v < 0.3 + 0.15 * eye) out.setHex(0x111111);
}

export function buildFishGeometry(shape: FishShape, look: FishLook): THREE.BufferGeometry {
  const pal = PALETTES[look];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= ALONG; i++) {
    const u = i / ALONG;
    const x = u - 0.5;
    const pr = profile(u, shape, look);
    for (let j = 0; j <= AROUND; j++) {
      const th = (j / AROUND) * Math.PI * 2;
      const sy = Math.sin(th);
      let y = sy > 0 ? pr.top * sy : pr.bottom * sy;
      let xx = x;
      // Kype: hook the snout down on spawning males.
      if (shape.kype > 0 && u > 0.88) {
        const k = (u - 0.88) / 0.12;
        y -= shape.kype * 0.05 * k * k;
        xx += shape.kype * 0.02 * k;
      }
      // Forked tail: the fin's upper and lower lobes reach further back than its middle.
      const fork = FORK[look] ?? 0;
      if (fork > 0 && u < 0.05) xx -= fork * (Math.abs(sy) - 0.4) * (1 - u / 0.05);
      positions.push(xx, y, pr.width * Math.cos(th));
      colorAt(u, sy, pal, look, c);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < ALONG; i++) {
    for (let j = 0; j < AROUND; j++) {
      const a = i * (AROUND + 1) + j;
      const b = a + AROUND + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export interface FishUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uFreq: { value: number };
}

/** Material with a swimming wave; the uniforms are shared through userData. */
export function fishMaterial(opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const uniforms: FishUniforms = { uTime: { value: 0 }, uAmp: { value: 0.06 }, uFreq: { value: 9 } };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.15,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: THREE.DoubleSide,
  });
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uFreq;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tailW = pow(clamp(0.6 - position.x, 0.0, 1.2), 2.0);
        transformed.z += uAmp * tailW * sin(uFreq * position.x - uTime);`,
      );
  };
  return m;
}

export function setSwim(mesh: THREE.Mesh, phase: number, amp: number): void {
  const u = (mesh.material as THREE.Material).userData.uniforms as FishUniforms | undefined;
  if (!u) return;
  u.uTime.value = phase;
  u.uAmp.value = amp;
}

export function createFish(shape: FishShape, look: FishLook, opts: { transparent?: boolean; opacity?: number } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(buildFishGeometry(shape, look), fishMaterial(opts));
  mesh.userData.look = look;
  mesh.userData.shapeKey = shapeKey(shape);
  return mesh;
}

export const shapeKey = (s: FishShape): string => [s.depth, s.hump, s.kype, s.yolk].map((n) => n.toFixed(2)).join(',');

export const DEFAULT_SHAPE: FishShape = { depth: 1, hump: 0, kype: 0, yolk: 0 };
