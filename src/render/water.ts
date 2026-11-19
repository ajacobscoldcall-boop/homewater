/**
 * Underwater atmosphere: caustics on the bottom, light shafts, the surface
 * seen from below (Snell's window), and drifting particles. All cheap enough
 * for integrated graphics.
 */
import * as THREE from 'three';

export interface WaterUniforms {
  uTime: { value: number };
  uLight: { value: number };
}

export const sharedWater: WaterUniforms = { uTime: { value: 0 }, uLight: { value: 1 } };

const CAUSTIC_GLSL = /* glsl */ `
float hwCaustic(vec2 p, float t) {
  vec2 q = p * 0.55;
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.7 + t * 0.9 + fi), cos(q.x * 1.3 - t * 0.7 + fi * 1.3));
    v += abs(sin(q.x + q.y));
  }
  return pow(clamp(1.0 - v / 3.0, 0.0, 1.0), 5.0) * 4.0;
}
`;

/** Bottom material: vertex colours plus caustics that fade with depth and darkness. */
export function causticFloorMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedWater.uTime;
    shader.uniforms.uLight = sharedWater.uLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHwWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHwWorld;\nuniform float uTime;\nuniform float uLight;\n${CAUSTIC_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float hwDepth = max(0.0, -vHwWorld.y);
        float hwC = hwCaustic(vHwWorld.xz, uTime) * exp(-hwDepth * 0.09) * uLight;
        totalEmissiveRadiance += vec3(0.55, 0.62, 0.55) * hwC * 0.22;`,
      );
  };
  return m;
}

/** The underside of the surface: bright sky inside Snell's window, darker reflection outside. */
export function surfaceMaterial(sky: THREE.Color, fog: THREE.FogExp2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: sharedWater.uTime,
      uLight: sharedWater.uLight,
      uSky: { value: sky.clone() },
      uFogColor: { value: fog.color },
      uFogDensity: { value: fog.density },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uLight;
      uniform vec3 uSky;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorld;
      void main() {
        vec3 d = vWorld - cameraPosition;
        float dist = length(d);
        float up = d.y / max(dist, 1e-4);
        // Snell's window: about 48.6 degrees from straight up.
        float window = smoothstep(0.62, 0.70, up);
        float ripple = 0.85 + 0.15 * sin(vWorld.x * 1.3 + uTime * 1.7) * sin(vWorld.z * 1.1 - uTime * 1.3);
        vec3 sky = uSky * ripple * (0.35 + 0.75 * uLight);
        vec3 mirror = uFogColor * 1.15;
        vec3 col = mix(mirror, sky, window);
        float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, fogF * (1.0 - 0.6 * window));
        gl_FragColor = vec4(col, 0.96);
      }`,
  });
}

/** Light shafts: soft additive planes hanging from the surface around the camera. */
export class LightShafts {
  readonly group = new THREE.Group();
  private shafts: { mesh: THREE.Mesh; angle: number; radius: number; phase: number }[] = [];
  private material: THREE.ShaderMaterial;

  constructor(count = 10) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: sharedWater.uTime, uLight: sharedWater.uLight, uStrength: { value: 0.12 }, uColor: { value: new THREE.Color(0xd8f0e6) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLight; uniform float uStrength; uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float across = sin(vUv.x * 3.14159);
          float down = pow(vUv.y, 1.6);
          float flicker = 0.75 + 0.25 * sin(uTime * 0.8 + vUv.x * 6.0);
          gl_FragColor = vec4(uColor * across * down * flicker * uStrength * uLight, 1.0);
        }`,
    });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.shafts.push({ mesh, angle: (i / count) * Math.PI * 2 + i, radius: 5 + ((i * 7) % 14), phase: i * 1.7 });
    }
  }

  setStrength(s: number, color?: number): void {
    this.material.uniforms.uStrength!.value = s;
    if (color !== undefined) (this.material.uniforms.uColor!.value as THREE.Color).setHex(color);
    this.group.visible = s > 0;
  }

  update(camera: THREE.Camera, floorAt: (x: number, z: number) => number, surfaceY: number, t: number): void {
    if (!this.group.visible) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const s of this.shafts) {
      const a = s.angle + Math.sin(t * 0.05 + s.phase) * 0.2;
      const x = cx + Math.cos(a) * s.radius;
      const z = cz + Math.sin(a) * s.radius;
      const bottom = Math.max(floorAt(x, z), surfaceY - 22);
      const h = Math.max(0.5, surfaceY - bottom);
      const w = 1.2 + ((s.phase * 3) % 2.2);
      s.mesh.scale.set(w, h, 1);
      s.mesh.position.set(x, surfaceY - h / 2, z);
      // Face the camera around the vertical axis, with a slight slant.
      s.mesh.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), 0.18);
    }
  }
}

/** Drifting particles that wrap around the camera so the water always has texture. */
export class MarineSnow {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor(count = 700, size = 14) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = Math.random() * size;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: sharedWater.uTime, uLight: sharedWater.uLight, uSize: { value: size }, uColor: { value: new THREE.Color(0xdfe8dc) }, uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSize; uniform vec3 uCam;
        varying float vFade;
        void main() {
          vec3 p = position + vec3(uTime * 0.05, -uTime * 0.03, uTime * 0.02);
          p = mod(p - uCam + uSize * 0.5, uSize) - uSize * 0.5 + uCam;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFade = 1.0 - smoothstep(uSize * 0.25, uSize * 0.5, length(p - uCam));
          gl_PointSize = clamp(18.0 / -mv.z, 1.0, 4.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uLight;
        varying float vFade;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.1, length(c)) * vFade * (0.25 + 0.35 * uLight);
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  update(camera: THREE.Camera): void {
    (this.material.uniforms.uCam!.value as THREE.Vector3).copy(camera.position);
  }
}
