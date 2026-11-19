/**
 * Procedural salmon (and other fish) built in code: a lofted body, separate
 * fin patches (dorsal, adipose, pectoral, pelvic, anal, forked caudal), a head
 * with a mouth line and jaws, a hooked kype and teeth on spawning males, and
 * an eye with iris and pupil. Everything is merged into one mesh with vertex
 * colours, so a fish is one draw call. Swimming is a travelling wave added in
 * the vertex shader; fins carry an extra flex weight so they trail the wave.
 *
 * Coordinates: the fish is about 1 unit long, snout towards +x (0.5), tail
 * towards -x, back towards +y.
 */
import * as THREE from 'three';
import { bell, col, decal, finPatch, GeoBuilder, hash3, keyed, loft, smooth, type Ring } from './geo';

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
  | 'char'
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

interface Palette {
  back: THREE.Color;
  side: THREE.Color;
  belly: THREE.Color;
  /** Head colour behind the snout (spawning: olive green). */
  head?: THREE.Color;
  /** Upper jaw and snout. */
  snout?: THREE.Color;
  /** Lower jaw. */
  jaw?: THREE.Color;
  /** Faint parr marks (fry). */
  parr?: THREE.Color;
  /** Body spots: species identification (char: pale on dark; trout: dark on light). */
  spots?: { color: THREE.Color; alt?: THREE.Color; count: number; size: number; minS: number; maxS: number };
  /** Fins. */
  fin: THREE.Color;
  finTip?: THREE.Color;
  caudal?: THREE.Color;
  /** Lower fins (pectoral, pelvic, anal). */
  lowerFin?: THREE.Color;
  /** White leading edge on the lower fins (char). */
  finEdge?: THREE.Color;
  iris: THREE.Color;
  /** Back-to-side boundary height (s), and how sharp it is. */
  line?: number;
}

/**
 * Sockeye colours by stage (advisor: no spots on sockeye; blush on the
 * return; red body and olive-green head only on the spawning grounds).
 */
const PALETTES: Record<FishLook, Palette> = {
  alevin: { back: col(0xa89886), side: col(0xcdbca8), belly: col(0xe9d9c8), fin: col(0xcfc2b2), iris: col(0x8f8a70) },
  fry: { back: col(0x56653f), side: col(0xb4bda6), belly: col(0xe6e9e0), parr: col(0x5a6644), fin: col(0xc8c6a8), iris: col(0xb9b07a), line: 0.3 },
  smolt: { back: col(0x2f5a62), side: col(0xd2dde1), belly: col(0xf4f6f6), fin: col(0xb8c4c6), finTip: col(0x3b4a4e), caudal: col(0x6d8086), iris: col(0xc8c3a0), line: 0.38 },
  ocean: { back: col(0x24557c), side: col(0xc3d0d8), belly: col(0xf2f4f5), fin: col(0x8fa0aa), finTip: col(0x2d3c48), caudal: col(0x4c6070), iris: col(0xc8c3a0), line: 0.42 },
  returnSilver: { back: col(0x2f5370), side: col(0xc8d2d6), belly: col(0xf0f2f2), fin: col(0x8d9aa2), finTip: col(0x2d3a44), caudal: col(0x4f5f6b), iris: col(0xc8c3a0), line: 0.42 },
  returnBlush: { back: col(0x5b4b55), side: col(0xc99a92), belly: col(0xe8dcd6), head: col(0x6f7b5c), fin: col(0x9a7a72), caudal: col(0x6b6556), iris: col(0xc4b88a), line: 0.4 },
  spawnMale: { back: col(0xa3201a), side: col(0xd03227), belly: col(0xb85448), head: col(0x55692c), snout: col(0x3e4d24), jaw: col(0xc7c7a2), fin: col(0xb8332a), caudal: col(0x4d5a2e), lowerFin: col(0xa8382c), iris: col(0xd2b45a), line: 0.5 },
  spawnFemale: { back: col(0x8f2a22), side: col(0xbf3f30), belly: col(0xc0786a), head: col(0x60703a), snout: col(0x4f5e30), jaw: col(0xb7b894), fin: col(0xa8382e), caudal: col(0x536038), lowerFin: col(0x9c4436), iris: col(0xd2b45a), line: 0.5 },
  spawnJack: { back: col(0x962c24), side: col(0xc64836), belly: col(0xc5806c), head: col(0x62723a), snout: col(0x4a582c), jaw: col(0xbcbc98), fin: col(0xad3a2e), caudal: col(0x56623a), lowerFin: col(0xa0402f), iris: col(0xd2b45a), line: 0.5 },
  // A brook-type trout: dark spots on a light body.
  trout: { back: col(0x4b5a36), side: col(0xa8a274), belly: col(0xe6dcbc), spots: { color: col(0x221d14), count: 70, size: 0.007, minS: -0.3, maxS: 0.95 }, fin: col(0x8a8458), iris: col(0xc9b46a), line: 0.3 },
  // Dolly Varden: pale spots on a dark olive back; white leading edges on the lower fins.
  char: { back: col(0x3e4a35), side: col(0x7c8468), belly: col(0xe8e2d0), spots: { color: col(0xf0dcae), alt: col(0xe58a5e), count: 72, size: 0.0095, minS: -0.45, maxS: 0.85 }, fin: col(0x5c6449), lowerFin: col(0xc7653e), finEdge: col(0xf6f3ea), caudal: col(0x4d5640), iris: col(0xc9b46a), line: 0.25 },
  orca: { back: col(0x0d0f12), side: col(0x15181c), belly: col(0xf0f2f2), fin: col(0x0d0f12), iris: col(0x222222) },
  herring: { back: col(0x2f566c), side: col(0xd5e0e5), belly: col(0xf5f7f7), fin: col(0xb0bcc2), iris: col(0xbbb59a), line: 0.4 },
  shark: { back: col(0x3b4c5c), side: col(0x6f8090), belly: col(0xe8ecee), fin: col(0x3b4c5c), iris: col(0x111111) },
  seal: { back: col(0x4a4f52), side: col(0x7d8285), belly: col(0xa9aaa6), fin: col(0x3a3e40), iris: col(0x111111) },
};

