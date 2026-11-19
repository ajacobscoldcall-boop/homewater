/**
 * Small helpers for building animals in code: a vertex-coloured geometry
 * builder, lofts (rings swept along an axis), flat fin patches and spot decals.
 * Everything one animal needs is merged into as few meshes as possible.
 */
import * as THREE from 'three';

export const col = (hex: number): THREE.Color => new THREE.Color(hex);

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();

/**
 * Accumulates positions, vertex colours and a two-channel "flex" attribute
 * (aFin: x = trailing median fin, y = paired fin) into one indexed geometry.
 * An optional matrix transforms everything added while it is set.
 */
export class GeoBuilder {
  private pos: number[] = [];
  private colr: number[] = [];
  private fin: number[] = [];
  private idx: number[] = [];
  matrix: THREE.Matrix4 | null = null;

  get count(): number {
    return this.pos.length / 3;
  }

  v(x: number, y: number, z: number, c: THREE.Color, fx = 0, fy = 0): number {
    tmpV.set(x, y, z);
    if (this.matrix) tmpV.applyMatrix4(this.matrix);
    this.pos.push(tmpV.x, tmpV.y, tmpV.z);
    this.colr.push(c.r, c.g, c.b);
    this.fin.push(fx, fy);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** A rows x cols vertex grid; f returns each vertex. wrap closes the columns into a tube. */
  grid(rows: number, cols: number, f: (i: number, j: number, out: GridVertex) => void): number {
    const start = this.count;
    const gv: GridVertex = { p: new THREE.Vector3(), c: new THREE.Color(), fx: 0, fy: 0 };
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= cols; j++) {
        gv.fx = 0;
        gv.fy = 0;
        f(i, j, gv);
        this.v(gv.p.x, gv.p.y, gv.p.z, gv.c, gv.fx, gv.fy);
      }
    }
    const stride = cols + 1;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = start + i * stride + j;
        const b = a + stride;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return start;
  }

  /** Append a three.js geometry, painted by a colour or a function of position. */
  add(geo: THREE.BufferGeometry, paint: THREE.Color | ((p: THREE.Vector3, out: THREE.Color) => void), m?: THREE.Matrix4, fx = 0, fy = 0): void {
    const g = geo;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const base = this.count;
    const c = new THREE.Color();
    const prev = this.matrix;
    if (m) this.matrix = prev ? prev.clone().multiply(m) : m;
    for (let i = 0; i < p.count; i++) {
      tmpN.set(p.getX(i), p.getY(i), p.getZ(i));
      if (typeof paint === 'function') paint(tmpN, c);
      else c.copy(paint);
      this.v(tmpN.x, tmpN.y, tmpN.z, c, fx, fy);
    }
    this.matrix = prev;
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    geo.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('aFin', new THREE.Float32BufferAttribute(this.fin, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export interface GridVertex {
  p: THREE.Vector3;
  c: THREE.Color;
  fx: number;
  fy: number;
}

/** One cross-section of a loft along x: centre (y, z), half-heights above/below and half-width. */
export interface Ring {
  x: number;
  y: number;
  z?: number;
  top: number;
  bottom: number;
  width: number;
}

export interface LoftOpts {
  /** Exponent on the sides: < 1 fills the cross-section out towards a rounded box. */
  fullness?: number;
  /** Close the ends with a fan. */
  caps?: boolean;
  /** Per-vertex flex weights. */
  flex?: (t: number, s: number) => [number, number];
  /** Tilt each ring to follow the slope of the centre line (necks, tails). */
  follow?: boolean;
}

/**
 * Sweep rings along x. t runs 0..1 along the loft; s = sin(angle) runs -1 (belly)
 * to +1 (back); the seam is on the belly where it is least visible.
 */
export function loft(
  b: GeoBuilder,
  along: number,
  around: number,
  ring: (t: number) => Ring,
  paint: (t: number, s: number, side: number, p: THREE.Vector3, out: THREE.Color) => void,
  opts: LoftOpts = {},
): void {
  const full = opts.fullness ?? 1;
  const rings: Ring[] = [];
  for (let i = 0; i <= along; i++) rings.push(ring(i / along));
  const tilt = rings.map((r, i) => {
    if (!opts.follow) return 0;
    const a = rings[Math.max(0, i - 1)]!;
    const c = rings[Math.min(along, i + 1)]!;
    return Math.atan2(c.y - a.y, c.x - a.x);
  });
  const start = b.grid(
    along,
    around,
    (i, j, o) => {
      const r = rings[i]!;
      const th = -Math.PI / 2 + (j / around) * Math.PI * 2;
      const s = Math.sin(th);
      const c = Math.cos(th);
      const dy = (s > 0 ? r.top : r.bottom) * Math.sign(s) * Math.pow(Math.abs(s), full);
      const z = (r.z ?? 0) + r.width * Math.sign(c) * Math.pow(Math.abs(c), full);
      const a = tilt[i]!;
      o.p.set(r.x - Math.sin(a) * dy, r.y + Math.cos(a) * dy, z);
      paint(i / along, s, Math.sign(c), o.p, o.c);
      if (opts.flex) [o.fx, o.fy] = opts.flex(i / along, s);
    },
  );
  if (opts.caps) {
    const stride = around + 1;
    for (const end of [0, along]) {
      const r = rings[end]!;
      const t = end / along;
      const cc = new THREE.Color();
      paint(t, 0, 0, tmpV.set(r.x, r.y, r.z ?? 0), cc);
      const centre = b.v(r.x, r.y, r.z ?? 0, cc);
      for (let j = 0; j < around; j++) {
        const a = start + end * stride + j;
        if (end === 0) b.tri(centre, a + 1, a);
        else b.tri(centre, a, a + 1);
      }
    }
  }
}

/** Point on a loft ring at vertical fraction s (-1..1) and side (+1/-1), plus outward normal. */
export function ringPoint(r: Ring, s: number, side: number, out: THREE.Vector3, normal?: THREE.Vector3): THREE.Vector3 {
  const c = Math.sqrt(Math.max(0, 1 - s * s));
  const h = s > 0 ? r.top : r.bottom;
  out.set(r.x, r.y + h * s, (r.z ?? 0) + side * r.width * c);
  if (normal) normal.set(0, (s / Math.max(1e-4, h)) * 1, (side * c) / Math.max(1e-4, r.width)).normalize();
  return out;
}

/**
 * A flat fin: a patch swept from a root curve to a tip curve, both functions
 * of s (0..1 along the fin base). Rays are drawn as faint stripes. flex sets
 * the aFin channel from root (0) to tip (1).
 */
export function finPatch(
  b: GeoBuilder,
  root: (s: number, out: THREE.Vector3) => void,
  tip: (s: number, out: THREE.Vector3) => void,
  paint: (s: number, r: number, out: THREE.Color) => void,
  opts: { rows?: number; cols?: number; flex?: 'median' | 'paired' | 'none'; rays?: number } = {},
): void {
  const rows = opts.rows ?? 4;
  const cols = opts.cols ?? 6;
  const rays = opts.rays ?? 0;
  const a = new THREE.Vector3();
  const t = new THREE.Vector3();
  b.grid(rows, cols, (i, j, o) => {
    const s = j / cols;
    const rr = i / rows;
    root(s, a);
    tip(s, t);
    o.p.lerpVectors(a, t, rr);
    paint(s, rr, o.c);
    if (rays > 0 && rr > 0.12) o.c.multiplyScalar(0.88 + 0.12 * Math.cos(s * rays * Math.PI * 2));
    const f = opts.flex ?? 'median';
    if (f === 'median') o.fx = rr;
    else if (f === 'paired') o.fy = rr;
  });
}

/** Small round decals (spots, eye patches) laid on a surface point along its normal. */
export function decal(b: GeoBuilder, at: THREE.Vector3, normal: THREE.Vector3, rx: number, ry: number, c: THREE.Color, segs = 8, lift = 0.0015, rot = 0, rim?: THREE.Color): void {
  const n = normal.clone().normalize();
  const up = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(up, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const cu = Math.cos(rot);
  const su = Math.sin(rot);
  const centre = at.clone().addScaledVector(n, lift);
  const ci = b.v(centre.x, centre.y, centre.z, c);
  const first = b.count;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    const p = centre
      .clone()
      .addScaledVector(u, x * cu - y * su)
      .addScaledVector(v, x * su + y * cu)
      .addScaledVector(n, -lift * 0.6);
    b.v(p.x, p.y, p.z, rim ?? c);
  }
  for (let k = 0; k < segs; k++) b.tri(ci, first + k, first + ((k + 1) % segs));
}

/** Catmull-Rom style smooth interpolation through keyframes [x, ...values]. */
export function keyed(keys: number[][], x: number, idx: number): number {
  if (x <= keys[0]![0]!) return keys[0]![idx]!;
  const last = keys[keys.length - 1]!;
  if (x >= last[0]!) return last[idx]!;
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1]![0]!) i++;
  const k0 = keys[Math.max(0, i - 1)]!;
  const k1 = keys[i]!;
  const k2 = keys[i + 1]!;
  const k3 = keys[Math.min(keys.length - 1, i + 2)]!;
  const t = (x - k1[0]!) / (k2[0]! - k1[0]!);
  const p0 = k0[idx]!;
  const p1 = k1[idx]!;
  const p2 = k2[idx]!;
  const p3 = k3[idx]!;
  // Monotone-ish Catmull-Rom; clamp so the curve never overshoots below zero.
  const m1 = ((p2 - p0) / Math.max(1e-6, k2[0]! - k0[0]!)) * (k2[0]! - k1[0]!);
  const m2 = ((p3 - p1) / Math.max(1e-6, k3[0]! - k1[0]!)) * (k2[0]! - k1[0]!);
  const t2 = t * t;
  const t3 = t2 * t;
  const v = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  return Math.max(Math.min(p1, p2) - 0.15 * Math.abs(p2 - p1), v);
}

export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Bell from a to b, 0 outside, 1 in the middle. */
export const bell = (a: number, b: number, x: number): number => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));

