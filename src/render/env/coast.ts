/**
 * The return: a sandy coastal shelf rising to a rocky coastline, three river
 * mouths, and the home river with riffles (shallow, cobbly, frothy: where the
 * bears fish), pools between them, undercut root-hung banks and the fork with
 * a gravel bar and log jam at its tip. Banks are built from the simulation's
 * wall boxes: every bank face starts exactly at a wall edge, so where the
 * fish stops is where the bank is.
 */
import * as THREE from 'three';
import type { Box } from '../../sim/stages';
import { isRiffle, returnLayout } from '../../sim/stages/return';
import type { World } from '../../sim/world';
import { sharedWater } from '../water';
import type { EnvParts } from './index';
import { addLog, bladeClumpGeometry, byDetail, envMaterial, fbm, gridLines, hangingRoot, instanced, instancedCells, range, rockGeometry, rockLevel, seeded, smoothstep, stoneTint, terrain, TubeBuilder, type Detail, type Placement } from './kit';
import { LandMask } from './landmask';

const EXTRA = 30;

export function buildCoast(w: World, detail: Detail): EnvParts {
  const group = new THREE.Group();
  const a = w.arena;
  const lay = returnLayout(w) ?? { coast: 90, fork: 175, homeMouth: 0, homeSide: 1, riverHalf: 7 };
  const rand = seeded(5501 + Math.round(lay.homeMouth));
  const L = a.max.x;
  const HALF = a.max.z;
  const coast = lay.coast;
  const hm = lay.homeMouth;

  // The sim's walls, carried on past the arena so the land doesn't stop at its edges.
  const walls: Box[] = (a.walls ?? []).map((b) => ({ min: { ...b.min }, max: { ...b.max, x: b.max.x >= L ? L + EXTRA : b.max.x } }));
  walls.push({ min: { x: coast, y: -20, z: HALF }, max: { x: L + EXTRA, y: 2, z: HALF + EXTRA } });
  walls.push({ min: { x: coast, y: -20, z: -HALF - EXTRA }, max: { x: L + EXTRA, y: 2, z: -HALF } });
  const res = detail === 0 ? 0.4 : 0.25;
  const mask = new LandMask(walls, coast - 1, L + EXTRA, -HALF - EXTRA, HALF + EXTRA, res);

  // Narrow walls (the fork's divider) become steep-sided gravel bars rather than a knife-edge ridge.
  const narrow = walls.filter((b) => Math.min(b.max.x - b.min.x, b.max.z - b.min.z) <= 2.5);
  const inNarrow = (x: number, z: number) => narrow.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);
  const floor = (x: number, z: number) => a.floor(Math.min(L, x), z);
  const ground = (x: number, z: number): number => {
    if (x <= coast || !mask.isLand(x, z)) return floor(x, z) + 0.05 * fbm(x * 0.7, z * 0.7, 2, 1);
    const d = mask.distance(x, z);
    const [sx, sz] = mask.nearestWater(x, z);
    const base = floor(sx, sz);
    const top = inNarrow(x, z) ? 0.35 + 0.15 * fbm(x * 0.5, z, 2, 2) : 1.5 + 0.6 * fbm(x * 0.08, z * 0.08, 2, 2);
    const ramp = inNarrow(x, z) ? 0.45 : 1.0 + 0.6 * (fbm(x * 0.15, z * 0.15, 2, 3) + 0.5);
    const s = smoothstep(0, ramp, d);
    return base + (top - base) * s + 0.35 * fbm(x * 0.45, z * 0.45, 2, 4) * s * (1 - s * 0.5);
  };

  // Grid: coarse over the open shelf, fine along the coast and rivers, with every wall edge on a grid line.
  const f = detail === 2 ? 1 : detail === 1 ? 1.4 : 2;
  const breaksX: number[] = [];
  const breaksZ: number[] = [];
  for (const b of walls) {
    breaksX.push(b.min.x, b.max.x);
    breaksZ.push(b.min.z, b.max.z);
  }
  const xs = [...gridLines(-25, coast - 8, 1.4 * f), ...gridLines(coast - 8, L + EXTRA, 0.5 * f, breaksX)].filter((v, i, arr) => i === 0 || v - arr[i - 1]! > 1e-4);
  const zs = [...gridLines(-HALF - EXTRA, -HALF - 2, 1.5 * f), ...gridLines(-HALF - 2, HALF + 2, 0.5 * f, breaksZ), ...gridLines(HALF + 2, HALF + EXTRA, 1.5 * f)].filter((v, i, arr) => i === 0 || v - arr[i - 1]! > 1e-4);

  const sand = new THREE.Color(0x7a7260);
  const sandDeep = new THREE.Color(0x4c5048);
  const gravel = new THREE.Color(0x726a56);
  const riffle = new THREE.Color(0x8d8468);
  const pool = new THREE.Color(0x46483a);
  const earth = new THREE.Color(0x3b3226);
  const moss = new THREE.Color(0x3e4a25);
  const rockFace = new THREE.Color(0x5a564c);
  const turf = new THREE.Color(0x56602f);
  const inHome = (z: number) => Math.abs(z - hm) <= lay.riverHalf;
  const land = terrain(xs, zs, ground, (x, z, h, out, steep) => {
    if (x <= coast || !mask.isLand(x, z)) {
      if (x < coast) {
        // Sand with ripples, greyer and darker in deeper water.
        out.copy(sand).lerp(sandDeep, smoothstep(5, 12, -h));
        out.multiplyScalar((0.9 + 0.08 * Math.sin(x * 2.2 + 3 * fbm(x * 0.2, z * 0.2, 2, 5)) + 0.1 * fbm(x * 1.5, z * 1.5, 2, 6)) * (0.8 + 0.35 * (fbm(x * 0.05, z * 0.05, 3, 13) + 0.5)));
      } else {
        out.copy(gravel);
        if (inHome(z)) {
          const r = isRiffle(x) ? 1 : 0;
          out.lerp(riffle, 0.6 * r).lerp(pool, (1 - r) * smoothstep(3, 4.5, -h) * 0.7);
        }
        out.multiplyScalar((0.8 + 0.35 * fbm(x * 2.6, z * 2.6, 2, 7)) * (0.78 + 0.4 * (fbm(x * 0.08, z * 0.2, 3, 14) + 0.5)));
      }
      return;
    }
    const d = mask.distance(x, z);
    out.copy(earth).lerp(rockFace, 0.5 * (0.5 + fbm(x * 0.6, z * 0.6, 2, 8))).lerp(moss, 0.35 * smoothstep(-2, -0.4, h));
    if (x < coast + 3) out.lerp(rockFace, 0.5);
    // Steep faces show bands of rock and earth.
    out.multiplyScalar(1 + 0.22 * smoothstep(0.3, 0.7, steep) * Math.sin(h * 2.7 + 2.2 * fbm(x * 0.25, z * 0.25, 2, 15)));
    if (h > -0.15) out.lerp(turf, smoothstep(-0.15, 0.5, h));
    out.multiplyScalar(0.85 + 0.2 * fbm(x * 2, z * 2, 2, 9) - 0.1 * smoothstep(0.2, 0, d));
  }, envMaterial({ caustics: 1, grain: { amount: 0.45, scale: 2.6 } }));
  group.add(...land);

  // Rocks: boulders along every bank toe and the coastline; cobble on the riffles and the shelf.
  const rockMat = envMaterial({ caustics: 1, roughness: 0.92, grain: { amount: 0.3, scale: 5 } });
  const boulderGeo = rockGeometry(9, rockLevel(detail, true), { base: 0xffffff, flat: 0.7, rough: 0.28, moss: 0.45 });
  const cobbleGeo = rockGeometry(17, rockLevel(detail, false), { base: 0xffffff, flat: 0.72, rough: 0.16 });
  const tint = (l = 0.3) => stoneTint(rand, l * 0.68);
  const boulders: Placement[] = [];
  const target = byDetail(650, detail);
  for (let tries = 0; tries < target * 60 && boulders.length < target; tries++) {
    const x = range(rand, coast - 0.5, L + EXTRA * 0.6);
    const z = range(rand, -HALF - 3, HALF + 3);
    const d = mask.distance(x, z);
    if (d < 0.05 || d > 1.3) continue;
    // Smaller near the face, so they don't jut into water the fish can use.
    const s = Math.min(1.5, 0.3 + d * 0.9) * range(rand, 0.75, 1.15);
    boulders.push({ x, y: ground(x, z) - s * 0.3, z, s: [s * range(rand, 1, 1.4), s * 0.85, s], yaw: rand() * 6, tilt: rand() * 0.3, colour: tint() });
  }
  // A few on the shelf off the coast.
  for (let i = 0; i < byDetail(40, detail); i++) {
    const x = range(rand, 55, coast - 1);
    const z = range(rand, -HALF, HALF);
    const s = range(rand, 0.4, 1.1);
    boulders.push({ x, y: floor(x, z) - s * 0.3, z, s: [s * 1.2, s * 0.8, s], yaw: rand() * 6, colour: tint(0.32) });
  }
  // Riffle boulders toward the edges, where the water breaks over them.
  for (let x = coast + 3; x < L; x += range(rand, 1.2, 2.6)) {
    if (!isRiffle(x)) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const zc = side * range(rand, 3.2, lay.riverHalf - 0.3);
    if (x > lay.fork && Math.abs(zc) < 1.6) continue;
    const s = range(rand, 0.35, 0.65);
    boulders.push({ x, y: floor(x, hm + zc) - s * 0.3, z: hm + zc, s: [s * 1.2, s * 0.8, s], yaw: rand() * 6, colour: tint(0.36) });
  }
  // Pool boulders, low along the edges of the home river's pools.
  for (let x = coast + 4; x < L; x += range(rand, 3, 7)) {
    if (isRiffle(x)) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const zc = side * range(rand, lay.riverHalf - 1.6, lay.riverHalf - 0.4);
    if (x > lay.fork && Math.abs(zc) < 1.6) continue;
    const s = range(rand, 0.4, 0.8);
    boulders.push({ x, y: floor(x, hm + zc) - s * 0.35, z: hm + zc, s: [s * 1.3, s * 0.75, s], yaw: rand() * 6, colour: tint(0.34) });
  }
  group.add(...instancedCells(boulderGeo, rockMat, boulders));

  const cobbles: Placement[] = [];
  const nCob = byDetail(900, detail);
  for (let tries = 0; tries < nCob * 4 && cobbles.length < nCob; tries++) {
    const x = range(rand, coast, L);
    const z = hm + range(rand, -lay.riverHalf, lay.riverHalf);
    if (mask.isLand(x, z)) continue;
    const r = isRiffle(x);
    if (!r && rand() < 0.65) continue;
    const s = range(rand, 0.12, r ? 0.38 : 0.25);
    cobbles.push({ x, y: floor(x, z) - s * 0.25, z, s: [s * 1.25, s * 0.8, s], yaw: rand() * 6, colour: tint(r ? 0.45 : 0.36) });
  }
  // Wrong rivers' beds and the shelf near the mouths.
  for (let i = 0; i < byDetail(260, detail); i++) {
    const x = range(rand, coast - 14, coast + 32);
    const z = range(rand, -HALF, HALF);
    if (mask.isLand(x, z)) continue;
    const s = range(rand, 0.12, 0.3);
    cobbles.push({ x, y: floor(x, z) - s * 0.25, z, s: [s * 1.2, s * 0.8, s], yaw: rand() * 6, colour: tint(0.36) });
  }
  group.add(...instancedCells(cobbleGeo, rockMat, cobbles));

  // Roots hanging from undercut banks, and the log jam at the fork's tip.
  const tb = new TubeBuilder();
  const root = new THREE.Color(0x3b2e22);
  const flow = new THREE.Vector2(-0.5, 0);
  const nRoot = byDetail(110, detail);
  let roots = 0;
  for (let tries = 0; tries < nRoot * 200 && roots < nRoot; tries++) {
    const x = range(rand, coast + 4, L + 10);
    const z = range(rand, -HALF, HALF);
    const d = mask.distance(x, z);
    if (d < 0.03 || d > 0.3) continue;
    roots++;
    const cluster = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < cluster; k++) {
      hangingRoot(tb, rand, new THREE.Vector3(x + range(rand, -0.5, 0.5), 0.05, z), range(rand, 0.4, 1.5), range(rand, 0.02, 0.05), root.clone().multiplyScalar(range(rand, 0.8, 1.2)), flow, 5);
    }
  }
  const bark = new THREE.Color(0x4a3e30);
  const m = new THREE.Matrix4();
  const jam = (x: number, z: number, yaw: number, len: number, r: number, y: number) => {
    m.makeRotationY(yaw);
    m.setPosition(x, y, z);
    addLog(tb, rand, m, len, r, bark.clone().multiplyScalar(range(rand, 0.8, 1.2)), 3);
  };
  jam(lay.fork + 0.3, hm - 0.3, -0.12, 6, 0.32, -0.35);
  jam(lay.fork + 0.8, hm + 0.35, 0.1, 5, 0.26, 0.05);
  jam(lay.fork + 2.5, hm, 0.0, 4, 0.22, 0.4);
  // A sunken trunk along the side of some pools: where anglers' lures swing.
  for (let x = coast + 12; x < lay.fork - 8; x += 34) {
    const px = x + range(rand, 10, 20);
    if (isRiffle(px)) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const zc = side * (lay.riverHalf - 1.0);
    m.makeRotationY(side * 0.12 + Math.PI);
    m.setPosition(px + 3, floor(px, hm + zc) + 0.2, hm + zc);
    addLog(tb, rand, m, range(rand, 5, 7), 0.3, bark.clone().multiplyScalar(0.8), 3);
  }
  const rootMesh = new THREE.Mesh(tb.build(), envMaterial({ sway: { amp: 0.05, freq: 1.5, flowX: -0.08 }, caustics: 0.5, roughness: 1 }));
  group.add(rootMesh);

  // Grass trailing from the bank lips.
  const grassGeo = bladeClumpGeometry(rand, { blades: 7, width: 0.03, segs: 4, spread: 0.3, bend: 1.2, base: 0x4a5528, tip: 0x6d7a3a });
  const grass: Placement[] = [];
  const nGrass = byDetail(600, detail);
  for (let tries = 0; tries < nGrass * 150 && grass.length < nGrass; tries++) {
    const x = range(rand, coast + 1, L + 10);
    const z = range(rand, -HALF, HALF);
    const d = mask.distance(x, z);
    if (d < 0.02 || d > 0.35) continue;
    grass.push({ x, y: 0.08, z, s: [1, -range(rand, 0.35, 0.9), 1], yaw: rand() * 6 });
  }
  group.add(...instancedCells(grassGeo, envMaterial({ sway: { amp: 0.12, freq: 1.4, flowX: -0.12 }, caustics: 0.4, side: THREE.DoubleSide }), grass));

  group.add(riffleFroth(w, lay, mask, rand, detail));
  return { group, ground, down: 0.7 };
}

