/**
 * Egg and alevin: inside a creek redd. Cobble of mixed sizes packed around a
 * clear pocket where the egg lies, dark interstitial gaps, fine silt in the
 * hollows, and a few pebbles that shift when the flow surges.
 */
import * as THREE from 'three';
import { alevinView } from '../../sim/stages/egg';
import type { World } from '../../sim/world';
import type { EnvParts } from './index';
import { byDetail, envMaterial, fbm, instanced, range, rockGeometry, rockLevel, seeded, terrain, gridLines, type Detail, type Placement } from './kit';

interface Stone {
  x: number;
  z: number;
  r: number;
}

/** Pocket around the egg kept free of stones that would hide the alevin. */
const POCKET = 0.36;
const BED = -1.62;

export function buildRedd(w: World, detail: Detail): EnvParts {
  const group = new THREE.Group();
  const rand = seeded(1307);
  const floor = w.arena.floor(0, 0);
  const bed = Math.min(floor, BED);

  // Pack stones from largest to smallest, so the small ones fill the gaps.
  const stones: Stone[] = [];
  const tryPlace = (count: number, rMin: number, rMax: number, area: number, pocket: number, overlap: number) => {
    let placed = 0;
    for (let a = 0; a < count * 30 && placed < count; a++) {
      const ang = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * area;
      const x = Math.cos(ang) * d;
      const z = Math.sin(ang) * d;
      const r = range(rand, rMin, rMax);
      if (Math.hypot(x, z) - r < pocket) continue;
      if (stones.some((s) => Math.hypot(s.x - x, s.z - z) < (s.r + r) * overlap)) continue;
      stones.push({ x, z, r });
      placed++;
    }
    return stones.length;
  };
  const big0 = 0;
  const big1 = tryPlace(byDetail(46, detail), 0.2, 0.36, 4.2, POCKET + 0.05, 0.92);
  const mid1 = tryPlace(byDetail(150, detail), 0.08, 0.17, 4.2, POCKET, 0.9);
  const small1 = tryPlace(byDetail(420, detail), 0.025, 0.06, 3.6, 0.12, 0.95);

  const palette = [0x7f7a6c, 0x8c806a, 0x6c6a62, 0x948a74, 0x75664f, 0x5f6156, 0x897560, 0x6f705a];
  const colourOf = (i: number, dust: number): THREE.Color => {
    const c = new THREE.Color(palette[Math.floor(rand() * palette.length)] ?? 0x7f7a6c);
    c.multiplyScalar(0.85 + 0.3 * rand());
    // Silt settles on the lower stones.
    return c.lerp(new THREE.Color(0x857a62), dust * (0.2 + 0.3 * rand()) + (i % 7 === 0 ? 0.2 : 0));
  };
  const place = (from: number, to: number, embed: number, flat: number): Placement[] =>
    stones.slice(from, to).map((s, i) => ({
      x: s.x,
      y: bed + s.r * embed + 0.05 * s.r * rand(),
      z: s.z,
      s: [s.r * range(rand, 0.95, 1.2), s.r * flat * range(rand, 0.8, 1.15), s.r * range(rand, 0.85, 1.1)],
      yaw: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.5,
      colour: colourOf(i, from === big0 ? 0.3 : 0.6),
    }));

  const rockMat = envMaterial({ caustics: 1, roughness: 0.9 });
  const cobbleGeo = rockGeometry(3, rockLevel(detail, true), { base: 0xffffff, flat: 0.75, rough: 0.2 });
  const pebbleGeo = rockGeometry(11, rockLevel(detail, false), { base: 0xffffff, flat: 0.7, rough: 0.12 });
  const add = (m: THREE.Object3D | null) => m && group.add(m);
  add(instanced(cobbleGeo, rockMat, place(big0, big1, 0.45, 0.8)));
  add(instanced(cobbleGeo, rockMat, place(big1, mid1, 0.5, 0.75)));
  add(instanced(pebbleGeo, rockMat, place(mid1, small1, 0.55, 0.7)));

  // The bed under the stones: fine gravel and silt, dark in the interstitial gaps.
  const step = detail === 2 ? 0.05 : detail === 1 ? 0.075 : 0.11;
  const lines = gridLines(-5, 5, step);
  const silt = new THREE.Color(0x6a604c);
  const sand = new THREE.Color(0x8b7f66);
  const gap = new THREE.Color(0x231f18);
  const near = stones.filter((s) => s.r > 0.07);
  const land = terrain(
    lines,
    lines,
    (x, z) => bed + 0.025 * fbm(x * 3, z * 3, 2, 4) - 0.04 * Math.max(0, 1 - Math.hypot(x, z) / POCKET),
    (x, z, _h, out) => {
      // Occlusion from nearby stones darkens the gaps between them.
      let occ = 0;
      for (const s of near) {
        const d = Math.hypot(s.x - x, s.z - z) / s.r;
        if (d < 1.9) occ += Math.max(0, 1.9 - d) * 0.55;
      }
      const speck = fbm(x * 18, z * 18, 2, 9);
      out.copy(silt).lerp(sand, 0.5 + 0.5 * fbm(x * 2.2, z * 2.2, 2, 2));
      out.multiplyScalar(0.9 + 0.25 * speck);
      out.lerp(gap, Math.min(0.85, occ));
    },
    envMaterial({ caustics: 1, grain: { amount: 0.35, scale: 14 } }),
  );
  group.add(...land);

  // Loose pebbles near the egg that shift when the flow surges (render only).
  const loose = byDetail(14, detail);
  const pebbles: { x: number; z: number; r: number; spin: number; home: THREE.Vector2 }[] = [];
  for (let i = 0; i < loose; i++) {
    const a = (i / loose) * Math.PI * 2 + rand();
    const d = range(rand, 0.32, 1.2);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    pebbles.push({ x, z, r: range(rand, 0.028, 0.05), spin: 0, home: new THREE.Vector2(x, z) });
  }
  const looseMesh = new THREE.InstancedMesh(pebbleGeo, rockMat, loose);
  looseMesh.frustumCulled = false;
  pebbles.forEach((_, i) => looseMesh.setColorAt(i, new THREE.Color(palette[i % palette.length] ?? 0x7f7a6c).multiplyScalar(1.1)));
  group.add(looseMesh);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let wobble = 0;

  const update = (world: World, dt: number) => {
    const v = alevinView(world);
    const surge = v?.pulse ? 1 : v?.warning ? 0.25 : 0;
    wobble += dt * (4 + 14 * surge);
    const ang = v?.currentAngle ?? 0;
    const cx = Math.cos(ang);
    const cz = Math.sin(ang);
    pebbles.forEach((pb, i) => {
      if (surge > 0) {
        // Rolled along by the surge, a little each, the lighter ones further.
        const speed = surge * (0.05 / pb.r) * 0.04 * (0.6 + 0.4 * Math.sin(i * 3.1));
        pb.x += cx * speed * dt;
        pb.z += cz * speed * dt;
        pb.spin += (speed / pb.r) * dt;
      }
      // Rolled too far: settle back in (out of sight of the camera).
      if (Math.hypot(pb.x, pb.z) > 1.9) {
        pb.x = pb.home.x;
        pb.z = pb.home.y;
      }
      const jitter = surge > 0 ? 0.006 * Math.sin(wobble + i * 1.7) : 0;
      p.set(pb.x + jitter, bed + pb.r * 0.6, pb.z);
      e.set(pb.spin * cz + i, i * 0.9, -pb.spin * cx);
      q.setFromEuler(e);
      sc.set(pb.r * 1.1, pb.r * 0.8, pb.r);
      looseMesh.setMatrixAt(i, m.compose(p, q, sc));
    });
    looseMesh.instanceMatrix.needsUpdate = true;
  };
  update(w, 0);
  return { group, update };
}