/** Deterministic hash noise in 0..1. */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in 0..1, for fur and skin mottling. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const n = (a: number, b: number, c: number) => hash3(xi + a, yi + b, zi + c);
  const x00 = n(0, 0, 0) + (n(1, 0, 0) - n(0, 0, 0)) * u;
  const x10 = n(0, 1, 0) + (n(1, 1, 0) - n(0, 1, 0)) * u;
  const x01 = n(0, 0, 1) + (n(1, 0, 1) - n(0, 0, 1)) * u;
  const x11 = n(0, 1, 1) + (n(1, 1, 1) - n(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/**
 * A thin strip lying on a loft surface (gill slits, mouth lines): it follows
 * the ring from s0 to s1 at plan position given by ring(), lifted along the normal.
 */
export function surfaceStrip(b: GeoBuilder, ringAt: (t: number) => Ring, s0: number, s1: number, side: number, halfWidth: number, c: THREE.Color, steps = 6, lift = 0.0012): void {
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  b.grid(steps, 1, (i, j, o) => {
    const t = i / steps;
    const s = s0 + (s1 - s0) * t;
    const r = ringAt(t);
    ringPoint(r, s, side, p, n);
    o.p.copy(p).addScaledVector(n, lift);
    o.p.x += (j === 0 ? -1 : 1) * halfWidth;
    o.c.copy(c);
  });
}

/**
 * A patch that lies on a loft surface, shaped in (x, s) space: a polar grid
 * around (x0, s0) whose edge is radius(angle) -> [dx, ds]. Gives clean,
 * smooth-edged markings (eye patches) without a dense body mesh.
 */
export function surfacePatch(
  b: GeoBuilder,
  ringAt: (x: number) => Ring,
  x0: number,
  s0: number,
  side: number,
  radius: (a: number) => [number, number],
  c: THREE.Color,
  opts: { rings?: number; segs?: number; lift?: number } = {},
): void {
  const rings = opts.rings ?? 4;
  const segs = opts.segs ?? 24;
  const lift = opts.lift ?? 0.0012;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const place = (x: number, s: number, out: THREE.Vector3) => {
    ringPoint(ringAt(x), Math.max(-0.995, Math.min(0.995, s)), side, p, n);
    out.copy(p).addScaledVector(n, lift);
  };
  const centre = new THREE.Vector3();
  place(x0, s0, centre);
  const ci = b.v(centre.x, centre.y, centre.z, c);
  const first = b.count;
  b.grid(rings - 1, segs, (i, j, o) => {
    const f = (i + 1) / rings;
    const a = (j / segs) * Math.PI * 2;
    const [dx, ds] = radius(a);
    place(x0 + dx * f, s0 + ds * f, o.p);
    o.c.copy(c);
  });
  // Wound the same way as the grid, so shared normals don't cancel.
  for (let j = 0; j < segs; j++) b.tri(ci, first + j + 1, first + j);
}
