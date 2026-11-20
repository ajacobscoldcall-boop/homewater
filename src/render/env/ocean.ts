/**
 * The ocean: open blue with no seafloor (advisor: sockeye stay in the top
 * 20-40 m). Depth reads from the dome gradient and the renderer's depth tint.
 * Far off, bait balls flicker silver; near the surface, the odd raft of
 * drift kelp and a few floating sticks drift with the current.
 */
import * as THREE from 'three';
import type { World } from '../../sim/world';
import { sharedWater } from '../water';
import type { EnvParts } from './index';
import { bladeClumpGeometry, byDetail, envMaterial, instanced, range, seeded, TubeBuilder, type Detail, type Placement } from './kit';

export function buildOcean(w: World, detail: Detail, fog: THREE.FogExp2): EnvParts {
  const group = new THREE.Group();
  const rand = seeded(4409);
  const a = w.arena;

  // Distant bait balls: flickering points that keep their distance from the camera.
  const balls = 5;
  const per = byDetail(260, detail);
  const centre: number[] = [];
  const offset: number[] = [];
  const phase: number[] = [];
  for (let b = 0; b < balls; b++) {
    const ang = (b / balls) * Math.PI * 2 + rand() * 0.8;
    const dist = range(rand, 24, 40);
    const cy = range(rand, -24, -6);
    const r = range(rand, 2.5, 4.5);
    for (let i = 0; i < per; i++) {
      centre.push(Math.cos(ang) * dist, cy, Math.sin(ang) * dist);
      // A squashed ball, denser in the middle.
      const u = rand() * Math.PI * 2;
      const v = Math.acos(2 * rand() - 1);
      const rr = r * Math.cbrt(rand());
      offset.push(Math.sin(v) * Math.cos(u) * rr * 1.3, Math.cos(v) * rr * 0.7, Math.sin(v) * Math.sin(u) * rr);
      phase.push(rand() * 100);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(offset, 3));
  geo.setAttribute('aCentre', new THREE.Float32BufferAttribute(centre, 3));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  const shimmer = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: sharedWater.uTime, uLight: sharedWater.uLight, uFog: { value: fog.color } },
    vertexShader: /* glsl */ `
      attribute vec3 aCentre; attribute float aPhase;
      uniform float uTime;
      varying float vFlash;
      void main() {
        // The school wheels around its centre; each fish flashes as it turns.
        float t = uTime * 0.25 + aPhase * 0.01;
        float c = cos(t), s = sin(t);
        vec3 p = vec3(c * position.x - s * position.z, position.y + 0.3 * sin(uTime + aPhase), s * position.x + c * position.z);
        vec4 mv = modelViewMatrix * vec4(aCentre + p, 1.0);
        vFlash = pow(max(0.0, sin(uTime * 2.3 + aPhase)), 12.0);
        gl_PointSize = clamp(80.0 / -mv.z, 1.5, 3.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLight; uniform vec3 uFog;
      varying float vFlash;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = smoothstep(0.5, 0.0, length(q));
        vec3 col = mix(uFog * 1.6, vec3(0.85, 0.92, 1.0), 0.35 + 0.65 * vFlash);
        gl_FragColor = vec4(col * d * (0.16 + 0.7 * vFlash) * uLight, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, shimmer);
  points.frustumCulled = false;
  group.add(points);

  // Drift kelp rafts and floating sticks near the surface, drifting with the current.
  const drift = new THREE.Group();
  const tb = new TubeBuilder();
  const stipe = new THREE.Color(0x5a4a26);
  const blades: Placement[] = [];
  const rafts = byDetail(6, detail);
  for (let r = 0; r < rafts; r++) {
    const cx = range(rand, a.min.x + 10, a.max.x - 10);
    const cz = range(rand, a.min.z + 10, a.max.z - 10);
    const n = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      // Bull kelp: a long stipe trailing from a float at the surface, blades fanning from it.
      const bx = cx + range(rand, -1.2, 1.2);
      const bz = cz + range(rand, -1.2, 1.2);
      const len = range(rand, 3, 6);
      const pts: THREE.Vector3[] = [];
      const sw: number[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        pts.push(new THREE.Vector3(bx - t * len * 0.75, -0.25 - t * len * 0.55 + Math.sin(t * 3 + i) * 0.3, bz + Math.sin(t * 2 + r) * 0.8));
        sw.push(t);
      }
      tb.tube(pts, [0.06, 0.05, 0.04, 0.035, 0.03, 0.025, 0.02], stipe, sw, 4);
      tb.tube([new THREE.Vector3(bx - 0.18, -0.25, bz), new THREE.Vector3(bx + 0.05, -0.22, bz), new THREE.Vector3(bx + 0.2, -0.25, bz)], [0.09, 0.16, 0.08], stipe.clone().multiplyScalar(1.2), null, 6);
      blades.push({ x: bx + 0.2, y: -0.2, z: bz, s: [1.5, -range(rand, 1.6, 3), 1.5], yaw: rand() * 6 });
    }
  }
  const stick = new THREE.Color(0x6b5a44);
  for (let i = 0; i < byDetail(10, detail); i++) {
    const x = range(rand, a.min.x, a.max.x);
    const z = range(rand, a.min.z, a.max.z);
    const yaw = rand() * 6;
    const l = range(rand, 0.6, 1.8);
    const d = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(l / 2);
    tb.tube([new THREE.Vector3(x, -0.12, z).sub(d), new THREE.Vector3(x, -0.15, z), new THREE.Vector3(x, -0.12, z).add(d)], [0.04, 0.05, 0.03], stick, null, 4, true);
  }
  drift.add(new THREE.Mesh(tb.build(), envMaterial({ sway: { amp: 0.25, freq: 0.7 }, roughness: 0.9 })));
  const bladeGeo = bladeClumpGeometry(rand, { blades: 9, width: 0.09, segs: 6, spread: 0.2, bend: 1.4, base: 0x6a5a28, tip: 0x8a7a3a, leafy: true });
  const bm = instanced(bladeGeo, envMaterial({ sway: { amp: 0.3, freq: 0.6 }, side: THREE.DoubleSide, roughness: 0.8 }), blades);
  if (bm) drift.add(bm);
  group.add(drift);

  const current = a.current({ x: 0, y: 0, z: 0 });
  const update = (_w: World, dt: number, camera: THREE.Camera) => {
    points.position.set(camera.position.x, 0, camera.position.z);
    drift.position.x += current.x * 0.6 * dt;
    drift.position.z += current.z * 0.6 * dt;
  };
  return { group, update, down: 0.62 };
}
