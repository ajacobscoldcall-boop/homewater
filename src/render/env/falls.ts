/**
 * The home river's rapids and falls (render only; the rules are in
 * src/sim/stages/falls.ts). The bed itself, the rock step and the plunge pool
 * come from the sim's floor() through coast.ts's terrain; this adds:
 * - boulders in the rapids, standing up through the surface, where the sim's
 *   rocks are, and stones along the foot and crest of the falls;
 * - white water: one Points draw for all of it, each particle on its own
 *   looping path (rapids breaking over rocks, the sheet over the crest, the
 *   curtain down the face, the boil in the plunge pool, the standing wave and
 *   the side channel's small steps);
 * - a driftwood jam across the top of the side channel that swings aside
 *   when the sim opens it (its white water shows the way is there from the start);
 * - the launch spot: brighter foam over the standing wave under the low step,
 *   and the curtain brighter where the low step pours;
 * - the practice ledge in the rapids: a rock shelf by one bank, just awash.
 * Particle counts follow the scenery detail level (Low keeps 40%).
 */
import * as THREE from 'three';
import { fallsLayout, fallsView, type FallsLayout } from '../../sim/stages/falls';
import { returnLayout } from '../../sim/stages/return';
import type { World } from '../../sim/world';
import { sharedWater } from '../water';
import { addLog, byDetail, envMaterial, instanced, range, rockGeometry, rockLevel, seeded, stoneTint, TubeBuilder, type Detail, type Placement } from './kit';
import { FALLS_FX } from './fallsConfig';

export interface FallsParts {
  group: THREE.Group;
  update(w: World, dt: number): void;
}

/** Extra grid lines so the terrain's rock step has a sharp face. */
export function fallsBreaks(w: World): number[] {
  const lay = fallsLayout(w);
  return lay ? [lay.rapidsStart, lay.practiceX[0] - 0.06, lay.practiceX[0], lay.practiceX[1], lay.practiceX[1] + 0.06, lay.poolStart, lay.face - 0.06, lay.face, lay.lipEnd, lay.lipEnd + 0.06].sort((a, b) => a - b) : [];
}

