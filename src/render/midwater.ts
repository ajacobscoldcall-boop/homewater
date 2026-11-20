/**
 * Small things in the water column, drawn as soft points (render only):
 *
 * - PlanktonSwarm: the fry's food. Each of the sim's plankton entities (one
 *   bite) is drawn as a little swarm of zooplankton a few millimetres long
 *   (Daphnia and copepods), drifting and twitching round the entity, instead of
 *   one big ball. Rich patches are denser and a little brighter.
 *
 * Sizes are in world units (scaleConfig.ts), so near specks are larger on
 * screen and far ones fade into the fog like everything else.
 */
import * as THREE from 'three';
import type { Entity } from '../sim/types';
import { quality } from './quality';
import { MODEL_SCALE } from './scaleConfig';

const MAX_FOOD = 200;

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A points material sized in world units, with fog, soft edges and a brighter core. */
export function softPointsMaterial(fog: THREE.FogExp2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPx: { value: 400 },
      uFogColor: { value: fog.color },
      uFogDensity: { value: fog.density },
    },
    vertexShader: /* glsl */ `
      uniform float uPx;
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        vColor = aColor;
        vAlpha = aAlpha;
        gl_PointSize = clamp(aSize * uPx / max(0.05, -mv.z), 1.0, 24.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDist;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.35, r) * vAlpha;
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
        vec3 c = mix(vColor * (1.0 + 0.35 * smoothstep(0.5, 0.0, r)), uFogColor, f);
        gl_FragColor = vec4(c, a * (1.0 - 0.7 * f));
      }`,
  });
}

/** Pixels per world unit at distance 1 for a camera: half the buffer height times the projection's y scale. */
export function pixelsPerUnit(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): number {
  const h = renderer.getDrawingBufferSize(tmpSize).y;
  return 0.5 * h * camera.projectionMatrix.elements[5]!;
}
const tmpSize = new THREE.Vector2();

export class PlanktonSwarm {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private colr: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private max: number;
  private material: THREE.ShaderMaterial;

  constructor(fog: THREE.FogExp2) {
    this.max = MAX_FOOD * Math.max(...MODEL_SCALE.planktonSpecks);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.colr = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.alpha = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = softPointsMaterial(fog);
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
  }

  /** Place the specks round the given plankton entities; t is the stage clock, px from pixelsPerUnit. */
  update(food: readonly Entity[], t: number, px: number, fog: THREE.FogExp2, light: number): void {
    const u = this.material.uniforms;
    u.uPx!.value = px;
    u.uFogDensity!.value = fog.density;
    const per = MODEL_SCALE.planktonSpecks[quality.envDetail] ?? 8;
    const cloud = MODEL_SCALE.planktonCloud;
    let n = 0;
    for (let i = 0; i < food.length && i < MAX_FOOD; i++) {
      const e = food[i]!;
      const rich = e.value === 1;
      const winter = e.state === 'winter';
      const count = rich ? per + (per >> 1) : per;
      for (let k = 0; k < count && n < this.max; k++) {
        const seed = e.id * 37 + k;
        const h1 = hash(seed);
        const h2 = hash(seed + 0.31);
        const h3 = hash(seed + 0.67);
        // Each speck hangs at its own place in the swarm, drifts on a slow loop and twitches (Daphnia hop).
        const r = cloud * Math.cbrt(h1);
        const th = h2 * Math.PI * 2 + t * (0.15 + 0.2 * h3);
        const ph = Math.acos(2 * h3 - 1);
        const hop = Math.max(0, Math.sin(t * (2.3 + 1.7 * h1) + seed)) ** 8 * 0.04;
        const o = n * 3;
        this.pos[o] = e.pos.x + r * Math.sin(ph) * Math.cos(th);
        this.pos[o + 1] = e.pos.y + r * Math.cos(ph) * 0.6 + hop;
        this.pos[o + 2] = e.pos.z + r * Math.sin(ph) * Math.sin(th);
        // Pale, translucent bodies; the rich patches a warmer gold-green.
        const c = rich ? [0.95, 0.96, 0.66] : winter ? [0.78, 0.82, 0.8] : [0.82, 0.9, 0.78];
        const b = (0.75 + 0.25 * light) * (0.85 + 0.3 * h2);
        this.colr[o] = c[0]! * b;
        this.colr[o + 1] = c[1]! * b;
        this.colr[o + 2] = c[2]! * b;
        this.size[n] = MODEL_SCALE.planktonSpeck * (0.7 + 0.6 * h3) * (rich ? 1.15 : 1);
        this.alpha[n] = 0.55 + 0.3 * h1;
        n++;
      }
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = n > 0;
  }
}
