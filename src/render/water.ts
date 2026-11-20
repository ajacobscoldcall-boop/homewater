/**
 * Underwater atmosphere: caustics on the bottom, light shafts, the surface
 * seen from below (Snell's window), and drifting particles. All cheap enough
 * for integrated graphics.
 */
import * as THREE from 'three';
import { quality } from './quality';
import { shoreSteps, type AboveUniforms } from './above';
import { SHAFTS } from './shaftConfig';

export interface WaterUniforms {
  uTime: { value: number };
  uLight: { value: number };
}

export const sharedWater: WaterUniforms = { uTime: { value: 0 }, uLight: { value: 1 } };

const CAUSTIC_GLSL = /* glsl */ `
float hwCaustic(vec2 p, float t) {
  vec2 q = p * 0.55;
  float v = 0.0;
  for (int i = 0; i < HW_CAUSTIC_STEPS; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.7 + t * 0.9 + fi), cos(q.x * 1.3 - t * 0.7 + fi * 1.3));
    v += abs(sin(q.x + q.y));
  }
  return pow(clamp(1.0 - v / float(HW_CAUSTIC_STEPS), 0.0, 1.0), 5.0) * 4.0;
}
`;

/**
 * Bottom material: vertex colours plus caustics that fade with depth and darkness.
 * The bottom fills much of the screen and the caustics are its costliest part
 * (nine sines and cosines a pixel), so:
 * - everywhere, caustics are skipped where depth, darkness and fog leave them under
 *   1/255 of brightness, which looks the same;
 * - below High the bottom uses Lambert shading (nearly the same on rough gravel);
 *   Medium uses a two-step caustic pattern and Low has none.
 */