export function buildFalls(w: World, detail: Detail): FallsParts | null {
  const lay = fallsLayout(w);
  const river = returnLayout(w);
  if (!lay || !river) return null;
  const group = new THREE.Group();
  group.name = 'falls';
  const rand = seeded(9107 + Math.round(river.homeMouth));
  const floor = (x: number, z: number) => w.arena.floor(x, z);
  const hm = river.homeMouth;
  const half = river.riverHalf;

  // Boulders: the sim's rapids rocks stand up through the surface; stones line the falls.
  const rockMat = envMaterial({ caustics: 1, roughness: 0.92, grain: { amount: 0.3, scale: 5 } });
  const big = rockGeometry(23, rockLevel(detail, true), { base: 0xffffff, flat: 0.7, rough: 0.3, moss: 0.35 });
  const stones: Placement[] = [];
  const dark = () => stoneTint(rand, 0.24);
  const tall = rockGeometry(31, rockLevel(detail, true), { base: 0xffffff, flat: 0.95, rough: 0.34, moss: 0.25 });
  const tallStones: Placement[] = [];
  for (const r of lay.rocks) {
    const f = floor(r.x, r.z);
    // Two big boulders leaning together, their tops just under the surface where the water breaks white.
    const h = (FALLS_FX.rockTop - f + 0.3) / 0.95;
    tallStones.push({ x: r.x, y: f - 0.3, z: r.z, s: [r.r * 1.35, h, r.r * 1.15], yaw: rand() * 6, tilt: range(rand, -0.08, 0.08), colour: dark() });
    const a = rand() * Math.PI * 2;
    tallStones.push({ x: r.x + Math.cos(a) * r.r * 0.55, y: f - 0.3, z: r.z + Math.sin(a) * r.r * 0.45, s: [r.r * 1.05, h * 0.8, r.r * 0.95], yaw: rand() * 6, tilt: range(rand, 0.1, 0.25), colour: dark() });
    const b = a + Math.PI * range(rand, 0.6, 1.4);
    const s2 = r.r * range(rand, 0.55, 0.75);
    stones.push({ x: r.x + Math.cos(b) * r.r * 1.05, y: f - 0.1, z: r.z + Math.sin(b) * r.r * 1.05, s: [s2 * 1.2, s2, s2], yaw: rand() * 6, colour: dark() });
  }
  const pillars = instanced(tall, rockMat, tallStones);
  if (pillars) group.add(pillars);
  // The foot of the falls: big stones fallen from the step, clear of the launch area under the low step.
  for (let i = 0; i < byDetail(14, detail); i++) {
    const z = hm + range(rand, -half + 0.4, half - 0.4);
    if (Math.abs(z - lay.notchZ) < lay.notchHalf + 0.5) continue;
    if (z > lay.chute[0] - 0.3 && z < lay.chute[1] + 0.3) continue;
    const s = range(rand, 0.45, 0.85);
    stones.push({ x: lay.face - range(rand, 0.2, 0.9), y: floor(lay.face - 1, z) - 0.1, z, s: [s, s * 1.2, s], yaw: rand() * 6, colour: dark() });
  }
  // The crest: a ragged lip of stones, lower at the notch.
  for (let z = hm - half + 0.3; z < hm + half; z += range(rand, 0.7, 1.3)) {
    if (z > lay.chute[0] - 0.2 && z < lay.chute[1] + 0.2) continue;
    const s = range(rand, 0.35, 0.6);
    stones.push({ x: lay.face + range(rand, 0.1, 0.6), y: floor(lay.face + 0.5, z) - 0.15, z, s: [s * 1.2, s * 0.6, s], yaw: rand() * 6, colour: stoneTint(rand, 0.3) });
  }
  // The side channel's small steps, each a sill of stones.
  const [cz0, cz1] = lay.chute;
  const [cx0, cx1] = lay.chuteX;
  for (let k = 1; k < 4; k++) {
    const x = cx0 + ((cx1 - cx0) * k) / 4;
    for (let z = cz0 + 0.2; z < cz1; z += 0.55) {
      const s = range(rand, 0.18, 0.3);
      stones.push({ x, y: floor(x - 0.2, z) - 0.05, z, s: [s * 1.3, s, s], yaw: rand() * 6, colour: stoneTint(rand, 0.34) });
    }
  }
  // The walls of the side channel, between it and the falls.
  const wallZ = lay.chuteSide > 0 ? cz0 - 0.15 : cz1 + 0.15;
  for (let x = cx0 + 0.6; x < lay.lipEnd + 0.8; x += 0.6) {
    const s = range(rand, 0.4, 0.6);
    stones.push({ x, y: floor(x, wallZ - lay.chuteSide * 0.6) - 0.1, z: wallZ, s: [s, s * 1.6, s * 0.7], yaw: rand() * 6, colour: dark() });
  }
  // The practice ledge: a shelf of broad, flat-topped boulders by the bank, its top just under the surface,
  // with a lower step of stones in front so it reads as a ledge rather than a wall.
  {
    const [px0, px1] = lay.practiceX;
    const [pz0, pz1] = lay.practiceZ;
    const base = floor(px0 - 1.5, (pz0 + pz1) / 2);
    const top = floor((px0 + px1) / 2, (pz0 + pz1) / 2);
    const nz = Math.max(3, Math.round((pz1 - pz0) / 0.7));
    for (let i = 0; i < nz; i++) {
      const z = pz0 + ((i + 0.5) * (pz1 - pz0)) / nz;
      const w = (pz1 - pz0) / nz;
      const hTop = top - base + 0.25;
      stones.push({ x: (px0 + px1) / 2 + range(rand, -0.08, 0.08), y: base - 0.25 + hTop / 2, z, s: [(px1 - px0) * 0.72, hTop * 0.55, w * 0.85], yaw: range(rand, -0.2, 0.2), colour: stoneTint(rand, 0.28) });
      const hLow = (top - base) * 0.45;
      stones.push({ x: px0 - 0.45 + range(rand, -0.1, 0.1), y: base + hLow * 0.35, z: z + range(rand, -0.15, 0.15), s: [0.55, hLow * 0.6, w * 0.7], yaw: rand() * 6, colour: dark() });
    }
  }
  const rocks = instanced(big, rockMat, stones);
  if (rocks) group.add(rocks);

  // The jam across the top of the side channel; it swings aside when the channel opens.
  const tb = new TubeBuilder();
  const bark = new THREE.Color(0x4a3e30);
  const m4 = new THREE.Matrix4();
  const span = cz1 - cz0 + 1.2;
  for (let i = 0; i < 3; i++) {
    m4.makeRotationY(Math.PI / 2 + range(rand, -0.15, 0.15));
    m4.setPosition(0, -0.25 - 0.3 * i, (i - 1) * 0.25);
    addLog(tb, rand, m4, span * range(rand, 0.85, 1.05), range(rand, 0.16, 0.24), bark.clone().multiplyScalar(range(rand, 0.75, 1.15)), 2);
  }
  const jam = new THREE.Group();
  const jamMesh = new THREE.Mesh(tb.build(), envMaterial({ caustics: 0.5, roughness: 1 }));
  // Pivot at the bank end, so it swings open like a gate.
  jamMesh.position.set(0, 0, -lay.chuteSide * (span / 2));
  jamMesh.frustumCulled = false;
  jam.add(jamMesh);
  jam.position.set(lay.lipEnd + 0.4, 0, lay.chuteSide > 0 ? cz1 + 0.3 : cz0 - 0.3);
  group.add(jam);

  const water = whiteWater(w, lay, half, hm, detail, rand);
  group.add(water.points);
  const sheet = fallsSheet(w, lay, half, hm);
  group.add(sheet.curtain, sheet.churn, launchSpot(w, lay));

  let open = 0;
  return {
    group,
    update(world, dt) {
      const v = fallsView(world);
      if (!v) return;
      // Swing the jam downstream along the bank when the side channel opens.
      open = Math.min(1, open + (v.sideOpen ? dt / FALLS_FX.jamSwing : -open));
      jam.rotation.y = -lay.chuteSide * open * 1.35;
      water.uChute.value = v.sideOpen ? 1 : FALLS_FX.chuteClosed;
    },
  };
}

