/**
 * Fish resting on the bed (render only; the sim's positions are untouched).
 *
 * The sim keeps a fish's centre a little above its floor, but the drawn bed is
 * not that floor: gravel patches are drawn as real cobble that stands above it,
 * and a drawn fish pitches, banks and has a belly and fins below its centre. From
 * the low chase camera a spawning female on coarse gravel could look half sunk.
 * Here the drawn fish is lifted, by the least amount, so its lowest points clear
 * the drawn bed; the lift eases in and out so it never pops.
 */
import * as THREE from 'three';
import { BED } from './bedConfig';

/** The lowest point of the body (fins included) in slices along its length, in the geometry's own frame: [x, y] pairs. */
export function bellyProfile(geo: THREE.BufferGeometry, slices = BED.slices): readonly (readonly [number, number])[] {
  const cached = geo.userData.belly as [number, number][] | undefined;
  if (cached && cached.length === slices) return cached;
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const lowY = new Array<number>(slices).fill(Infinity);
  const atX = new Array<number>(slices).fill(0);
  const span = Math.max(1e-6, maxX - minX);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const k = Math.min(slices - 1, Math.floor(((x - minX) / span) * slices));
    if (y < lowY[k]!) {
      lowY[k] = y;
      atX[k] = x;
    }
  }
  const out: [number, number][] = [];
  for (let k = 0; k < slices; k++) if (Number.isFinite(lowY[k]!)) out.push([atX[k]!, lowY[k]!]);
  geo.userData.belly = out;
  return out;
}

/** A gravel patch as drawn (env/gravel.ts): centre, radius and cobble size. */
export interface DrawnPatch {
  x: number;
  z: number;
  radius: number;
  cobble: number;
}

/**
 * The drawn bed's top at (x, z): the scenery's ground, raised inside gravel patches by the cobble that stands
 * above it (BED.stoneTop × cobble), easing off over the patch's rim.
 */
export function drawnBedTop(ground: number, x: number, z: number, patches: readonly DrawnPatch[]): number {
  let raise = 0;
  for (const p of patches) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.radius) continue;
    const rim = p.radius * BED.rim;
    const k = d <= rim ? 1 : 1 - (d - rim) / Math.max(1e-6, p.radius - rim);
    raise = Math.max(raise, p.cobble * BED.stoneTop * k);
  }
  return ground + raise;
}

const tmp = new THREE.Vector3();

/**
 * How far to lift a drawn fish (a mesh whose matrixWorld is current) so the lowest points of its body clear
 * the drawn bed by BED.margin. bedTop(x, z) is the drawn bed's height there. 0 when it already clears.
 */
export function restLift(mesh: THREE.Mesh, bedTop: (x: number, z: number) => number): number {
  const belly = bellyProfile(mesh.geometry);
  let lift = 0;
  for (const [x, y] of belly) {
    tmp.set(x, y, 0).applyMatrix4(mesh.matrixWorld);
    lift = Math.max(lift, bedTop(tmp.x, tmp.z) + BED.margin - tmp.y);
  }
  return Math.min(lift, BED.maxLift);
}

/** Eases a lift toward its target: quick to rise (no frame in the gravel), slower to settle back. */
export function easeLift(current: number, target: number, dt: number): number {
  const rate = target > current ? BED.rise : BED.settle;
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
}
