/**
 * A gravel patch a female can judge (gameplay: advisor, cobble size decides
 * redd quality). Freshly cleaned gravel, lighter than the algae-darkened bed
 * around it, with a faint rim, and stones drawn at the patch's real cobble
 * size so fine, medium and coarse patches look different at a glance.
 */
import * as THREE from 'three';
import { envMaterial, fbm, range, rockGeometry, rockLevel, seeded, type Detail } from './kit';

/** Shared per build of a scene: one rock geometry and material for every patch. */
let shared: { geo: THREE.BufferGeometry; mat: THREE.MeshLambertMaterial; detail: Detail } | null = null;

function parts(detail: Detail): { geo: THREE.BufferGeometry; mat: THREE.MeshLambertMaterial } {
  // Geometry is flagged shared so the renderer won't dispose it with one patch.
  if (!shared || shared.detail !== detail) {
    const geo = rockGeometry(31, rockLevel(detail, false), { base: 0xffffff, flat: 0.62, rough: 0.14 });
    geo.userData.shared = true;
    shared = { geo, mat: envMaterial({ caustics: 1, roughness: 0.85 }), detail };
  }
  return shared;
}

/**
 * radius: the patch radius; cobble: typical stone radius (sim units);
 * floor(dx, dz): the bed height at an offset from the patch centre, relative to the centre.
 */
export function buildGravelPatch(radius: number, cobble: number, detail: Detail, floor: (dx: number, dz: number) => number = () => 0): THREE.Group {
  const g = new THREE.Group();
  const rand = seeded(Math.round(cobble * 1000) + Math.round(radius * 77));

  // The cleaned bed: a disc that follows the riverbed, lighter in the middle, with a soft rim.
  const rings = detail === 0 ? 6 : 10;
  const segs = detail === 0 ? 24 : 40;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const light = new THREE.Color(0xa49779);
  const rim = new THREE.Color(0x6e6450);
  const c = new THREE.Color();
  pos.push(0, floor(0, 0), 0);
  c.copy(light);
  col.push(c.r, c.g, c.b);
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * radius * 1.06;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const wob = 1 + 0.06 * fbm(Math.cos(a) * 2, Math.sin(a) * 2, 2, cobble * 10);
      const x = Math.cos(a) * rr * wob;
      const z = Math.sin(a) * rr * wob;
      pos.push(x, floor(x, z), z);
      const t = r / rings;
      c.copy(light).lerp(rim, Math.max(0, (t - 0.75) / 0.25));
      c.multiplyScalar(0.92 + 0.16 * fbm(x * 4, z * 4, 2, 3));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs;
    const b0 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, b0 + s, b0 + s, a0 + s1, b0 + s1);
    }
  }
  const disc = new THREE.BufferGeometry();
  disc.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  disc.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  disc.setIndex(idx);
  disc.computeVertexNormals();
  const discMat = envMaterial({ caustics: 1, grain: { amount: 0.4, scale: Math.min(12, 0.9 / Math.max(0.05, cobble)) } });
  discMat.polygonOffset = true;
  discMat.polygonOffsetFactor = -2;
  discMat.polygonOffsetUnits = -2;
  g.add(new THREE.Mesh(disc, discMat));

  // Stones at the patch's cobble size, packed by a sunflower spiral with jitter.
  const { geo, mat } = parts(detail);
  const cap = detail === 2 ? 240 : detail === 1 ? 150 : 80;
  const area = Math.PI * radius * radius;
  const n = Math.max(12, Math.min(cap, Math.round((area * 0.75) / (Math.PI * cobble * cobble * 0.8))));
  const stones = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const palette = [0xb7ab90, 0xa89c84, 0xc2b69a, 0x9a9282, 0xb09a7c, 0xa3a497, 0xbfae8c];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rand() * 0.4;
    const r = Math.sqrt((i + 0.5) / n) * radius * 0.96 + range(rand, -0.5, 0.5) * cobble * 0.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = cobble * range(rand, 0.7, 1.2);
    p.set(x, floor(x, z) + s * 0.2, z);
    e.set(rand() * 0.5, rand() * 6.28, rand() * 0.5);
    q.setFromEuler(e);
    sc.set(s * range(rand, 1, 1.35), s * range(rand, 0.75, 1), s);
    stones.setMatrixAt(i, m.compose(p, q, sc));
    stones.setColorAt(i, c.setHex(palette[i % palette.length] ?? 0xb7ab90).multiplyScalar(range(rand, 0.85, 1.1)));
  }
  stones.computeBoundingSphere();
  g.add(stones);
  return g;
}