/**
 * All the falls' white water in one draw. Each particle follows
 * p(t) = p0 + v t + (0, g t^2 / 2, 0) for t looping over its period, fading
 * in and out at the ends of its path.
 */
function whiteWater(w: World, lay: FallsLayout, half: number, hm: number, detail: Detail, rand: () => number) {
  const p0: number[] = [];
  const vel: number[] = [];
  const misc: number[] = []; // period, phase, size, alpha
  const grav: number[] = [];
  const chute: number[] = [];
  const floor = (x: number, z: number) => w.arena.floor(x, z);
  const add = (x: number, y: number, z: number, vx: number, vy: number, vz: number, g: number, period: number, size: number, alpha: number, inChute = 0) => {
    p0.push(x, y, z);
    vel.push(vx, vy, vz);
    grav.push(g);
    misc.push(period, rand(), size, alpha);
    chute.push(inChute);
  };
  const [cz0, cz1] = lay.chute;
  const inChute = (z: number) => z > cz0 - 0.1 && z < cz1 + 0.1;
  const notchK = (z: number) => Math.max(0, 1 - Math.abs(z - lay.notchZ) / lay.notchHalf);
  const n = (k: number) => byDetail(k, detail);
  const F = FALLS_FX;

  // The sheet over the crest: fast water sliding over the lip, thickest at the notch.
  for (let i = 0; i < n(F.sheet); i++) {
    const z = hm + range(rand, -half + 0.2, half - 0.2);
    if (inChute(z)) continue;
    if (rand() > 0.35 + 0.65 * notchK(z)) continue;
    const y = floor(lay.face + 0.7, z) + range(rand, 0.05, 0.3);
    add(lay.lipEnd + 2.5, Math.min(-0.08, y + 0.15), z, -range(rand, 3.5, 5), -0.05, 0, 0, (lay.lipEnd + 2.5 - lay.face) / 4.2, 3.2, 0.5);
  }
  // The curtain: water and air pouring off the lip, down the face, spreading as it falls.
  for (let i = 0; i < n(F.curtain); i++) {
    const z = hm + range(rand, -half + 0.2, half - 0.2);
    if (inChute(z)) continue;
    const thick = 0.45 + 0.55 * notchK(z);
    if (rand() > thick) continue;
    const top = floor(lay.face + 0.2, z) + 0.05;
    const depth = -floor(lay.face - 1, z) + top;
    const g = -range(rand, 6, 9);
    const period = Math.sqrt((2 * depth) / -g) * range(rand, 0.75, 1.0);
    add(lay.face + 0.05, top, z + range(rand, -0.1, 0.1), -range(rand, 0.4, 1.3), -range(rand, 0.2, 0.8), range(rand, -0.15, 0.15), g, period, range(rand, 3, 5), 0.6);
  }
  // The boil: bubbles driven to the bottom of the pool rise and spread downstream to the standing wave.
  for (let i = 0; i < n(F.boil); i++) {
    const z = hm + range(rand, -half + 0.4, half - 0.4);
    if (inChute(z)) continue;
    const y = floor(lay.face - 0.8, z) + range(rand, 0.2, 1.4);
    const rise = range(rand, 1.2, 2.2);
    const period = -y / rise;
    add(lay.face - range(rand, 0.3, 1.1), y, z, -(lay.face - lay.waveX + range(rand, -0.6, 0.8)) / period, rise, range(rand, -0.3, 0.3), 0, period, range(rand, 2, 3.5), 0.4);
  }
  // The standing wave: a band of foam just under the surface that holds its place, churning.
  for (let i = 0; i < n(F.wave); i++) {
    const z = hm + range(rand, -half + 0.2, half - 0.2);
    if (inChute(z)) continue;
    const x = lay.waveX + range(rand, -0.5, 0.9) + 0.4 * notchK(z);
    add(x + 0.5, -range(rand, 0.05, 0.3), z, -range(rand, 0.6, 1.4), range(rand, -0.15, 0.1), range(rand, -0.3, 0.3), 0, range(rand, 0.6, 1.1), range(rand, 3.5, 5.5), 0.55);
  }
  // The launch spot: a dense boil of bubbles just under the standing wave below the low step (where a leap goes best).
  const rx = w.p.get('return.leapWaveReach');
  const rz = w.p.get('return.leapNotchReach');
  for (let i = 0; i < n(F.launchBoil); i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    const z = lay.notchZ + Math.sin(a) * r * rz * 0.8;
    if (inChute(z)) continue;
    const y = -range(rand, 0.4, 1.6);
    const rise = range(rand, 0.6, 1.2);
    add(lay.waveX + Math.cos(a) * r * rx * 0.7, y, z, -range(rand, 0.2, 0.6), rise, range(rand, -0.15, 0.15), 0, -y / rise, range(rand, 3, 5), 0.6);
  }
  // Surface foam drifting away from the falls across the pool.
  for (let i = 0; i < n(F.poolFoam); i++) {
    const z = hm + range(rand, -half + 0.2, half - 0.2);
    add(lay.face - range(rand, 0, 0.5), -range(rand, 0.03, 0.15), z, -range(rand, 1.5, 3), 0, range(rand, -0.2, 0.2), 0, range(rand, 1.5, 2.8), range(rand, 2.5, 4), 0.35);
  }
  // The rapids: water breaking over and around each boulder, streaming off downstream.
  for (const r of lay.rocks) {
    for (let i = 0; i < n(F.perRock); i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const z = r.z + side * r.r * range(rand, 0.7, 1.2);
      add(r.x + range(rand, 0, r.r), -range(rand, 0.03, 0.4), z, -range(rand, 3, 5.5), range(rand, -0.2, 0.05), side * range(rand, 0.2, 0.9), 0, range(rand, 0.5, 1.1), range(rand, 2.5, 4.5), 0.5);
    }
  }
  for (let i = 0; i < n(F.rapids); i++) {
    const x = range(rand, lay.rapidsStart - 1, lay.poolStart + 0.5);
    add(x, -range(rand, 0.03, 0.35), hm + range(rand, -half + 0.3, half - 0.3), -range(rand, 3.5, 5.5), 0, 0, 0, range(rand, 0.6, 1.4), range(rand, 2, 3.5), 0.35);
  }
  // The practice ledge: water breaking over the shelf and pouring off its downstream edge.
  for (let i = 0; i < n(F.practice); i++) {
    const z = range(rand, lay.practiceZ[0] + 0.1, lay.practiceZ[1] - 0.1);
    add(lay.practiceX[1] + 0.1, -range(rand, 0.02, 0.12), z, -range(rand, 2.5, 3.5), -range(rand, 0, 0.6), 0, -4, range(rand, 0.4, 0.7), range(rand, 2.5, 4), 0.55);
  }
  // The side channel: tumbling over each small step.
  for (let i = 0; i < n(F.chute); i++) {
    const t = Math.floor(rand() * 4);
    const x = lay.chuteX[0] + ((lay.chuteX[1] - lay.chuteX[0]) * (t + 1)) / 4;
    const z = range(rand, cz0 + 0.1, cz1 - 0.1);
    add(x, floor(x + 0.1, z) + 0.4, z, -range(rand, 1.5, 2.5), -range(rand, 0.3, 0.8), 0, -6, range(rand, 0.4, 0.7), range(rand, 2.5, 4), 0.5, 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p0, 3));
  geo.setAttribute('aVel', new THREE.Float32BufferAttribute(vel, 3));
  geo.setAttribute('aGrav', new THREE.Float32BufferAttribute(grav, 1));
  geo.setAttribute('aMisc', new THREE.Float32BufferAttribute(misc, 4));
  geo.setAttribute('aChute', new THREE.Float32BufferAttribute(chute, 1));
  const uChute = { value: F.chuteClosed as number };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: sharedWater.uTime, uLight: sharedWater.uLight, uChute, uFar: { value: new THREE.Vector2(F.fadeNear, F.fadeFar) } },
    vertexShader: /* glsl */ `
      attribute vec3 aVel; attribute float aGrav; attribute vec4 aMisc; attribute float aChute;
      uniform float uTime; uniform float uChute; uniform vec2 uFar;
      varying float vA;
      void main() {
        float period = aMisc.x;
        float t = mod(uTime + aMisc.y * period, period);
        vec3 p = position + aVel * t;
        p.y += 0.5 * aGrav * t * t;
        p.y = min(p.y, -0.02);
        float k = t / period;
        vA = aMisc.w * smoothstep(0.0, 0.12, k) * smoothstep(1.0, 0.75, k) * mix(1.0, uChute, aChute);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(aMisc.z * 9.0 / -mv.z, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
        vA *= 1.0 - smoothstep(uFar.x, uFar.y, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLight;
      varying float vA;
      void main() {
        float d = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(0.9, 0.96, 0.98), d * vA * (0.4 + 0.6 * uLight));
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'fallsWater';
  return { points, uChute };
}

/**
 * The falling water as surfaces: a translucent white curtain streaming down
 * the face (thicker under the low step), and the churned white underside of
 * the surface over the plunge pool, fading out at the standing wave.
 * Two draws, one shader.
 */
function fallsSheet(w: World, lay: FallsLayout, half: number, hm: number) {
  const F = FALLS_FX;
  const [cz0, cz1] = lay.chute;
  // The curtain spans the river except the side channel.
  const z0 = lay.chuteSide > 0 ? hm - half : cz1;
  const z1 = lay.chuteSide > 0 ? cz0 : hm + half;
  const top = -0.1;
  const bottom = Math.min(w.arena.floor(lay.face - 0.5, hm), w.arena.floor(lay.face - 0.5, lay.notchZ)) - 0.2;
  const uniforms = {
    uTime: sharedWater.uTime,
    uLight: sharedWater.uLight,
    uNotch: { value: new THREE.Vector2(lay.notchZ, lay.notchHalf) },
    uBright: { value: F.notchBright as number },
    uFar: { value: new THREE.Vector2(F.fadeNear + 6, F.fadeFar + 10) },
  };
  const vertexShader = /* glsl */ `
    varying vec3 vW; varying vec2 vUv; varying float vDist;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const noise = /* glsl */ `
    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
    }`;
  const curtainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLight; uniform vec2 uNotch; uniform vec2 uFar; uniform float uBright;
      varying vec3 vW; varying vec2 vUv; varying float vDist;
      ${noise}
      void main() {
        float notch = max(0.0, 1.0 - abs(vW.z - uNotch.x) / uNotch.y);
        notch = notch * (1.0 + uBright);
        // Streaks pouring down: stretched noise moving down fast.
        float s = vn(vec2(vW.z * 3.0, vW.y * 0.7 + uTime * 3.2)) * 0.6 + vn(vec2(vW.z * 9.0, vW.y * 1.6 + uTime * 5.0)) * 0.4;
        float a = smoothstep(0.35, 0.85, s) * (0.32 + 0.4 * notch);
        // Brightest at the lip and in the churn at the foot.
        a += 0.25 * smoothstep(0.75, 1.0, vUv.y) + 0.35 * smoothstep(0.25, 0.0, vUv.y) * (0.6 + 0.4 * vn(vec2(vW.z * 2.0 + uTime, uTime * 2.0)));
        a *= smoothstep(0.0, 0.4, min(vUv.x, 1.0 - vUv.x) * 20.0);
        a *= 1.0 - smoothstep(uFar.x, uFar.y, vDist);
        gl_FragColor = vec4(vec3(0.88, 0.95, 0.97) * (0.55 + 0.45 * uLight), clamp(a, 0.0, 0.85));
      }`,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, top - bottom, 1, 1), curtainMat);
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(lay.face - 0.12, (top + bottom) / 2, (z0 + z1) / 2);
  curtain.renderOrder = 2;
  curtain.name = 'fallsCurtain';
  // Placed by its transform, which the scenery's fog culling doesn't read: always drawn.
  curtain.frustumCulled = false;
  const churnMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...uniforms, uWave: { value: lay.waveX } },
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLight; uniform vec2 uNotch; uniform vec2 uFar; uniform float uWave;
      varying vec3 vW; varying vec2 vUv; varying float vDist;
      ${noise}
      void main() {
        // Foam carried away from the falls, boiling up at the standing wave.
        float f = vn(vec2(vW.x * 1.6 + uTime * 1.8, vW.z * 1.6)) * 0.55 + vn(vec2(vW.x * 4.5 + uTime * 3.0, vW.z * 4.5 - uTime)) * 0.45;
        float near = smoothstep(uWave - 1.8, uWave + 0.6, vW.x);
        float wave = exp(-pow((vW.x - uWave) / 0.5, 2.0));
        float a = smoothstep(0.3, 0.75, f) * (0.25 + 0.5 * near) + 0.35 * wave * f;
        a *= smoothstep(0.0, 0.5, min(vUv.y, 1.0 - vUv.y) * 14.0);
        a *= 1.0 - smoothstep(uFar.x, uFar.y, vDist);
        gl_FragColor = vec4(vec3(0.9, 0.96, 0.98) * (0.55 + 0.45 * uLight), clamp(a, 0.0, 0.8));
      }`,
  });
  const x0 = lay.waveX - 2.2;
  const churn = new THREE.Mesh(new THREE.PlaneGeometry(lay.face - x0, half * 2, 1, 1), churnMat);
  churn.rotation.x = -Math.PI / 2;
  churn.position.set((lay.face + x0) / 2, -0.06, hm);
  churn.renderOrder = 2;
  churn.name = 'fallsChurn';
  churn.frustumCulled = false;
  return { curtain, churn };
}

