/**
 * Underwater atmosphere: caustics on the bottom, light shafts, the surface
 * seen from below (Snell's window), and drifting particles. All cheap enough
 * for integrated graphics.
 */
import * as THREE from 'three';
import { quality } from './quality';
import { BODY_CAPSULES, shoreSteps, type AboveUniforms } from './above';
import { SHAFTS } from './shaftConfig';
import { WEATHER_LOOK } from './weatherConfig';

export interface WaterUniforms {
  uTime: { value: number };
  uLight: { value: number };
  /** The sun's share of the light (1 clear; less under cloud, weather.ts): caustics and shafts follow it. */
  uSun: { value: number };
}

export const sharedWater: WaterUniforms = { uTime: { value: 0 }, uLight: { value: 1 }, uSun: { value: 1 } };

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
    shader.uniforms.uSun = sharedWater.uSun;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHwWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define HW_CAUSTIC_STEPS ${steps}\nvarying vec3 vHwWorld;\nuniform float uTime;\nuniform float uLight;\nuniform float uSun;\n${CAUSTIC_GLSL}`)
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
          float hwC = hwCaustic(vHwWorld.xz, uTime) * exp(-hwDepth * 0.09) * uLight * uSun;
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
    defines: {
      HW_STEPS: steps,
      HW_SHORE: steps > 0 ? 1 : 0,
      HW_BODIES: BODY_CAPSULES,
      // Rain rings: two offset grids of drops, one on Low.
      HW_RAIN_LAYERS: quality.aboveWater === 0 ? 1 : 2,
      HW_RAIN_CELL: WEATHER_LOOK.rainCell.toFixed(3),
      HW_RAIN_FAR: WEATHER_LOOK.rainFar.toFixed(1),
      HW_RIPPLE_CALM: WEATHER_LOOK.rippleCalm.toFixed(3),
      HW_RIPPLE_WIND: WEATHER_LOOK.rippleWind.toFixed(3),
      HW_SKY_CLOUD: WEATHER_LOOK.skyUnderCloud.toFixed(3),
    },
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
      uniform vec4 uBody[HW_BODIES * 2];
      uniform int uBodyCount;
      uniform vec4 uWeather;
      uniform vec3 uCloud;
      uniform vec3 uLeaf;
      uniform float uSnow;
      uniform vec3 uCoat;
      uniform vec3 uHull;
      varying vec3 vWorld;

      float hwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hwNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hwHash(i), hwHash(i + vec2(1.0, 0.0)), f.x), mix(hwHash(i + vec2(0.0, 1.0)), hwHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // How bright the sky is now, against a clear day's (1): leaves, snow, coats and hulls follow it.
      float hwDayK() { return clamp(dot(uHorizon, vec3(0.3, 0.59, 0.11)) / 0.72, 0.03, 1.2); }

      // Rain on the surface: rings spreading from drops, one drop per cell, each cell its own beat.
      // Returns the tilt the rings give the surface (xy), a bright speck where a drop has just hit (z) and how bright the rings are (w).
      vec4 hwRain(vec2 p, float t, float rain) {
        vec4 o = vec4(0.0);
        for (int l = 0; l < HW_RAIN_LAYERS; l++) {
          vec2 q = p / HW_RAIN_CELL + float(l) * vec2(0.5, 0.37);
          vec2 cell = floor(q);
          float h = hwHash(cell + float(l) * 17.0);
          // Fewer cells have drops in light rain.
          if (h > 0.25 + 0.75 * rain) continue;
          vec2 c = cell + 0.3 + 0.4 * vec2(hwHash(cell + 3.1), hwHash(cell + 7.7));
          float age = fract(t * (0.9 + 0.5 * h) + h * 13.0);
          vec2 dv = q - c;
          float d = length(dv);
          float r = age * 0.3;
          float wave = sin((d - r) * 40.0) * exp(-pow((d - r) * 9.0, 2.0)) * (1.0 - age);
          o.xy += dv / max(d, 1e-3) * wave;
          o.w += abs(wave);
          o.z += (1.0 - smoothstep(0.0, 0.05, d)) * (1.0 - smoothstep(0.0, 0.12, age));
        }
        return o;
      }

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
        float oc = uWeather.x;
        c += uGlow * pow(max(0.0, dot(flat2, uGlowDir)), 6.0) * pow(1.0 - e, 3.0) * (1.0 - 0.85 * oc);
        // Cloud: broken cloud drifting at moderate cover, a low grey sheet at full cover.
        if (oc > 0.02) {
          vec2 cp = rd.xz / (rd.y + 0.2) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
          float n = 0.62 * hwNoise(cp) + 0.38 * hwNoise(cp * 2.7 + 5.3);
          float cover = smoothstep(1.0 - oc, 1.35 - oc, n);
          cover = max(cover, smoothstep(0.65, 1.0, oc));
          // Fair-weather cloud is brighter than the sky behind it; heavy cover a flat grey.
          float skyL = dot(c, vec3(0.3, 0.59, 0.11));
          vec3 fair = vec3(skyL * 1.12 + 0.04 * hwDayK());
          vec3 cloud = mix(fair, uCloud * hwDayK(), smoothstep(0.45, 0.9, oc)) * (0.9 + 0.2 * n);
          c = mix(c, cloud, cover * 0.95);
        }
        if (uStars > 0.0 && oc < 0.85) {
          vec2 g = floor(rd.xz / (rd.y + 0.25) * 90.0);
          c += vec3(0.6, 0.65, 0.75) * uStars * (1.0 - smoothstep(0.2, 0.7, oc)) * step(0.997, hwHash(g)) * e;
          // The moon, high in the sky, with a soft halo that lights the surface around it.
          vec3 moonDir = normalize(vec3(-0.25, 1.0, 0.35));
          float m = max(0.0, dot(rd, moonDir));
          c += uStars * (1.0 - smoothstep(0.3, 0.85, oc)) * (vec3(0.92, 0.95, 1.0) * smoothstep(0.9988, 0.9993, m) + vec3(0.32, 0.38, 0.5) * pow(m, 24.0) + vec3(0.05, 0.07, 0.1) * pow(m, 3.0));
        }
        return c;
      }

      // The world above, along a refracted ray leaving the surface at p.
      vec3 hwOutside(vec3 p, vec3 rd) {
        float best = 1e6;
        float kind = -1.0;
        for (int i = 0; i < HW_BODIES; i++) {
          if (i >= uBodyCount) break;
          vec4 a = uBody[i * 2];
          if (a.w <= 0.0) continue;
          vec4 b = uBody[i * 2 + 1];
          float t = hwCapsule(p, rd, a, b);
          if (t >= 0.0 && t < best) { best = t; kind = b.w; }
        }
        // Seen against the sky, mostly in silhouette: the bear dark, a coat and a hull lit a little by the sky.
        if (kind > 2.5) return vec3(0.035, 0.03, 0.028) + 0.04 * uHorizon;
        if (kind > 1.5) return uHull * 0.2 * hwDayK() + 0.04 * uHorizon;
        if (kind > 0.5) return uCoat * 0.4 * hwDayK() + 0.02 * uHorizon;
        if (kind > -0.5) return vec3(0.03, 0.022, 0.016) + 0.05 * uHorizon;
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
              float dk = hwDayK();
              vec3 bank = mix(uTrees * 1.8 + vec3(0.035, 0.028, 0.018) * min(1.0, dk), vec3(0.62, 0.66, 0.7) * dk, uSnow * 0.85);
              vec3 conifer = mix(uTrees * (0.7 + 0.5 * up), vec3(0.4, 0.44, 0.47) * dk, uSnow * 0.3 * up);
              // Alder and willow along the water take the season's colour (bare twigs in winter).
              // Backlit against the sky, so mostly in shadow; clumps of leaves with darker gaps between.
              float clump = hwNoise(qh.xz * 1.7 + qh.y * 1.3);
              vec3 leaf = uLeaf * dk * (0.035 + 0.075 * up) * (0.5 + 0.9 * clump);
              vec3 c = mix(bank, mix(conifer, leaf, step(0.5, m.b)), m.g);
              return mix(c, uHorizon, clamp(hi / 1500.0, 0.0, 0.3));
            }
            prev = s;
            s += min(s * (uGrow - 1.0), uLongest);
          }
        #endif
        if (uFar.x > 0.0) {
          float az = atan(rd.z, rd.x);
          float ridge = uFar.x * (0.55 + 0.3 * sin(az * 3.0 + 1.3) + 0.15 * sin(az * 11.0));
          if (rd.y * uFar.y < ridge * length(rd.xz)) return mix(mix(uHills, uHorizon, 0.25), uCloud * hwDayK(), 0.45 * uWeather.x);
        }
        return hwSky(rd);
      }

      void main() {
        vec3 d = vWorld - cameraPosition;
        float dist = length(d);
        vec3 v = d / max(dist, 1e-4);
        float ripple = sin(vWorld.x * 1.3 + uTime * 1.7) * sin(vWorld.z * 1.1 - uTime * 1.3);
        float ripple2 = sin(vWorld.x * 0.7 - vWorld.z * 0.9 + uTime * 1.1);
        float wind = uWeather.z;
        float rain = uWeather.y;
        // Wind ruffles the surface: the swell tilts further and a fine chop runs downwind.
        float amp = mix(HW_RIPPLE_CALM, HW_RIPPLE_WIND, wind);
        vec2 tilt = vec2(ripple, ripple2) * amp;
        if (wind > 0.01) {
          float c1 = sin(vWorld.x * 4.1 + vWorld.z * 1.3 + uTime * 5.0) * sin(vWorld.z * 3.3 - vWorld.x * 0.9 + uTime * 3.7);
          float c2 = sin(vWorld.x * 2.3 - vWorld.z * 5.2 + uTime * 4.3);
          // Kept small: a steep chop folds the refracted view and draws thin lines along every edge in the sky.
          tilt += vec2(c1, c2) * 0.04 * wind;
        }
        vec4 drops = vec4(0.0);
        // Rings only near the camera (too small to see further off); on Low only inside the window.
        #if HW_RAIN_LAYERS == 1
          bool rainHere = dist < HW_RAIN_FAR && v.y > 0.6;
        #else
          bool rainHere = dist < HW_RAIN_FAR;
        #endif
        if (rain > 0.01 && rainHere) {
          drops = hwRain(vWorld.xz, uTime, rain) * (1.0 - smoothstep(HW_RAIN_FAR * 0.6, HW_RAIN_FAR, dist));
          // Rings tilt the surface less in the dark, where they would only flicker.
          tilt += drops.xy * (0.025 + 0.15 * min(1.0, hwDayK())) * rain;
        }
        // Bodies above the water block the light: the surface under a bear or a boat is darker.
        float shade = 0.0;
        for (int i = 0; i < HW_BODIES; i++) {
          if (i >= uBodyCount) break;
          vec4 a4 = uBody[i * 2];
          if (a4.w <= 0.0) continue;
          vec3 a = a4.xyz; vec3 b = uBody[i * 2 + 1].xyz;
          float dd = hwSeg(vec3(vWorld.x, 0.0, vWorld.z), vec3(a.x, 0.0, a.z), vec3(b.x, 0.0, b.z));
          float above = step(uSurfaceY, max(a.y, b.y) + a4.w);
          shade = max(shade, above * (1.0 - smoothstep(a4.w * 0.5, a4.w * 1.8, dd)));
        }
        vec3 col;
        float alpha = 1.0;
        float window = 0.0;
        if (cameraPosition.y < uSurfaceY) {
          // The window's edge comes from the flat surface; ripples only wobble the view through it.
          vec3 n = normalize(vec3(tilt.x, -1.0, tilt.y));
          vec3 r = refract(v, n, 1.333);
          if (dot(r, r) < 0.001) r = refract(v, vec3(0.0, -1.0, 0.0), 1.333);
          // Outside the window: total internal reflection, the water below in a darker mirror.
          vec3 mirror = uFogColor * (0.76 + 0.1 * ripple + 0.06 * ripple2 + 0.6 * (tilt.x - amp * ripple)) * (1.0 - 0.12 * uWeather.x);
          // cos(48.6 deg) = 0.661: the critical angle.
          window = smoothstep(0.662, 0.685, v.y);
          float cloudy = 1.0 - (1.0 - HW_SKY_CLOUD) * uWeather.x;
          vec3 outside = window > 0.0 && dot(r, r) > 0.001 ? hwOutside(vWorld, normalize(r)) * uSkyLight * cloudy * (0.45 + 0.65 * uLight) : mirror;
          col = mix(mirror, outside, window);
          // Rain speckles the window: a bright fleck where each drop lands.
          col += drops.z * rain * window * 0.5 * uSkyLight * hwDayK() * vec3(0.9, 0.95, 1.0);
          // The rings catch the light: pale in the window, faint glints in the mirror outside it.
          col += drops.w * rain * mix(0.05 * uFogColor, 0.12 * uSkyLight * hwDayK() * vec3(0.85, 0.9, 0.95), window);
          col *= 1.0 - 0.6 * shade;
          float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          // From deeper down the window dims into the water's colour.
          float clear = exp(-0.08 * max(0.0, uSurfaceY - cameraPosition.y));
          col = mix(col, uFogColor, max(fogF * (1.0 - 0.6 * window), window * (1.0 - clear) * 0.85));
        } else {
          // From above: sky reflected at a glancing view, the water's colour looking down.
          float fres = pow(1.0 - clamp(-v.y, 0.0, 1.0), 4.0);
          vec3 sky = hwSky(reflect(v, normalize(vec3(-tilt.x, 1.0, -tilt.y)))) * uSkyLight;
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
  private weatherK = 1;

  setStrength(s: number, color?: number): void {
    this.strength = s;
    this.material.uniforms.uStrength!.value = s * SHAFTS.gain * this.weatherK;
    if (color !== undefined) (this.material.uniforms.uColor!.value as THREE.Color).setHex(color);
    this.group.visible = s > 0 && this.count > 0;
  }

  /** Weather (weather.ts): under cloud the shafts soften, to k of their clear-sky strength. */
  setWeather(k: number): void {
    if (Math.abs(k - this.weatherK) < 1e-4) return;
    this.weatherK = k;
    this.material.uniforms.uStrength!.value = this.strength * SHAFTS.gain * k;
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
