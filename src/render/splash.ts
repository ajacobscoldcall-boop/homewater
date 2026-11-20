/**
 * Splashes where a bear's head and forepaws break the surface (render only):
 * a white-water ring on the underside of the surface, spray above it (seen
 * only from above, the surface hides it from below) and bubbles that trail
 * from the jaws and paws while they are under. Two draw calls while active,
 * none when idle.
 */
import * as THREE from 'three';
import { SPLASH } from './aboveConfig';
import { quality } from './quality';

const RINGS = 6;
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/** A soft, broken ring of foam. */
function foamTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n - 0.5;
      const y = (j + 0.5) / n - 0.5;
      const r = Math.hypot(x, y) * 2;
      const a = Math.atan2(y, x);
      const broken = 0.6 + 0.4 * Math.sin(a * 7 + Math.sin(a * 3) * 2) * Math.sin(a * 13 + 1);
      const ring = Math.exp(-((r - 0.78) ** 2) / 0.012) * broken + 0.35 * Math.max(0, 1 - r / 0.8) * (0.5 + 0.5 * Math.sin(a * 5 + r * 20));
      const v = Math.round(Math.min(1, ring) * 255);
      data.set([v, v, v, 255], (j * n + i) * 4);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A soft round spot, white with alpha falling to the rim (bubbles, and the bear's shadow on the surface). */
let disc: THREE.DataTexture | null = null;
export function softDisc(): THREE.DataTexture {
  if (disc) return disc;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const r = Math.hypot((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 0.8;
      data.set([255, 255, 255, Math.round(Math.min(1, a * 1.6) * 255)], (j * n + i) * 4);
    }
  disc = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  disc.magFilter = disc.minFilter = THREE.LinearFilter;
  disc.needsUpdate = true;
  return disc;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

export class Splashes {
  readonly group = new THREE.Group();
  private ring: THREE.InstancedMesh;
  private rings: { x: number; z: number; y: number; age: number; size: number }[] = [];
  private points: THREE.Points;
  private parts: Particle[] = [];
  private pos: Float32Array;
  private max: number;
  private next = 0;
  private time = 0;
  /** Each tracked anchor's last height, so a crossing of the surface is seen. */
  private last = new WeakMap<THREE.Object3D, number>();

  constructor() {
    const ringMat = new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.ring = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ringMat, RINGS);
    this.ring.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 3), 3);
    this.ring.frustumCulled = false;
    // After the surface, so the foam lies on its underside.
    this.ring.renderOrder = 2;
    this.max = SPLASH.particles;
    this.pos = new Float32Array(this.max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const pm = new THREE.PointsMaterial({ color: 0xe8f4f2, size: 0.075, map: softDisc(), transparent: true, opacity: 0.85, depthWrite: false });
    this.points = new THREE.Points(geo, pm);
    this.points.frustumCulled = false;
    this.group.add(this.ring, this.points);
    this.group.visible = false;
  }

  /** Graphics quality: how many particles a splash may use. */
  private budget(): number {
    return Math.round(this.max * (quality.level === 'high' ? 1 : quality.level === 'medium' ? 0.6 : 0.35));
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    if (this.parts.length >= this.budget()) {
      // Reuse the oldest.
      this.parts[this.next % this.parts.length] = { x, y, z, vx, vy, vz, age: 0, life };
      this.next++;
      return;
    }
    this.parts.push({ x, y, z, vx, vy, vz, age: 0, life });
  }

  /** A burst where something breaks the surface at (x, z). */
  burst(x: number, z: number, surfaceY: number, size = 1): void {
    this.rings.push({ x, z, y: surfaceY - 0.03, age: 0, size });
    if (this.rings.length > RINGS) this.rings.shift();
    const n = Math.round(this.budget() * 0.7 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.6;
      // A little spray up and out (seen only from above), and a white cloud of bubbles driven down.
      if (i % 4 === 0) this.emit(x, surfaceY + 0.05, z, Math.cos(a) * sp, 1.5 + Math.random() * 2.2, Math.sin(a) * sp, SPLASH.life);
      else {
        const r = Math.random() * 0.35 * size;
        this.emit(x + Math.cos(a) * r, surfaceY - 0.05 - Math.random() * 0.35, z + Math.sin(a) * r, Math.cos(a) * sp * 0.35, -0.5 - Math.random() * 1.3, Math.sin(a) * sp * 0.35, SPLASH.life * (1 + Math.random() * 0.6));
      }
    }
    this.group.visible = true;
  }

  /**
   * Follow a bear's jaws and forepaws: a splash when one goes in (or comes out),
   * bubbles from it while it is under and `active`.
   */
  track(bear: THREE.Object3D, surfaceY: number, active: boolean, dt: number): void {
    bear.traverse((o) => {
      if (o.name !== 'mouth' && o.name !== 'paw') return;
      o.getWorldPosition(tmpV);
      const prev = this.last.get(o);
      this.last.set(o, tmpV.y);
      if (prev === undefined) return;
      if (prev > surfaceY && tmpV.y <= surfaceY) this.burst(tmpV.x, tmpV.z, surfaceY, o.name === 'mouth' ? 1 : 0.7);
      else if (prev <= surfaceY && tmpV.y > surfaceY + 0.02) this.burst(tmpV.x, tmpV.z, surfaceY, 0.4);
      if (active && tmpV.y < surfaceY && Math.random() < dt * 30) {
        this.emit(tmpV.x + (Math.random() - 0.5) * 0.2, tmpV.y, tmpV.z + (Math.random() - 0.5) * 0.2, 0, 0.4 + Math.random() * 0.5, 0, 1.2);
        this.group.visible = true;
      }
    });
  }

  update(dt: number, surfaceY: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    // Particles: spray falls back; bubbles slow, then rise and wobble, and pop at the surface.
    let live = 0;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.y > surfaceY) p.vy -= 9.8 * dt;
      else {
        p.vx *= 1 - 3 * dt;
        p.vz *= 1 - 3 * dt;
        p.vy += (0.9 - p.vy) * 2.5 * dt;
        p.x += Math.sin(this.time * 9 + p.life * 40) * 0.2 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.vy > 0 && p.y > surfaceY - 0.02 && p.y < surfaceY + 0.05 && p.age > 0.2) p.age = p.life;
      if (p.age >= p.life) continue;
      this.pos.set([p.x, p.y, p.z], live * 3);
      live++;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    this.points.geometry.setDrawRange(0, live);
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = live > 0;
    // Rings grow and fade.
    let shown = 0;
    for (const r of this.rings) {
      r.age += dt;
      const k = r.age / SPLASH.ringLife;
      if (k >= 1) continue;
      const s = SPLASH.ringRadius * 2 * r.size * (0.35 + 0.65 * Math.sqrt(k));
      this.ring.setMatrixAt(shown, tmpM.compose(tmpV.set(r.x, r.y, r.z), tmpQ, tmpS.set(s, s, 1)));
      const b = (1 - k) * (1 - k) * 0.9;
      this.ring.setColorAt(shown, tmpC.setRGB(b, b, b));
      shown++;
    }
    this.rings = this.rings.filter((r) => r.age < SPLASH.ringLife);
    this.ring.count = shown;
    this.ring.instanceMatrix.needsUpdate = true;
    if (this.ring.instanceColor) this.ring.instanceColor.needsUpdate = true;
    this.ring.visible = shown > 0;
    this.group.visible = live > 0 || shown > 0;
  }

  clear(): void {
    this.parts = [];
    this.rings = [];
    this.group.visible = false;
  }
}
