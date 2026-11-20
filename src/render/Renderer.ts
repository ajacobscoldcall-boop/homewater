/**
 * Draws the world. Reads simulation state; never changes it.
 * Fish and animals are built in code (fishMesh.ts, animals.ts); fog and colour carry the scene.
 */
import * as THREE from 'three';
import { alevinView } from '../sim/stages/egg';
import { fryView } from '../sim/stages/fry';
import { oceanView } from '../sim/stages/ocean';
import type { ArenaKind } from '../sim/stages';
import { returnLayout, returnUpstream } from '../sim/stages/return';
import { roleOf, spawnState } from '../sim/stages/spawn';
import type { Entity, EntityKind } from '../sim/types';
import { headingVec } from '../sim/vec';
import type { World } from '../sim/world';
import { animalOf, BEAR_FORE_X, createBear, createChar, createGull, createMerganser, createOrca, createSeal, createShark } from './animals';
import { buildEnvironment, buildGravelPatch, type Detail, type EnvScene } from './env';
import { bodyLook } from './bodyChange';
import { SCENT_FLOOR, SCENT_SCALE } from './bodyConfig';
import { buildFishGeometry, createFish, setSwim, shapeKey, type FishLook, type FishShape } from './fishMesh';
import { FoodSwarm } from './krill';
import { LightShafts, MarineSnow, sharedWater, surfaceMaterial } from './water';
// The world above the water (sky, shore, the bear's bulk) and splashes: see above.ts, splash.ts.
import { AboveWater } from './above';
import { BEAR_STRIKE } from './aboveConfig';
import { softDisc, Splashes } from './splash';
// Gore: wounds, senescence, death beats and the carcass (render only).
import { GoreLayer } from './gore';
import { ScavengerLayer } from './scavengers';
// Cinematic camera moments (render only): see cinematics.ts. Hook is in updateCamera.
import { Cinematics } from './cinematics';
// Photo mode (render only): see photoRig.ts. Hooks in render(), after updateCamera.
import { PhotoRig } from './photoRig';
// Graphics quality (Low/Medium/High/Auto): see quality.ts. Hooks are marked "quality".
import { quality, type Quality } from './quality';
import { adaptDetail, frameQuality, pixelRatioFor, skipInstance } from './qualityRender';
// Fellow migrants on the return and their splashes at the falls (migrants.ts).
import { MigrantLayer } from './migrants';
// Performance: keeps shader programs compiled while materials come and go (programKeeper.ts).
import { ProgramKeeper } from './programKeeper';
import { WaterFeel } from './waterFeel';
// Feel pass: the third-person camera rig (collision, lag, look-ahead, shake) and banking into turns.
import { CameraRig, type CameraProbe } from './cameraRig';
import { CAMERA } from './cameraConfig';
import { SceneryProbe } from './sceneryProbe';
import { access } from '../ui/accessibility';

export type CameraMode = 'third' | 'first';
const NO_WALLS: readonly never[] = [];

const WATER: Record<ArenaKind, { fog: number; density: number; floor: [number, number]; shafts: number; shaftColor: number }> = {
  gravel: { fog: 0x3e5244, density: 0.18, floor: [0x6b6152, 0x8e8270], shafts: 0.0, shaftColor: 0xd8f0e6 },
  lake: { fog: 0x2d5c60, density: 0.05, floor: [0x4d4a3a, 0x6b6650], shafts: 0.247, shaftColor: 0xd8f0e6 },
  river: { fog: 0x3b6a62, density: 0.045, floor: [0x5d5848, 0x8a8068], shafts: 0.209, shaftColor: 0xe2f2e6 },
  ocean: { fog: 0x123d5a, density: 0.032, floor: [0x1d2b33, 0x2b3a42], shafts: 0.285, shaftColor: 0xbfe2ff },
  bayCreek: { fog: 0x36605a, density: 0.042, floor: [0x5a5545, 0x857b63], shafts: 0.209, shaftColor: 0xe0f2e8 },
  spawnBed: { fog: 0x416c5c, density: 0.06, floor: [0x6a604c, 0x9a8c70], shafts: 0.152, shaftColor: 0xe8f4e2 },
  spawnRiver: { fog: 0x3c665e, density: 0.05, floor: [0x5f5848, 0x8d816a], shafts: 0.13, shaftColor: 0xe4f2e6 },
  lakeBeach: { fog: 0x2f6366, density: 0.04, floor: [0x6e6650, 0xa59a7c], shafts: 0.2, shaftColor: 0xe0f2ee },
};

