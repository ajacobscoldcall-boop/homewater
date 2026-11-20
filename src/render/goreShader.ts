/**
 * Wounds and senescence in the fish shader. Every fish material (fishMesh.ts)
 * carries these uniforms; they do nothing until the gore layer (gore.ts)
 * sets a wear level or wounds. Patterns are drawn procedurally in the fish's
 * own coordinates, so marks stay on the body as it swims.
 *
 * - Wear (0..1, more for a carcass): darker, duller skin, pale fungus patches
 *   (first on the head, tail and fins), and frayed fin edges.
 * - Wounds: claw or tooth rakes, scrapes where scales are gone, net marks
 *   round the gill covers, bite arcs, a hook tear at the mouth.
 * - uGore 1 (Unflinching): fresh wounds are raw red. 0 (Documentary): they
 *   show as pale scale loss.
 */
import * as THREE from 'three';
import { GORE } from './goreConfig';
import { WOUND_KINDS, type Wound } from './wounds';

const MAX = GORE.wounds.max;

export interface GoreUniforms {
  uWear: { value: number };
  uGore: { value: number };
  uWoundN: { value: number };
  /** x, y, angle, size. */
  uWA: { value: THREE.Vector4[] };
  /** kind, side, strength, fresh. */
  uWB: { value: THREE.Vector4[] };
  /** The eye, for a carcass: centre x, y, |z| and radius in the fish's own space (radius 0: off). */
  uEye: { value: THREE.Vector4 };
}

export function goreUniforms(): GoreUniforms {
  return {
    uWear: { value: 0 },
    uGore: { value: 1 },
    uWoundN: { value: 0 },
    uWA: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
    uWB: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
    uEye: { value: new THREE.Vector4() },
  };
}

/** Where the eye is (from the fish geometry's userData.eye), so a carcass's eye can be drawn sunken and clouded; null turns it off. */
export function setGoreEye(material: THREE.Material | THREE.Material[] | undefined, eye: readonly number[] | null | undefined): void {
  if (!material || Array.isArray(material)) return;
  const u = material.userData.uniforms as Partial<GoreUniforms> | undefined;
  if (!u?.uEye) return;
  if (eye && eye.length >= 4) u.uEye.value.set(eye[0]!, eye[1]!, eye[2]!, eye[3]!);
  else u.uEye.value.set(0, 0, 0, 0);
}

/** Copy wounds and wear into a material's uniforms (no-op for materials without them). */
export function setGore(material: THREE.Material | THREE.Material[] | undefined, wear: number, wounds: readonly Wound[], gore: number): void {
  if (!material || Array.isArray(material)) return;
  const u = material.userData.uniforms as Partial<GoreUniforms> | undefined;
  if (!u?.uWA || !u.uWB || !u.uWear || !u.uWoundN || !u.uGore) return;
  u.uWear.value = wear;
  u.uGore.value = gore;
  const n = Math.min(MAX, wounds.length);
  u.uWoundN.value = n;
  for (let i = 0; i < n; i++) {
    const w = wounds[i]!;
    u.uWA.value[i]!.set(w.x, w.y, w.angle, w.size);
    u.uWB.value[i]!.set(WOUND_KINDS.indexOf(w.kind), w.side, w.strength, w.fresh);
  }
}

const COMMON = /* glsl */ `
varying vec3 vGObj;
varying vec2 vGFin;
uniform float uWear;
uniform float uGore;
uniform float uWoundN;
uniform vec4 uWA[${MAX}];
uniform vec4 uWB[${MAX}];
uniform vec4 uEye;
float gHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float gNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float gFbm(vec3 p) { return 0.55 * gNoise(p) + 0.3 * gNoise(p * 2.13) + 0.15 * gNoise(p * 4.71); }
`;