/** Advisor: tail shape and eye size change across the life cycle. */
const FORK: Partial<Record<FishLook, number>> = { alevin: 0.0, fry: 0.07, smolt: 0.07, herring: 0.08, ocean: 0.05, returnSilver: 0.05, returnBlush: 0.04, spawnFemale: 0.025, spawnMale: 0.015, spawnJack: 0.035, trout: 0.012, char: 0.022 };
const EYE: Partial<Record<FishLook, number>> = { alevin: 1.9, fry: 1.6, smolt: 1.3, herring: 1.3, spawnMale: 0.85, spawnFemale: 0.95, char: 1.05 };
/** Teeth: big on spawning males (advisor), smaller on jacks and females. */
const TEETH: Partial<Record<FishLook, number>> = { spawnMale: 1, spawnJack: 0.55, spawnFemale: 0.3, char: 0.2 };

/** Body keyframes for a salmon: [x, top, bottom, half-width, centre y]. Tail base at -0.40, snout at 0.50. */
const BODY: number[][] = [
  [-0.4, 0.033, 0.033, 0.015, 0],
  [-0.34, 0.04, 0.04, 0.021, 0],
  [-0.22, 0.064, 0.058, 0.034, 0],
  [-0.06, 0.092, 0.08, 0.047, 0],
  [0.1, 0.103, 0.088, 0.051, 0],
  [0.22, 0.095, 0.083, 0.05, -0.002],
  [0.3, 0.083, 0.073, 0.046, -0.004],
  [0.37, 0.067, 0.058, 0.039, -0.006],
  [0.43, 0.048, 0.042, 0.03, -0.008],
  [0.47, 0.031, 0.028, 0.021, -0.01],
  [0.495, 0.012, 0.012, 0.01, -0.011],
  [0.5, 0.002, 0.002, 0.002, -0.011],
];

interface Plan {
  look: FishLook;
  shape: FishShape;
  pal: Palette;
  /** Mouth corner (x before head stretch). */
  corner: number;
  /** Gape of the lower jaw, radians. */
  gape: number;
  lod: 'high' | 'low';
}

const XT = -0.4;
const XS = 0.5;

/** Head stretch and kype hook: map an x along the body plan to a real position. */
function headMap(xo: number, k: number): { x: number; dy: number } {
  const h = Math.max(0, xo - 0.28);
  const x = xo + h * 0.3 * k;
  const dy = -0.04 * k * Math.pow(smooth(0.38, 0.5, xo), 2);
  return { x, dy };
}

