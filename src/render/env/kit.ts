/**
 * Building blocks for the procedural places: a seeded random source, shared
 * materials (caustics on everything below the surface, vertex-shader sway for
 * plants and roots), rock and plant geometry, heightfield terrain and an
 * instanced scatter helper. Render only: nothing here touches the simulation.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise3 } from '../geo';
import { quality } from '../quality';
import { sharedWater } from '../water';

/** 0 = low, 1 = medium, 2 = high. Graphics quality presets map onto this. */
export type Detail = 0 | 1 | 2;

/** Mulberry32: a small seeded generator, so a place looks the same every time it is built. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (r: () => number, a: number, b: number): number => a + (b - a) * r();

/** Integer hash to 0..1 (cheap, no trigonometry). */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in 0..1. */
export function noise2(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise, centred on 0 (about -1..1). */
export function fbm(x: number, z: number, octaves = 3, seed = 0): number {
  let v = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += (noise2(x * f + i * 17.3, z * f - i * 9.1, seed * 31 + i) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const CAUSTIC_GLSL = /* glsl */ `
float hwEnvCaustic(vec2 p, float t) {
  vec2 q = p * 0.55;
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.7 + t * 0.9 + fi), cos(q.x * 1.3 - t * 0.7 + fi * 1.3));
    v += abs(sin(q.x + q.y));
  }
  return pow(clamp(1.0 - v / 3.0, 0.0, 1.0), 5.0) * 4.0;
}
`;

export interface EnvMaterialOpts {
  /** Sway driven by the `aSway` attribute (0 at the root, 1 at the tip). */
  sway?: { amp: number; freq: number; flowX?: number; flowZ?: number };
  /** Caustic light on upward faces below the surface. */
  caustics?: number;
  /** Unused by the Lambert material; kept so callers can state intent. */
  roughness?: number;
  side?: THREE.Side;
  emissive?: number;
  flatShading?: boolean;
  /** Fine mottling in the fragment shader (gravel, sand), independent of mesh density: strength and features per unit. */
  grain?: { amount: number; scale: number };
}

/**
 * The one material family for scenery: vertex colours (and instance colours),
 * optional caustics that work with instancing, and optional sway. Settings
 * are uniforms and defines, so one shader program serves every place.
 */
export function envMaterial(opts: EnvMaterialOpts = {}): THREE.MeshLambertMaterial {
  // Lambert: scenery is matte anyway, and it is much cheaper per pixel than the PBR material.
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
  });
  const defines: Record<string, string> = {};
  if (opts.sway) defines.HW_SWAY = '';
  // Caustics follow the graphics preset: off on Low, where they were the biggest cost.
  if (opts.caustics && quality.caustics > 0) defines.HW_CAUSTICS = '';
  if (opts.grain) defines.HW_GRAIN = '';
  // Keep any defines the material has and add ours.
  const own = m as unknown as { defines?: Record<string, string> };
  own.defines = { ...(own.defines ?? {}), ...defines };
  const uniforms = {
    uSwayAmp: { value: opts.sway?.amp ?? 0 },
    uSwayFreq: { value: opts.sway?.freq ?? 1 },
    uFlow: { value: new THREE.Vector2(opts.sway?.flowX ?? 0, opts.sway?.flowZ ?? 0) },
    uCaustics: { value: opts.caustics ?? 0 },
    uGrain: { value: opts.grain?.amount ?? 0 },
    uGrainScale: { value: opts.grain?.scale ?? 1 },
  };
  m.userData.env = uniforms;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedWater.uTime;
    shader.uniforms.uLight = sharedWater.uLight;
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHwWorld;
        varying float vHwUp;
        uniform float uTime;
        #ifdef HW_SWAY
        attribute float aSway;
        uniform float uSwayAmp;
        uniform float uSwayFreq;
        uniform vec2 uFlow;
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef HW_SWAY
        {
          vec3 hwRoot = position;
          #ifdef USE_INSTANCING
          hwRoot = instanceMatrix[3].xyz;
          #endif
          hwRoot = (modelMatrix * vec4(hwRoot, 1.0)).xyz;
          float hwPh = uTime * uSwayFreq + dot(hwRoot.xz, vec2(0.41, 0.27));
          float hwK = aSway * aSway;
          float hwGust = 0.75 + 0.25 * sin(uTime * 0.37 + hwRoot.x * 0.05);
          transformed.x += (sin(hwPh) * uSwayAmp * hwGust + uFlow.x) * hwK;
          transformed.z += (cos(hwPh * 0.83 + 1.3) * uSwayAmp * 0.7 * hwGust + uFlow.y) * hwK;
          transformed.y -= 0.25 * (abs(uFlow.x) + abs(uFlow.y)) * hwK * hwK;
        }
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 hwW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          hwW = instanceMatrix * hwW;
          #endif
          vHwWorld = (modelMatrix * hwW).xyz;
          vHwUp = inverseTransformDirection(transformedNormal, viewMatrix).y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHwWorld;
        varying float vHwUp;
        uniform float uTime;
        uniform float uLight;
        uniform float uCaustics;
        uniform float uGrain;
        uniform float uGrainScale;
        float hwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float hwVN(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hwHash(i), hwHash(i + vec2(1.0, 0.0)), u.x), mix(hwHash(i + vec2(0.0, 1.0)), hwHash(i + 1.0), u.x), u.y);
        }
        ${CAUSTIC_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef HW_GRAIN
        {
          vec2 gp = vHwWorld.xz * uGrainScale + vec2(vHwWorld.y * 0.71, -vHwWorld.y * 0.53) * uGrainScale;
          float g = (hwVN(gp) - 0.5) * 1.0 + (hwVN(gp * 2.7 + 7.3) - 0.5) * 0.55 + (hwVN(gp * 0.21 + 3.1) - 0.5) * 0.9;
          diffuseColor.rgb *= 1.0 + uGrain * g;
        }
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef HW_CAUSTICS
        {
          float hwDepth = max(0.0, -vHwWorld.y);
          float hwUp = clamp(vHwUp, 0.0, 1.0);
          float hwC = hwEnvCaustic(vHwWorld.xz, uTime) * exp(-hwDepth * 0.09) * uLight * step(vHwWorld.y, 0.0);
          totalEmissiveRadiance += vec3(0.55, 0.62, 0.55) * hwC * 0.22 * uCaustics * diffuseColor.rgb * 2.2 * hwUp;
        }
        #endif`,
      );
  };
  // Same GLSL for every instance; the defines split the programs.
  m.customProgramCacheKey = () => 'hw-env';
  return m;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * A rock: a noisy, squashed icosphere with vertex colours (darker in the
 * crevices and underneath, a little lighter on top). Unit size.
 */