export function causticFloorMaterial(): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  const m = quality.floorShading === 'standard' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const steps = quality.caustics === 2 ? 3 : quality.caustics === 1 ? 2 : 0;
  if (steps === 0) return m;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedWater.uTime;
    shader.uniforms.uLight = sharedWater.uLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHwWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define HW_CAUSTIC_STEPS ${steps}\nvarying vec3 vHwWorld;\nuniform float uTime;\nuniform float uLight;\n${CAUSTIC_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float hwDepth = max(0.0, -vHwWorld.y);
        float hwW = exp(-hwDepth * 0.09) * uLight;
        #if defined( USE_FOG ) && defined( FOG_EXP2 )
          hwW *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #endif
        // At most about 0.5 * hwW of light: below 0.002 it cannot be seen, so skip the pattern.
        if (hwW > 0.002) {
          float hwC = hwCaustic(vHwWorld.xz, uTime) * exp(-hwDepth * 0.09) * uLight;
          totalEmissiveRadiance += vec3(0.55, 0.62, 0.55) * hwC * 0.22;
        }`,
      );
  };
  m.customProgramCacheKey = () => `hw-caustic-${steps}`;
  return m;
}

/**
 * The surface. From below: the world above, refracted, inside Snell's window
 * (about 48.6 degrees from straight up), and outside it total internal
 * reflection, a darker mirror of the water below (above.ts has the sky, shore
 * and bear it looks up). From above (a camera that has risen out of the water):
 * a tinted, partly see-through surface. Colours are worked in linear and
 * converted to the output colour space at the end, like the fog on lit
 * materials, so the surface and the fog agree.
 */
export function surfaceMaterial(fog: THREE.FogExp2, above: AboveUniforms, surfaceY: number): THREE.ShaderMaterial {
  const [steps, first, grow, longest] = shoreSteps(quality.aboveWater);
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    defines: { HW_STEPS: steps, HW_SHORE: steps > 0 ? 1 : 0 },
    uniforms: {
      uTime: sharedWater.uTime,
      uLight: sharedWater.uLight,
      uFogColor: { value: fog.color },
      uFogDensity: { value: fog.density },
      uSurfaceY: { value: surfaceY },
      uFirst: { value: first },
      uGrow: { value: grow },
      uLongest: { value: longest },
      ...above,
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
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uSurfaceY;
      uniform float uFirst;
      uniform float uGrow;
      uniform float uLongest;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec2 uGlowDir;
      uniform vec3 uTrees;
      uniform vec3 uHills;
      uniform float uStars;
      uniform float uSkyLight;
      uniform sampler2D uSkyline;
      uniform vec4 uSkyBox;
      uniform float uSkyMax;
      uniform vec2 uFar;
      uniform vec4 uBear[4];
      varying vec3 vWorld;

      float hwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      // Distance from point p to segment a-b.
      float hwSeg(vec3 p, vec3 a, vec3 b) {
        vec3 ba = b - a;
        float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
        return length(p - a - ba * h);
      }

      // Does the ray from ro along rd pass through a capsule? Returns the distance along it, or -1.
      float hwCapsule(vec3 ro, vec3 rd, vec4 a, vec4 b) {
        if (a.w <= 0.0) return -1.0;
        vec3 mid = 0.5 * (a.xyz + b.xyz);
        float t = max(0.0, dot(mid - ro, rd));
        float d = hwSeg(ro + rd * t, a.xyz, b.xyz);
        return d < a.w ? t : -1.0;
      }

      vec3 hwSky(vec3 rd) {
        float e = clamp(rd.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(e, 0.55));
        vec2 flat2 = normalize(rd.xz + 1e-4);
        c += uGlow * pow(max(0.0, dot(flat2, uGlowDir)), 6.0) * pow(1.0 - e, 3.0);
        if (uStars > 0.0) {
          vec2 g = floor(rd.xz / (rd.y + 0.25) * 90.0);
          c += vec3(0.6, 0.65, 0.75) * uStars * step(0.997, hwHash(g)) * e;
          // The moon, high in the sky, with a soft halo that lights the surface around it.
          vec3 moonDir = normalize(vec3(-0.25, 1.0, 0.35));
          float m = max(0.0, dot(rd, moonDir));
          c += uStars * (vec3(0.92, 0.95, 1.0) * smoothstep(0.9988, 0.9993, m) + vec3(0.32, 0.38, 0.5) * pow(m, 24.0) + vec3(0.05, 0.07, 0.1) * pow(m, 3.0));
        }
        return c;
      }

      // The world above, along a refracted ray leaving the surface at p.
      vec3 hwOutside(vec3 p, vec3 rd) {
        float tb = hwCapsule(p, rd, uBear[0], uBear[1]);
        float th = hwCapsule(p, rd, uBear[2], uBear[3]);
        if (tb >= 0.0 || th >= 0.0) return vec3(0.03, 0.022, 0.016) + 0.05 * uHorizon;
        #if HW_SHORE == 1
          float s = uFirst;
          float prev = 0.0;
          for (int i = 0; i < HW_STEPS; i++) {
            vec3 q = p + rd * s;
            vec4 m = texture2D(uSkyline, (q.xz - uSkyBox.xy) * uSkyBox.zw);
            if (q.y - uSurfaceY < m.r * uSkyMax) {
              // Refine the edge between the last step in the open and this one, so the tree tops are sharp.
              float lo = prev; float hi = s;
              for (int j = 0; j < 4; j++) {
                float mid = 0.5 * (lo + hi);
                vec3 qm = p + rd * mid;
                vec4 mm = texture2D(uSkyline, (qm.xz - uSkyBox.xy) * uSkyBox.zw);
                if (qm.y - uSurfaceY < mm.r * uSkyMax) { hi = mid; m = mm; } else lo = mid;
              }
              vec3 qh = p + rd * hi;
              // Trees, darker low down, or bare bank where the trees stand back from the water; hazier far off.
              float up = clamp((qh.y - uSurfaceY) / max(m.r * uSkyMax, 0.5), 0.0, 1.0);
              vec3 c = mix(uTrees * 1.8 + vec3(0.035, 0.028, 0.018), uTrees * (0.7 + 0.5 * up), m.g);
              return mix(c, uHorizon, clamp(hi / 1500.0, 0.0, 0.3));
            }
            prev = s;
            s += min(s * (uGrow - 1.0), uLongest);
          }
        #endif
        if (uFar.x > 0.0) {
          float az = atan(rd.z, rd.x);
          float ridge = uFar.x * (0.55 + 0.3 * sin(az * 3.0 + 1.3) + 0.15 * sin(az * 11.0));
          if (rd.y * uFar.y < ridge * length(rd.xz)) return mix(uHills, uHorizon, 0.25);
        }
        return hwSky(rd);
      }

      void main() {
        vec3 d = vWorld - cameraPosition;
        float dist = length(d);
        vec3 v = d / max(dist, 1e-4);
        float ripple = sin(vWorld.x * 1.3 + uTime * 1.7) * sin(vWorld.z * 1.1 - uTime * 1.3);
        float ripple2 = sin(vWorld.x * 0.7 - vWorld.z * 0.9 + uTime * 1.1);
        // A bear overhead blocks the light: the surface under its body is darker.
        float shade = 0.0;
        for (int i = 0; i < 4; i += 2) {
          if (uBear[i].w > 0.0) {
            vec3 a = uBear[i].xyz; vec3 b = uBear[i + 1].xyz;
            float dd = hwSeg(vec3(vWorld.x, 0.0, vWorld.z), vec3(a.x, 0.0, a.z), vec3(b.x, 0.0, b.z));
            float above = step(uSurfaceY, max(a.y, b.y) + uBear[i].w);
            shade = max(shade, above * (1.0 - smoothstep(uBear[i].w * 0.5, uBear[i].w * 1.8, dd)));
          }
        }
        vec3 col;
        float alpha = 1.0;
        float window = 0.0;
        if (cameraPosition.y < uSurfaceY) {
          // The window's edge comes from the flat surface; ripples only wobble the view through it.
          vec3 n = normalize(vec3(0.05 * ripple, -1.0, 0.05 * ripple2));
          vec3 r = refract(v, n, 1.333);
          if (dot(r, r) < 0.001) r = refract(v, vec3(0.0, -1.0, 0.0), 1.333);
          // Outside the window: total internal reflection, the water below in a darker mirror.
          vec3 mirror = uFogColor * (0.76 + 0.1 * ripple + 0.06 * ripple2);
          // cos(48.6 deg) = 0.661: the critical angle.
          window = smoothstep(0.662, 0.685, v.y);
          vec3 outside = window > 0.0 && dot(r, r) > 0.001 ? hwOutside(vWorld, normalize(r)) * uSkyLight * (0.45 + 0.65 * uLight) : mirror;
          col = mix(mirror, outside, window);
          col *= 1.0 - 0.6 * shade;
          float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          // From deeper down the window dims into the water's colour.
          float clear = exp(-0.08 * max(0.0, uSurfaceY - cameraPosition.y));
          col = mix(col, uFogColor, max(fogF * (1.0 - 0.6 * window), window * (1.0 - clear) * 0.85));
        } else {
          // From above: sky reflected at a glancing view, the water's colour looking down.
          float fres = pow(1.0 - clamp(-v.y, 0.0, 1.0), 4.0);
          vec3 sky = hwSky(reflect(v, vec3(0.0, 1.0, 0.0))) * uSkyLight;
          col = mix(uFogColor * 0.9, sky, 0.25 + 0.7 * fres) * (1.0 - 0.4 * shade) * (0.93 + 0.07 * ripple);
          alpha = 0.55 + 0.4 * fres;
        }
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Light shafts: soft additive beams hanging from the surface around the camera.
 * Each is a camera-facing plane, shaded so no edge of the plane shows (shaftConfig.ts):
 * clipped at the surface and faded in below it, faded near the camera and into the
 * fog, ragged at the sides and brighter looking up into the light.
 */
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
      defines: { HW_STREAK_FREQ: SHAFTS.streakFreq.toFixed(1) },
      uniforms: {
        uTime: sharedWater.uTime,
        uLight: sharedWater.uLight,
        uStrength: { value: 0.12 },
        uColor: { value: new THREE.Color(0xd8f0e6) },
        uSurfaceY: { value: 0 },
        uFogDensity: { value: 0 },
        uTopFade: { value: SHAFTS.topFade },
        uBottomFade: { value: SHAFTS.bottomFade },
        uFalloff: { value: SHAFTS.falloff },
        uNear: { value: new THREE.Vector2(SHAFTS.near[0], SHAFTS.near[1]) },
        uLevel: { value: SHAFTS.level },
        uSpread: { value: SHAFTS.spread },
        uStreaks: { value: SHAFTS.streaks },
      },
      vertexShader: /* glsl */ `
        uniform float uSpread;
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          // Wider at the bottom (uv.y 0) than at the top: the beam spreads as it goes down.
          vec3 p = position;
          p.x *= mix(uSpread, 1.0, uv.y);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLight; uniform float uStrength; uniform vec3 uColor;
        uniform float uSurfaceY; uniform float uFogDensity; uniform float uTopFade; uniform float uBottomFade;
        uniform float uFalloff; uniform vec2 uNear; uniform float uLevel; uniform float uStreaks;
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          float below = uSurfaceY - vWorld.y;
          // Nothing above the surface (the slanted plane's top corner pokes through it).
          if (below <= 0.0) discard;
          // Soft sides, broken into streaks that drift slowly.
          float across = sin(vUv.x * 3.14159);
          across *= across;
          float streak = 1.0 - uStreaks * (0.5 + 0.5 * sin(vUv.x * HW_STREAK_FREQ + uTime * 0.21 + vWorld.y * 0.09));
          // Fades in just under the surface, fades out with depth and toward the bottom of the plane.
          float top = smoothstep(0.0, uTopFade, below);
          float bottom = smoothstep(0.0, uBottomFade, vUv.y);
          float deep = exp(-uFalloff * below);
          vec3 d = vWorld - cameraPosition;
          float dist = length(d);
          // Faded close to the camera, so a plane never fills the screen, and into the fog like the scenery.
          float near = smoothstep(uNear.x, uNear.y, dist);
          float fog = exp(-uFogDensity * uFogDensity * dist * dist);
          // Looking up into the light the beam is bright; seen level, along its side, much less.
          float look = mix(uLevel, 1.0, smoothstep(-0.1, 0.7, d.y / max(dist, 1e-4)));
          float flicker = 0.8 + 0.2 * sin(uTime * 0.8 + vUv.x * 6.0);
          float k = across * streak * top * bottom * deep * near * fog * look * flicker;
          gl_FragColor = vec4(uColor * k * uStrength * uLight, 1.0);
        }`,
    });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
      mesh.frustumCulled = false;
      // After the surface (renderOrder 1): the surface writes no depth, so drawn first a shaft would be painted
      // over wherever its pixel's ray goes on to meet the surface, cut off in a hard line at the surface's far edge.
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.shafts.push({ mesh, angle: (i / count) * Math.PI * 2 + i, radius: 5 + ((i * 7) % 14), phase: i * 1.7 });
    }
  }

  private strength = 0;
  private count = Infinity;

  setStrength(s: number, color?: number): void {
    this.strength = s;
    this.material.uniforms.uStrength!.value = s * SHAFTS.gain;
    if (color !== undefined) (this.material.uniforms.uColor!.value as THREE.Color).setHex(color);
    this.group.visible = s > 0 && this.count > 0;
  }

  /** How many shafts to draw (graphics quality). */
  setCount(n: number): void {
    this.count = n;
    this.shafts.forEach((s, i) => (s.mesh.visible = i < n));
    this.group.visible = this.strength > 0 && n > 0;
  }

  /** fogDensity: the scene's FogExp2 density, so far shafts fade into the water like the scenery. */
  update(camera: THREE.Camera, floorAt: (x: number, z: number) => number, surfaceY: number, t: number, fogDensity = 0): void {
    if (!this.group.visible) return;
    this.material.uniforms.uSurfaceY!.value = surfaceY;
    this.material.uniforms.uFogDensity!.value = fogDensity * SHAFTS.fog;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const s of this.shafts) {
      if (!s.mesh.visible) continue;
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

/**
 * Drifting particles that wrap around the camera so the water always has texture.
 * Two looks: marine snow at sea (fine pale specks), and in fresh water drifting
 * organic matter (bits of leaf, algae and detritus): soft, translucent, olive-brown
 * flakes of mixed size and shape, each tumbling slowly, fading with distance.
 */
export class MarineSnow {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor(count = 700, size = 14) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = Math.random() * size;
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: sharedWater.uTime,
        uLight: sharedWater.uLight,
        uSize: { value: size },
        uColor: { value: new THREE.Color(0xdfe8dc) },
        uCam: { value: new THREE.Vector3() },
        uOrganic: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSize; uniform vec3 uCam; uniform float uOrganic;
        attribute float aSeed;
        varying float vFade;
        varying float vSeed;
        void main() {
          // Organic matter sinks and drifts more slowly than the fine snow, each piece at its own pace.
          float pace = mix(1.0, 0.45 + 0.6 * aSeed, uOrganic);
          vec3 p = position + vec3(uTime * 0.05, -uTime * 0.03, uTime * 0.02) * pace;
          p = mod(p - uCam + uSize * 0.5, uSize) - uSize * 0.5 + uCam;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFade = 1.0 - smoothstep(uSize * 0.2, uSize * 0.5, length(p - uCam));
          vSeed = aSeed;
          // Snow: 1-4 px. Organic: larger and more varied, from fine silt to small flakes.
          float big = mix(18.0, 10.0 + 34.0 * aSeed * aSeed, uOrganic);
          gl_PointSize = clamp(big / -mv.z, 1.0, mix(4.0, 9.0, uOrganic));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uLight; uniform float uOrganic; uniform float uTime;
        varying float vFade;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          // Organic: a tumbling flake, stretched and ragged, darker at its edge.
          float ang = vSeed * 6.283 + uTime * (0.2 + 0.3 * vSeed) * uOrganic;
          vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c;
          q.x *= mix(1.0, 1.0 + 1.6 * fract(vSeed * 7.3), uOrganic);
          float edge = 0.5 - uOrganic * (0.08 * sin(atan(q.y, q.x) * 3.0 + vSeed * 20.0) + 0.06);
          float r = length(q);
          float a = smoothstep(edge, edge * 0.2, r) * vFade * mix(0.25 + 0.35 * uLight, (0.18 + 0.3 * uLight) * (0.6 + 0.6 * fract(vSeed * 3.7)), uOrganic);
          vec3 col = uColor * mix(1.0, 0.75 + 0.45 * fract(vSeed * 13.1), uOrganic);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  /** Marine snow at sea; drifting organic matter in fresh water. */
  setLook(look: 'snow' | 'organic'): void {
    const u = this.material.uniforms;
    u.uOrganic!.value = look === 'organic' ? 1 : 0;
    (u.uColor!.value as THREE.Color).setHex(look === 'organic' ? 0x8f8a62 : 0xdfe8dc);
  }

  update(camera: THREE.Camera): void {
    (this.material.uniforms.uCam!.value as THREE.Vector3).copy(camera.position);
  }

  /** How many particles to draw (graphics quality); at most the number made. */
  setCount(n: number): void {
    this.points.geometry.setDrawRange(0, Math.max(0, Math.floor(n)));
    this.points.visible = n > 0;
  }
}
