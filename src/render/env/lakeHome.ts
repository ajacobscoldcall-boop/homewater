/**
 * The nursery lake on the way home (the end of the return): the home branch
 * runs on past the river's end in a trough that opens into the lake; a
 * sandy, weedy shelf along the shore drops away into a deep muddy basin; on
 * the far shore the inflowing streams come in over fans of gravel, and on
 * the side shores the beaches are cobble and gravel, with the shelf where
 * the beach spawners will be. The same look as the fry's lake (lake.ts), at
 * adult scale. The bed inside the arena is the simulation's floor; outside
 * it the land rises away to the hills the sky behind the surface shows.
 */
import * as THREE from 'three';
import { INLET_TROUGH, inletAt, type LakeLayout } from '../../sim/stages/returnLake';
import type { World } from '../../sim/world';
import { LAKE_HOME } from './lakeHomeConfig';
import { addLog, bladeClumpGeometry, byDetail, envMaterial, fbm, gridLines, hangingRoot, instanced, joinLines, range, rockGeometry, rockLevel, seeded, smoothstep, stoneTint, terrain, TubeBuilder, type Detail, type Placement } from './kit';

export interface LakeHomeParts {
  group: THREE.Group;
  ground(x: number, z: number): number;
}

/**
 * The ground of the lake section: the sim's floor inside the arena (with a
 * few centimetres of texture), rising land outside it.
 */
export function lakeGround(w: World, lay: LakeLayout): (x: number, z: number) => number {
  const a = w.arena;
  return (x: number, z: number): number => {
    const cx = Math.max(lay.start + 1e-3, Math.min(a.max.x, x));
    const cz = Math.max(a.min.z, Math.min(a.max.z, z));
    const base = a.floor(cx, cz);
    const out = Math.hypot(x - cx, z - cz);
    if (out === 0) return base + 0.04 * fbm(x * 0.6, z * 0.6, 2, 31);
    // Past the end of a stream's channel the stream bends away uphill; elsewhere the land rises to the hills.
    return Math.max(base, 0) + out * 0.35 + 0.6 * fbm(x * 0.12, z * 0.12, 2, 33) * smoothstep(0, 6, out) + (base < 0 ? base * Math.max(0, 1 - out / 6) : 0);
  };
}