/** Icosphere subdivision for rocks: big rocks get more, small stones less. */
export const rockLevel = (detail: Detail, big: boolean): number => (big ? (detail === 2 ? 2 : 1) : detail === 0 ? 0 : 1);

export function rockGeometry(seed: number, level: number, opts: { flat?: number; rough?: number; base: number; top?: number; moss?: number } = { base: 0x77705f }): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, level);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rough = opts.rough ?? 0.22;
  const flat = opts.flat ?? 0.65;
  const cols: number[] = [];
  const base = new THREE.Color(opts.base);
  const top = new THREE.Color(opts.top ?? opts.base).offsetHSL(0, -0.02, 0.06);
  const moss = new THREE.Color(0x4f5a2c);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6) - 0.5;
    const n2 = noise3(v.x * 4.1, v.y * 4.1 + seed * 0.7, v.z * 4.1) - 0.5;
    // Facets: pull vertices toward a few planes so stones read as broken, not blobby.
    const r = 1 + rough * (n * 1.6 + n2 * 0.5);
    v.multiplyScalar(r);
    v.y *= flat;
    if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.4; // flatter underside, sits on the bed
    pos.setXYZ(i, v.x, v.y, v.z);
    const up = Math.max(0, v.y / flat);
    c.copy(base).lerp(top, up * 0.8);
    c.multiplyScalar(0.82 + 0.35 * (n + 0.5) * 0.6 + 0.12 * n2);
    if (opts.moss) c.lerp(moss, Math.min(1, opts.moss * Math.max(0, up - 0.25) * (0.6 + n2 * 1.5)));
    if (v.y < 0) c.multiplyScalar(0.7);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A clump of ribbon blades (pondweed, sedge, eelgrass): unit height, with
 * `aSway` running 0 at the root to 1 at the tip.
 */
