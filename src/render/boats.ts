/**
 * People at the nets on the return's coast (render only): a gillnet skiff at
 * the end of each net line, rocking on the surface, with its crew.
 *
 * From below, the hull is real geometry pressing into the surface, with its
 * shadow on the bed (fainter under cloud). What stands above the water, the
 * hull's sides and the two people in rain gear, is seen through Snell's window
 * as capsules handed to above.ts, so it costs nothing outside the window.
 * One draw per skiff and one per shadow; at most a few lines are fished.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { AboveWater } from './above';
import { BOATS } from './weatherConfig';

interface Skiff {
  root: THREE.Group;
  hull: THREE.Mesh;
  shadow: THREE.Mesh;
  x: number;
  z: number;
  /** Along +z (1) or -z (-1): the bow points along the net line. */
  dir: number;
  phase: number;
}

/** A small open skiff: flat-bottomed, with a raked bow, built as rings of a U section along its length. */
export function skiffGeometry(): THREE.BufferGeometry {
  const L = BOATS.length;
  const B = BOATS.beam;
  const top = BOATS.freeboard;
  const keel = -BOATS.draft;
  const rings = 12;
  // Section points across the hull (side, bottom, side), from port gunwale to starboard gunwale.
  const across = [-1, -0.92, -0.6, 0, 0.6, 0.92, 1];
  const pos: number[] = [];
  const colours: number[] = [];
  const side = new THREE.Color(BOATS.hull);
  const bottom = new THREE.Color(0x3c4a44);
  const idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings; // 0 stern, 1 bow
    const zAlong = (t - 0.5) * L;
    // Beam narrows toward the bow; the bottom rises into the raked bow.
    const halfBeam = (B / 2) * (t < 0.6 ? 1 : Math.max(0.08, 1 - ((t - 0.6) / 0.4) ** 1.6));
    const lift = t < 0.55 ? 0 : ((t - 0.55) / 0.45) ** 1.5 * (top - keel) * 0.8;
    for (const a of across) {
      const edge = Math.abs(a);
      const x = a * halfBeam;
      // Sides from the gunwale down to the chine, then the flat bottom.
      const y = edge > 0.95 ? top : edge > 0.9 ? keel + 0.18 + lift : keel + lift + 0.04 * (1 - edge);
      pos.push(x, Math.min(top, y), zAlong);
      const c = edge > 0.9 ? side : bottom;
      colours.push(c.r, c.g, c.b);
    }
  }
  const n = across.length;
  for (let r = 0; r < rings; r++)
    for (let i = 0; i < n - 1; i++) {
      const a = r * n + i;
      const b = a + n;
      // Wound so the normals face out of the hull.
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  // Transom: close the stern.
  for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let discTex: THREE.Texture | null = null;
function softDisc(): THREE.Texture {
  if (discTex) return discTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const gr = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
  }
  discTex = new THREE.CanvasTexture(c);
  return discTex;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class BoatLayer {
  readonly group = new THREE.Group();
  private skiffs: Skiff[] = [];
  private surface = 0;

  /** Build a skiff at the end of each net line (return stage); none elsewhere. */
  build(w: World, floor: (x: number, z: number) => number): void {
    this.clear();
    const lines = w.live('netLine');
    if (!lines.length) return;
    const geo = skiffGeometry();
    // Seen from below the hull is in its own shadow: a little light scattered up from the water keeps it from going black.
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(BOATS.underGlow) });
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x08100e, map: softDisc(), transparent: true, opacity: BOATS.shadow, depthWrite: false });
    const s = w.arena.surfaceY;
    this.surface = s;
    lines.forEach((line, i) => {
      const half = (line.size?.z ?? 80) / 2;
      // Alternate ends, so the boats are spread across the bay; the bow points back along the line.
      const end = i % 2 === 0 ? 1 : -1;
      const z = end * (half - BOATS.offset - BOATS.length / 2);
      const x = line.pos.x + BOATS.beam * 0.9;
      // Only where the water is deep enough to float it.
      if (floor(x, z) > s - BOATS.draft - 0.6) return;
      const root = new THREE.Group();
      const hull = new THREE.Mesh(geo, mat);
      hull.rotation.y = end > 0 ? Math.PI : 0;
      root.add(hull);
      root.position.set(x, s, z);
      const bed = floor(x, z);
      // The hull's shadow on the bed, a little long, as the light comes from high overhead.
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(BOATS.beam * BOATS.shadowSpread, BOATS.length * 1.1), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(x, bed + 0.05, z);
      this.group.add(root, shadow);
      this.skiffs.push({ root, hull, shadow, x, z, dir: -end, phase: i * 1.9 });
    });
  }

  clear(): void {
    for (const k of this.skiffs) {
      this.group.remove(k.root, k.shadow);
      k.shadow.geometry.dispose();
    }
    if (this.skiffs.length) {
      this.skiffs[0]!.hull.geometry.dispose();
      (this.skiffs[0]!.hull.material as THREE.Material).dispose();
      (this.skiffs[0]!.shadow.material as THREE.Material).dispose();
    }
    this.skiffs = [];
  }

  /**
   * Rock the skiffs with the wind, fade their shadows under cloud, and hand the two
   * nearest to the camera (hull, and each person's body and head, above the water) to the sky seen through the window.
   */
  update(t: number, wind: number, sun: number, above: AboveWater, camera: THREE.Camera): void {
    above.clearBoats();
    if (!this.skiffs.length) return;
    const sorted = [...this.skiffs].sort((a, b) => Math.hypot(a.x - camera.position.x, a.z - camera.position.z) - Math.hypot(b.x - camera.position.x, b.z - camera.position.z));
    const rock = BOATS.rock * (0.6 + 1.4 * wind);
    for (const k of this.skiffs) {
      const ph = (2 * Math.PI * t) / BOATS.rockPeriod + k.phase;
      k.root.rotation.set(rock * 0.4 * Math.sin(ph * 0.7), 0, rock * Math.sin(ph));
      k.root.position.y = this.surface + 0.05 * Math.sin(ph * 1.3) * (0.5 + wind);
      (k.shadow.material as THREE.MeshBasicMaterial).opacity = BOATS.shadow * sun;
    }
    sorted.slice(0, 2).forEach((k, i) => {
      const s = k.root.position.y;
      const tilt = k.root.rotation.z;
      // The hull's sides above the water: a low capsule along it, as wide as the boat.
      const r = BOATS.freeboard * 0.55;
      tmpA.set(k.x, s + r * 0.6, k.z - (BOATS.length / 2 - r) * k.dir);
      tmpB.set(k.x, s + r * 0.6, k.z + (BOATS.length / 2 - r * 1.5) * k.dir);
      above.setBoatCapsule(i * 5, tmpA, tmpB, Math.max(r, BOATS.beam * 0.3), 2);
      // The crew: one at the bow hauling the net, one aft; they sway with the boat.
      for (let c = 0; c < BOATS.crew && c < 2; c++) {
        const along = (c === 0 ? 0.28 : -0.25) * BOATS.length * k.dir;
        const lean = tilt * BOATS.height + (c === 0 ? 0.25 : 0) * Math.sin(t * 1.1 + k.phase);
        const pr = BOATS.personRadius;
        const foot = s + BOATS.freeboard * 0.3;
        const neck = foot + BOATS.height * 0.82;
        tmpA.set(k.x, foot + pr, k.z + along);
        tmpB.set(k.x + lean * 0.8, neck - pr, k.z + along + (c === 0 ? 0.2 * k.dir : 0));
        above.setBoatCapsule(i * 5 + 1 + c * 2, tmpA, tmpB, pr, 1);
        // The head, in a dark hat.
        tmpA.set(k.x + lean, neck + BOATS.headRadius * 0.9, k.z + along + (c === 0 ? 0.25 * k.dir : 0));
        above.setBoatCapsule(i * 5 + 2 + c * 2, tmpA, tmpA, BOATS.headRadius, 3);
      }
    });
  }
}
