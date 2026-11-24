/**
 * Lake ice seen from below (the fry's winter; render only).
 *
 * Light comes through the ice as a soft blue-white glow, brightest inside
 * Snell's window (frosted: no sky shows through), dimmer at a slant; snow lying
 * on the ice lets less light through, so it shows as darker patches; cracks run
 * as dark lines with a pale edge; small bubbles are frozen in. One draw, the
 * scene's fog applied. Low skips the bubbles and the finer frost.
 */
import * as THREE from 'three';
import { quality } from './quality';
import { sharedWater } from './water';
import { ICE_LOOK } from './weatherConfig';

export function iceMaterial(): THREE.ShaderMaterial {
  const detail = quality.aboveWater === 0 ? 0 : 1;
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    fog: true,
    defines: {
      HW_ICE_DETAIL: detail,
      HW_CRACK_CELL: ICE_LOOK.crackCell.toFixed(3),
      HW_CRACK_WIDTH: ICE_LOOK.crackWidth.toFixed(3),
      HW_CRACK_SHARE: ICE_LOOK.crackShare.toFixed(3),
      HW_BUBBLE_CELL: ICE_LOOK.bubbleCell.toFixed(3),
      HW_BUBBLE_SIZE: ICE_LOOK.bubbleSize.toFixed(3),
    },
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uLight: { value: 1 },
        uLit: { value: new THREE.Color(ICE_LOOK.lit) },
        uDim: { value: new THREE.Color(ICE_LOOK.dim) },
        uSnowCol: { value: new THREE.Color(ICE_LOOK.snow) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uLit;
      uniform vec3 uDim;
      uniform vec3 uSnowCol;
      uniform float uLight;
      varying vec3 vWorld;

      float iHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 iHash2(vec2 p) { return vec2(iHash(p), iHash(p + 19.19)); }
      float iNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(iHash(i), iHash(i + vec2(1.0, 0.0)), f.x), mix(iHash(i + vec2(0.0, 1.0)), iHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // Distance to the nearest crack: the edge between cells of a jittered grid.
      float iCrack(vec2 p) {
        vec2 g = floor(p); vec2 f = fract(p);
        float d1 = 8.0; float d2 = 8.0;
        for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            vec2 r = o + iHash2(g + o) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        return sqrt(d2) - sqrt(d1);
      }

      void main() {
        vec3 d = vWorld - cameraPosition;
        vec3 v = d / max(length(d), 1e-4);
        vec2 p = vWorld.xz;
        // Frosted ice scatters the light: the window's edge is soft, and the light is brightest looking straight up.
        float win = smoothstep(0.4, 0.85, v.y);
        float frost = iNoise(p * 0.9);
        #if HW_ICE_DETAIL == 1
          frost = 0.6 * frost + 0.4 * iNoise(p * 3.7 + 7.0);
        #endif
        // Clear black ice glows where the light comes straight down; elsewhere a cloudier grey-blue.
        float clearIce = iNoise(p * 0.11 + 13.0);
        vec3 c = mix(uDim, uLit, win * (0.65 + 0.5 * clearIce)) * (0.86 + 0.22 * frost);
        // Snow lying on top: wind-shaped drifts that let little light through, with soft edges.
        float sn = 0.6 * iNoise(p * 0.045 + 3.0) + 0.28 * iNoise(p * 0.16) + 0.12 * iNoise(p * 0.6);
        float snow = smoothstep(0.5, 0.66, sn);
        c = mix(c, uSnowCol * (0.8 + 0.4 * frost), snow * 0.9);
        // Cracks: long, wandering breaks (a warped cell edge), in some places only, a dark line with a pale fringe.
        vec2 cq = p / HW_CRACK_CELL;
        cq += 0.45 * vec2(iNoise(p * 0.21), iNoise(p * 0.21 + 9.1)) - 0.22;
        float e = iCrack(cq) * HW_CRACK_CELL;
        float where = smoothstep(1.0 - HW_CRACK_SHARE, 1.08 - HW_CRACK_SHARE, iNoise(p * 0.035 + 31.0));
        e = mix(1e3, e, where);
        float crack = 1.0 - smoothstep(0.0, HW_CRACK_WIDTH * (0.6 + 0.8 * iNoise(p * 0.5)), e);
        float fringe = (1.0 - smoothstep(HW_CRACK_WIDTH, HW_CRACK_WIDTH * 4.0, e)) - crack;
        c = mix(c, c * 0.35, crack) + uLit * 0.18 * fringe * (1.0 - snow);
        #if HW_ICE_DETAIL == 1
          // Bubbles frozen in: small pale discs, a few per cell.
          vec2 bq = p / HW_BUBBLE_CELL;
          vec2 bc = floor(bq);
          float bh = iHash(bc + 41.0);
          if (bh < 0.22 * (1.0 - snow)) {
            vec2 at = bc + 0.2 + 0.6 * iHash2(bc + 5.0);
            float r = HW_BUBBLE_SIZE / HW_BUBBLE_CELL * (0.5 + bh);
            float b = 1.0 - smoothstep(r * 0.7, r, length(bq - at));
            c = mix(c, uLit * 1.15, b * 0.7);
          }
        #endif
        // The winter light is dim; the ice follows the water's light.
        c *= 0.6 + 0.55 * uLight;
        // Fog, but lighter than on the scenery, so the ceiling still reads in the winter gloom (in linear, like the surface).
        #ifdef USE_FOG
          float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.35);
          c = mix(c, fogColor, fogF * 0.85);
        #endif
        gl_FragColor = vec4(c, 0.96);
        #include <colorspace_fragment>
      }`,
  });
  // The ice follows the water's light (shared, so not copied by the merge above).
  m.uniforms.uLight = sharedWater.uLight;
  return m;
}