/** White water over the riffles: bubbles streaming downstream just under the surface. */
function riffleFroth(w: World, lay: { coast: number; fork: number; homeMouth: number; riverHalf: number }, mask: LandMask, rand: () => number, detail: Detail): THREE.Points {
  const zones: [number, number][] = [];
  let start = -1;
  for (let x = lay.coast; x <= w.arena.max.x; x += 0.5) {
    const r = isRiffle(x);
    if (r && start < 0) start = x;
    if (!r && start >= 0) {
      zones.push([start, x - start]);
      start = -1;
    }
  }
  const pos: number[] = [];
  const zone: number[] = [];
  const phase: number[] = [];
  const per = byDetail(380, detail);
  for (const [x0, span] of zones) {
    for (let i = 0; i < per; i++) {
      const z = lay.homeMouth + range(rand, -lay.riverHalf + 0.3, lay.riverHalf - 0.3);
      const x = x0 + rand() * span;
      if (mask.isLand(x, z)) continue;
      pos.push(x, -range(rand, 0.04, 0.4), z);
      zone.push(x0, span);
      phase.push(rand());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aZone', new THREE.Float32BufferAttribute(zone, 2));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: sharedWater.uTime, uLight: sharedWater.uLight },
    vertexShader: /* glsl */ `
      attribute vec2 aZone; attribute float aPhase;
      uniform float uTime;
      varying float vA;
      void main() {
        vec3 p = position;
        float run = mod(p.x - aZone.x - uTime * (2.5 + 1.5 * aPhase), aZone.y);
        p.x = aZone.x + run;
        p.y += 0.06 * sin(uTime * 7.0 + aPhase * 40.0);
        // Fade in and out at the ends of the riffle.
        vA = smoothstep(0.0, 1.5, run) * smoothstep(0.0, 1.5, aZone.y - run);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(26.0 / -mv.z, 1.0, 4.0);
        gl_Position = projectionMatrix * mv;
        vA *= 1.0 - smoothstep(10.0, 26.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLight;
      varying float vA;
      void main() {
        float d = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(0.9, 0.96, 0.98), d * vA * 0.45 * (0.4 + 0.6 * uLight));
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