export function buildLakeHome(w: World, lay: LakeLayout, detail: Detail): LakeHomeParts {
  const C = LAKE_HOME;
  const group = new THREE.Group();
  group.name = 'lakeHome';
  const rand = seeded(7707 + Math.round(lay.inletZ0));
  const a = w.arena;
  const ground = lakeGround(w, lay);
  const x0 = lay.start;
  const x1 = a.max.x + C.margin;
  const zMin = a.min.z - C.margin;
  const zMax = a.max.z + C.margin;
  const inflows = lay.sites.filter((q) => q.kind === 'inflow');
  const beaches = lay.sites.filter((q) => q.kind === 'beach');

  // Grid: finer over the water and the shore, coarse on the land beyond; every stream edge on a line.
  const step = C.step[detail];
  const breaksZ = inflows.flatMap((q) => [q.z - q.half - 0.5, q.z + q.half + 0.5]);
  const xs = gridLines(x0, x1, step);
  const zs = joinLines(gridLines(zMin, a.min.z, step * 2.5), gridLines(a.min.z, a.max.z, step, breaksZ), gridLines(a.max.z, zMax, step * 2.5));

  const mud = new THREE.Color(0x3a3a2c);
  const silt = new THREE.Color(0x56523e);
  const sand = new THREE.Color(0x7b7257);
  const chara = new THREE.Color(0x4b5a2c);
  const gravel = new THREE.Color(0x7a705a);
  const cobble = new THREE.Color(0x8a8068);
  const earth = new THREE.Color(0x3b3226);
  const turf = new THREE.Color(0x56602f);
  const cliff = new THREE.Color(0x3a3629);
  const nearBeach = (x: number, z: number) => beaches.reduce((m, q) => Math.max(m, Math.sign(z) === q.side ? smoothstep(q.half + 4, q.half - 2, Math.abs(x - q.x)) : 0), 0);
  const nearMouth = (x: number, z: number) => inflows.reduce((m, q) => Math.max(m, smoothstep(14, 4, Math.hypot(Math.max(0, lay.end - x), z - q.z))), 0);
  const land = terrain(
    xs,
    zs,
    ground,
    (x, z, h, out, steep) => {
      const depth = -h;
      // Shelf sand with a carpet of short green algae; mud in the deep basin.
      out.copy(mud).lerp(silt, smoothstep(9, 4, depth)).lerp(sand, smoothstep(4, 1.5, depth));
      out.lerp(chara, 0.45 * smoothstep(0.8, 2.6, depth) * smoothstep(5, 3, depth) * (0.6 + 0.6 * fbm(x * 0.3, z * 0.3, 2, 7)));
      // Beaches and stream mouths: clean gravel and cobble.
      const g = Math.max(nearBeach(x, z) * smoothstep(5, 1, depth), nearMouth(x, z), x > lay.end ? 1 : 0);
      if (g > 0) out.lerp(gravel, g * 0.8).lerp(cobble, g * 0.35 * (0.5 + fbm(x * 1.3, z * 1.3, 2, 9)));
      const face = smoothstep(0.25, 0.7, steep);
      out.lerp(cliff, face * 0.45);
      if (h > -0.4) out.lerp(earth, smoothstep(-0.4, 0.3, h) * (1 - g * 0.6));
      if (h > 0.4) out.lerp(turf, smoothstep(0.4, 1.2, h));
      out.multiplyScalar((0.8 + 0.38 * (fbm(x * 0.07, z * 0.07, 3, 11) + 0.5)) * (0.86 + 0.24 * fbm(x * 1.9, z * 1.9, 2, 5)));
    },
    envMaterial({ caustics: 1, grain: { amount: 0.4, scale: 2.4 } }),
    C.chunk,
  );
  group.add(...land);

  // Weed beds on the shelf, away from the beaches and the stream mouths.
  const weedGeo = bladeClumpGeometry(rand, { blades: detail === 0 ? 4 : 6, width: 0.1, segs: detail === 0 ? 4 : 5, spread: 0.45, bend: 0.5, base: 0x2b4420, tip: 0x5b7a30, leafy: true });
  const weedMat = envMaterial({ sway: { amp: 0.14, freq: 0.7 }, caustics: 0.6, side: THREE.DoubleSide, roughness: 0.85 });
  const weeds: Placement[] = [];
  for (let tries = 0, n = byDetail(C.weeds, detail); tries < n * 12 && weeds.length < n; tries++) {
    const x = range(rand, x0 + 14, lay.end - 4);
    const z = range(rand, a.min.z, a.max.z);
    const f = a.floor(x, z);
    const depth = -f;
    if (depth < 1.2 || depth > 4.5 || nearBeach(x, z) > 0.2 || nearMouth(x, z) > 0.2) continue;
    // Patchy beds rather than an even lawn.
    if (fbm(x * 0.05, z * 0.05, 2, 17) < -0.05) continue;
    const tint = new THREE.Color().setHSL(0.24 + 0.04 * rand(), 0.35 + 0.2 * rand(), 0.45 + 0.2 * rand()).multiplyScalar(1.5);
    weeds.push({ x, y: f - 0.05, z, s: [range(rand, 1.4, 2.2), Math.min(depth * 0.8, range(rand, 0.8, 2.2)), range(rand, 1.4, 2.2)], yaw: rand() * 6, colour: tint });
  }
  const weedMesh = instanced(weedGeo, weedMat, weeds);
  if (weedMesh) group.add(weedMesh);

  // Sedge along the shore line, and grass hanging over the streams' banks.
  const tuftGeo = bladeClumpGeometry(rand, { blades: 9, width: 0.035, segs: 3, spread: 0.35, bend: 0.8, base: 0x3d4a25, tip: 0x7d8a45 });
  const tufts: Placement[] = [];
  for (let tries = 0, n = byDetail(C.tufts, detail); tries < n * 10 && tufts.length < n; tries++) {
    const x = range(rand, x0, x1 - C.margin * 0.5);
    const z = range(rand, zMin + 4, zMax - 4);
    const h = ground(x, z);
    if (h < -1.2 || h > 0.5) continue;
    tufts.push({ x, y: h - 0.02, z, s: [1.4, range(rand, 0.6, 1.2), 1.4], yaw: rand() * 6 });
  }
  const tuftMesh = instanced(tuftGeo, weedMat, tufts);
  if (tuftMesh) group.add(tuftMesh);

  // Rocks: cobble on the beaches and the stream fans, boulders at the shore, a few scattered on the bottom.
  const rockMat = envMaterial({ caustics: 1, roughness: 0.92, grain: { amount: 0.3, scale: 5 } });
  const boulderGeo = rockGeometry(23, rockLevel(detail, true), { base: 0xffffff, flat: 0.68, rough: 0.26, moss: 0.4 });
  const cobbleGeo = rockGeometry(29, rockLevel(detail, false), { base: 0xffffff, flat: 0.72, rough: 0.15 });
  const tint = (l = 0.3) => stoneTint(rand, l * 0.66);
  const boulders: Placement[] = [];
  for (let tries = 0, n = byDetail(C.boulders, detail); tries < n * 20 && boulders.length < n; tries++) {
    const x = range(rand, x0, x1 - 4);
    const z = range(rand, zMin + 2, zMax - 2);
    const h = ground(x, z);
    if (h < -1.6 || h > 0.9) continue;
    const s = range(rand, 0.4, 1.2);
    boulders.push({ x, y: h - s * 0.3, z, s: [s * range(rand, 1, 1.4), s * 0.8, s], yaw: rand() * 6, tilt: rand() * 0.3, colour: tint() });
  }
  for (let i = 0; i < byDetail(C.bedRocks, detail); i++) {
    const x = range(rand, x0 + 14, lay.end - 6);
    const z = range(rand, a.min.z + 4, a.max.z - 4);
    const s = range(rand, 0.3, 0.9) * (rand() < 0.15 ? 1.8 : 1);
    boulders.push({ x, y: a.floor(x, z) - s * 0.25, z, s: [s * 1.2, s * 0.8, s], yaw: rand() * 6, colour: tint(0.26) });
  }
  // The river's banks carry on along its trough into the lake: boulders at the toe of each bank.
  const zc = (lay.inletZ0 + lay.inletZ1) / 2;
  for (let u = 0.5; u < INLET_TROUGH * 0.6; u += range(rand, 0.8, 1.6)) {
    for (const side of [-1, 1]) {
      // Walk out from the centre line to the bank's toe.
      let z = zc;
      const t0 = inletAt(lay, u, zc);
      for (let k = 0; k < 40 && inletAt(lay, u, z).d < t0.hw - 0.6; k++) z += side * 0.25;
      if (rand() < 0.25) continue;
      const s = range(rand, 0.4, 0.95);
      const x = x0 + u;
      boulders.push({ x, y: ground(x, z) - s * 0.35, z: z + side * range(rand, 0, 0.6), s: [s * 1.3, s * 0.8, s], yaw: rand() * 6, tilt: rand() * 0.3, colour: tint(0.3) });
    }
  }
  const bMesh = instanced(boulderGeo, rockMat, boulders);
  if (bMesh) group.add(bMesh);
  const cobbles: Placement[] = [];
  const nCob = byDetail(C.cobbles, detail);
  for (let tries = 0; tries < nCob * 10 && cobbles.length < nCob; tries++) {
    const q = lay.sites[Math.floor(rand() * lay.sites.length)]!;
    let x: number;
    let z: number;
    if (q.kind === 'inflow') {
      x = range(rand, lay.end - 10, lay.end + lay.inflowLen);
      z = q.z + range(rand, -q.half - 3, q.half + 3) * (x > lay.end ? 0.35 : 1);
    } else {
      x = q.x + range(rand, -q.half - 3, q.half + 3);
      z = q.side * range(rand, q.side * q.z - 3, lay.half + 0.5);
    }
    const h = ground(x, z);
    if (h > 0.2 || h < -4) continue;
    const s = range(rand, 0.1, 0.3);
    cobbles.push({ x, y: h - s * 0.3, z, s: [s * 1.25, s * 0.75, s], yaw: rand() * 6, colour: tint(0.44) });
  }
  const cMesh = instanced(cobbleGeo, rockMat, cobbles);
  if (cMesh) group.add(cMesh);

  // Sunken logs on the shelf and down the slope; roots at the stream banks; driftwood on the beaches.
  const tb = new TubeBuilder();
  const bark = new THREE.Color(0x4a3e2e);
  const m = new THREE.Matrix4();
  for (let i = 0; i < byDetail(C.logs, detail); i++) {
    const x = range(rand, x0 + 16, lay.end - 8);
    const z = range(rand, a.min.z + 3, a.max.z - 3);
    const f = a.floor(x, z);
    if (f > -1.5) continue;
    m.makeRotationY(rand() * 6).multiply(new THREE.Matrix4().makeRotationZ(range(rand, -0.08, 0.08)));
    const r = range(rand, 0.25, 0.45);
    m.setPosition(x, f + r * 0.4, z);
    addLog(tb, rand, m, range(rand, 4, 8), r, bark.clone().multiplyScalar(range(rand, 0.8, 1.15)), 3);
  }
  const root = new THREE.Color(0x3b2e22);
  const flow = new THREE.Vector2(-0.4, 0);
  // Roots hanging from the trough's banks, as along the river.
  for (let u = 0.5; u < 14; u += range(rand, 0.6, 1.4)) {
    for (const side of [-1, 1]) {
      let z = zc;
      const t0 = inletAt(lay, u, zc);
      for (let k = 0; k < 40 && inletAt(lay, u, z).d < t0.hw + 0.3; k++) z += side * 0.25;
      hangingRoot(tb, rand, new THREE.Vector3(x0 + u, 0.05, z), range(rand, 0.4, 1.4), range(rand, 0.02, 0.05), root, new THREE.Vector2(0.4, 0), 5);
    }
  }
  for (const q of inflows) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < byDetail(6, detail); k++) {
        const x = range(rand, lay.end + 1, lay.end + lay.inflowLen);
        hangingRoot(tb, rand, new THREE.Vector3(x, 0.05, q.z + side * (q.half + 0.5)), range(rand, 0.4, 1.3), range(rand, 0.02, 0.05), root, flow, 5);
      }
    }
  }
  for (const q of beaches) {
    for (let k = 0; k < 2; k++) {
      const x = q.x + range(rand, -q.half, q.half);
      const z = q.side * (lay.half + range(rand, 0.3, 1.5));
      m.makeRotationY(range(rand, -0.4, 0.4));
      m.setPosition(x, ground(x, z) + 0.15, z);
      addLog(tb, rand, m, range(rand, 3, 5), range(rand, 0.15, 0.25), bark.clone().multiplyScalar(1.3), 2);
    }
  }
  group.add(new THREE.Mesh(tb.build(), envMaterial({ sway: { amp: 0.04, freq: 1.2, flowX: -0.05 }, caustics: 0.6, roughness: 1 })));

  return { group, ground };
}