/** The main body ring at plan position xo (upper jaw included). */
function bodyRing(p: Plan, xo: number, forJaw = false): Ring {
  const s = p.shape;
  let top = keyed(BODY, xo, 1) * s.depth;
  let bottom = keyed(BODY, xo, 2) * s.depth;
  let width = keyed(BODY, xo, 3) * (0.85 + 0.15 * s.depth);
  let y = keyed(BODY, xo, 4);
  // Spawning hump: rises steeply behind the head, highest in front of the dorsal fin.
  if (s.hump > 0) top += s.hump * 0.075 * Math.pow(bell(-0.08, 0.34, xo), 1.3) * (xo > 0.18 ? 1 - 0.4 * smooth(0.18, 0.32, xo) : 1);
  // Yolk sac.
  if (s.yolk > 0) {
    const yb = bell(-0.05, 0.36, xo);
    bottom += s.yolk * 0.1 * yb;
    width += s.yolk * 0.045 * yb;
  }
  // Fry and alevin: bigger heads, rounder snouts.
  if (p.look === 'alevin' || p.look === 'fry') {
    const hb = smooth(0.2, 0.42, xo) * (1 - smooth(0.45, 0.5, xo));
    top += 0.012 * hb;
    bottom += 0.01 * hb;
  }
  if (p.look === 'char' || p.look === 'trout') {
    top *= 0.92;
    bottom *= 0.95;
    width *= 1.05;
  }
  // Upper jaw: behind the mouth corner the body is whole; forward of it the
  // underside rises to the mouth line and the lower jaw fills in beneath.
  if (!forJaw) {
    const m = smooth(p.corner - 0.025, p.corner + 0.01, xo);
    bottom = bottom * (1 - 0.68 * m);
  }
  const hm = headMap(xo, s.kype);
  y += hm.dy;
  return { x: hm.x, y, top, bottom, width };
}

function backSideBelly(p: Plan, s: number, out: THREE.Color): void {
  const pal = p.pal;
  const line = pal.line ?? 0.35;
  if (s > line - 0.15) out.copy(pal.side).lerp(pal.back, smooth(line - 0.15, line + 0.25, s));
  else if (s < -0.35) out.copy(pal.side).lerp(pal.belly, smooth(-0.35, -0.8, s));
  else out.copy(pal.side);
}

/** Gill cover edge: a backward-bulging curve. */
const opercle = (s: number): number => 0.3 - 0.018 * (1 - s * s);

function bodyColor(p: Plan, xo: number, s: number, side: number, out: THREE.Color): void {
  const pal = p.pal;
  backSideBelly(p, s, out);
  // Spawning and blush: the head behind the snout turns olive green.
  if (pal.head && xo > opercle(s) - 0.004) out.lerp(pal.head, p.look === 'returnBlush' ? 0.55 : 0.95);
  if (pal.snout && xo > 0.41 && s > -0.4) out.lerp(pal.snout, smooth(0.41, 0.46, xo));
  // Gill cover line.
  const op = opercle(s);
  if (Math.abs(xo - op) < 0.0045 && s > -0.75 && s < 0.65) out.multiplyScalar(pal.head ? 0.7 : 0.78);
  // Mouth line along the underside of the upper jaw.
  if (xo > p.corner - 0.005 && s < -0.82) out.multiplyScalar(0.45);
  // Parr marks: a few short, faint ovals along the side (fry only).
  if (pal.parr && xo > -0.3 && xo < 0.26) {
    const k = Math.round((xo + 0.3) / 0.062);
    const cx = -0.3 + k * 0.062;
    const d = ((xo - cx) / 0.016) ** 2 + ((s - 0.16) / 0.27) ** 2;
    if (d < 1) out.lerp(pal.parr, 0.24 * (1 - d * d));
  }
  // Silver sheen: a slightly brighter lateral band on silver fish.
  if (!pal.head && !pal.parr && !pal.spots && Math.abs(s - 0.05) < 0.25 && p.look !== 'alevin') out.lerp(col(0xffffff), 0.06);
  // Belly of the alevin shows the orange yolk.
  if (p.shape.yolk > 0) {
    const yb = bell(-0.05, 0.36, xo) * smooth(-0.1, -0.6, s);
    out.lerp(col(0xf08a3c), Math.min(1, yb * 1.3));
  }
  // Very faint mottling so large flat areas don't look plastic.
  const n = hash3(Math.round(xo * 160), Math.round(s * 14), side);
  out.multiplyScalar(0.97 + 0.05 * n);
}