export function bladeClumpGeometry(rand: () => number, opts: { blades: number; width: number; segs: number; spread: number; bend: number; base: number; tip: number; leafy?: boolean }): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const sway: number[] = [];
  const idx: number[] = [];
  const cb = new THREE.Color(opts.base);
  const ct = new THREE.Color(opts.tip);
  const c = new THREE.Color();
  for (let b = 0; b < opts.blades; b++) {
    const a = rand() * Math.PI * 2;
    const ox = Math.cos(a) * opts.spread * rand();
    const oz = Math.sin(a) * opts.spread * rand();
    const h = 0.55 + 0.45 * rand();
    const lean = (rand() - 0.5) * opts.bend;
    const face = rand() * Math.PI;
    const fx = Math.cos(face);
    const fz = Math.sin(face);
    const w0 = opts.width * (0.6 + 0.6 * rand());
    const start = pos.length / 3;
    const shade = 0.8 + 0.35 * rand();
    for (let s = 0; s <= opts.segs; s++) {
      const t = s / opts.segs;
      const y = t * h;
      const curl = lean * t * t;
      const cx = ox + Math.cos(a) * curl;
      const cz = oz + Math.sin(a) * curl;
      // Leafy weeds widen in the middle; grasses taper.
      const w = w0 * (opts.leafy ? 0.35 + Math.sin(Math.PI * Math.min(1, t * 1.15)) : 1 - 0.85 * t);
      pos.push(cx - fx * w, y, cz - fz * w, cx + fx * w, y, cz + fz * w);
      c.copy(cb).lerp(ct, t).multiplyScalar(shade * (0.75 + 0.25 * t));
      col.push(c.r, c.g, c.b, c.r * 0.92, c.g * 0.92, c.b * 0.92);
      sway.push(t * h, t * h);
    }
    for (let s = 0; s < opts.segs; s++) {
      const i0 = start + s * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Accumulates tubes (roots, branches, logs) into one geometry with colour and
 * sway weights, so a whole tangle is a single draw call.
 */
export class TubeBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private sway: number[] = [];
  private idx: number[] = [];

  /** A tube through points, radius per point, sway weight per point. */
  tube(points: THREE.Vector3[], radii: number[], colour: THREE.Color, swayW: number[] | null, sides = 5, capEnd = false): void {
    const n = points.length;
    if (n < 2) return;
    const start = this.pos.length / 3;
    const t = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const bin = new THREE.Vector3();
    const ref = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const a = points[Math.max(0, i - 1)]!;
      const b = points[Math.min(n - 1, i + 1)]!;
      t.subVectors(b, a).normalize();
      if (Math.abs(t.dot(ref)) > 0.95) ref.set(1, 0, 0);
      nrm.crossVectors(t, ref).normalize();
      bin.crossVectors(t, nrm).normalize();
      const r = radii[i] ?? radii[radii.length - 1] ?? 0.05;
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        this.pos.push(p.x + (nrm.x * ca + bin.x * sa) * r, p.y + (nrm.y * ca + bin.y * sa) * r, p.z + (nrm.z * ca + bin.z * sa) * r);
        // Bark: darker underneath, faint stripes.
        const shade = 0.78 + 0.22 * Math.max(0, nrm.y * ca + bin.y * sa) + 0.06 * Math.sin(i * 2.1 + s * 1.7);
        c.copy(colour).multiplyScalar(shade);
        this.col.push(c.r, c.g, c.b);
        this.sway.push(swayW ? swayW[i] ?? 0 : 0);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = start + i * sides + s;
        const b = start + i * sides + ((s + 1) % sides);
        const c2 = a + sides;
        const d = b + sides;
        this.idx.push(a, c2, b, b, c2, d);
      }
    }
    if (capEnd) {
      const last = points[n - 1]!;
      const centre = this.pos.length / 3;
      this.pos.push(last.x, last.y, last.z);
      c.copy(colour).multiplyScalar(1.25);
      this.col.push(c.r, c.g, c.b);
      this.sway.push(swayW ? swayW[n - 1] ?? 0 : 0);
      const ring = start + (n - 1) * sides;
      for (let s = 0; s < sides; s++) this.idx.push(ring + s, ring + ((s + 1) % sides), centre);
    }
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/**
 * A wandering root or rootlet hanging from (x, y, z) downward, with sway that
 * grows toward the tip. Returns the points so callers can branch from them.
 */
export function hangingRoot(tb: TubeBuilder, rand: () => number, from: THREE.Vector3, length: number, radius: number, colour: THREE.Color, drift: THREE.Vector2, segs = 6): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  const sw: number[] = [];
  const p = from.clone();
  const d = new THREE.Vector3(drift.x * 0.3, -1, drift.y * 0.3).normalize();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(p.clone());
    radii.push(radius * (1 - 0.8 * t));
    sw.push(t);
    d.x += (rand() - 0.5) * 0.5 + drift.x * 0.15;
    d.z += (rand() - 0.5) * 0.5 + drift.y * 0.15;
    d.y = -1 + 0.3 * rand();
    d.normalize();
    p.addScaledVector(d, length / segs);
  }
  tb.tube(pts, radii, colour, sw, 4);
  return pts;
}

