/**
 * Fry in the lake: a shallow weedy shelf along the shore, the drop-off at the
 * weed edge, a muddy bowl falling away into blue, sunken logs, and the outlet
 * channel on the far side. Weed clumps stand where the simulation put its
 * weed entities; filler weeds cover the rest of the bed the sim calls weeds
 * (everything shoreward of the weed edge), so the safe zone reads as one bed.
 */
import * as THREE from 'three';
import { fryView } from '../../sim/stages/fry';
import type { World } from '../../sim/world';
import type { EnvParts } from './index';
import { addLog, bladeClumpGeometry, byDetail, envMaterial, fbm, gridLines, instanced, instancedCells, range, rockGeometry, rockLevel, seeded, smoothstep, stoneTint, terrain, TubeBuilder, type Detail, type Placement } from './kit';

const OUT = 48;

export function buildLake(w: World, detail: Detail): EnvParts {
  const group = new THREE.Group();
  const rand = seeded(2203);
  const a = w.arena;
  const edgeX = fryView(w)?.weedEdge ?? -19;
  const outletZ = 6;

  // Inside the arena the bottom is the simulation's; outside it rises to the shore,
  // except for the outlet channel past the far end.
  const ground = (x: number, z: number): number => {
    const cx = Math.max(a.min.x, Math.min(a.max.x, x));
    const cz = Math.max(a.min.z, Math.min(a.max.z, z));
    const inside = cx === x && cz === z;
    const base = a.floor(cx, cz);
    if (inside) return base + 0.06 * fbm(x * 0.6, z * 0.6, 2, 1);
    let d = Math.hypot(x - cx, z - cz);
    if (x > a.max.x && Math.abs(z) < outletZ + 3) d = Math.max(0, Math.abs(z) - outletZ) * smoothstep(a.max.x, a.max.x + 4, x) + (x - a.max.x) * 0.02;
    return base + d * 0.55 + 0.4 * fbm(x * 0.15, z * 0.15, 2, 3) * smoothstep(0, 4, d);
  };

  const step = detail === 2 ? 0.45 : detail === 1 ? 0.65 : 0.95;
  // Breakpoints just either side of the weed edge keep the drop-off a clean step.
  const xs = gridLines(-OUT, OUT, step, [edgeX - 0.06, edgeX]);
  const zs = gridLines(-OUT, OUT, step);
  const mud = new THREE.Color(0x3c3b2c);
  const silt = new THREE.Color(0x56523e);
  const sand = new THREE.Color(0x7b7257);
  const chara = new THREE.Color(0x4b5a2c);
  const shore = new THREE.Color(0x8a8068);
  const cliff = new THREE.Color(0x3a3629);
  const land = terrain(xs, zs, ground, (x, z, h, out, steep) => {
    const depth = -h;
    // Shelf sand with a carpet of short green algae; mud in the deep bowl.
    out.copy(mud).lerp(silt, smoothstep(9, 5, depth));
    if (x < edgeX) out.copy(sand).lerp(chara, 0.55 * smoothstep(0.5, 3, depth) * (0.6 + 0.6 * fbm(x * 0.5, z * 0.5, 2, 7)));
    if (h > -0.6) out.lerp(shore, smoothstep(-0.6, 0.2, h));
    // The drop-off face.
    // The drop-off face: dark silt with bands of exposed sediment.
    const face = smoothstep(0.25, 0.7, steep);
    out.lerp(cliff, face * 0.55).multiplyScalar(1 + face * 0.25 * Math.sin(h * 3.1 + 2.5 * fbm(x * 0.4, z * 0.4, 2, 9)));
    // Large soft patches (silt drifts, darker organic mud) and fine mottling.
    out.multiplyScalar((0.78 + 0.4 * (fbm(x * 0.09, z * 0.09, 3, 11) + 0.5)) * (0.85 + 0.25 * fbm(x * 1.7, z * 1.7, 2, 5)));
  }, envMaterial({ caustics: 1, grain: { amount: 0.4, scale: 2.2 } }));
  group.add(...land);

  // Weeds: sim clumps plus filler over the whole bed.
  const weedGeo = bladeClumpGeometry(rand, { blades: detail === 0 ? 4 : 6, width: 0.08, segs: detail === 0 ? 4 : 5, spread: 0.35, bend: 0.5, base: 0x2b4420, tip: 0x5b7a30, leafy: true });
  const weedMat = envMaterial({ sway: { amp: 0.16, freq: 0.9 }, caustics: 0.6, side: THREE.DoubleSide, roughness: 0.85 });
  const weeds: Placement[] = [];
  const addWeed = (x: number, z: number, frac: number, width: number) => {
    const f = a.floor(x, z);
    const depth = a.surfaceY - f;
    if (depth < 0.5) return;
    const h = Math.min(depth * 0.92, Math.max(0.6, depth * frac));
    const tint = new THREE.Color().setHSL(0.24 + 0.04 * rand(), 0.35 + 0.2 * rand(), 0.45 + 0.2 * rand()).multiplyScalar(1.6);
    weeds.push({ x, y: f - 0.05, z, s: [width, h, width], yaw: rand() * Math.PI * 2, colour: tint });
  };
  for (const e of w.live('weed')) addWeed(e.pos.x, e.pos.z, 0.35 + 0.4 * (e.value ?? 1), range(rand, 1.2, 1.7));
  const filler = byDetail(150, detail);
  for (let i = 0; i < filler; i++) addWeed(range(rand, a.min.x - 1, edgeX - 0.3), range(rand, a.min.z - 1, a.max.z + 1), range(rand, 0.2, 0.5), range(rand, 0.9, 1.5));
  // A dense wall of tall weed right at the edge, so the safe line reads at a glance.
  const edge = byDetail(60, detail);
  for (let i = 0; i < edge; i++) addWeed(edgeX - 0.25 - rand() * 1.5, range(rand, a.min.z, a.max.z), range(rand, 0.5, 0.85), range(rand, 1.1, 1.6));
  group.add(...instancedCells(weedGeo, weedMat, weeds));

  // Short sedge tufts near the shore line.
  const tuftGeo = bladeClumpGeometry(rand, { blades: 9, width: 0.025, segs: 3, spread: 0.25, bend: 0.8, base: 0x3d4a25, tip: 0x7d8a45 });
  const tufts: Placement[] = [];
  for (let i = 0; i < byDetail(160, detail); i++) {
    const x = range(rand, -OUT, OUT);
    const z = range(rand, -OUT, OUT);
    const h = ground(x, z);
    if (h < -2.2 || h > 0.4) continue;
    tufts.push({ x, y: h - 0.02, z, s: [1, range(rand, 0.4, 0.9), 1], yaw: rand() * 6 });
  }
  group.add(...instancedCells(tuftGeo, weedMat, tufts));

  // Sunken logs: one along the shelf, one leaning down the drop-off, two in the bowl.
  const tb = new TubeBuilder();
  const bark = new THREE.Color(0x4a3e2e);
  const m = new THREE.Matrix4();
  const logAt = (x: number, z: number, yaw: number, pitch: number, len: number, r: number, lift = 0) => {
    m.makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(pitch));
    m.setPosition(x, a.floor(x, z) + r * 0.45 + lift, z);
    addLog(tb, rand, m, len, r, bark.clone().multiplyScalar(range(rand, 0.8, 1.15)), 3);
  };
  logAt(edgeX - 4, -14, 0.4, 0, 5, 0.3);
  logAt(edgeX - 0.6, 9, 0.15, -0.55, 8, 0.38, 0.2);
  logAt(-4, 12, 2.2, 0.03, 6, 0.42);
  logAt(6, -10, -0.9, -0.02, 7, 0.36);
  // Sunken branches scattered over the bowl.
  for (let i = 0; i < byDetail(16, detail); i++) {
    const x = range(rand, edgeX + 2, a.max.x - 2);
    const z = range(rand, a.min.z + 2, a.max.z - 2);
    logAt(x, z, rand() * 6, range(rand, -0.05, 0.05), range(rand, 1.2, 3.2), range(rand, 0.05, 0.11), -0.02);
  }
  const logs = new THREE.Mesh(tb.build(), envMaterial({ caustics: 0.8, roughness: 1 }));
  group.add(logs);

  // Rocks: tumbled at the foot of the drop-off, and cobble along the shore.
  const rockMat = envMaterial({ caustics: 1, roughness: 0.92, grain: { amount: 0.3, scale: 5 } });
  const rockGeo = rockGeometry(5, rockLevel(detail, true), { base: 0xffffff, flat: 0.62, rough: 0.26, moss: 0.4 });
  const rocks: Placement[] = [];
  const rockTint = () => stoneTint(rand, 0.17);
  for (let i = 0; i < byDetail(55, detail); i++) {
    const x = edgeX + range(rand, 0.1, 2.6);
    const z = range(rand, a.min.z, a.max.z);
    const s = range(rand, 0.35, 1.0);
    rocks.push({ x, y: a.floor(x, z) + s * 0.15, z, s: [s * 1.2, s, s], yaw: rand() * 6, tilt: rand() * 0.4, colour: rockTint() });
  }
  // Stones set into the drop-off face, so it reads as a bank of rubble rather than a wall.
  for (let i = 0; i < byDetail(110, detail); i++) {
    const z = range(rand, a.min.z, a.max.z);
    const lo = a.floor(edgeX + 0.2, z);
    const hi = a.floor(edgeX - 0.2, z);
    const s = range(rand, 0.3, 0.75);
    rocks.push({ x: edgeX + range(rand, -0.2, 0.15), y: range(rand, lo + s * 0.4, hi - s * 0.2), z, s: [s * 0.8, s * 0.75, s * 1.1], yaw: rand() * 6, tilt: rand() * 0.6, colour: rockTint() });
  }
  for (let i = 0; i < byDetail(120, detail); i++) {
    const x = range(rand, -OUT, OUT);
    const z = range(rand, -OUT, OUT);
    const h = ground(x, z);
    if (h < -2.5 || h > 0.8) continue;
    const s = range(rand, 0.15, 0.5);
    rocks.push({ x, y: h + s * 0.1, z, s, yaw: rand() * 6, colour: rockTint() });
  }
  for (let i = 0; i < byDetail(70, detail); i++) {
    const x = range(rand, edgeX + 3, a.max.x);
    const z = range(rand, a.min.z, a.max.z);
    const s = range(rand, 0.15, 0.8) * (rand() < 0.15 ? 1.8 : 1);
    rocks.push({ x, y: a.floor(x, z) - s * 0.15, z, s: [s * 1.2, s * 0.8, s], yaw: rand() * 6, colour: rockTint() });
  }
  group.add(...instancedCells(rockGeo, rockMat, rocks));

  return { group, handles: ['weed'], ground, down: 0.62 };
}
