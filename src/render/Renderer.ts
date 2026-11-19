/**
 * Draws the world. Reads simulation state; never changes it.
 * Milestone 1 is grey-box: simple shapes, fog and colour carry the scene.
 */
import * as THREE from 'three';
import { alevinView } from '../sim/stages/egg';
import type { ArenaKind } from '../sim/stages';
import { returnLayout } from '../sim/stages/return';
import { roleOf, spawnState } from '../sim/stages/spawn';
import type { Entity, EntityKind } from '../sim/types';
import { headingVec } from '../sim/vec';
import type { World } from '../sim/world';
import { buildFishGeometry, createFish, setSwim, shapeKey, type FishLook, type FishShape } from './fishMesh';
import { causticFloorMaterial, LightShafts, MarineSnow, sharedWater, surfaceMaterial } from './water';

export type CameraMode = 'third' | 'first';

const WATER: Record<ArenaKind, { fog: number; density: number; floor: [number, number]; surface: number; shafts: number; shaftColor: number }> = {
  gravel: { fog: 0x3e5244, density: 0.18, floor: [0x6b6152, 0x8e8270], surface: 0xcfe2d2, shafts: 0.0, shaftColor: 0xd8f0e6 },
  lake: { fog: 0x2d5c60, density: 0.05, floor: [0x4d4a3a, 0x6b6650], surface: 0xd4ecea, shafts: 0.247, shaftColor: 0xd8f0e6 },
  river: { fog: 0x3b6a62, density: 0.045, floor: [0x5d5848, 0x8a8068], surface: 0xdcefe6, shafts: 0.209, shaftColor: 0xe2f2e6 },
  ocean: { fog: 0x123d5a, density: 0.032, floor: [0x1d2b33, 0x2b3a42], surface: 0xb7dcf0, shafts: 0.285, shaftColor: 0xbfe2ff },
  bayCreek: { fog: 0x36605a, density: 0.042, floor: [0x5a5545, 0x857b63], surface: 0xd4ebe2, shafts: 0.209, shaftColor: 0xe0f2e8 },
  spawnBed: { fog: 0x416c5c, density: 0.06, floor: [0x6a604c, 0x9a8c70], surface: 0xdaeee2, shafts: 0.152, shaftColor: 0xe8f4e2 },
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
const UP = new THREE.Vector3(0, 1, 0);

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.05, 400);
  cameraMode: CameraMode = 'third';
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

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xcfe8e2, 0x2a2a20, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.3);
    this.sun.position.set(20, 60, 10);
    this.scene.add(this.hemi, this.sun);
    this.scene.add(this.stageGroup, this.entityGroup, this.shafts.group, this.snow.points);
  }

  private shafts = new LightShafts(10);
  private snow = new MarineSnow();
  private surfaceMat: THREE.ShaderMaterial | null = null;

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Screen position (0..1) of a world point, and whether it is behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, y, z);
    const toPoint = v.clone().sub(this.camera.position);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const behind = toPoint.dot(forward) < 0;
    v.project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, behind };
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  render(w: World, frameDt: number): void {
    if (this.builtFor !== w || this.builtStage !== w.stageIndex || this.lastArena !== w.arena) this.buildStage(w);
    this.syncEntities(w);
    this.syncPlayer(w, frameDt);
    this.updateCamera(w, frameDt);
    sharedWater.uTime.value += frameDt;
    this.updateAlevin(w, frameDt);
    this.updateHidingSpots(w);
    if (this.surfaceMat) this.surfaceMat.uniforms.uFogDensity!.value = this.fog.density;
    this.shafts.update(this.camera, (x, z) => w.arena.floor(x, z), w.arena.surfaceY, sharedWater.uTime.value);
    this.snow.update(this.camera);
    this.renderer.render(this.scene, this.camera);
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
      ring.position.set(sp.x, w.arena.floor(sp.x, sp.z) + 0.05, sp.z);
      const owner = s.owners[i];
      (ring.material as THREE.MeshBasicMaterial).color.setHex(owner === 0 ? 0x8fa04a : owner === -1 ? 0xdfe8dc : 0xd9473a);
    });
  }
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
      this.hemi.intensity = night ? 0.55 : 1.1;
      this.sun.intensity = night ? 0.45 : 1.3;
      this.fog.density = this.baseDensity;
      sharedWater.uLight.value = night ? 0.45 : 1;
      // Deeper water is darker.
      const depth = Math.max(0, w.arena.surfaceY - this.camera.position.y);
      this.fog.color.copy(this.baseFog).multiplyScalar((1 - Math.min(0.55, depth / 45)) * (night ? 0.55 : 1));
      (this.scene.background as THREE.Color).copy(this.fog.color);
      return;
    }
    sharedWater.uLight.value = v.phase === 'egg' ? 0.8 : v.light;
    const light = v.phase === 'egg' ? 0.8 : v.light;
    this.hemi.intensity = 0.2 + 0.95 * light;
    this.sun.intensity = 0.1 + 1.3 * light;
    this.fog.color.copy(this.baseFog).multiplyScalar(0.25 + 0.75 * light);
    (this.scene.background as THREE.Color).copy(this.fog.color);
    this.fog.density = this.baseDensity;
    const flow = this.flow;
    if (!flow) return;
    const speed = v.pulse ? 2.4 : v.warning ? 1.2 : 0.5;
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
      tmpS.set(v.pulse ? 3 : 1.4, 1, 1);
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
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
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

    // Bottom.
    const sx = a.max.x - a.min.x;
    const sz = a.max.z - a.min.z;
    const segX = Math.min(220, Math.max(8, Math.round(sx / 1.2)));
    const segZ = Math.min(120, Math.max(8, Math.round(sz / 1.2)));
    const floorGeo = new THREE.PlaneGeometry(sx, sz, segX, segZ);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate((a.min.x + a.max.x) / 2, 0, (a.min.z + a.max.z) / 2);
    const pos = floorGeo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const c0 = new THREE.Color(look.floor[0]);
    const c1 = new THREE.Color(look.floor[1]);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.3 - x * 0.9);
      pos.setY(i, a.floor(x, z) + 0.06 * n);
      tmpC.copy(c0).lerp(c1, 0.5 + 0.5 * n);
      colors.push(tmpC.r, tmpC.g, tmpC.b);
    }
    floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    floorGeo.computeVertexNormals();
    this.stageGroup.add(new THREE.Mesh(floorGeo, causticFloorMaterial()));
    this.shafts.setStrength(look.shafts, look.shaftColor);

    // The surface, seen from below.
    this.surfaceMat = surfaceMaterial(new THREE.Color(look.surface), this.fog);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(sx + 120, sz + 120), this.surfaceMat);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set((a.min.x + a.max.x) / 2, a.surfaceY, (a.min.z + a.max.z) / 2);
    this.stageGroup.add(surf);

    // Banks and walls.
    const bankMat = new THREE.MeshStandardMaterial({ color: 0x3b3326, roughness: 1 });
    for (const wall of a.walls ?? []) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(wall.max.x - wall.min.x, Math.min(30, wall.max.y - wall.min.y), wall.max.z - wall.min.z), bankMat);
      box.position.set((wall.min.x + wall.max.x) / 2, (Math.max(-30, wall.min.y) + wall.max.y) / 2, (wall.min.z + wall.max.z) / 2);
      this.stageGroup.add(box);
    }

    // Gillnets are static: build them once.
    for (const net of w.live('netLine')) this.buildNet(w, net);

    // Instanced kinds.
    this.makeInstanced('plankton', new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160);
    this.makeInstanced('scent', new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd7ffe8, transparent: true, opacity: 0.55 }), 200);
    this.makeInstanced('eggs', new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf28a3a, roughness: 0.25, transparent: true, opacity: 0.85 }), 20);
    this.makeInstanced('herring', buildFishGeometry({ depth: 0.9, hump: 0, kype: 0, yolk: 0 }, 'herring'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), 160);
    this.makeInstanced('track', new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 200);
    this.makeInstanced('smolt', buildFishGeometry({ depth: 0.95, hump: 0, kype: 0, yolk: 0 }, 'smolt'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), 80);
    this.makeInstanced('weed', new THREE.CylinderGeometry(0.07, 0.12, 1, 5), new THREE.MeshStandardMaterial({ color: 0x3f6b2f, roughness: 0.9 }), 80);

    if (a.kind === 'gravel') {
      // Stones around the egg.
      const stoneGeo = new THREE.DodecahedronGeometry(1, 0);
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7c7462, roughness: 1, flatShading: true });
      const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 70);
      for (let i = 0; i < 70; i++) {
        const ang = (i * 2.399) % (Math.PI * 2);
        const r = 0.6 + ((i * 37) % 23) / 10;
        tmpP.set(Math.cos(ang) * r, -1.55 + ((i * 13) % 5) * 0.04, Math.sin(ang) * r);
        tmpS.setScalar(0.18 + ((i * 7) % 9) * 0.03);
        tmpQ.setFromEuler(new THREE.Euler(i, i * 0.7, 0));
        stones.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
      }
      this.stageGroup.add(stones);
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
      // Float line.
      const floats = Math.max(1, Math.floor(width / 1.6));
      for (let i = 0; i <= floats; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff7a1a }));
        f.position.set(x, -0.05, z0 + (width * i) / floats);
        this.stageGroup.add(f);
      }
    }
  }

  private syncEntities(w: World): void {
    const counts = new Map<EntityKind, number>();
    const seen = new Set<number>();
    for (const e of w.entities) {
      if (!e.alive) continue;
      const inst = this.instanced.get(e.kind);
      if (inst) {
        const n = counts.get(e.kind) ?? 0;
        if (n >= inst.max) continue;
        this.writeInstance(w, e, inst.mesh, n);
        counts.set(e.kind, n + 1);
        continue;
      }
      if (e.kind === 'netLine' || e.kind === 'netGap' || e.kind === 'wall') continue;
      seen.add(e.id);
      let obj = this.objects.get(e.id);
      if (!obj) {
        obj = this.makeObject(w, e);
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
      case 'weed': {
        const h = 5 * (e.value ?? 1);
        tmpP.y = w.arena.floor(e.pos.x, e.pos.z) + h / 2;
        tmpQ.setFromEuler(new THREE.Euler(0.08 * Math.sin(w.stageTime + e.id), 0, 0.08 * Math.cos(w.stageTime * 0.8 + e.id)));
        tmpS.set(1, h, 1);
        break;
      }
      case 'herring':
        tmpQ.setFromAxisAngle(UP, -e.yaw + Math.PI);
        tmpS.setScalar(0.35);
        break;
      case 'smolt':
        tmpQ.setFromAxisAngle(UP, -e.yaw);
        tmpS.setScalar(0.6 * (0.95 + 0.1 * Math.sin(w.time * 12 + e.id)));
        break;
      case 'eggs':
        tmpS.setScalar(e.radius);
        break;
      case 'track': {
        // The magnetic sense: a shimmer that fades in and out.
        const life = Math.max(0, Math.min(1, e.timer / 1.4));
        tmpS.setScalar((0.25 + 0.55 * (e.value ?? 0)) * Math.sin(Math.PI * life));
        tmpQ.setFromEuler(new THREE.Euler(w.time * 2 + e.id, w.time * 3, 0));
        break;
      }
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
        const m = createFish({ depth: 1.1, hump: 0, kype: 0, yolk: 0 }, 'trout');
        m.scale.setScalar(3.2);
        return m;
      }
      case 'orca': {
        const m = createFish({ depth: 1.2, hump: 0, kype: 0, yolk: 0 }, 'orca');
        m.scale.setScalar(9);
        return m;
      }
      case 'shark': {
        const m = createFish({ depth: 1, hump: 0, kype: 0, yolk: 0 }, 'shark');
        m.scale.setScalar(4.5);
        return m;
      }
      case 'seal': {
        const m = createFish({ depth: 1.1, hump: 0, kype: 0, yolk: 0 }, 'seal', { transparent: true, opacity: 1 });
        m.scale.setScalar(3.4);
        return m;
      }
      case 'merganser': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2f3b33 }));
        body.scale.set(1.6, 0.7, 0.8);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a3b22 }));
        head.position.set(0.7, 0.18, 0);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.name = 'ring';
        g.add(body, head, ring);
        return g;
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
        const bird = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xe8e8e2 }));
        bird.rotation.x = Math.PI;
        bird.name = 'bird';
        bird.visible = false;
        g.add(shadow, bird);
        return g;
      }
      case 'bear': {
        const g = new THREE.Group();
        const fur = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.4), fur);
        body.position.y = 0.9;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.8), fur);
        head.position.set(1.5, 1.3, 0);
        const paw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), fur);
        paw.name = 'paw';
        paw.visible = false;
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: 0x0c120f, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.name = 'shadow';
        g.add(body, head, paw, shadow);
        return g;
      }
      case 'cover': {
        const s = e.size ?? new THREE.Vector3(6, 0.6, 2);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshStandardMaterial({ color: 0x2f3a22, roughness: 1 }));
        return m;
      }
      case 'gravelPatch': {
        // Advisor: females judge gravel by cobble size. Stones show it.
        const cobble = e.size?.x ?? 0.2;
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CircleGeometry(e.radius, 24), new THREE.MeshStandardMaterial({ color: 0x8a7d63, roughness: 1 }));
        base.rotation.x = -Math.PI / 2;
        g.add(base);
        const n = Math.round(Math.min(90, 6 / (cobble * cobble)));
        const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xb3a587, roughness: 1, flatShading: true }), n);
        for (let i = 0; i < n; i++) {
          const a = i * 2.399;
          const r = Math.sqrt((i + 0.5) / n) * e.radius * 0.95;
          tmpP.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
          tmpS.setScalar(cobble * (0.7 + ((i * 37) % 10) / 20));
          tmpQ.setFromEuler(new THREE.Euler(i, i * 0.6, 0));
          stones.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
        }
        g.add(stones);
        return g;
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
        const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.opacity = e.state === 'warn' ? 0.35 + 0.25 * Math.sin(w.time * 10) : 1;
        setSwim(obj as THREE.Mesh, w.time * 6, 0.12);
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
        obj.rotation.set(0, -Math.atan2(e.vel.z, e.vel.x), 0);
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
        setSwim(obj as THREE.Mesh, w.time * (3 + speed * 1.5) + e.id, e.state === 'fight' ? 0.18 : 0.05 + 0.02 * speed);
        if (e.kind === 'female') obj.position.y = w.arena.floor(e.pos.x, e.pos.z) + 0.35;
        break;
      }
      case 'birdShadow': {
        const shadow = obj.getObjectByName('shadow') as THREE.Mesh;
        const bird = obj.getObjectByName('bird') as THREE.Mesh;
        const mat = shadow.material as THREE.MeshBasicMaterial;
        if (e.state === 'warn') {
          const warn = w.p.get('smolt.birdWarning');
          mat.opacity = 0.15 + 0.55 * (1 - e.timer / warn);
          shadow.scale.setScalar(1.6 - 0.6 * (1 - e.timer / warn));
          bird.visible = false;
        } else {
          mat.opacity = 0.8;
          bird.visible = true;
          bird.position.y = -1.5 + e.timer * 2;
        }
        obj.position.y = 0;
        break;
      }
      case 'bear': {
        const shadow = obj.getObjectByName('shadow') as THREE.Mesh;
        const paw = obj.getObjectByName('paw') as THREE.Mesh;
        const mat = shadow.material as THREE.MeshBasicMaterial;
        obj.rotation.y = e.pos.z > 0 ? Math.PI / 2 : -Math.PI / 2;
        const target = e.home;
        if ((e.state === 'warn' || e.state === 'strike') && target) {
          // Place the shadow in world space over the target.
          obj.updateMatrixWorld();
          shadow.position.copy(obj.worldToLocal(new THREE.Vector3(target.x, -0.05, target.z)));
          mat.opacity = e.state === 'warn' ? 0.35 + 0.3 * Math.sin(w.time * 18) : 0.7;
          paw.visible = e.state === 'strike';
          if (paw.visible) {
            paw.position.copy(obj.worldToLocal(new THREE.Vector3(target.x, -0.6, target.z)));
          }
        } else {
          mat.opacity = 0;
          paw.visible = false;
        }
        break;
      }
      case 'gravelPatch':
        obj.position.y = w.arena.floor(e.pos.x, e.pos.z) + 0.03;
        break;
      case 'redd': {
        obj.position.y = w.arena.floor(e.pos.x, e.pos.z) + 0.04;
        const s = 0.4 + 0.8 * (e.value ?? 0);
        obj.scale.set(s, s, s);
        break;
      }
      default:
        break;
    }
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
        // Silver at sea, a blush once in fresh water, full spawning colours only on the grounds.
        if (w.stageId === 'return') {
          const inCreek = w.body.pos.x > (returnLayout(w)?.coast ?? 90);
          const male = w.fish.sex === 'M' && role !== 'jack';
          return { look: inCreek ? 'returnBlush' : 'returnSilver', shape: { depth: male && inCreek ? depth * 1.05 : depth, hump: male && inCreek ? 0.3 : 0, kype: male && inCreek ? 0.3 : 0, yolk: 0 } };
        }
        if (role === 'female') return { look: 'spawnFemale', shape: { depth: depth * 1.05, hump: 0.15, kype: 0, yolk: 0 } };
        if (role === 'jack') return { look: 'spawnJack', shape: { depth, hump: 0.3, kype: 0.4, yolk: 0 } };
        return { look: 'spawnMale', shape: { depth: depth * 1.15, hump: 1, kype: 1, yolk: 0 } };
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
        (this.player.material as THREE.Material).dispose();
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
    p.scale.setScalar(b.scale);
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    this.swimPhase += frameDt * (w.stageId === 'egg' ? 2 : 4 + speed * 2.5 + (b.burst ? 6 : 0));
    setSwim(p, this.swimPhase, w.stageId === 'egg' ? 0.03 : 0.04 + 0.03 * b.thrust + (b.burst ? 0.04 : 0));
    p.visible = (this.cameraMode === 'third' || w.stageId === 'egg') && !(w.stageId === 'egg' && alevinView(w)?.phase === 'egg');
  }

  private updateCamera(w: World, frameDt: number): void {
    const b = w.body;
    const fish = new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z);
    let want: THREE.Vector3;
    let look: THREE.Vector3;
    if (w.stageId === 'egg') {
      // Looking down on the alevin, so its heading against the flow is clear.
      want = new THREE.Vector3(0.35, b.pos.y + 1.05, 0.75);
      look = new THREE.Vector3(0, b.pos.y - 0.05, 0);
    } else if (this.cameraMode === 'first') {
      const h = headingVec(b.yaw, b.pitch);
      want = fish.clone().add(new THREE.Vector3(h.x, h.y, h.z).multiplyScalar(0.55 * b.scale));
      look = want.clone().add(new THREE.Vector3(h.x, h.y, h.z).multiplyScalar(6));
    } else {
      // Behind and above, looking down at the back so the whole body reads.
      const h = headingVec(b.yaw, b.pitch * 0.4);
      const d = 1.6 * b.scale + 1.0;
      want = fish.clone().add(new THREE.Vector3(-h.x * d * 0.8, -h.y * d * 0.8 + 0.75 * d, -h.z * d * 0.8));
      look = fish.clone().add(new THREE.Vector3(h.x, h.y, h.z).multiplyScalar(0.9 * b.scale + 0.6));
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
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}