/** A log with a few broken branch stubs; lies along +x from the origin, radius r, length len. */
export function addLog(tb: TubeBuilder, rand: () => number, m: THREE.Matrix4, len: number, r: number, colour: THREE.Color, stubs = 3): void {
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  const segs = Math.max(4, Math.round(len / 0.8));
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(t * len, Math.sin(t * 3 + rand()) * r * 0.15, Math.sin(t * 2.3) * r * 0.25).applyMatrix4(m));
    radii.push(r * (1 - 0.35 * t) * (0.92 + 0.12 * rand()));
  }
  tb.tube(pts, radii, colour, null, 7, true);
  for (let s = 0; s < stubs; s++) {
    const t = 0.2 + 0.7 * rand();
    const a = rand() * Math.PI * 2;
    const base = new THREE.Vector3(t * len, 0, 0);
    const dir = new THREE.Vector3(0.4, Math.cos(a), Math.sin(a)).normalize();
    const l = r * (1.5 + 3 * rand());
    const tip = base.clone().addScaledVector(dir, l);
    // The middle is taken before any point is moved into place (applyMatrix4 changes the vector itself).
    const mid = base.clone().lerp(tip, 0.5);
    tb.tube([base.applyMatrix4(m), mid.applyMatrix4(m), tip.applyMatrix4(m)], [r * 0.3, r * 0.2, r * 0.08], colour, null, 4);
  }
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/** Sorted, de-duplicated grid lines from a regular spacing plus required breakpoints (e.g. wall edges). */
export function gridLines(a: number, b: number, step: number, breaks: number[] = []): number[] {
  const out: number[] = [];
  for (let v = a; v < b; v += step) out.push(v);
  out.push(b);
  for (const v of breaks) if (v > a && v < b) out.push(v);
  out.sort((p, q) => p - q);
  return out.filter((v, i) => i === 0 || v - out[i - 1]! > 1e-4);
}

/** Joins runs of grid lines with different spacing into one sorted list. */
export const joinLines = (...runs: number[][]): number[] =>
  runs
    .flat()
    .sort((p, q) => p - q)
    .filter((v, i, arr) => i === 0 || v - arr[i - 1]! > 1e-4);

/**
 * A heightfield over a rectilinear grid, coloured per vertex, split into
 * chunks along x (about `chunk` units each) so chunks out of view or lost
 * in the fog are skipped. Normals come from the height function itself, so
 * there are no seams between chunks.
 */
export function terrain(
  xs: number[],
  zs: number[],
  height: (x: number, z: number) => number,
  colour: (x: number, z: number, h: number, out: THREE.Color, steep: number) => void,
  material: THREE.Material,
  chunk = 24,
  /** Quads entirely above this height are dropped: from under the water they can't be seen. */
  cutAbove = 0.6,
): THREE.Mesh[] {
  // Heights once for the whole grid; normals from the grid, so chunks share them at their seams.
  const nx = xs.length;
  const nz = zs.length;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = height(xs[i]!, zs[j]!);
  const N = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(nz - 1, j + 1);
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nx - 1, i + 1);
      const gx = (H[j * nx + i1]! - H[j * nx + i0]!) / (xs[i1]! - xs[i0]!);
      const gz = (H[j1 * nx + i]! - H[j0 * nx + i]!) / (zs[j1]! - zs[j0]!);
      const l = Math.hypot(gx, 1, gz);
      const k = (j * nx + i) * 3;
      N[k] = -gx / l;
      N[k + 1] = 1 / l;
      N[k + 2] = -gz / l;
    }
  }
  const out: THREE.Mesh[] = [];
  let i0 = 0;
  while (i0 < nx - 1) {
    let i1 = i0 + 1;
    while (i1 < nx - 1 && xs[i1]! - xs[i0]! < chunk) i1++;
    const piece = terrainPiece(xs, zs, i0, i1, H, N, colour, material, cutAbove);
    if (piece) {
      // The camera tests terrain through the ground function, not by ray (sceneryProbe.ts).
      piece.userData.terrain = true;
      out.push(piece);
    }
    i0 = i1;
  }
  return out;
}

