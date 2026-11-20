/**
 * Sockeye eggs in the redd: translucent orange-red spheres about 6 mm across,
 * each a little different in colour, with the embryo curled inside. In the
 * weeks before hatching the eggs are "eyed": the embryo's two dark eyes show
 * through the shell. The egg stage of the game is that last stretch, so the
 * eyes are always there and darken as hatching nears (uniform uEyed).
 *
 * One geometry of radius 1, drawn instanced (Renderer: the brood's eggs and
 * the player's own). Drawn in order within the mesh: the embryo and oil drop,
 * then the see-through shell (per-vertex opacity), then the eyes on its inside
 * surface. Parts are marked in the builder's spare aFin.x channel (eggs never
 * use the fish material).
 */
import * as THREE from 'three';
import { col, GeoBuilder } from './geo';

/** Colours: the shell (orange-red), the embryo, the oil globule, the eyes. */
const SHELL = col(0xec5a28);
const SHELL_LIGHT = col(0xffa25a);
const EMBRYO = col(0xb8492a);
const OIL = col(0xf7b24e);
const EYE = col(0x0b0806);

export function buildEggGeometry(lod: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const hi = lod === 'high';
  const b = new GeoBuilder();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  // Parts are marked in aFin.x: 0 inside (opaque), 0.5 the shell (see-through), 1 the eyes.
  // The embryo: a body curled round inside the shell.
  b.add(new THREE.TorusGeometry(0.52, 0.12, hi ? 6 : 4, hi ? 16 : 8, Math.PI * 1.45), EMBRYO, m.compose(p.set(0, 0.12, 0), q.setFromEuler(new THREE.Euler(0, 0, -0.4)), s.set(1, 1, 1)));
  // The oil globule: a pale gold drop on top.
  b.add(new THREE.SphereGeometry(0.24, hi ? 8 : 5, hi ? 6 : 4), OIL, m.compose(p.set(-0.32, 0.5, 0.1), q.identity(), s.set(1, 0.8, 1)));
  // The shell: lighter where the light comes through at the top, deeper red below.
  b.add(new THREE.SphereGeometry(1, hi ? 18 : 10, hi ? 12 : 7), (v, out) => out.copy(SHELL).lerp(SHELL_LIGHT, 0.5 + 0.5 * v.y), undefined, 0.5, 0);
  // The eyes: dark discs pressed against the inside of the thin shell, drawn over it so they read black.
  for (const z of [-0.26, 0.26]) {
    const n = new THREE.Vector3(0.62, 0.55, z).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    b.add(new THREE.CircleGeometry(0.17, hi ? 12 : 7), EYE, m.compose(p.copy(n).multiplyScalar(1.004), q, s.set(1, 1, 1)), 1, 0);
  }
  const g = b.build();
  // Per-vertex opacity: the shell lets the embryo show through; inside parts and eyes are solid.
  const fin = g.getAttribute('aFin') as THREE.BufferAttribute;
  const rgb = g.getAttribute('color') as THREE.BufferAttribute;
  const rgba = new Float32Array(rgb.count * 4);
  for (let i = 0; i < rgb.count; i++) {
    const part = fin.getX(i);
    rgba.set([rgb.getX(i), rgb.getY(i), rgb.getZ(i), part > 0.9 ? 0.95 : part > 0.4 ? SHELL_ALPHA : 1], i * 4);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
  return g;
}

/** How much of the shell's own colour covers what is behind it. */
const SHELL_ALPHA = 0.5;

/**
 * The egg material: glossy and translucent, with the eyes' strength set by
 * `uEyed` (0 = not yet visible, 1 = dark). Instance colours tint each egg.
 */
export function eggMaterial(): THREE.MeshStandardMaterial {
  const uEyed = { value: 1 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, transparent: true, emissive: new THREE.Color(0x4a1406) });
  mat.userData.uEyed = uEyed;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEyed = uEyed;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uEyed;\nattribute vec2 aFin;')
      .replace('#include <color_vertex>', `#include <color_vertex>\n  float hwEye = step(0.9, aFin.x) * (1.0 - uEyed);\n  vColor = mix(vColor, vec4(${SHELL.r.toFixed(3)}, ${SHELL.g.toFixed(3)}, ${SHELL.b.toFixed(3)}, 0.0), hwEye);`);
  };
  mat.customProgramCacheKey = () => 'egg';
  return mat;
}

/** Per-egg colour: a little variation in hue and depth of colour, fixed by id. */
export function eggTint(id: number, out: THREE.Color): THREE.Color {
  const h = Math.sin(id * 91.7 + 3.3) * 43758.5453;
  const f = h - Math.floor(h);
  const g = Math.sin(id * 27.1 + 9.1) * 43758.5453;
  const k = g - Math.floor(g);
  return out.setRGB(1, 0.86 + 0.16 * f, 0.84 + 0.18 * k);
}