function finColor(p: Plan, which: 'dorsal' | 'adipose' | 'caudal' | 'anal' | 'pelvic' | 'pectoral', s: number, r: number, out: THREE.Color): void {
  const pal = p.pal;
  const lower = which === 'anal' || which === 'pelvic' || which === 'pectoral';
  if (which === 'adipose') {
    backSideBelly(p, 0.7, out);
    if (pal.head) out.copy(pal.back);
    return;
  }
  out.copy(which === 'caudal' && pal.caudal ? pal.caudal : lower && pal.lowerFin ? pal.lowerFin : pal.fin);
  if (pal.finTip) out.lerp(pal.finTip, smooth(0.55, 1, r) * (which === 'caudal' ? 0.8 : 0.5));
  // Char: a bright white leading edge with a dark line behind it on the lower fins.
  if (pal.finEdge && lower) {
    if (s < 0.12) out.copy(pal.finEdge);
    else if (s < 0.2) out.setHex(0x1d1f18);
  }
  // Fins are thinner and darker towards the root on the spawning fish.
  if (pal.head) out.multiplyScalar(0.85 + 0.15 * r);
}

function addEye(b: GeoBuilder, p: Plan, side: number): void {
  const eye = EYE[p.look] ?? 1;
  const xo = 0.425 - 0.012 * (eye - 1);
  const r = bodyRing(p, xo);
  const re = 0.0105 * eye * (p.look === 'alevin' ? 1.1 : 1);
  const s = 0.3;
  const y = r.y + r.top * s;
  const c = Math.sqrt(1 - s * s);
  const centre = new THREE.Vector3(r.x, y, side * r.width * c);
  const n = new THREE.Vector3(0, s / r.top * 0.6, (side * c) / r.width).normalize();
  // Slightly forward-facing, as salmon eyes are.
  n.x += 0.12;
  n.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(up, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const phiMax = 1.05;
  const R = re / Math.sin(phiMax);
  const rings = p.lod === 'low' ? 2 : 5;
  const segs = p.lod === 'low' ? 8 : 14;
  const pupil = col(0x070707);
  const rim = col(0x2b2b26);
  b.grid(rings, segs, (i, j, o) => {
    const phi = (i / rings) * phiMax;
    const a = (j / segs) * Math.PI * 2;
    const lift = R * Math.cos(phi) - R * Math.cos(phiMax) + 0.0008;
    o.p.copy(centre).addScaledVector(n, lift).addScaledVector(u, Math.cos(a) * R * Math.sin(phi)).addScaledVector(v, Math.sin(a) * R * Math.sin(phi));
    const f = phi / phiMax;
    if (f < 0.44) o.c.copy(pupil);
    else if (f < 0.86) o.c.copy(p.pal.iris).multiplyScalar(0.8 + 0.35 * (f - 0.44));
    else o.c.copy(rim);
    // A tiny highlight dot keeps the eye alive under murky light.
    if (i === 1 && j === Math.round(segs * 0.15)) o.c.setHex(0xf2f2f2);
  });
}

/** Lower jaw, mouth interior and teeth. */
function addJaws(b: GeoBuilder, p: Plan, along: number, around: number): void {
  const k = p.shape.kype;
  const tipXo = 0.488 + 0.012 * k;
  const startXo = p.corner - 0.05;
  const pivotRing = bodyRing(p, p.corner, true);
  const pivot = new THREE.Vector3(pivotRing.x, pivotRing.y - pivotRing.bottom * 0.3, 0);
  const rot = new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(-p.gape))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, 0));
  const jawRing = (t: number): Ring => {
    const xo = startXo + (tipXo - startXo) * t;
    const r = bodyRing(p, Math.min(xo, 0.5), true);
    const full = r.bottom;
    const close = 1 - smooth(0.82, 1, t) * 0.92;
    // The lower jaw tip turns up a little on hooked males.
    const up = 0.018 * k * Math.pow(smooth(0.6, 1, t), 2);
    return { x: r.x - 0.004 * (1 - t), y: r.y - full * 0.62 + up, top: full * 0.31 * close, bottom: full * 0.4 * close, width: r.width * 0.93 * close };
  };
  const pal = p.pal;
  const prev = b.matrix;
  b.matrix = rot;
  loft(
    b,
    Math.max(6, Math.round(along * 0.25)),
    around,
    jawRing,
    (t, s, side, pos, out) => {
      const xo = startXo + (tipXo - startXo) * t;
      backSideBelly(p, -0.7 + 0.25 * s, out);
      if (pal.head && xo > opercle(s) - 0.004) out.copy(pal.head);
      if (pal.jaw) out.lerp(pal.jaw, smooth(0.3, 0.6, t) * 0.85);
      if (s > 0.8) out.multiplyScalar(0.5);
    },
    { caps: true },
  );
  // Teeth on the lower jaw, pointing up.
  const teeth = TEETH[p.look] ?? 0;
  const tc = col(0xf1ead8);
  const nTeeth = p.lod === 'low' ? 0 : Math.round(3 + 5 * Math.min(1, teeth));
  if (teeth > 0) {
    for (let i = 0; i < nTeeth; i++) {
      const t = 0.42 + (0.55 * i) / Math.max(1, nTeeth - 1);
      const r = jawRing(t);
      for (const side of [-1, 1]) {
        const h = 0.0055 * teeth * (1 + 0.6 * t);
        const g = new THREE.ConeGeometry(h * 0.32, h, 4);
        const m = new THREE.Matrix4().makeTranslation(r.x, r.y + r.top * 0.8 + h * 0.45, side * r.width * 0.62);
        if (i === nTeeth - 1) m.multiply(new THREE.Matrix4().makeRotationZ(-0.4));
        b.add(g, tc, m);
      }
    }
  }
  // Mouth interior, rotated half as far as the jaw.
  b.matrix = new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(-p.gape * 0.5))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, 0));
  if (p.gape > 0.02) {
    loft(
      b,
      6,
      8,
      (t) => {
        const xo = p.corner - 0.01 + (tipXo - 0.012 - p.corner) * t;
        const r = bodyRing(p, xo, true);
        const close = 1 - smooth(0.7, 1, t) * 0.9;
        return { x: r.x, y: r.y - r.bottom * 0.3 - 0.006, top: 0.006 * close, bottom: r.bottom * 0.28 * close, width: r.width * 0.8 * close };
      },
      (_t, _s, _side, _p, out) => out.setHex(0x3a1715),
      { caps: true },
    );
  }
  // Upper teeth hang from the underside of the upper jaw.
  b.matrix = prev;
  if (teeth > 0) {
    for (let i = 0; i < nTeeth; i++) {
      const xo = p.corner + 0.012 + ((0.495 - p.corner - 0.012) * i) / Math.max(1, nTeeth - 1);
      const r = bodyRing(p, Math.min(0.495, xo));
      for (const side of [-1, 1]) {
        const h = 0.006 * teeth * (1 + 0.5 * (i / nTeeth));
        const g = new THREE.ConeGeometry(h * 0.32, h, 4);
        const m = new THREE.Matrix4().makeTranslation(r.x, r.y - r.bottom * 0.85 - h * 0.4, side * r.width * 0.6).multiply(new THREE.Matrix4().makeRotationX(Math.PI));
        b.add(g, tc, m);
      }
    }
  }
}

