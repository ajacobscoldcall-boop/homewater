/**
 * Small rendered portraits of a fish at spawning age, for the offspring cards.
 * One shared offscreen WebGL renderer, made on first use and kept; one fish
 * mesh whose geometry is swapped per portrait (the material, and so the
 * compiled shader, is kept); finished images are cached as data URLs by look
 * and shape. On Low the portraits are drawn small and without antialiasing.
 * Render only: reads a fish's traits, never the simulation.
 */
import * as THREE from 'three';
import { bodyLook, type BodyRole } from './bodyChange';
import { buildFishGeometry, createFish, setSwim, shapeKey } from './fishMesh';
import { quality } from './quality';
import { RECAP } from '../ui/recapConfig';

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  fish: THREE.Mesh | null;
  ratio: number;
}

let rig: Rig | null | undefined;
const cache = new Map<string, string>();

function makeRig(): Rig | null {
  try {
    const level = quality.level;
    const ratio = RECAP.portrait.ratio[level] ?? 1;
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: level !== 'low', preserveDrawingBuffer: true, alpha: true });
    renderer.setPixelRatio(ratio);
    renderer.setSize(RECAP.portrait.width, RECAP.portrait.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(RECAP.portrait.background, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf2f4f6, 0x4a4640, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe8f0, 0.6);
    fill.position.set(-4, -1, 3);
    scene.add(fill);
    const aspect = RECAP.portrait.width / RECAP.portrait.height;
    const camera = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 0.5, -0.5, 0.1, 50);
    camera.position.set(0, 0.6, 10);
    camera.lookAt(0, 0, 0);
    return { renderer, scene, camera, fish: null, ratio };
  } catch {
    return null;
  }
}

/** The role a fish is drawn in: females as females; males as large males, or as a jack when they lean strongly that way. */
export function portraitRole(sex: 'F' | 'M', jackScore: number): BodyRole {
  if (sex === 'F') return 'female';
  return jackScore > RECAP.portrait.jackFrom ? 'jack' : 'largeMale';
}

/**
 * A data URL of the fish in spawning dress (bodyChange.ts on the grounds), or
 * null when WebGL is not available. `bodyDepth` is the fish's expressed trait.
 */
export function fishPortrait(role: BodyRole, bodyDepth: number): string | null {
  const { look, shape } = bodyLook({ role, bodyDepth, fat: RECAP.portrait.fat, place: 'grounds' });
  const key = `${look}|${shapeKey(shape)}|${quality.level}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (rig === undefined) rig = makeRig();
  if (!rig) return null;
  const r = rig;
  if (!r.fish) {
    r.fish = createFish(shape, look);
    r.scene.add(r.fish);
  } else {
    r.fish.geometry.dispose();
    r.fish.geometry = buildFishGeometry(shape, look);
  }
  const fish = r.fish;
  setSwim(fish, 0.6, 0.02);
  // Fit the body into the frame, seen a little from the front and above, head to the right.
  fish.rotation.set(0, 0.32, 0);
  fish.position.set(0, 0, 0);
  fish.scale.setScalar(1);
  fish.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fish);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const aspect = RECAP.portrait.width / RECAP.portrait.height;
  const fit = Math.min((aspect * 0.86) / Math.max(size.x, 1e-3), 0.78 / Math.max(size.y, 1e-3));
  fish.scale.setScalar(fit);
  fish.position.set(-centre.x * fit, -centre.y * fit, -centre.z * fit);
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
