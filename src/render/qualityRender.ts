/**
 * How the graphics quality reaches the scene: pixel ratio, far clip and fog,
 * school thinning and fish detail. Renderer.ts calls these through a few
 * one-line hooks; the presets themselves are in quality.ts.
 */
import * as THREE from 'three';
import { CROWD_FX } from './crowdConfig';
import { buildFishGeometry, type FishLook, type FishShape } from './fishMesh';
import { quality, type Quality } from './quality';

/**
 * Whether the browser draws WebGL in software (SwiftShader, llvmpipe), as it does
 * when the graphics driver is blocklisted. Auto then starts at Low: such a machine
 * cannot afford High, and antialiasing can only be turned off by reloading.
 */
export function detectSoftwareGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** Device pixel ratio capped by the preset, times the resolution scale. */
export function pixelRatioFor(q: Quality, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, q.maxPixelRatio) * q.resolutionScale;
}

/** Instanced kinds that are only scenery around the player: drawing fewer changes nothing in the simulation. */
const SCHOOL_KINDS = new Set(['herring', 'smolt', 'pink', 'migrant']);
/** The crowd on the spawning grounds has its own share per preset (crowdConfig.ts `drawn`). */
const CROWD_KINDS = new Set(['crowdFemale', 'crowdMale', 'crowdJack', 'crowdCarcass']);

/**
 * Whether to leave this school fish out of the drawing. Chosen by entity id,
 * so the same fish stay drawn from frame to frame and the school keeps its shape.
 */
export function skipInstance(e: { kind: string; id: number }): boolean {
  const share = CROWD_KINDS.has(e.kind) ? (CROWD_FX.drawn[quality.level] ?? 1) : SCHOOL_KINDS.has(e.kind) ? quality.schoolFraction : 1;
  if (share >= 1) return false;
  // Golden-ratio hash of the id: evenly spread in 0..1.
  return (e.id * 0.6180339887) % 1 >= share;
}

const lowFish = new Map<string, THREE.BufferGeometry>();

/** Swap the fish meshes in a newly made object to low detail when the preset asks for it. */
export function adaptDetail<T extends THREE.Object3D>(obj: T): T {
  if (quality.fishDetail !== 'low') return obj;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    const look = m.userData.look as FishLook | undefined;
    const key = m.userData.shapeKey as string | undefined;
    if (!m.isMesh || !look || !key || m.userData.lowDetail) return;
    const id = `${look}|${key}`;
    let geo = lowFish.get(id);
    if (!geo) {
      const [depth = 1, hump = 0, kype = 0, yolk = 0] = key.split(',').map(Number);
      const shape: FishShape = { depth, hump, kype, yolk };
      geo = buildFishGeometry(shape, look, { lod: 'low' });
      // Shared: the renderer does not dispose shared geometry when the object goes.
      geo.userData.shared = true;
      lowFish.set(id, geo);
    }
    m.geometry.dispose();
    m.geometry = geo;
    m.userData.lowDetail = true;
  });
  return obj;
}

/** Fog density times distance where exp2 fog is all but opaque (99.8%). */
const FOG_OPAQUE = 2.5;
/** Never clip nearer than this, so fog-free things (lake ice) stay whole. */
const MIN_FAR = 30;

/**
 * Each frame, after the renderer has set the fog for the moment: thicken it a
 * little on Low and pull the far plane in to where the fog hides everything.
 */
export function frameQuality(fog: THREE.FogExp2, camera: THREE.PerspectiveCamera, defaultFar: number): void {
  fog.density *= quality.fogScale;
  const far = quality.fogClip > 0 ? Math.min(defaultFar, Math.max(MIN_FAR, (quality.fogClip * FOG_OPAQUE) / Math.max(1e-4, fog.density))) : defaultFar;
  if (Math.abs(camera.far - far) > 0.5) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