function addFins(b: GeoBuilder, p: Plan): void {
  const lo = p.lod === 'low';
  const rows = lo ? 2 : 4;
  const cols = lo ? 3 : 7;
  const look = p.look;
  const depth = p.shape.depth;
  const top = (xo: number, out: THREE.Vector3, inset = 0.004) => {
    const r = bodyRing(p, xo);
    return out.set(r.x, r.y + r.top - inset, 0);
  };
  const bot = (xo: number, out: THREE.Vector3, inset = 0.004) => {
    const r = bodyRing(p, xo);
    return out.set(r.x, r.y - r.bottom + inset, 0);
  };
  const juvenile = look === 'alevin';
  // Dorsal fin: tall leading edge, short trailing edge.
  const dH = (juvenile ? 0.035 : 0.078) * Math.sqrt(depth);
  finPatch(
    b,
    (s, o) => top(0.12 - 0.14 * s, o),
    (s, o) => {
      top(0.12 - 0.14 * s, o);
      o.x -= 0.05 + 0.02 * s;
      o.y += dH * (1 - 0.72 * s) - 0.008 * Math.sin(Math.PI * s);
    },
    (s, r, c) => finColor(p, 'dorsal', s, r, c),
    { rows, cols, rays: lo ? 0 : 10 },
  );
  // Adipose fin: small and fleshy, between the dorsal fin and the tail. Herring have none.
  if (look !== 'herring') {
    finPatch(
      b,
      (s, o) => top(-0.18 - 0.07 * s, o, 0.003),
      (s, o) => {
        top(-0.18 - 0.07 * s, o, 0.003);
        o.x -= 0.012 * s;
        o.y += 0.024 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05)), 0.7) * (0.6 + 0.4 * s);
      },
      (s, r, c) => finColor(p, 'adipose', s, r, c),
      { rows: 2, cols: lo ? 3 : 5 },
    );
  }
  // Anal fin.
  finPatch(
    b,
    (s, o) => bot(-0.11 - 0.12 * s, o),
    (s, o) => {
      bot(-0.11 - 0.12 * s, o);
      o.x -= 0.035 + 0.01 * s;
      o.y -= (juvenile ? 0.025 : 0.052) * (1 - 0.65 * s);
    },
    (s, r, c) => finColor(p, 'anal', s, r, c),
    { rows, cols, rays: lo ? 0 : 8 },
  );
  if (!juvenile) {
    // Paired fins: pelvic under the dorsal fin, pectoral low behind the gill cover.
    for (const side of [-1, 1]) {
      finPatch(
        b,
        (s, o) => {
          const r = bodyRing(p, 0.05 - 0.045 * s);
          o.set(r.x, r.y - r.bottom * 0.88, side * r.width * 0.42);
        },
        (s, o) => {
          const r = bodyRing(p, 0.05 - 0.045 * s);
          o.set(r.x - 0.08 + 0.03 * s, r.y - r.bottom - 0.03 + 0.016 * s, side * (r.width * 0.42 + 0.032 - 0.01 * s));
        },
        (s, r, c) => finColor(p, 'pelvic', s, r, c),
        { rows: lo ? 2 : 3, cols: lo ? 2 : 5, flex: 'paired', rays: lo ? 0 : 6 },
      );
      finPatch(
        b,
        (s, o) => {
          const r = bodyRing(p, 0.295 - 0.03 * s);
          o.set(r.x, r.y - r.bottom * 0.62, side * r.width * 0.8);
        },
        (s, o) => {
          const r = bodyRing(p, 0.295 - 0.03 * s);
          // A fan: the leading rays are longest and reach furthest out and down.
          o.set(r.x - 0.1 + 0.04 * s, r.y - r.bottom * 0.62 - 0.042 + 0.028 * s, side * (r.width * 0.8 + 0.05 - 0.02 * s));
        },
        (s, r, c) => finColor(p, 'pectoral', s, r, c),
        { rows: lo ? 2 : 3, cols: lo ? 2 : 5, flex: 'paired', rays: lo ? 0 : 7 },
      );
    }
  } else {
    // Alevin: a fin fold under the belly in place of paired fins.
    finPatch(
      b,
      (s, o) => bot(-0.05 - 0.3 * s, o),
      (s, o) => {
        bot(-0.05 - 0.3 * s, o);
        o.y -= 0.012;
      },
      (s, r, c) => finColor(p, 'anal', s, r, c),
      { rows: 1, cols: 6 },
    );
  }
  // Caudal fin: forked by stage (advisor).
  const fork = FORK[look] ?? 0.04;
  const span = (juvenile ? 0.065 : 0.105) * Math.sqrt(depth);
  const lobe = juvenile ? 0.08 : 0.12;
  const root = bodyRing(p, XT + 0.012);
  finPatch(
    b,
    (s, o) => o.set(root.x, root.y + (s * 2 - 1) * root.top * 0.92, 0),
    (s, o) => {
      const e = Math.abs(s * 2 - 1);
      // Lobes reach back further than the middle; the lobe tips are slightly rounded.
      const len = lobe - fork * 1.25 * (1 - Math.pow(e, 1.4)) - 0.012 * Math.pow(e, 8);
      o.set(root.x - len, root.y + (s * 2 - 1) * span * (1 - 0.06 * Math.pow(e, 6)), 0);
    },
    (s, r, c) => finColor(p, 'caudal', s, r, c),
    { rows: lo ? 2 : 5, cols: lo ? 6 : 12, rays: lo ? 0 : 14 },
  );
}

