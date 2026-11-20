/**
 * The gore layer: wounds and senescence on the fish, the death beat, and the
 * carcass in the post-spawn sequence. Render only: it reads the world and
 * its events and moves meshes, never sim state.
 *
 * The Renderer calls update() once a frame, after the entities, the player
 * and the camera have been placed, so this can override them for a moment
 * (a predator carrying the fish off, a close-up on the carcass).
 */
import * as THREE from 'three';
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { setSwim } from './fishMesh';
import { GORE, type DeathBeatPlan, type EndScene, type GoreMode } from './goreConfig';
import { setGore } from './goreShader';
import { otherFishLook, senescence, WoundTracker, type Wound } from './wounds';

const OTHER_KINDS = new Set(['rival', 'female', 'guardMale', 'jackAI']);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

const ease = (t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/** Blood and loose scales drifting in the water: soft round points. */
class Cloud {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly scale: Uint8Array;
  private next = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.n = GORE.cloud.blood * 2 + GORE.cloud.scales * 2;
    const n = this.n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.baseSize = new Float32Array(n);
    this.scale = new Uint8Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPx;
        varying vec3 vC;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * uPx / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
          vC = aColor;
          vA = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = (1.0 - smoothstep(0.0, 0.5, r)) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Release blood and scales at a point; size is the fish's scale. */
  emit(at: THREE.Vector3, blood: number, scales: number, size: number): void {
    const spread = GORE.cloud.spread * Math.max(0.35, size);
    const put = (isScale: boolean) => {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const r = Math.random;
      const dir = tmpV.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const sp = spread * (0.3 + 0.9 * r());
      this.pos.set([at.x + dir.x * 0.05 * size, at.y + dir.y * 0.05 * size, at.z + dir.z * 0.05 * size], i * 3);
      this.vel.set([dir.x * sp, dir.y * sp * 0.7, dir.z * sp], i * 3);
      this.age[i] = 0;
      this.life[i] = GORE.cloud.seconds * (0.6 + 0.6 * r());
      this.scale[i] = isScale ? 1 : 0;
      if (isScale) {
        const c = 0.75 + 0.2 * r();
        this.col.set([c, c + 0.03, c + 0.06], i * 3);
        this.baseSize[i] = (0.025 + 0.02 * r()) * Math.max(0.4, size);
      } else {
        const d = 0.3 + 0.2 * r();
        this.col.set([d, d * 0.07, d * 0.065], i * 3);
        this.baseSize[i] = (0.05 + 0.09 * r()) * Math.max(0.4, size);
      }
    };
    for (let k = 0; k < blood; k++) put(false);
    for (let k = 0; k < scales; k++) put(true);
    (this.points.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = true;
  }

  clear(): void {
    this.age.fill(1e9);
    this.alpha.fill(0);
    this.points.visible = false;
    (this.points.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, viewHeight: number): void {
    if (!this.points.visible) return;
    let any = false;
    const drag = Math.exp(-dt * 1.6);
    for (let i = 0; i < this.n; i++) {
      const age = (this.age[i] = this.age[i]! + dt);
      const life = this.life[i]!;
      if (age >= life) {
        this.alpha[i] = 0;
        continue;
      }
      any = true;
      const k = age / life;
      for (let c = 0; c < 3; c++) {
        this.pos[i * 3 + c] = this.pos[i * 3 + c]! + this.vel[i * 3 + c]! * dt;
        this.vel[i * 3 + c] = this.vel[i * 3 + c]! * drag;
      }
      if (this.scale[i]) {
        // Scales flutter down and glint.
        this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! - 0.25 * dt;
        this.size[i] = this.baseSize[i]!;
        this.alpha[i] = (1 - k) * (0.45 + 0.55 * Math.abs(Math.sin(time * 9 + i * 1.7)));
      } else {
        // Blood blooms into a cloud and thins out.
        this.size[i] = this.baseSize[i]! * (1 + 4 * Math.sqrt(k));
        this.alpha[i] = 0.26 * (1 - k) * (1 - k) * Math.min(1, age * 6);
      }
    }
    this.points.visible = any;
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.uPx!.value = (viewHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  }
}

interface Beat {
  plan: DeathBeatPlan;
  world: World;
  t: number;
  killerId: number;
  /** Where the killer and the fish were when it struck. */
  killerStart: THREE.Vector3 | null;
  killerYaw: number;
  killerRotY: number;
  fishStart: THREE.Vector3;
  away: number;
  /** The fish's hold point in the killer's own space (lift style). */
  hold: THREE.Vector3 | null;
  bled: number;
}

interface Ending {
  world: World;
  scene: EndScene;
  sceneT: number;
  wear: number;
  roll: number;
  sink: number;
  close: number;
}

export class GoreLayer {
  mode: GoreMode = 'unflinching';
  readonly tracker = new WoundTracker();
  /** Playtest: a side-on close-up of the player fish (for checking wounds). */
  inspect = false;
  private readonly cloud = new Cloud();
  private beat: Beat | null = null;
  private ending: Ending | null = null;
  private lastWorld: World | null = null;
  private lastFish = '';
  private playerWear = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.cloud.points);
  }

  private get goreValue(): number {
    return this.mode === 'unflinching' ? 1 : 0;
  }

  /** Marks from sim events (fights, hooks, nets). */
  onEvents(events: readonly SimEvent[], w: World | null): void {
    if (w) this.tracker.onEvents(events, w);
  }

  /** The death beat: the strike, then (Unflinching) the predator turning away with the fish. */
  startDeathBeat(w: World, plan: DeathBeatPlan): void {
    const fish = w.body.pos;
    let killerId = 0;
    let best = Infinity;
    for (const e of w.entities) {
      if (!e.alive || e.kind !== plan.killer) continue;
      const at = e.kind === 'bear' && e.home ? e.home : e.pos;
      const d = Math.hypot(at.x - fish.x, at.y - fish.y, at.z - fish.z);
      if (d < best) {
        best = d;
        killerId = e.id;
      }
    }
    this.beat = { plan, world: w, t: 0, killerId, killerStart: null, killerYaw: 0, killerRotY: 0, fishStart: new THREE.Vector3(fish.x, fish.y, fish.z), away: 0, hold: null, bled: 0 };
  }

  /** The post-spawn sequence: which card is showing (null to stop). */
  setEnding(w: World | null, scene: EndScene | null): void {
    if (!w || !scene) {
      this.ending = null;
      return;
    }
    if (this.ending && this.ending.world === w) {
      this.ending.scene = scene;
      this.ending.sceneT = 0;
      return;
    }
    this.ending = { world: w, scene, sceneT: 0, wear: this.playerWear, roll: 0, sink: 0, close: 0 };
  }

  update(w: World, dt: number, player: THREE.Mesh | null, objects: ReadonlyMap<number, THREE.Object3D>, camera: THREE.PerspectiveCamera): void {
    // A new life or a sibling: clear the water.
    if (w !== this.lastWorld || w.fish.id !== this.lastFish) {
      this.lastWorld = w;
      this.lastFish = w.fish.id;
      this.cloud.clear();
    }
    if (this.beat && (this.beat.world !== w || w.status !== 'dead')) this.beat = null;
    if (this.ending && (this.ending.world !== w || w.status !== 'lifeComplete')) this.ending = null;
    this.tracker.update(w);
    const gore = this.goreValue;
    const wear = senescence(w);
    this.playerWear = wear;

    // Other fish on the grounds carry their own wear and old marks.
    if (w.stageId === 'spawn') {
      for (const e of w.entities) {
        if (!OTHER_KINDS.has(e.kind)) continue;
        const obj = objects.get(e.id) as THREE.Mesh | undefined;
        if (!obj?.material) continue;
        const look = (obj.userData.gore ??= otherFishLook(e.id, e.kind)) as { wearFactor: number; wounds: Wound[] };
        setGore(obj.material, Math.min(1, wear * look.wearFactor), look.wounds, gore);
      }
    }

    let playerWear = wear;
    if (player) {
      if (this.beat) this.updateBeat(this.beat, w, dt, player, objects, camera);
      if (this.ending) playerWear = this.updateEnding(this.ending, w, dt, player, camera);
      setGore(player.material as THREE.Material, playerWear, this.tracker.wounds, gore);
      if (this.inspect && !this.ending) this.inspectCamera(w, player, camera);
    }
    const viewHeight = (globalThis.innerHeight ?? 720) * Math.min(globalThis.devicePixelRatio ?? 1, 1.5);
    this.cloud.update(dt, performance.now() / 1000, camera, viewHeight);
  }

  private updateBeat(b: Beat, w: World, dt: number, fish: THREE.Mesh, objects: ReadonlyMap<number, THREE.Object3D>, camera: THREE.PerspectiveCamera): void {
    b.t = Math.min(8, b.t + dt);
    const t = b.t;
    const plan = b.plan;
    const unflinching = plan.mode === 'unflinching';
    const size = w.body.scale;
    const killer = b.killerId ? objects.get(b.killerId) : undefined;
    if (killer && !b.killerStart) {
      b.killerStart = killer.position.clone();
      b.killerRotY = killer.rotation.y;
      b.killerYaw = -killer.rotation.y;
      // Turn away from the camera.
      b.away = Math.atan2(killer.position.z - camera.position.z, killer.position.x - camera.position.x);
    }
    // The strike: a violent jerk, then thrashing that fades.
    const thrash = Math.max(0, 1 - t / 1.2);
    setSwim(fish, t * 34, 0.05 + 0.16 * thrash);
    const mouth = new THREE.Vector3();
    if (plan.style === 'carry' && killer && b.killerStart) {
      const yaw = lerpAngle(b.killerYaw, b.away, ease((t - 0.12) / GORE.beat.turnSeconds));
      const s = killer.scale.x;
      const go = Math.max(0, t - 0.2);
      const dist = GORE.beat.carrySpeed * Math.sqrt(s) * go * go * 0.9;
      const fwd = tmpV.set(Math.cos(yaw), 0, Math.sin(yaw));
      killer.position.copy(b.killerStart).addScaledVector(fwd, dist);
      killer.rotation.y = -yaw;
      // Seals and orcas and fish hold prey at the front; a merganser in its bill.
      const reach = killer.userData.animal ? 0.42 * s : 0.45 * s;
      mouth.copy(killer.position).addScaledVector(fwd, reach);
      const k = ease(t / 0.14);
      fish.position.lerpVectors(b.fishStart, mouth, k);
      fish.rotation.set(0, -(yaw + Math.PI / 2), 0);
      fish.rotateZ(0.3 * Math.sin(t * 17) * thrash);
    } else if (plan.style === 'lift' && killer) {
      const bird = killer.getObjectByName('bird');
      if (bird) {
        // The plunge, then up through the surface with the fish.
        bird.position.set(0, -0.8 + Math.max(0, t - 0.15) * 3.2, 0);
        bird.getWorldPosition(mouth);
        mouth.y -= 0.25 * size;
      } else {
        // A bear: the fish is hauled out of the water to the bank, and the bear turns away with it.
        if (!b.hold) {
          const toRiver = Math.sign(b.fishStart.z - killer.position.z) || 1;
          tmpW.set(killer.position.x, w.arena.surfaceY + 1.3, killer.position.z + toRiver * 1.4);
          killer.updateMatrixWorld();
          b.hold = killer.worldToLocal(tmpW.clone());
        }
        killer.rotation.y = b.killerRotY + Math.PI * ease((t - 0.55) / (GORE.beat.turnSeconds * 1.6));
        killer.updateMatrixWorld();
        mouth.copy(b.hold).applyMatrix4(killer.matrixWorld);
      }
      fish.position.lerpVectors(b.fishStart, mouth, ease(t / 0.5));
      fish.rotation.set(0, 0, 0);
      fish.rotateY(-(w.body.yaw + 0.6 * Math.sin(t * 13) * thrash));
      fish.rotateX(Math.PI / 2 * ease(t / 0.5));
    } else if (plan.style === 'line') {
      // Hauled up towards the surface on the line.
      mouth.copy(b.fishStart);
      mouth.y = w.arena.surfaceY + 0.2;
      mouth.x -= 1.5;
      fish.position.lerpVectors(b.fishStart, mouth, ease((t - 0.1) / 1.3));
      fish.rotateZ(0.6 * ease(t / 0.6));
      if (killer) killer.position.copy(fish.position).add(tmpV.set(0.45 * size, 0, 0));
    } else {
      // A gillnet: thrashing in place, then still.
      mouth.copy(b.fishStart);
      fish.rotateZ(-0.25 * ease(t / 0.4));
    }
    // The camera turns to follow the fish (it stays where it was, under the water).
    const look = tmpW.copy(b.fishStart).lerp(fish.position, ease(t / 0.6) * (plan.style === 'lift' ? 0.75 : 0.6));
    if (plan.style === 'lift') camera.position.y = Math.min(w.arena.surfaceY - 0.15, camera.position.y + 0.6 * ease(t / 0.8));
    camera.lookAt(look);
    // Blood and scales: a burst at the strike, then a trail (Unflinching only).
    if (unflinching && t > 0.06) {
      const c = GORE.cloud;
      const blood = plan.blood ? c.blood : 0;
      const target = Math.min(1, (t - 0.06) / 0.9);
      const want = Math.floor(target * 10);
      while (b.bled < want) {
        const first = b.bled === 0;
        const share = first ? 0.45 : 0.06;
        fish.getWorldPosition(tmpW);
        // A lifted fish leaves the water: no cloud above the surface.
        if (tmpW.y < w.arena.surfaceY) this.cloud.emit(tmpW, Math.round(blood * share), Math.round(c.scales * (first ? 0.5 : 0.055)), size);
        b.bled++;
      }
    }
  }

  private updateEnding(e: Ending, w: World, dt: number, fish: THREE.Mesh, camera: THREE.PerspectiveCamera): number {
    e.sceneT += dt;
    const order: EndScene[] = ['spent', 'death', 'carcass', 'forest', 'seasons', 'eggs'];
    const idx = order.indexOf(e.scene);
    const approach = (v: number, target: number, rate: number) => v + (target - v) * (1 - Math.exp(-dt * rate));
    const carcass = GORE.wear.carcass[this.mode];
    // Spent: ragged and slow. Then it dies, rolls and settles on the gravel. Unflinching: it decays, close up.
    e.wear = approach(e.wear, idx === 0 ? 0.9 : idx === 1 ? 1 : carcass, idx >= 2 ? 0.9 : 1.6);
    e.roll = approach(e.roll, idx >= 1 ? 1 : 0, 2.2);
    e.sink = approach(e.sink, idx >= 1 ? 1 : 0.15, 1.8);
    e.close = approach(e.close, idx === 2 && this.mode === 'unflinching' ? 1 : 0, 2);
    const b = w.body;
    const bed = w.arena.floor(b.pos.x, b.pos.z) + 0.05 * b.scale;
    fish.position.y = b.pos.y + (bed - b.pos.y) * e.sink;
    fish.rotation.set(0, -b.yaw, 0);
    fish.rotateX((Math.PI / 2) * e.roll);
    setSwim(fish, w.time * 2, 0.02 * (1 - e.roll));
    if (e.close > 0.001) {
      // Looking down on the carcass's upturned flank.
      tmpV.set(fish.position.x - Math.cos(b.yaw) * 0.15 * b.scale, fish.position.y + 0.85 * b.scale, fish.position.z - Math.sin(b.yaw) * 0.15 * b.scale);
      tmpV.y = Math.min(w.arena.surfaceY - 0.15, tmpV.y);
      camera.position.lerp(tmpV, e.close);
      camera.lookAt(fish.position);
    }
    return e.wear;
  }

  private inspectCamera(w: World, fish: THREE.Mesh, camera: THREE.PerspectiveCamera): void {
    const b = w.body;
    const s = Math.max(0.3, b.scale);
    camera.position.set(fish.position.x - Math.sin(b.yaw) * 1.25 * s, fish.position.y + 0.12 * s, fish.position.z + Math.cos(b.yaw) * 1.25 * s);
    camera.position.y = Math.min(w.arena.surfaceY - 0.1, camera.position.y);
    camera.lookAt(fish.position);
  }
}