interface InstancedKind {
  mesh: THREE.InstancedMesh;
  max: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
/** Flood water colour in the redd (silt). */
const SILT = new THREE.Color(0x6e5c3c);
const UP = new THREE.Vector3(0, 1, 0);
/** Ring and circle geometry faces +z. */
const FACING = new THREE.Vector3(0, 0, 1);
const tmpTarget = new THREE.Vector3();
const shotPosV = new THREE.Vector3();
const shotLookV = new THREE.Vector3();
const projV = new THREE.Vector3();
const projF = new THREE.Vector3();
const projD = new THREE.Vector3();
// Per-frame scratch (performance: no allocation in the frame loop).
const tmpE = new THREE.Euler();
const smoltE = new THREE.Euler(0, 0, 0, 'YZX');
const camFish = new THREE.Vector3();
const camWant = new THREE.Vector3();
const camLookAt = new THREE.Vector3();
const camH = new THREE.Vector3();

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.05, 400);
  cameraMode: CameraMode = 'third';
  /** Scenery detail, 0 (low) to 2 (high); read when a stage is built. */
  /** Scenery detail, from the graphics preset (quality.envDetail). */
  get envDetail(): Detail {
    return quality.envDetail as Detail;
  }
  private env: EnvScene | null = null;
  private stageGroup = new THREE.Group();
  private entityGroup = new THREE.Group();
  private objects = new Map<number, THREE.Object3D>();
  private instanced = new Map<EntityKind, InstancedKind>();
  private player: THREE.Mesh | null = null;
  private playerKey = '';
  private builtFor: unknown = null;
  private builtStage = -1;
  private swimPhase = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fog = new THREE.FogExp2(0x2d5c60, 0.05);
  private baseDensity = 0.05;
  private readonly programs: ProgramKeeper;
  /** Third-person camera (cameraRig.ts) and what it must not clip into. */
  readonly rig = new CameraRig();
  private scenery = new SceneryProbe();
  private probe: CameraProbe | null = null;
  private hitsSeen = 0;
  private lastMode: 'third' | 'other' = 'other';
  /** Banking: smoothed yaw rate and roll of the player fish (render only). */
  private lastYaw = NaN;
  private yawRate = 0;
  private roll = 0;
  // Reused by syncEntities every frame.
  private instanceCounts = new Map<EntityKind, number>();
  private seenIds = new Set<number>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.programs = new ProgramKeeper(this.renderer);
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xcfe8e2, 0x2a2a20, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.3);
    this.sun.position.set(20, 60, 10);
    this.scene.add(this.hemi, this.sun);
    this.scene.add(this.stageGroup, this.entityGroup, this.shafts.group, this.snow.points, this.food.group, this.splash.group);
    this.scene.add(this.scavengers.group);
  }

  /** Ocean food patch: krill swarm with small fish and squid (krill.ts). */
  private food = new FoodSwarm();

  /** Gore layer (src/render/gore.ts): wounds, wear, the death beat and the carcass. App sets its mode. */
  readonly gore = new GoreLayer(this.scene);
  /** Cinematic camera moments (src/render/cinematics.ts). App feeds it sim events. */
  readonly cinematics = new Cinematics();
  /** Photo mode (src/render/photoRig.ts): its free camera and picture pass. App opens and closes it. */
  readonly photo = new PhotoRig();
  private shafts = new LightShafts(10);
  private snow = new MarineSnow();
  private surfaceMat: THREE.ShaderMaterial | null = null;
  private above = new AboveWater();
  private splash = new Splashes();
  /** Gulls, the eagle and carcasses on the spawning grounds (src/render/scavengers.ts). */
  private scavengers = new ScavengerLayer();
  /** Bears drawn this frame (syncEntities), for their splashes and their shape above the water. */
  private bearsSeen: THREE.Object3D[] = [];
  private migrants = new MigrantLayer();

  /** Graphics quality changed (quality.ts). rebuild: materials or geometry depend on it, so build the stage again. */
  applyQuality(q: Quality, rebuild: boolean): void {
    this.renderer.setPixelRatio(pixelRatioFor(q, window.devicePixelRatio));
    this.shafts.setCount(q.lightShafts);
    this.snow.setCount(q.marineSnow);
    if (rebuild) this.builtStage = -1;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Screen position (0..1) of a world point, and whether it is behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    // Called for every threat marker every frame: reuse vectors.
    const v = projV.set(x, y, z);
    const forward = this.camera.getWorldDirection(projF);
    const behind = projD.copy(v).sub(this.camera.position).dot(forward) < 0;
    v.project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, behind };
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  render(w: World, frameDt: number): void {
    // Photo mode: the picture holds still (no time passes in the scene) and its own camera replaces the play camera.
    const photo = this.photo.active;
    if (photo) frameDt = 0;
    if (this.builtFor !== w || this.builtStage !== w.stageIndex || this.lastArena !== w.arena) this.buildStage(w);
    this.syncEntities(w);
    this.food.update(w.stageId === 'ocean' ? w.live('herring') : [], w.stageTime);
    this.syncPlayer(w, frameDt);
    if (photo) this.photo.place(this.camera, w, this.player);
    else this.updateCamera(w, frameDt);
    this.gore.update(w, frameDt, this.player, this.objects, this.camera);
    // Scavengers: after the gore layer has laid the carcass down at the end of a life.
    const end = this.gore.endScene;
    this.scavengers.update(w, frameDt, { bears: this.bearsSeen, objects: this.objects, ending: end && end !== 'spent' && this.player ? this.player.position : null, ground: (x, z) => this.groundAt(w, x, z), gore: this.gore.mode === 'unflinching' ? 1 : 0 });
    this.above.beginBears();
    for (const obj of this.bearsSeen) {
      obj.updateMatrixWorld(true);
      this.splash.track(obj, w.arena.surfaceY, true, frameDt);
      this.above.trackBear(obj, this.camera);
    }
    this.migrants.update(w, frameDt, this.splash, this.player);
    this.splash.update(frameDt, w.arena.surfaceY);
    sharedWater.uTime.value += frameDt;
    this.env?.update(w, frameDt, this.camera);
    this.updateAlevin(w, frameDt);
    this.updateHidingSpots(w);
    frameQuality(this.fog, this.camera, 400); // quality: fog scale and far clip
    if (this.surfaceMat) this.surfaceMat.uniforms.uFogDensity!.value = this.fog.density;
    this.shafts.update(this.camera, (x, z) => w.arena.floor(x, z), w.arena.surfaceY, sharedWater.uTime.value);
    this.snow.update(this.camera);
    if (photo) this.photo.draw(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  /** Photo mode: open the free camera where the camera is now. */
  beginPhoto(w: World): void {
    this.photo.begin(this.camera, w, (x, z) => this.groundAt(w, x, z));
  }

  /** Photo mode: close it; the play camera takes over again next frame, unchanged. */
  endPhoto(): void {
    this.photo.end(this.camera);
  }

  /** Photo mode: draw the current picture at width × height and read it back (RGBA, top row first). */
  capturePhoto(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
    return this.photo.capture(this.renderer, this.scene, this.camera, width, height);
  }

  private lastArena: unknown = null;
  private spotRings: THREE.Mesh[] = [];

  /** Jack role: rings under the bank show hiding spots; green is yours, red is another jack's. */
  private updateHidingSpots(w: World): void {
    const s = spawnState(w);
    const show = !!s && s.role === 'jack';
    if (!show) {
      for (const r of this.spotRings) r.visible = false;
      return;
    }
    while (this.spotRings.length < s.spots.length) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.spotRings.push(ring);
    }
    s.spots.forEach((sp, i) => {
      const ring = this.spotRings[i];
      if (!ring) return;
      ring.visible = true;
      // Lie flat on the sloping bed so the whole ring shows.
      const f = (x: number, z: number) => w.arena.floor(x, z);
      ring.position.set(sp.x, f(sp.x, sp.z) + 0.07, sp.z);
      ring.quaternion.setFromUnitVectors(FACING, tmpTarget.set(f(sp.x - 0.5, sp.z) - f(sp.x + 0.5, sp.z), 1, f(sp.x, sp.z - 0.5) - f(sp.x, sp.z + 0.5)).normalize());
      const owner = s.owners[i];
      (ring.material as THREE.MeshBasicMaterial).color.setHex(owner === 0 ? 0x8fa04a : owner === -1 ? 0xdfe8dc : 0xd9473a);
    });
  }
  private waterFeel = new WaterFeel(this.scene);
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private baseFog = new THREE.Color();
  private flow: THREE.InstancedMesh | null = null;
  private flowPts: THREE.Vector3[] = [];

  /** Egg stage: daylight, the flow made visible as drifting flecks. */
  private updateAlevin(w: World, frameDt: number): void {
    const v = alevinView(w);
    if (!v) {
      // Smolts run at night (advisor): a darker, moonlit river.
      const night = w.stageId === 'smolt';
      // Fry and ocean moments set their own light: dusk, winter, autumn, and dark time skips.
      const fry = fryView(w);
      const sea = oceanView(w);
      const moment = fry ?? sea;
      const dim = moment?.light ?? 1;
      // The sky above: night for the smolt run; dusk and winter in the lake; an autumn evening for the maturation reveal.
      const skyLight = 1 - 0.9 * (moment?.fade ?? 0);
      if (night) this.above.setSky('night', 'night', 0, skyLight);
      else if (fry?.phase === 'winter') this.above.setSky('winter', 'winter', 0, skyLight);
      else if (fry && (fry.phase === 'dusk' || fry.phase === 'second')) {
        const duskLight = w.p.get('fry.duskLight');
        this.above.setSky('day', 'dusk', Math.min(1, Math.max(0, (1 - fry.light) / Math.max(0.05, 1 - duskLight))), skyLight);
      } else if (sea?.moment === 'reveal') this.above.setSky('day', 'dusk', 0.4, skyLight);
      else this.above.setSky('day', 'day', 0, skyLight);
      this.hemi.intensity = (night ? 0.55 : 1.1) * dim;
      this.sun.intensity = (night ? 0.45 : 1.3) * dim;
      // Time skips close in with dark water, then open on the next moment.
      this.fog.density = this.baseDensity * (1 + 30 * (moment?.fade ?? 0));
      sharedWater.uLight.value = (night ? 0.45 : 1) * dim;
      // Deeper water is darker.
      const depth = Math.max(0, w.arena.surfaceY - this.camera.position.y);
      this.fog.color.copy(this.baseFog).multiplyScalar((1 - Math.min(0.55, depth / 45)) * (night ? 0.55 : 1) * dim);
      // The return in a warm year: cool refuges clearer and bluer, hot shallows hazier; seeps shimmer.
      this.waterFeel.tint(this.fog, w, frameDt);
      this.waterFeel.update(w, frameDt);
      (this.scene.background as THREE.Color).copy(this.fog.color);
      return;
    }
    // The flood: the water rises, darkens and clouds with silt, then clears.
    const flood = v.floodLevel;
    const light = (v.phase === 'egg' ? 0.8 : v.light) * (1 - 0.35 * flood);
    sharedWater.uLight.value = light;
    this.hemi.intensity = 0.2 + 0.95 * light;
    this.sun.intensity = 0.1 + 1.3 * light;
    this.fog.color.copy(this.baseFog).lerp(SILT, 0.75 * flood).multiplyScalar(0.25 + 0.75 * light);
    (this.scene.background as THREE.Color).copy(this.fog.color);
    this.fog.density = this.baseDensity * (1 + 2.5 * flood);
    const flow = this.flow;
    if (!flow) return;
    const flooding = v.flood === 'flood';
    const speed = flooding ? 3.4 : v.pulse ? 2.4 : v.warning || v.flood === 'warning' ? 1.2 + flood : 0.5;
    const dx = Math.cos(v.currentAngle) * speed * frameDt;
    const dz = Math.sin(v.currentAngle) * speed * frameDt;
    this.flowPts.forEach((pt, i) => {
      pt.x += dx;
      pt.z += dz;
      if (Math.hypot(pt.x, pt.z) > 2.6) {
        // Re-enter on the upstream side.
        const a = v.currentAngle + Math.PI + (Math.random() - 0.5) * 2;
        pt.set(Math.cos(a) * 2.5, -1.55 + Math.random() * 0.8, Math.sin(a) * 2.5);
      }
      tmpS.set(flooding ? 2.4 : v.pulse ? 3 : 1.4, 1, 1);
      tmpQ.setFromAxisAngle(UP, -v.currentAngle);
      flow.setMatrixAt(i, tmpM.compose(pt, tmpQ, tmpS));
    });
    flow.instanceMatrix.needsUpdate = true;
  }

  private clearGroup(g: THREE.Group): void {
    for (const child of [...g.children]) {
      g.remove(child);
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        // Textures made per stage (e.g. the gillnet mesh) are freed with their materials.
        const free = (x: THREE.Material) => {
          (x as THREE.MeshBasicMaterial).map?.dispose();
          this.programs.release(x);
        };
        if (Array.isArray(mat)) mat.forEach(free);
        else if (mat) free(mat);
      });
    }
  }

  private buildStage(w: World): void {
    this.builtFor = w;
    this.builtStage = w.stageIndex;
    this.lastArena = w.arena;
    this.clearGroup(this.stageGroup);
    this.clearGroup(this.entityGroup);
    this.objects.clear();
    this.instanced.clear();
    this.player = null;
    this.playerKey = '';
    const a = w.arena;
    const look = WATER[a.kind];
    this.fog.color.setHex(look.fog);
    this.baseFog.setHex(look.fog);
    this.baseDensity = look.density;
    this.flow = null;
    this.scene.background = new THREE.Color(look.fog);

    // The place itself: terrain, banks, rocks, plants (src/render/env).
    this.env = buildEnvironment(w, { detail: this.envDetail, fog: this.fog });
    this.stageGroup.add(this.env.group);
    this.scenery.build(this.env.group);
    this.rig.reset();
    this.probe = null;
    const sx = a.max.x - a.min.x;
    const sz = a.max.z - a.min.z;
    this.shafts.setStrength(look.shafts, look.shaftColor);

    // The surface, seen from below, and the world above it seen through Snell's window.
    this.above.build(w, (x, z) => this.groundAt(w, x, z));
    this.splash.clear();
    this.surfaceMat = surfaceMaterial(this.fog, this.above.uniforms, a.surfaceY);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(sx + 120, sz + 120), this.surfaceMat);
    surf.renderOrder = 1;
    surf.rotation.x = -Math.PI / 2;
    surf.position.set((a.min.x + a.max.x) / 2, a.surfaceY, (a.min.z + a.max.z) / 2);
    this.stageGroup.add(surf);

    // Gillnets are static: build them once.
    for (const net of w.live('netLine')) this.buildNet(w, net);

    // Instanced kinds.
    this.makeInstanced('plankton', new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160);
    this.makeInstanced('scent', new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd7ffe8, transparent: true, opacity: 0.55 }), 200);
    this.makeInstanced('eggs', new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf28a3a, roughness: 0.25, transparent: true, opacity: 0.85 }), 20);
    // Brood-mates after hatching: alevin with their yolk sacs, one draw call for the nest.
    this.makeInstanced('brood', buildFishGeometry({ depth: 0.8, hump: 0, kype: 0, yolk: 1 }, 'alevin', { lod: 'low' }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), 20);
    this.makeInstanced('track', new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 200);
    this.makeInstanced('smolt', buildFishGeometry({ depth: 0.95, hump: 0, kype: 0, yolk: 0 }, 'smolt', { lod: 'low' }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), 80);
    // Pink salmon in a crowded ocean year: silver at sea, a little smaller than the player.
    // Other returning sockeye travelling the home river with the player (migrants.ts).
    const mig = this.migrants.make();
    this.makeInstanced('migrant', mig.geo, mig.mat, 40);
    for (const [kind, inst] of this.instanced) if (kind === 'migrant') inst.mesh.renderOrder = 2; // after the surface: see migrants.ts
    this.makeInstanced('pink', buildFishGeometry({ depth: 0.95, hump: 0, kype: 0, yolk: 0 }, 'pink', { lod: quality.fishDetail }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }), 60);

    if (a.kind === 'gravel') {
      // Flecks carried by the flow show which way the water is moving.
      const flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 3), new THREE.MeshBasicMaterial({ color: 0xd8cfb8 }), 140);
      flow.frustumCulled = false;
      this.flowPts = Array.from({ length: 140 }, () => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 2.5;
        return new THREE.Vector3(Math.cos(a) * r, -1.55 + Math.random() * 0.8, Math.sin(a) * r);
      });
      this.flow = flow;
      this.stageGroup.add(flow);
    }
  }

  private makeInstanced(kind: EntityKind, geo: THREE.BufferGeometry, mat: THREE.Material, max: number): void {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.entityGroup.add(mesh);
    this.instanced.set(kind, { mesh, max });
  }

  private buildNet(w: World, net: Entity): void {
    const x = net.pos.x;
    const half = (net.size?.z ?? 36) / 2;
    const depth = net.size?.y ?? 7;
    const gaps = w
      .live('netGap')
      .filter((g) => Math.abs(g.pos.x - x) < 0.5)
      .map((g) => [g.pos.z - g.radius, g.pos.z + g.radius] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    const spans: [number, number][] = [];
    let z = -half;
    for (const [g0, g1] of gaps) {
      if (g0 > z) spans.push([z, g0]);
      z = Math.max(z, g1);
    }
    if (z < half) spans.push([z, half]);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = 'rgba(220,230,225,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 64, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const floatsAt: number[] = [];
    for (const [z0, z1] of spans) {
      const width = z1 - z0;
      const t = tex.clone();
      t.repeat.set(width / 0.6, depth / 0.6);
      t.needsUpdate = true;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      panel.rotation.y = Math.PI / 2;
      panel.position.set(x, -depth / 2, (z0 + z1) / 2);
      this.stageGroup.add(panel);
      // Float line: one instanced draw per span (it was one draw per float).
      const floats = Math.max(1, Math.floor(width / 1.6));
      for (let i = 0; i <= floats; i++) floatsAt.push(z0 + (width * i) / floats);
    }
    // All the floats of one line in a single draw call.
    const floatMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff7a1a }), Math.max(1, floatsAt.length));
    floatMesh.count = floatsAt.length;
    floatsAt.forEach((fz, i) => floatMesh.setMatrixAt(i, tmpM.makeTranslation(x, -0.05, fz)));
    floatMesh.computeBoundingSphere();
    this.stageGroup.add(floatMesh);
  }

  private syncEntities(w: World): void {
    const counts = this.instanceCounts;
    const seen = this.seenIds;
    this.bearsSeen.length = 0;
    counts.clear();
    seen.clear();
    for (const e of w.entities) {
      if (!e.alive || this.env?.handles.has(e.kind)) continue;
      const inst = this.instanced.get(e.kind);
      if (inst) {
        const n = counts.get(e.kind) ?? 0;
        if (n >= inst.max || skipInstance(e)) continue; // quality: thinner schools
        this.writeInstance(w, e, inst.mesh, n);
        counts.set(e.kind, n + 1);
        continue;
      }
      if (e.kind === 'netLine' || e.kind === 'netGap' || e.kind === 'wall' || e.kind === 'herring' || e.kind === 'carcass') continue;
      seen.add(e.id);
      let obj = this.objects.get(e.id);
      if (!obj) {
        obj = adaptDetail(this.makeObject(w, e)); // quality: fish detail
        this.objects.set(e.id, obj);
        this.entityGroup.add(obj);
      }
      this.updateObject(w, e, obj);
    }
    for (const [kind, inst] of this.instanced) {
      inst.mesh.count = counts.get(kind) ?? 0;
      inst.mesh.instanceMatrix.needsUpdate = true;
      if (inst.mesh.instanceColor) inst.mesh.instanceColor.needsUpdate = true;
    }
    for (const [id, obj] of this.objects) {
      if (!seen.has(id)) {
        this.entityGroup.remove(obj);
        this.objects.delete(id);
        // Animal geometry is shared between instances; materials are per instance.
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => this.programs.release(x));
          else if (mat) this.programs.release(mat);
        });
      }
    }
  }

  private writeInstance(w: World, e: Entity, mesh: THREE.InstancedMesh, i: number): void {
    tmpP.set(e.pos.x, e.pos.y, e.pos.z);
    tmpQ.identity();
    switch (e.kind) {
      case 'plankton': {
        const pulse = 1 + 0.25 * Math.sin(w.stageTime * 3 + e.id);
        tmpS.setScalar(pulse * (e.value === 1 ? 1.15 : 0.8));
        mesh.setColorAt(i, tmpC.setHex(e.value === 1 ? 0xf6ff9a : 0xb8d88a));
        break;
      }
      case 'smolt': {
        // Pitch with its climb or dive, a slight roll of its own, and (bursting away from a strike,
        // flock.ts) a hard bank that flashes its silver side. The tail beat quickens with speed.
        const sp = Math.hypot(e.vel.x, e.vel.z);
        const pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(e.vel.y, Math.max(0.8, sp))));
        const flash = e.state === 'flash' ? Math.min(1, e.timer / 0.4) : 0;
        const roll = 0.1 * Math.sin(w.time * 1.7 + e.id * 1.3) + flash * 0.85 * (e.id % 2 ? 1 : -1);
        tmpQ.setFromEuler(smoltE.set(roll, -e.yaw, pitch));
        tmpS.setScalar(0.6 * (0.96 + 0.08 * Math.sin(w.time * (10 + sp * 1.5) + e.id)));
        break;
      }
      case 'migrant':
        this.migrants.pose(e, tmpP, tmpQ, tmpS);
        break;
      case 'pink':
        tmpQ.setFromAxisAngle(UP, -e.yaw);
        tmpS.setScalar(0.72);
        mesh.setColorAt(i, tmpC.setHex(0xb8c4cc));
        break;
      case 'eggs':
        tmpS.setScalar(e.radius);
        break;
      case 'brood':
        if (e.state === 'washed') {
          // Tumbling away on the flood.
          tmpQ.setFromEuler(tmpE.set(e.timer * 9 + e.id, -e.yaw, e.timer * 5));
        } else {
          // Deeper ones sit lower among the stones; all wriggle a little.
          tmpP.y -= 0.06 * (e.value ?? 0.5);
          tmpQ.setFromEuler(tmpE.set(0, -e.yaw + 0.08 * Math.sin(w.time * 5 + e.id), 0.05 * Math.sin(w.time * 3 + e.id * 2)));
        }
        // A little smaller than the player's alevin (0.35), so the player's own fish stands out.
        tmpS.setScalar(0.28);
        break;
      case 'track': {
        // The magnetic sense: a shimmer that fades in and out.
        const life = Math.max(0, Math.min(1, e.timer / 1.4));
        tmpS.setScalar((0.25 + 0.55 * (e.value ?? 0)) * Math.sin(Math.PI * life));
        tmpQ.setFromEuler(tmpE.set(w.time * 2 + e.id, w.time * 3, 0));
        break;
      }
      case 'scent':
        // Home scent on the return and the lake's home-water plume: size shows how clear the smell is (imprint.ts).
        if (w.stageId === 'return' || e.state === 'plume') tmpS.setScalar(Math.max(0.3, (e.timer ?? 1) / 9) * SCENT_SCALE * (SCENT_FLOOR + (1 - SCENT_FLOOR) * (e.value ?? 1)));
        else tmpS.setScalar(Math.max(0.3, (e.timer ?? 1) / 9) * (e.value ?? 1));
        break;
      default:
        tmpS.setScalar(Math.max(0.3, (e.timer ?? 1) / 9) * (e.value ?? 1));
    }
    mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
  }

  private rivalLook(w: World): FishLook {
    return w.fish.sex === 'F' ? 'spawnFemale' : 'spawnMale';
  }

  private makeObject(w: World, e: Entity): THREE.Object3D {
    switch (e.kind) {
      case 'trout': {
        // Dolly Varden / char (advisor: char, not trout, hunt fry and wait at the outlet).
        const g = createChar().root;
        g.scale.setScalar(3.2);
        return g;
      }
      case 'orca': {
        const g = createOrca().root;
        g.scale.setScalar(9);
        return g;
      }
      case 'shark': {
        const g = createShark().root;
        g.scale.setScalar(4.5);
        return g;
      }
      case 'seal': {
        const g = createSeal().root;
        g.scale.setScalar(2.8);
        return g;
      }
      case 'merganser': {
        // Males and females both hunt; which one is just the entity id.
        const g = createMerganser(e.id % 2 === 0).root;
        g.scale.setScalar(1.15);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.name = 'ring';
        const holder = new THREE.Group();
        holder.add(g, ring);
        holder.userData.animal = animalOf(g);
        return holder;
      }
      case 'jackAI': {
        const m = createFish({ depth: 1, hump: 0.3, kype: 0.4, yolk: 0 }, 'spawnJack');
        m.scale.setScalar(0.42);
        return m;
      }
      case 'rival':
      case 'female':
      case 'guardMale': {
        const look: FishLook = e.kind === 'female' ? 'spawnFemale' : e.kind === 'guardMale' ? 'spawnMale' : this.rivalLook(w);
        const male = look === 'spawnMale';
        const m = createFish({ depth: male ? 1.2 : 1.05, hump: male ? 1 : 0.15, kype: male ? 1 : 0, yolk: 0 }, look);
        // Rivals are drawn at their real size: size decides fights.
        m.scale.setScalar(e.kind === 'female' ? 0.95 : e.kind === 'guardMale' ? 1.1 : (e.value ?? 1) * 1.05);
        return m;
      }
      case 'birdShadow': {
        const g = new THREE.Group();
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(e.radius, 24), new THREE.MeshBasicMaterial({ color: 0x0b1210, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -0.06;
        shadow.name = 'shadow';
        const bird = createGull().root;
        bird.scale.setScalar(1.3);
        bird.name = 'bird';
        bird.visible = false;
        g.add(shadow, bird);
        return g;
      }
      case 'bear': {
        const g = new THREE.Group();
        const bear = createBear();
        bear.root.name = 'bear';
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ color: 0x0c120f, map: softDisc(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.name = 'shadow';
        // Drawn after the surface, on its underside.
        shadow.renderOrder = 2;
        g.add(bear.root, shadow);
        return g;
      }
      case 'lure': {
        const g = new THREE.Group();
        const spoon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.9, roughness: 0.2, emissive: 0x332a10 }));
        spoon.scale.set(1.6, 0.6, 0.8);
        spoon.name = 'spoon';
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8eee8, transparent: true, opacity: 0.6 }));
        line.name = 'line';
        g.add(spoon, line);
        return g;
      }
      case 'cover': {
        const s = e.size ?? new THREE.Vector3(6, 0.6, 2);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshStandardMaterial({ color: 0x2f3a22, roughness: 1 }));
        return m;
      }
      case 'gravelPatch': {
        // Advisor: females judge gravel by cobble size. Stones show it, at their real size.
        const a = w.arena;
        const base = a.floor(e.pos.x, e.pos.z);
        return buildGravelPatch(e.radius, e.size?.x ?? 0.2, this.envDetail, (dx, dz) => a.floor(e.pos.x + dx, e.pos.z + dz) - base);
      }
      case 'ice': {
        // Lake ice, seen from below: a pale, unlit, unfogged sheet, so the ceiling reads even in the winter gloom.
        const s = e.size ?? new THREE.Vector3(90, 0.1, 90);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s.x, s.z), new THREE.MeshBasicMaterial({ color: 0x7f979c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false }));
        m.rotation.x = -Math.PI / 2;
        // Over the surface (drawn after it), so the sky does not show through the ice.
        m.renderOrder = 2;
        return m;
      }
      case 'redd': {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.3, 24), new THREE.MeshStandardMaterial({ color: 0x3a3024, roughness: 1, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        return m;
      }
      default:
        return new THREE.Mesh(new THREE.SphereGeometry(e.radius, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
    }
  }

  private updateObject(w: World, e: Entity, obj: THREE.Object3D): void {
    obj.position.set(e.pos.x, e.pos.y, e.pos.z);
    switch (e.kind) {
      case 'seal': {
        obj.rotation.set(0, -e.yaw, 0);
        const lunge = e.state === 'lunge';
        animalOf(obj)?.update({
          mode: e.state,
          t: w.time,
          phase: w.time * (lunge ? 13 : 6) + e.id,
          amp: lunge ? 0.12 : 0.08,
          opacity: e.state === 'warn' ? 0.35 + 0.25 * Math.sin(w.time * 10) : 1,
          pitch: lunge ? Math.max(-0.8, Math.min(0.8, Math.atan2(e.vel.y, Math.hypot(e.vel.x, e.vel.z)))) : 0,
        });
        break;
      }
      case 'merganser': {
        const ring = obj.getObjectByName('ring') as THREE.Mesh;
        const warn = e.state === 'warn';
        ring.visible = warn;
        if (warn) {
          const k = 1 + ((w.time * 2) % 1) * 2;
          ring.scale.setScalar(k);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - (k - 1) / 2);
          obj.position.y = -0.05;
        }
        // Face the way it is moving; keep the last heading during the straight-down dive.
        const h = Math.hypot(e.vel.x, e.vel.z);
        if (h > 0.05 || obj.userData.yaw === undefined) obj.userData.yaw = Math.atan2(e.vel.z, e.vel.x);
        obj.rotation.set(0, -(obj.userData.yaw as number), 0);
        const under = e.state === 'dive' || e.state === 'chase' || e.state === 'surface';
        animalOf(obj)?.update({
          mode: warn ? 'float' : e.state,
          t: w.time + e.id,
          pitch: under ? Math.max(-1.2, Math.min(1.0, Math.atan2(e.vel.y, Math.max(h, 0.01)))) : 0,
        });
        break;
      }
      case 'trout':
      case 'orca':
      case 'shark':
      case 'jackAI':
      case 'rival':
      case 'female':
      case 'guardMale': {
        const yaw = e.kind === 'female' ? Math.PI : Math.atan2(e.vel.z, e.vel.x) || e.yaw;
        obj.rotation.set(0, -yaw, 0);
        const speed = Math.hypot(e.vel.x, e.vel.z);
        const animal = animalOf(obj);
        if (animal) {
          // Big animals beat their tails slowly and with a small bend for their length.
          const big = e.kind === 'orca' || e.kind === 'shark';
          const phase = w.time * (big ? 2.2 + speed * 0.3 : 3 + speed * 1.2) + e.id;
          const amp = big ? Math.min(0.06, 0.03 + 0.003 * speed) : Math.min(0.12, 0.05 + 0.012 * speed);
          animal.update({ mode: e.state, t: w.time, phase, amp });
        } else setSwim(obj, w.time * (3 + speed * 1.5) + e.id, e.state === 'fight' ? 0.18 : 0.05 + 0.02 * speed);
        if (e.kind === 'female') obj.position.y = w.arena.floor(e.pos.x, e.pos.z) + 0.35;
        break;
      }
      case 'birdShadow': {
        const shadow = obj.getObjectByName('shadow') as THREE.Mesh;
        const bird = obj.getObjectByName('bird') as THREE.Object3D;
        const mat = shadow.material as THREE.MeshBasicMaterial;
        const gull = animalOf(bird);
        if (e.state === 'warn') {
          const warn = w.p.get('smolt.birdWarning');
          const left = e.timer / warn;
          mat.opacity = 0.15 + 0.55 * (1 - left);
          shadow.scale.setScalar(1.6 - 0.6 * (1 - left));
          // Circling in above the shadow (seen through the surface, if at all).
          const a = w.time * 1.4 + e.id;
          bird.visible = true;
          bird.position.set(Math.cos(a) * 2.2 * left, 1.4 + 2.5 * left, Math.sin(a) * 2.2 * left);
          bird.rotation.set(0, -a - Math.PI / 2, 0);
          gull?.update({ mode: 'fly', t: w.time + e.id });
        } else {
          // The plunge: head first through the surface.
          mat.opacity = 0.8;
          bird.visible = true;
          bird.position.set(0, -1.2 + e.timer * 5, 0);
          bird.rotation.set(0, e.id, 0);
          gull?.update({ mode: 'strike', t: w.time });
        }
        obj.position.y = 0;
        break;
      }
      case 'bear': {
        const shadow = obj.getObjectByName('shadow') as THREE.Mesh;
        const bearObj = obj.getObjectByName('bear') as THREE.Object3D;
        const bear = animalOf(bearObj);
        const mat = shadow.material as THREE.MeshBasicMaterial;
        // Stand on the bank, or at most in the shallows, facing the middle of the river:
        // where the sim's spot is under water, step back up the bank.
        const mid = returnLayout(w)?.homeMouth ?? 0;
        const out = w.fish.habitat === 'beach' && w.stageId === 'spawn' ? 1 : e.pos.z > mid ? 1 : -1;
        const surfaceY = w.arena.surfaceY;
        let z = e.pos.z;
        for (let i = 0; i < 50 && this.groundAt(w, e.pos.x, z - out * BEAR_FORE_X) < surfaceY - BEAR_STRIKE.standDepth; i++) z += out * 0.1;
        const ground = this.groundAt(w, e.pos.x, z);
        obj.position.set(e.pos.x, ground, z);
        obj.rotation.y = out > 0 ? Math.PI / 2 : -Math.PI / 2;
        // Walking the bank (spawning grounds): it faces the way it goes.
        if ((e.state === 'patrol' || e.state === 'stalk') && Math.hypot(e.vel.x, e.vel.z) > 0.1) obj.rotation.y = -Math.atan2(e.vel.z, e.vel.x);
        // The ground in the bear's own frame (it faces -out along z): local x is towards the water.
        const ox = e.pos.x;
        const oz = z;
        const groundLocal = (lx: number, lz: number) => this.groundAt(w, ox + lz * out, oz - lx * out) - ground;
        obj.userData.ground = groundLocal;
        const target = e.home;
        const warnTime = w.p.get(w.stageId === 'return' ? 'return.bearWarning' : 'spawn.bearWarning');
        let k = 0;
        if (e.state === 'warn') k = 1 - e.timer / warnTime;
        else if (e.state === 'strike') k = 1 - e.timer / 0.6;
        else if (e.state === 'rest') k = 1 - e.timer / 3;
        obj.updateMatrixWorld();
        const local = target ? obj.worldToLocal(tmpTarget.set(target.x, surfaceY - 0.6, target.z)).clone() : undefined;
        bear?.update({ mode: e.state, t: w.time + e.id, k, target: local, surface: surfaceY - ground, ground: groundLocal });
        // After the gore layer has posed it too (render()), its splash and its shape above the water.
        this.bearsSeen.push(obj);
        if ((e.state === 'warn' || e.state === 'strike') && target) {
          // The bear's shadow falls on the surface over the target, a dark patch seen from below.
          shadow.position.copy(obj.worldToLocal(tmpTarget.set(target.x, surfaceY - 0.04, target.z)));
          mat.opacity = e.state === 'warn' ? 0.35 + 0.3 * Math.sin(w.time * 18) : 0.7;
        } else {
          mat.opacity = 0;
        }
        break;
      }
      case 'gravelPatch':
        obj.position.y = w.arena.floor(e.pos.x, e.pos.z) + 0.02;
        break;
      case 'lure': {
        const spoon = obj.getObjectByName('spoon') as THREE.Mesh;
        const line = obj.getObjectByName('line') as THREE.Line;
        obj.visible = e.state !== 'free';
        spoon.rotation.set(w.time * 9, w.time * 4, 0);
        // The line runs up to the surface, where the angler is.
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(1, -1.5, -e.pos.y + 0.05, 0);
        pos.needsUpdate = true;
        break;
      }
      case 'redd': {
        obj.position.y = w.arena.floor(e.pos.x, e.pos.z) + 0.04;
        const s = 0.4 + 0.8 * (e.value ?? 0);
        obj.scale.set(s, s, s);
        // Spawning hook: a covered redd takes the colour of the gravel around it.
        (((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).color).setHex(e.state === 'buried' ? 0x6a604c : 0x3a3024);
        break;
      }
      default:
        break;
    }
  }

  /** Where an animal standing at (x, z) has its feet: the top of a bank, or the bed. */
  private groundAt(w: World, x: number, z: number): number {
    return this.env ? this.env.ground(x, z) : w.arena.floor(x, z);
  }

  private playerShape(w: World): { look: FishLook; shape: FishShape } {
    const z = w.fish.z;
    const depth = 1 + 0.12 * z.bodyDepth;
    const role = roleOf(w);
    switch (w.stageId) {
      case 'egg':
        return { look: 'alevin', shape: { depth: 0.8, hump: 0, kype: 0, yolk: 0.4 + 0.8 * w.progress.yolk } };
      case 'fry':
        return { look: 'fry', shape: { depth: 0.95, hump: 0, kype: 0, yolk: 0 } };
      case 'smolt':
        return { look: 'smolt', shape: { depth: 0.95, hump: 0, kype: 0, yolk: 0 } };
      case 'ocean':
        return { look: 'ocean', shape: { depth, hump: 0, kype: 0, yolk: 0 } };
      default: {
        // Silver at sea, a blush once in fresh water that deepens up the river, full spawning colours only on the grounds;
        // thinner as fat drains (bodyChange.ts).
        const place = w.stageId === 'spawn' ? 'grounds' : w.body.pos.x > (returnLayout(w)?.coast ?? 90) ? 'river' : 'sea';
        return bodyLook({ role, bodyDepth: z.bodyDepth, fat: w.progress.fat, place, upstream: returnUpstream(w) });
      }
    }
  }

  private syncPlayer(w: World, frameDt: number): void {
    const { look, shape } = this.playerShape(w);
    const key = `${look}|${shapeKey(shape)}`;
    if (key !== this.playerKey) {
      if (this.player) {
        this.entityGroup.remove(this.player);
        this.player.geometry.dispose();
        this.programs.release(this.player.material as THREE.Material);
      }
      this.player = createFish(shape, look);
      this.entityGroup.add(this.player);
      this.playerKey = key;
    }
    const p = this.player;
    if (!p) return;
    const b = w.body;
    p.position.set(b.pos.x, b.pos.y, b.pos.z);
    p.rotation.set(0, 0, 0);
    p.rotateY(-b.yaw);
    p.rotateZ(b.pitch);
    // Bank into turns: the back tilts toward the inside of the turn.
    const bank = CAMERA.bank;
    if (frameDt > 0 && Number.isFinite(this.lastYaw) && w.stageId !== 'egg') {
      const dy = Math.atan2(Math.sin(b.yaw - this.lastYaw), Math.cos(b.yaw - this.lastYaw));
      this.yawRate += (dy / frameDt - this.yawRate) * (1 - Math.exp(-bank.follow * frameDt));
    } else this.yawRate = 0;
    this.lastYaw = b.yaw;
    const wantRoll = Math.max(-bank.max, Math.min(bank.max, this.yawRate * bank.perYawRate));
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-bank.follow * frameDt));
    p.rotateX(this.roll);
    p.scale.setScalar(b.scale);
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    this.swimPhase += frameDt * (w.stageId === 'egg' ? 2 : 4 + speed * 2.5 + (b.burst ? 6 : 0));
    setSwim(p, this.swimPhase, w.stageId === 'egg' ? 0.03 : 0.04 + 0.03 * b.thrust + (b.burst ? 0.04 : 0));
    p.visible = (this.cameraMode === 'third' || w.stageId === 'egg') && !(w.stageId === 'egg' && alevinView(w)?.phase === 'egg');
  }

  private updateCamera(w: World, frameDt: number): void {
    const b = w.body;
    const fish = camFish.set(b.pos.x, b.pos.y, b.pos.z);
    const want = camWant;
    const look = camLookAt;
    if (w.stageId === 'egg' || this.cameraMode === 'first') this.lastMode = 'other';
    if (w.stageId === 'egg') {
      // Looking down on the alevin, so its heading against the flow is clear.
      want.set(0.35, b.pos.y + 1.05, 0.75);
      look.set(0, b.pos.y - 0.05, 0);
    } else if (this.cameraMode === 'first') {
      const h = headingVec(b.yaw, b.pitch);
      want.copy(fish).add(camH.set(h.x, h.y, h.z).multiplyScalar(0.55 * b.scale));
      look.copy(want).add(camH.set(h.x, h.y, h.z).multiplyScalar(6));
    } else {
      // Behind and above, looking down at the back so the whole body reads (cameraRig.ts):
      // lags a little on turns, looks ahead, never clips into banks, rocks or the bed, stays under the surface.
      const hits = this.gore.tracker.hits;
      if (hits !== this.hitsSeen) {
        this.hitsSeen = hits;
        this.rig.shake(this.gore.tracker.lastHit);
      }
      if (w.stageTime < 0.05 || this.lastMode !== 'third') this.rig.reset();
      this.lastMode = 'third';
      this.rig.update(b, frameDt, this.cameraProbe(w), access().reducedMotion);
      this.camPos.set(this.rig.pos.x, this.rig.pos.y, this.rig.pos.z);
      this.camLook.set(this.rig.look.x, this.rig.look.y, this.rig.look.z);
      this.placeCamera(w, frameDt);
      return;
    }
    // Keep the camera under the surface and above the bottom.
    const a = w.arena;
    want.y = Math.min(a.surfaceY - 0.15, Math.max(a.floor(want.x, want.z) + 0.25, want.y));
    const k = this.cameraMode === 'first' || w.stageTime < 0.05 ? 1 : 1 - Math.exp(-frameDt * 7);
    if (this.camPos.lengthSq() === 0 || w.stageTime < 0.05) {
      this.camPos.copy(want);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(want, k);
      this.camLook.lerp(look, k);
    }
    this.placeCamera(w, frameDt);
  }

  /** What the play camera must stay clear of: the surface, the scenery's ground, the sim's walls, solid scenery. */
  private cameraProbe(w: World): CameraProbe {
    const a = w.arena;
    if (!this.probe || this.probe.walls !== (a.walls ?? NO_WALLS) || this.probe.surfaceY !== a.surfaceY) {
      const scenery = this.scenery;
      this.probe = {
        surfaceY: a.surfaceY,
        ground: (x, z) => Math.max(a.floor(x, z), this.env ? this.env.ground(x, z) : -Infinity),
        walls: a.walls ?? NO_WALLS,
        rayHit: (from, dir, max) => scenery.rayHit(from, dir, max),
      };
    }
    return this.probe;
  }

  private placeCamera(w: World, frameDt: number): void {
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // Cinematics: blend towards a framed shot; the play camera (camPos/camLook) carries on underneath.
    const shotPos = shotPosV.copy(this.camPos);
    const shotLook = shotLookV.copy(this.camLook);
    if (this.cinematics.apply(w, frameDt, shotPos, shotLook)) {
      this.camera.position.copy(shotPos);
      this.camera.lookAt(shotLook);
      if (this.player && !(w.stageId === 'egg' && alevinView(w)?.phase === 'egg')) this.player.visible = true;
    }
  }
}