function addSpots(b: GeoBuilder, p: Plan): void {
  const sp = p.pal.spots;
  if (!sp || p.lod === 'low') return;
  const at = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    const xo = -0.36 + 0.66 * hash3(i, 1.3, 7.1);
    const s = sp.minS + (sp.maxS - sp.minS) * hash3(i, 5.7, 2.2);
    const side = i % 2 === 0 ? 1 : -1;
    const r = bodyRing(p, xo);
    const c = Math.sqrt(Math.max(0, 1 - s * s));
    const h = s > 0 ? r.top : r.bottom;
    at.set(r.x, r.y + h * s, side * r.width * c);
    n.set(0, s / h, (side * c) / r.width).normalize();
    const size = sp.size * (0.7 + 0.6 * hash3(i, 9.1, 3.3)) * (0.6 + 0.4 * Math.min(1, (h * 2) / 0.17));
    const colr = sp.alt && hash3(i, 2.2, 8.8) < 0.3 ? sp.alt : sp.color;
    decal(b, at, n, size, size * 0.85, colr, 7, 0.0012);
  }
}

export function buildFishGeometry(shape: FishShape, look: FishLook, opts: { lod?: 'high' | 'low' } = {}): THREE.BufferGeometry {
  const lod = opts.lod ?? 'high';
  const male = look === 'spawnMale';
  const plan: Plan = {
    look,
    shape,
    pal: PALETTES[look],
    corner: male ? 0.355 : look === 'spawnJack' ? 0.37 : look === 'char' || look === 'trout' ? 0.37 : 0.39,
    gape: male ? 0.07 + 0.13 * shape.kype : look === 'spawnJack' ? 0.07 : look === 'char' ? 0.04 : 0.015,
    lod,
  };
  const b = new GeoBuilder();
  const along = lod === 'low' ? 26 : 64;
  const around = lod === 'low' ? 12 : 24;
  loft(
    b,
    along,
    around,
    (t) => bodyRing(plan, XT + (XS - XT) * t),
    (t, s, side, _p, out) => bodyColor(plan, XT + (XS - XT) * t, s, side, out),
    { caps: true, fullness: 0.92 },
  );
  addJaws(b, plan, along, around);
  addFins(b, plan);
  addSpots(b, plan);
  for (const side of [-1, 1]) addEye(b, plan, side);
  return b.build();
}

