/**
 * The spawning grounds, one look per habitat:
 * - creek: shallow gravel run with a gravel bar on one side and an undercut,
 *   root-hung bank on the other (the jacks' hiding spots are under it);
 * - river: deeper, coarser gravel with boulders, and a log jam with a root
 *   wad as the bank cover;
 * - lake beach: rounded beach gravel rising to a boulder shoreline, the bed
 *   falling away offshore into blue; boulders are the only cover.
 * The bed inside the arena is the simulation's floor exactly, so gravel
 * patches, redds and hiding-spot rings sit on it. Past the arena's edges the
 * banks give the bears somewhere to stand.
 */
import * as THREE from 'three';
import type { World } from '../../sim/world';
import type { EnvParts } from './index';
import { addLog, bladeClumpGeometry, byDetail, envMaterial, fbm, gridLines, hangingRoot, instanced, instancedCells, range, rockGeometry, rockLevel, seeded, smoothstep, stoneTint, terrain, TubeBuilder, type Detail, type Placement } from './kit';

export function buildGrounds(w: World, detail: Detail): EnvParts {
  const group = new THREE.Group();
  const a = w.arena;
  const kind = a.kind;
  const rand = seeded(kind === 'spawnRiver' ? 6607 : kind === 'lakeBeach' ? 6703 : 6601);
  const half = a.max.z;
  const fe = (x: number, side: number) => a.floor(x, side * half);

  const ground = (x: number, z: number): number => {
    if (Math.abs(z) <= half) return a.floor(x, z);
    const side = Math.sign(z);
    const d = Math.abs(z) - half;
    const base = fe(x, side);
    const n = 0.3 * fbm(x * 0.3, z * 0.3, 2, 2);
    if (kind === 'lakeBeach') {
      // Shore side rises gently out of the water; offshore falls away.
      if (side > 0) return base + Math.min(d * 0.42, 1.6 + d * 0.08) + n * smoothstep(0, 3, d);
      return Math.max(-18, base - d * 1.15) + n;
    }
    if (kind === 'spawnRiver') return base + (1.7 - base) * smoothstep(0, 2.4, d) + n * smoothstep(0.5, 3, d);
    // Creek: the cut bank under the cover, the gravel bar opposite (as before: bears wade there).
    if (side > 0) return base + (1.5 - base) * smoothstep(0, 1.1, d) + n * smoothstep(0.3, 2, d);
    return base + Math.min(d * 1.1, 2.2 + (d - 2) * 0.35) + n * smoothstep(1, 3, d);
  };

  const patches = w.live('gravelPatch');
  const covers = w.live('cover');
  const inPatch = (x: number, z: number, pad = 0.25) => patches.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < p.radius + pad);
  const underCover = (x: number, z: number) =>
    covers.reduce((acc, c) => {
      const s = c.size ?? { x: 2, y: 1, z: 2 };
      const dx = Math.max(0, Math.abs(x - c.pos.x) - s.x / 2);
      const dz = Math.max(0, Math.abs(z - c.pos.z) - s.z / 2);
      return Math.max(acc, 1 - smoothstep(0, 1.2, Math.hypot(dx, dz)));
    }, 0);

  // Terrain.
  const step = detail === 2 ? 0.3 : detail === 1 ? 0.42 : 0.6;
  const zMin = kind === 'lakeBeach' ? -30 : -24;
  const xs = gridLines(-30, 72, step);
  const zs = [...gridLines(zMin, -half - 3, step * 2.5), ...gridLines(-half - 3, half + 3, step, [-half, half]), ...gridLines(half + 3, 24, step * 2.5)].filter((v, i, arr) => i === 0 || v - arr[i - 1]! > 1e-4);
  const look = {
    spawnBed: { bed: 0x6f6650, algae: 0x55593a, bank: 0x3c3224 },
    spawnRiver: { bed: 0x5f5e55, algae: 0x4a5038, bank: 0x3a3228 },
    lakeBeach: { bed: 0x8a8068, algae: 0x5d5e44, bank: 0x6f6550 },
  }[kind as 'spawnBed' | 'spawnRiver' | 'lakeBeach'] ?? { bed: 0x6f6650, algae: 0x55593a, bank: 0x3c3224 };
  const bed = new THREE.Color(look.bed);
  const algae = new THREE.Color(look.algae);
  const bankC = new THREE.Color(look.bank);
  const turf = new THREE.Color(0x56602f);
  const shade = new THREE.Color(0x1d1a14);
  const deep = new THREE.Color(0x3b4542);
  const land = terrain(xs, zs, ground, (x, z, h, out) => {
    // Gravel speckle, darkened by algae; the patches the sim placed are left to stand out lighter.
    const speck = fbm(x * 6, z * 6, 2, 3);
    out.copy(bed).lerp(algae, 0.45 + 0.35 * fbm(x * 0.4, z * 0.4, 2, 4));
    out.multiplyScalar(0.82 + 0.3 * speck);
    const d = Math.abs(z) - half;
    if (d > 0) {
      if (kind === 'lakeBeach' && z > 0) out.lerp(bed, 0.5).multiplyScalar(1.1);
      else if (kind === 'lakeBeach') out.lerp(deep, smoothstep(0, 6, d));
      else out.lerp(bankC, smoothstep(0.4, 1.4, d) * (kind === 'spawnBed' && z < 0 ? 0.35 : 0.85));
    }
    if (h > 0.05) out.lerp(turf, smoothstep(0.05, 0.6, h) * (kind === 'lakeBeach' ? smoothstep(1, 2, h) : 1));
    out.lerp(shade, 0.65 * underCover(x, z));
  }, envMaterial({ caustics: 1, grain: { amount: 0.5, scale: kind === 'lakeBeach' ? 5 : 3.5 } }));
  group.add(...land);

  // Background stones on the bed (not on the patches, which carry their own).
  const rockMat = envMaterial({ caustics: 1, roughness: 0.9, grain: { amount: 0.3, scale: 6 } });
  const cobbleGeo = rockGeometry(41, rockLevel(detail, false), { base: 0xffffff, flat: 0.62, rough: 0.16 });
  const boulderGeo = rockGeometry(43, rockLevel(detail, true), { base: 0xffffff, flat: 0.72, rough: 0.28, moss: 0.5 });
  const tint = (l: number) => stoneTint(rand, l * 0.72);
  const size = kind === 'spawnRiver' ? [0.12, 0.34] : kind === 'lakeBeach' ? [0.05, 0.16] : [0.06, 0.2];
  const cobbles: Placement[] = [];
  const nCob = byDetail(kind === 'spawnRiver' ? 500 : 650, detail);
  for (let tries = 0; tries < nCob * 3 && cobbles.length < nCob; tries++) {
    const x = range(rand, -20, 60);
    const z = range(rand, -half - 3, half + 4);
    if (inPatch(x, z)) continue;
    const s = range(rand, size[0]!, size[1]!);
    cobbles.push({ x, y: ground(x, z) - s * 0.25, z, s: [s * 1.25, s * 0.8, s], yaw: rand() * 6, tilt: rand() * 0.3, colour: tint(0.3) });
  }
  group.add(...instancedCells(cobbleGeo, rockMat, cobbles));

  const boulders: Placement[] = [];
  const boulder = (x: number, z: number, s: number, lift = 0.25, l = 0.32) => boulders.push({ x, y: ground(x, z) - s * lift, z, s: [s * range(rand, 1, 1.4), s * range(rand, 0.75, 0.95), s], yaw: rand() * 6, tilt: rand() * 0.25, colour: tint(l) });
  if (kind === 'lakeBeach') {
    for (let i = 0; i < byDetail(70, detail); i++) boulder(range(rand, -25, 65), range(rand, half - 0.8, half + 6), range(rand, 0.4, 1.3), 0.3, 0.38);
    for (let i = 0; i < byDetail(18, detail); i++) {
      const x = range(rand, -10, 50);
      const z = range(rand, -half - 6, -half + 2);
      if (!inPatch(x, z, 1)) boulder(x, z, range(rand, 0.5, 1.2), 0.35, 0.3);
    }
    // Cover boulders where the sim put them: big, leaning over the hiding spot.
    for (const c of covers) {
      const s = c.size ?? { x: 2.2, y: 1.6, z: 1.6 };
      boulders.push({ x: c.pos.x, y: a.floor(c.pos.x, c.pos.z + 0.8) + s.y * 0.05, z: c.pos.z + 0.1, s: [s.x * 0.62, s.y * 0.68, s.z * 0.72], yaw: 0.3, tilt: -0.18, colour: tint(0.34) });
    }
  } else {
    const big = kind === 'spawnRiver';
    for (let i = 0; i < byDetail(big ? 120 : 80, detail); i++) {
      const side = rand() < 0.5 ? -1 : 1;
      boulder(range(rand, -25, 65), side * range(rand, half - 0.3, half + 4), range(rand, 0.35, big ? 1.4 : 0.9));
    }
    if (big) {
      // A few in the channel, low and clear of the patches.
      for (let i = 0; i < byDetail(10, detail); i++) {
        const x = range(rand, -5, 45);
        const z = range(rand, -half + 1, half - 2);
        if (!inPatch(x, z, 1.2) && !covers.some((c) => Math.abs(c.pos.x - x) < 7 && z > 4)) boulder(x, z, range(rand, 0.5, 0.85), 0.4, 0.3);
      }
    }
  }
  group.add(...instancedCells(boulderGeo, rockMat, boulders));

  // Cover: the creek's undercut bank, the river's log jam (render of the sim's 'cover' boxes).
  const tb = new TubeBuilder();
  const root = new THREE.Color(0x3a2d21);
  const flow = new THREE.Vector2(kind === 'lakeBeach' ? 0 : -0.6, 0);
  const slabs: Placement[] = [];
  const m = new THREE.Matrix4();
  if (kind !== 'lakeBeach') {
    for (const c of covers) {
      const s = c.size ?? { x: 10, y: 0.8, z: 2.6 };
      const x0 = c.pos.x - s.x / 2;
      const zLip = c.pos.z - s.z / 2; // the edge toward the open water
      const yTop = c.pos.y + s.y / 2;
      if (kind === 'spawnBed') {
        // Turf slabs overhanging the water, roots trailing beneath their lip.
        for (let k = 0; k < Math.ceil(s.x / 1.6); k++) {
          slabs.push({ x: x0 + 0.8 + k * 1.6 + range(rand, -0.2, 0.2), y: yTop - 0.18, z: c.pos.z + 0.35, s: [range(rand, 1.05, 1.3), range(rand, 0.28, 0.4), s.z * 0.62], yaw: range(rand, -0.15, 0.15), colour: new THREE.Color(0x4d3f2d).multiplyScalar(range(rand, 0.8, 1.1)) });
        }
        const n = byDetail(Math.round(s.x * 4), detail);
        for (let i = 0; i < n; i++) {
          const lip = rand() < 0.6;
          const x = x0 + rand() * s.x;
          const z = lip ? zLip + range(rand, 0, 0.35) : range(rand, zLip + 0.6, c.pos.z + s.z / 2);
          hangingRoot(tb, rand, new THREE.Vector3(x, yTop - 0.35, z), lip ? range(rand, 0.4, 1.0) : range(rand, 0.2, 0.55), range(rand, 0.018, 0.045), root.clone().multiplyScalar(range(rand, 0.8, 1.25)), flow, 5);
        }
      } else {
        // Log jam: big trunks along the bank and a root wad at the downstream end.
        const bark = new THREE.Color(0x45392b);
        m.makeRotationY(0.04);
        m.setPosition(x0 - 0.5, yTop - 0.45, c.pos.z - 0.5);
        addLog(tb, rand, m, s.x + 1.5, 0.42, bark, 4);
        m.makeRotationY(-0.08);
        m.setPosition(x0 + 0.8, yTop - 0.05, c.pos.z + 0.55);
        addLog(tb, rand, m, s.x - 1, 0.36, bark.clone().multiplyScalar(0.85), 3);
        const wad = new THREE.Vector3(x0 - 0.5, yTop - 0.4, c.pos.z - 0.4);
        for (let i = 0; i < byDetail(26, detail); i++) {
          const dir = new THREE.Vector3(-range(rand, 0.1, 1), range(rand, -1, 0.9), range(rand, -1, 1)).normalize();
          const l = range(rand, 0.6, 1.6);
          const mid = wad.clone().addScaledVector(dir, l * 0.5).add(new THREE.Vector3(0, -0.1, 0));
          const end = wad.clone().addScaledVector(dir, l);
          end.y = Math.min(end.y, 0.2);
          tb.tube([wad.clone(), mid, end], [0.09, 0.05, 0.015], root, [0, 0.4, 1], 4);
        }
        for (let i = 0; i < byDetail(Math.round(s.x * 2), detail); i++) {
          hangingRoot(tb, rand, new THREE.Vector3(x0 + rand() * s.x, yTop - 0.2, zLip + range(rand, 0, 0.8)), range(rand, 0.3, 0.8), range(rand, 0.015, 0.035), root, flow, 4);
        }
      }
    }
  }
  // Rootlets along the banks outside the cover.
  if (kind !== 'lakeBeach') {
    for (let i = 0; i < byDetail(70, detail); i++) {
      const side = kind === 'spawnBed' ? 1 : rand() < 0.5 ? -1 : 1;
      const x = range(rand, -20, 60);
      const z = side * (half + range(rand, 0.4, 1.0));
      const top = ground(x, z);
      if (top < 0.05) continue;
      hangingRoot(tb, rand, new THREE.Vector3(x, 0.05, z), range(rand, 0.3, 0.9), range(rand, 0.015, 0.035), root, flow, 4);
    }
  }
  if (!tb.empty) group.add(new THREE.Mesh(tb.build(), envMaterial({ sway: { amp: 0.04, freq: 1.4, flowX: flow.x * 0.12 }, caustics: 0.5, roughness: 1 })));
  const sm = instanced(rockGeometry(47, rockLevel(detail, false), { base: 0xffffff, flat: 0.5, rough: 0.3 }), envMaterial({ roughness: 1 }), slabs);
  if (sm) group.add(sm);

  // Grass trailing from the bank lips (sedges on the beach).
  const grassGeo = bladeClumpGeometry(rand, { blades: 7, width: 0.03, segs: 4, spread: 0.3, bend: 1.2, base: 0x4a5528, tip: 0x6d7a3a });
  const grass: Placement[] = [];
  for (let i = 0; i < byDetail(220, detail); i++) {
    const x = range(rand, -25, 65);
    if (kind === 'lakeBeach') {
      const z = range(rand, half + 1, half + 7);
      const h = ground(x, z);
      if (h > -0.05) grass.push({ x, y: h, z, s: [1.2, range(rand, 0.5, 1.1), 1.2], yaw: rand() * 6 });
      continue;
    }
    const side = kind === 'spawnBed' && rand() < 0.75 ? 1 : rand() < 0.5 ? -1 : 1;
    // Where the bank top meets the water line.
    let z = side * half;
    for (let k = 0; k < 30 && ground(x, z) < 0.05; k++) z += side * 0.15;
    const cover = covers.find((c) => Math.abs(x - c.pos.x) < (c.size?.x ?? 0) / 2 && side > 0);
    if (cover && kind === 'spawnBed') z = cover.pos.z - (cover.size?.z ?? 2) / 2 + range(rand, 0, 0.3);
    grass.push({ x, y: cover && kind === 'spawnBed' ? cover.pos.y + (cover.size?.y ?? 0.8) / 2 - 0.05 : 0.06, z, s: [1, -range(rand, 0.35, 0.8), 1], yaw: rand() * 6 });
  }
  group.add(...instancedCells(grassGeo, envMaterial({ sway: { amp: 0.1, freq: 1.3, flowX: flow.x * 0.2 }, caustics: 0.4, side: THREE.DoubleSide }), grass));

  return { group, handles: ['cover'], ground, down: kind === 'lakeBeach' ? 0.62 : 0.75 };
}