const FRAGMENT = /* glsl */ `
{
  vec3 gp = vGObj;
  float finW = max(vGFin.x, vGFin.y);
  float wear = uWear;
  if (wear > 0.001) {
    // Frayed fins: the edges go first, raggedly.
    if (finW > 0.02) {
      float rag = 0.6 * gNoise(gp * 85.0) + 0.4 * gNoise(gp * 21.0);
      if (finW > 1.0 - min(0.8, wear * 0.55) * (0.35 + rag)) discard;
    }
    // Darker, duller skin.
    float dk = min(wear, 1.0);
    diffuseColor.rgb *= 1.0 - 0.36 * dk;
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), 0.3 * dk);
    // A carcass (wear above 1): 0 at death, 1 well into decay.
    float rot = clamp((wear - 1.0) / 0.3, 0.0, 1.0);
    // Pale fungus: patches that spread from the head, the tail and the fins.
    float region = 0.5 + 0.5 * max(max(smoothstep(-0.18, -0.36, gp.x), smoothstep(0.3, 0.46, gp.x)), finW);
    float f = gFbm(gp * mix(vec3(15.0, 19.0, 19.0), vec3(24.0, 30.0, 30.0), rot));
    float th = 1.0 - min(1.0, pow(min(wear, 1.0), 1.3) * region * 0.5 + rot * 0.08);
    float fung = smoothstep(th, th + 0.13, f) * (0.65 + 0.35 * gNoise(gp * 170.0));
    // On a carcass the skin itself goes first: a dull, dark red fading to grey-brown
    // (most at the head, the tail and the belly), and the fungus is a dirty, eroded grey
    // with darker edges rather than clean white.
    float lumC = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float fade = clamp(0.25 + 0.55 * (region - 0.5) * 2.0 + 0.3 * smoothstep(0.0, -0.06, gp.y) + 0.5 * (gFbm(gp * 7.0) - 0.5), 0.0, 1.0);
    vec3 dull = mix(vec3(0.1, 0.018, 0.0145) * (0.8 + 1.0 * lumC), vec3(0.13, 0.1, 0.072), fade);
    diffuseColor.rgb = mix(diffuseColor.rgb, dull, rot * 0.9);
    vec3 fungC = mix(vec3(0.78, 0.77, 0.71), vec3(0.36, 0.32, 0.25) * (0.8 + 0.35 * gNoise(gp * 90.0)), rot);
    float rim = smoothstep(th - 0.09, th, f) * (1.0 - smoothstep(th + 0.02, th + 0.1, f));
    diffuseColor.rgb *= 1.0 - 0.45 * rim * rot;
    diffuseColor.rgb = mix(diffuseColor.rgb, fungC, fung * mix(0.82, 0.7, rot));
    gMatte = max(gMatte, max(fung, rot * 0.7));
    // Fins: ragged, thin and grey-brown.
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.08, 0.06), rot * smoothstep(0.02, 0.3, finW) * 0.7);
    // The eye: clouded over and sunk into a dark socket.
    if (uEye.w > 0.0 && rot > 0.0 && abs(gp.z) > uEye.z * 0.4) {
      float de = length(vec2(gp.x - uEye.x, gp.y - uEye.y)) / uEye.w;
      float socket = (1.0 - smoothstep(1.0, 1.7, de)) * smoothstep(0.75, 1.05, de);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.011, 0.008, 0.006), socket * rot * 0.9);
      float cloud = 1.0 - smoothstep(0.85, 1.0, de);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.27) * (0.75 + 0.35 * gNoise(gp * 400.0)), cloud * rot * 0.85);
    }
  }
  if (finW < 0.02) {
    for (int i = 0; i < ${MAX}; i++) {
      if (float(i) >= uWoundN) break;
      vec4 a = uWA[i];
      vec4 b = uWB[i];
      if (b.y != 0.0 && sign(gp.z) != b.y) continue;
      vec2 d = gp.xy - a.xy;
      float ca = cos(a.z);
      float sa = sin(a.z);
      vec2 r = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
      float sz = a.w;
      float m = 0.0;
      float core = 0.0;
      int kind = int(b.x + 0.5);
      float wob = (gNoise(gp * 70.0) - 0.5);
      if (kind == 0) {
        // Rakes: three or four parallel tears, tapering at the ends.
        float along = 1.0 - smoothstep(0.55, 1.0, abs(r.x) / sz);
        float spacing = sz * 0.26;
        float k = r.y / spacing + 0.5 * step(0.5, fract(a.w * 97.0));
        float idx = floor(k + 0.5);
        if (abs(idx) > 1.5) along = 0.0;
        float dd = abs(k - idx) * spacing + wob * 0.006;
        float width = sz * 0.042 * (1.0 - 0.6 * abs(r.x) / sz);
        m = along * (1.0 - smoothstep(width * 0.9, width * 2.4, dd)) * (0.55 + 0.45 * gNoise(gp * 120.0));
        core = along * (1.0 - smoothstep(width * 0.35, width * 1.0, dd));
      } else if (kind == 1) {
        // A scrape: scales gone in a ragged patch, with raw specks.
        float e = length(r / vec2(sz, sz * 0.55)) + wob * 0.55;
        m = 1.0 - smoothstep(0.65, 1.0, e);
        core = m * smoothstep(0.55, 0.75, gNoise(gp * 150.0)) * (1.0 - smoothstep(0.2, 0.8, e));
      } else if (kind == 2) {
        // Net marks: thin lines worn round the body behind the head.
        // A band of rubbed scales where the mesh closed, with the mesh line cut in at its front.
        float x0 = a.x + 0.0015 * sin(gp.y * 60.0);
        float band = 1.0 - smoothstep(sz * 1.2, sz * 2.6, abs(gp.x - x0 + sz * 1.6));
        float l1 = 1.0 - smoothstep(sz * 0.15, sz * 0.45, abs(gp.x - x0));
        m = band * 0.55 * smoothstep(0.35, 0.7, gNoise(gp * 110.0)) + l1 * 0.8;
        core = l1 * 0.7;
      } else if (kind == 3) {
        // A bite: an arc of tooth punctures, scales lost inside it.
        float rr = length(r);
        float ang = atan(r.y, r.x);
        float half_ = smoothstep(-0.2, 0.3, cos(ang));
        float arc = (1.0 - smoothstep(sz * 0.06, sz * 0.16, abs(rr - sz))) * half_;
        float teeth = smoothstep(0.55, 0.92, cos(ang * 11.0));
        float inner = (1.0 - smoothstep(sz * 0.5, sz * 0.95, rr + wob * 0.03)) * half_ * smoothstep(0.35, 0.65, gNoise(gp * 120.0));
        m = max(arc * (0.3 + 0.7 * teeth), 0.5 * inner);
        core = arc * teeth;
      } else {
        // A hook tear at the mouth.
        float e = length(r / vec2(sz * 1.5, sz)) + wob * 0.6;
        m = 1.0 - smoothstep(0.7, 1.15, e);
        core = 1.0 - smoothstep(0.15, 0.55, e);
      }
      m *= b.z;
      core *= b.z;
      // Scale loss is pale; under it, flesh: raw red when fresh (Unflinching), pink then pale as it heals.
      // Documentary keeps every mark as muted scale loss.
      float raw = uGore * b.w;
      vec3 scar = mix(diffuseColor.rgb, vec3(0.8, 0.74, 0.7), 0.7);
      // Fresh: torn, pale skin round dark open flesh, so it reads even on a red spawner.
      vec3 edge = mix(mix(scar, vec3(0.72, 0.5, 0.46), 0.5 * uGore), vec3(0.86, 0.6, 0.55), raw);
      vec3 flesh = mix(mix(scar * 0.92, vec3(0.62, 0.34, 0.31), uGore), vec3(0.2, 0.008, 0.008), raw);
      float show = 0.55 + 0.45 * uGore;
      diffuseColor.rgb = mix(diffuseColor.rgb, edge, clamp(m, 0.0, 1.0) * 0.8 * show);
      diffuseColor.rgb = mix(diffuseColor.rgb, flesh, clamp(core, 0.0, 1.0) * show);
      gMatte = max(gMatte, m * (1.0 - raw) * 0.6);
    }
  }
}
`;

/** Add the wound and wear code to a fish shader (call inside onBeforeCompile, after the swim code). */
export function injectGore(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec3 vGObj;\nvarying vec2 vGFin;\nvoid main() {\n  vGObj = position;\n  vGFin = aFin;');
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${COMMON}\nvoid main() {\n  float gMatte = 0.0;`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT}`)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 1.0, gMatte);\n  metalnessFactor *= 1.0 - gMatte;');
}