export interface FishUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uFreq: { value: number };
}

/**
 * Material with a swimming wave; the uniforms are shared through userData.
 * vertical: the wave bends the body up and down (whales), not side to side.
 */
export function fishMaterial(opts: { transparent?: boolean; opacity?: number; vertical?: boolean; roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const uniforms: FishUniforms = { uTime: { value: 0 }, uAmp: { value: 0.06 }, uFreq: { value: 9 } };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.42,
    metalness: opts.metalness ?? 0.15,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: THREE.DoubleSide,
  });
  m.userData.uniforms = uniforms;
  const axis = opts.vertical ? 'y' : 'z';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uFreq;\nattribute vec2 aFin;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tailW = pow(clamp(0.6 - position.x, 0.0, 1.2), 2.0);
        transformed.${axis} += uAmp * tailW * sin(uFreq * position.x - uTime);
        // Fins trail the body wave a little, and paired fins scull.
        transformed.${axis} += aFin.x * uAmp * 0.35 * sin(uFreq * position.x - uTime - 1.4);
        transformed.z += aFin.y * sign(position.z) * (0.006 + uAmp * 0.08) * sin(uTime * 0.6 + position.x * 20.0);`,
      );
  };
  m.customProgramCacheKey = () => `fish-${axis}`;
  return m;
}

export function setSwim(obj: THREE.Object3D, phase: number, amp: number): void {
  const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
  const u = (mat?.userData.uniforms ?? obj.userData.uniforms) as FishUniforms | undefined;
  if (!u) return;
  u.uTime.value = phase;
  u.uAmp.value = amp;
}

export function createFish(shape: FishShape, look: FishLook, opts: { transparent?: boolean; opacity?: number } = {}): THREE.Mesh {
  const silver = look === 'smolt' || look === 'ocean' || look === 'returnSilver' || look === 'herring';
  const mesh = new THREE.Mesh(buildFishGeometry(shape, look), fishMaterial({ ...opts, metalness: silver ? 0.3 : 0.12, roughness: silver ? 0.35 : 0.5 }));
  mesh.userData.look = look;
  mesh.userData.shapeKey = shapeKey(shape);
  return mesh;
}

export const shapeKey = (s: FishShape): string => [s.depth, s.hump, s.kype, s.yolk].map((n) => n.toFixed(2)).join(',');

export const DEFAULT_SHAPE: FishShape = { depth: 1, hump: 0, kype: 0, yolk: 0 };