function terrainPiece(
  xs: number[],
  zs: number[],
  i0: number,
  i1: number,
  H: Float32Array,
  N: Float32Array,
  colour: (x: number, z: number, h: number, out: THREE.Color, steep: number) => void,
  material: THREE.Material,
  cutAbove: number,
): THREE.Mesh | null {
  const full = xs.length;
  const nx = i1 - i0 + 1;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const nrm = new Float32Array(nx * nz * 3);
  const c = new THREE.Color();
  let k = 0;
  for (let j = 0; j < nz; j++) {
    const z = zs[j]!;
    for (let i = 0; i < nx; i++) {
      const g = j * full + i0 + i;
      const x = xs[i0 + i]!;
      const h = H[g]!;
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
      nrm[k] = N[g * 3]!;
      nrm[k + 1] = N[g * 3 + 1]!;
      nrm[k + 2] = N[g * 3 + 2]!;
      colour(x, z, h, c, 1 - nrm[k + 1]!);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
      k += 3;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const d = a + nx;
      const f = d + 1;
      if (Math.min(pos[a * 3 + 1]!, pos[b * 3 + 1]!, pos[d * 3 + 1]!, pos[f * 3 + 1]!) > cutAbove) continue;
      // Alternate the diagonal for a less regular look.
      if ((i + j) % 2 === 0) idx.push(a, d, b, b, d, f);
      else idx.push(a, d, f, a, f, b);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, material);
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Uniform or per-axis scale. */
  s: number | [number, number, number];
  yaw?: number;
  tilt?: number;
  colour?: THREE.Color;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** One instanced draw call for many copies of a geometry. */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Placement[]): THREE.InstancedMesh | null {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    tmpP.set(it.x, it.y, it.z);
    tmpE.set(it.tilt ?? 0, it.yaw ?? 0, (it.tilt ?? 0) * 0.6, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    if (typeof it.s === 'number') tmpS.setScalar(it.s);
    else tmpS.set(it.s[0], it.s[1], it.s[2]);
    mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    if (it.colour) mesh.setColorAt(i, it.colour);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Instanced copies split into square cells of `cell` units, so each cell can be culled on its own. */
export function instancedCells(geo: THREE.BufferGeometry, mat: THREE.Material, items: Placement[], cell = 24): THREE.InstancedMesh[] {
  const cells = new Map<string, Placement[]>();
  for (const it of items) {
    // Wholly above the water: never seen from below.
    const sy = typeof it.s === 'number' ? it.s : Math.abs(it.s[1]);
    if (it.y - sy * 0.8 > 0.15 && !(typeof it.s !== 'number' && it.s[1] < 0)) continue;
    const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(it);
  }
  const out: THREE.InstancedMesh[] = [];
  for (const list of cells.values()) {
    const m = instanced(geo, mat, list);
    if (m) out.push(m);
  }
  return out;
}

/**
 * A stone's colour around lightness l: mostly greys and browns close to the
 * bed, an occasional pale granite or rusty stone for variety.
 */
export function stoneTint(rand: () => number, l: number): THREE.Color {
  const r = rand();
  const hue = r < 0.12 ? 0.05 + 0.03 * rand() : 0.09 + 0.07 * rand();
  const sat = r < 0.12 ? 0.25 + 0.1 * rand() : 0.05 + 0.1 * rand();
  const light = l * (r > 0.9 ? 1.35 : 0.75 + 0.4 * rand());
  return new THREE.Color().setHSL(hue, sat, light);
}

/** Scale a count by detail level: low keeps 40%, medium 70%. */
export const byDetail = (n: number, detail: Detail): number => Math.max(1, Math.round(n * (detail === 2 ? 1 : detail === 1 ? 0.7 : 0.4)));

/**
 * Hides scenery pieces that are fully lost in the fog. Underwater the view
 * ends at the fog, so this cuts most of the work in long arenas.
 */
export class FogCull {
  private items: { obj: THREE.Object3D; c: THREE.Vector3; r: number }[] = [];

  add(...objs: THREE.Object3D[]): void {
    for (const obj of objs) {
      const mesh = obj as THREE.Mesh;
      const inst = obj as THREE.InstancedMesh;
      const sphere = inst.isInstancedMesh ? inst.boundingSphere : mesh.geometry?.boundingSphere;
      if (!sphere) continue;
      this.items.push({ obj, c: sphere.center.clone(), r: sphere.radius });
    }
  }

  update(camera: THREE.Camera, density: number): void {
    // exp(-(density * d)^2) < 0.015: past here the fog is opaque.
    const limit = 2.05 / Math.max(0.005, density);
    const p = camera.position;
    for (const it of this.items) it.obj.visible = it.c.distanceTo(p) - it.r < limit;
  }
}
