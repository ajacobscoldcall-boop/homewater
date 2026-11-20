/**
 * The smolt run at night: out of the lake through the outlet, down a river
 * channel between earth banks, to the estuary where the banks open out.
 * Boulders line the banks; roots, overhanging bank lips and fallen trees
 * (sweepers) hang into the water and show as silhouettes against the
 * moonlit surface. The bank cover the simulation spawns ('cover' entities)
 * is drawn as undercut, root-hung bank.
 */
import * as THREE from 'three';
import type { World } from '../../sim/world';
import type { EnvParts } from './index';
import { addLog, bladeClumpGeometry, byDetail, envMaterial, fbm, gridLines, hangingRoot, joinLines, instanced, instancedCells, range, rockGeometry, rockLevel, seeded, smoothstep, stoneTint, terrain, TubeBuilder, type Detail, type Placement } from './kit';

export function buildRiver(w: World, detail: Detail): EnvParts {
  const group = new THREE.Group();
  const rand = seeded(3301);
  const a = w.arena;
  const half = a.max.z;
  const L = a.max.x;
  const outlet = w.p.get('smolt.outletEnd');
  const mouth = w.p.get('smolt.mouthStart');
  const lakeEnd = 14;
  const estuary = mouth + 20;

  // How far the banks stand back from the arena edge: wide at the lake outlet and the estuary.
  const widen = (x: number) => Math.max(0, lakeEnd - x) * 1.4 + Math.max(0, x - estuary) * 0.45;
  // The bank line wanders, but only ever away from the water the fish can use.
  const wobble = (x: number, side: number) => 0.9 * Math.max(0, fbm(x * 0.06, side * 7.1, 2, 2) + 0.15);
  const edgeFloor = (x: number) => a.floor(x, half);
  const ground = (x: number, z: number): number => {
    if (Math.abs(z) <= half) return a.floor(Math.max(a.min.x, Math.min(L, x)), z) + 0.04 * fbm(x * 0.8, z * 0.8, 2, 1);
    const side = Math.sign(z);
    const d = Math.abs(z) - half - widen(x) - wobble(x, side);
    const shelf = edgeFloor(Math.max(0, Math.min(L, x))) - 0.25 - 1.6 * smoothstep(0, 10, widen(x)) * (x < lakeEnd ? 1 : 0.35);
    if (d < 0) return shelf + 0.06 * fbm(x * 0.5, z * 0.5, 2, 3);
    const top = 1.3 + 0.5 * fbm(x * 0.07, z * 0.2, 2, 5);
    return shelf + (top - shelf) * smoothstep(0, 1.7, d) + 0.25 * fbm(x * 0.4, z * 0.4, 2, 6) * smoothstep(0.3, 2, d);
  };

  const sx = detail === 2 ? 0.7 : detail === 1 ? 1.0 : 1.5;
  const sz = detail === 2 ? 0.4 : detail === 1 ? 0.55 : 0.8;
  const xs = gridLines(-30, L + 40, sx);
  const zs = joinLines(gridLines(-34, -half - 5, sz * 3), gridLines(-half - 5, half + 5, sz, [-half, half]), gridLines(half + 5, 34, sz * 3));
  const gravel = new THREE.Color(0x6f6754);
  const deep = new THREE.Color(0x4d4a3c);
  const mud = new THREE.Color(0x6b6553);
  const earth = new THREE.Color(0x3a3024);
  const moss = new THREE.Color(0x3f4a26);
  const turf = new THREE.Color(0x4f5a2e);
  const land = terrain(xs, zs, ground, (x, z, h, out) => {
    out.copy(gravel).lerp(deep, smoothstep(2.5, 6, -h));
    if (x > mouth) out.lerp(mud, smoothstep(mouth, estuary + 20, x) * 0.8);
    // Bars of cleaner gravel and darker, algae-covered stretches; fine mottling.
    out.multiplyScalar((0.75 + 0.45 * (fbm(x * 0.07, z * 0.18, 3, 12) + 0.5)) * (0.85 + 0.25 * fbm(x * 2.3, z * 2.3, 2, 4)));
    const bank = smoothstep(half + 0.2, half + 1.2, Math.abs(z) - widen(x));
    if (bank > 0) out.lerp(earth, bank * 0.85).lerp(moss, bank * 0.3 * (0.5 + fbm(x * 0.3, z, 2, 8)));
    if (h > -0.2) out.lerp(turf, smoothstep(-0.2, 0.4, h));
  }, envMaterial({ caustics: 1, grain: { amount: 0.45, scale: 3 } }));
  group.add(...land);

  // Boulders along the bank toes; scattered cobble on the bed.
  const rockMat = envMaterial({ caustics: 1, roughness: 0.92, grain: { amount: 0.3, scale: 5 } });
  const boulderGeo = rockGeometry(7, rockLevel(detail, true), { base: 0xffffff, flat: 0.7, rough: 0.28, moss: 0.5 });
  const cobbleGeo = rockGeometry(13, rockLevel(detail, false), { base: 0xffffff, flat: 0.72, rough: 0.15 });
  const tint = (l = 0.3) => stoneTint(rand, l * 0.62);
  const boulders: Placement[] = [];
  for (let i = 0; i < byDetail(170, detail); i++) {
    const x = range(rand, -10, L + 30);
    const side = rand() < 0.5 ? -1 : 1;
    const out = range(rand, -0.6, 2.2);
    const z = side * (half + widen(x) + wobble(x, side) + out);
    const s = out < 0 ? range(rand, 0.3, 0.6) : range(rand, 0.45, 1.3);
    boulders.push({ x, y: ground(x, z) - s * 0.25, z, s: [s * range(rand, 1, 1.5), s * 0.8, s], yaw: rand() * 6, tilt: rand() * 0.3, colour: tint() });
  }
  // A few big ones mid-channel in the upper river, low enough to pass over.
  for (let i = 0; i < byDetail(60, detail); i++) {
    const x = range(rand, outlet * 0.4, mouth + 20);
    const z = range(rand, -half * 0.75, half * 0.75);
    const s = range(rand, 0.5, 0.9);
    boulders.push({ x, y: a.floor(x, z) - s * 0.35, z, s: [s * 1.3, s * 0.7, s], yaw: rand() * 6, colour: tint(0.35) });
  }
  group.add(...instancedCells(boulderGeo, rockMat, boulders));
  const cobbles: Placement[] = [];
  for (let i = 0; i < byDetail(700, detail); i++) {
    const x = range(rand, -5, L + 25);
    const z = range(rand, -half - 2, half + 2);
    const s = range(rand, 0.1, x > mouth ? 0.18 : 0.32);
    cobbles.push({ x, y: ground(x, z) - s * 0.2, z, s: [s * 1.2, s * 0.8, s], yaw: rand() * 6, colour: tint(0.42) });
  }
  group.add(...instancedCells(cobbleGeo, rockMat, cobbles));

  // Roots, sweepers and driftwood: one swaying tube mesh.
  const tb = new TubeBuilder();
  const root = new THREE.Color(0x3b2e22);
  const bark = new THREE.Color(0x40352a);
  const flow = new THREE.Vector2(0.5, 0);
  const lipSlabs: Placement[] = [];
  const covers = w.live('cover');
  covers.forEach((c, ci) => {
    const len = c.size?.x ?? 6;
    const side = Math.sign(c.pos.z) || 1;
    // The overhanging lip of the bank: an earth slab at the surface.
    for (let k = 0; k < Math.ceil(len / 2.2); k++) {
      const x = c.pos.x - len / 2 + 1.1 + k * 2.2 + range(rand, -0.3, 0.3);
      lipSlabs.push({ x, y: -0.12, z: side * (half + 0.15), s: [range(rand, 1.4, 1.9), range(rand, 0.35, 0.5), range(rand, 1.2, 1.5)], yaw: range(rand, -0.2, 0.2), colour: new THREE.Color(0x4a3d2c).multiplyScalar(range(rand, 0.75, 1.1)) });
    }
    // Roots hanging from under the lip.
    const n = byDetail(Math.round(len * 3), detail);
    for (let i = 0; i < n; i++) {
      const x = c.pos.x + range(rand, -len / 2, len / 2);
      const z = side * range(rand, half - 1.0, half + 0.2);
      hangingRoot(tb, rand, new THREE.Vector3(x, -0.3, z), range(rand, 0.6, 1.7), range(rand, 0.025, 0.06), root.clone().multiplyScalar(range(rand, 0.8, 1.2)), flow, 6);
    }
    // Every third cover: a fallen tree leaning out from the bank into the water.
    if (ci % 3 === 1) {
      const base = new THREE.Vector3(c.pos.x - 2, 1.4, side * (half + 3.5));
      const tip = new THREE.Vector3(c.pos.x + 3.5, -1.1, side * (half - 2.2));
      const pts: THREE.Vector3[] = [];
      const radii: number[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(base.clone().lerp(tip, t).add(new THREE.Vector3(0, -0.5 * Math.sin(t * Math.PI) * 0.4, 0)));
        radii.push(0.28 * (1 - 0.7 * t));
      }
      tb.tube(pts, radii, bark, null, 7, true);
      for (let b = 0; b < 7; b++) {
        const t = 0.35 + 0.6 * rand();
        const from = base.clone().lerp(tip, t);
        const dir = new THREE.Vector3(range(rand, 0.2, 1), range(rand, -1, 0.3), range(rand, -1, 1) * 0.8).normalize();
        const l = range(rand, 0.8, 2.0);
        const mid = from.clone().addScaledVector(dir, l * 0.5).add(new THREE.Vector3(0, -0.15, 0));
        const end = from.clone().addScaledVector(dir, l);
        end.y = Math.min(end.y, -0.05);
        tb.tube([from, mid, end], [0.07, 0.045, 0.015], bark, [0, 0.5, 1], 4);
      }
    }
  });
  // Rootlets all along both banks: the whole bank edge is cover in the sim.
  for (let i = 0; i < byDetail(120, detail); i++) {
    const x = range(rand, 0, L + 20);
    const side = rand() < 0.5 ? -1 : 1;
    const z = side * (half + widen(x) + range(rand, 0.0, 0.5));
    hangingRoot(tb, rand, new THREE.Vector3(x, -0.15, z), range(rand, 0.3, 1.0), range(rand, 0.015, 0.035), root, flow, 4);
  }
  // Driftwood in the estuary.
  const m = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    const x = range(rand, mouth, L + 10);
    const z = range(rand, -half + 1, half - 1) * (i % 2 ? 1 : 1.6);
    m.makeRotationY(rand() * 6);
    m.setPosition(x, ground(x, z) + 0.15, z);
    addLog(tb, rand, m, range(rand, 3, 6), range(rand, 0.18, 0.3), bark.clone().multiplyScalar(1.25), 2);
  }
  const roots = new THREE.Mesh(tb.build(), envMaterial({ sway: { amp: 0.05, freq: 1.6, flowX: 0.06 }, caustics: 0.5, roughness: 1 }));
  group.add(roots);

  const slabGeo = rockGeometry(21, rockLevel(detail, false), { base: 0xffffff, flat: 0.5, rough: 0.3 });
  const slabs = instanced(slabGeo, envMaterial({ roughness: 1 }), lipSlabs);
  if (slabs) group.add(slabs);

  // Grass trailing from the bank lip, and eelgrass in the estuary.
  const grassGeo = bladeClumpGeometry(rand, { blades: 7, width: 0.03, segs: 4, spread: 0.3, bend: 1.2, base: 0x4a5528, tip: 0x6d7a3a });
  const grass: Placement[] = [];
  for (let i = 0; i < byDetail(320, detail); i++) {
    const x = range(rand, -5, L + 20);
    const side = rand() < 0.5 ? -1 : 1;
    const z = side * (half + widen(x) + wobble(x, side) * 0.5 + range(rand, -0.1, 0.4));
    // Hanging: negative height flips the clump to trail down into the water.
    grass.push({ x, y: 0.05, z, s: [1, -range(rand, 0.4, 1.0), 1], yaw: rand() * 6 });
  }
  for (let i = 0; i < byDetail(140, detail); i++) {
    const x = range(rand, mouth + 15, L + 20);
    const z = range(rand, -half - 6, half + 6);
    if (Math.abs(z) < half - 2.5) continue;
    const h = ground(x, z);
    if (h > -0.6) continue;
    grass.push({ x, y: h - 0.03, z, s: [1.3, Math.min(-h * 0.7, range(rand, 0.6, 1.4)), 1.3], yaw: rand() * 6 });
  }
  group.add(...instancedCells(grassGeo, envMaterial({ sway: { amp: 0.12, freq: 1.4, flowX: 0.15 }, caustics: 0.4, side: THREE.DoubleSide }), grass));

  return { group, handles: ['cover'], ground, down: 0.7 };
}