/**
 * The launch spot: brighter foam on the underside of the surface over the
 * standing wave, centred under the low step and as wide as the sim's reach for
 * the spot's bonus. Natural white water, just more of it where a leap goes
 * best; shown in every view, Documentary included. One draw.
 */
function launchSpot(w: World, lay: FallsLayout): THREE.Mesh {
  const F = FALLS_FX.launch;
  const rx = w.p.get('return.leapWaveReach');
  const rz = w.p.get('return.leapNotchReach');
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: sharedWater.uTime,
      uLight: sharedWater.uLight,
      uLook: { value: new THREE.Vector3(F.opacity, F.breathe, F.pulse) },
      uFar: { value: new THREE.Vector2(FALLS_FX.fadeNear + 10, FALLS_FX.fadeFar + 14) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW; varying float vDist;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uLight; uniform vec3 uLook; uniform vec2 uFar;
      varying vec2 vUv; varying vec3 vW; varying float vDist;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 d = vUv * 2.0 - 1.0;
        float r = length(d);
        float body = smoothstep(1.0, 0.35, r);
        float foam = vn(vec2(vW.x * 3.0 + uTime * 1.4, vW.z * 2.2)) * 0.6 + vn(vec2(vW.x * 7.0 - uTime * 2.1, vW.z * 6.0 + uTime)) * 0.4;
        float breathe = 1.0 - uLook.y * (0.5 + 0.5 * sin(uTime * 6.2832 / uLook.z));
        float a = body * (0.45 + 0.55 * smoothstep(0.25, 0.7, foam)) * uLook.x * breathe;
        a *= 1.0 - smoothstep(uFar.x, uFar.y, vDist);
        gl_FragColor = vec4(vec3(0.94, 0.98, 1.0) * (0.6 + 0.4 * uLight), clamp(a, 0.0, 0.9));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * rx, 2 * rz, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(lay.waveX, -0.04, lay.notchZ);
  mesh.renderOrder = 2;
  mesh.name = 'fallsLaunch';
  // Placed by its transform, which the scenery's fog culling doesn't read: always drawn.
  mesh.frustumCulled = false;
  return mesh;
}
