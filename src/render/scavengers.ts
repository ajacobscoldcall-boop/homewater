/**
 * Scavengers on the spawning grounds: render only. Reads the world, never writes it.
 *
 * - What the bears leave (the sim's 'carcass' entities) lies at the water's
 *   edge, torn by how much the bear ate.
 * - A bear eating on the bank holds its fish under its jaws.
 * - Late in the stage (as the player's strength runs down) and in the
 *   post-spawn sequence, spent fish float dead downstream.
 * - Gulls come down to float beside carcasses and drifting fish and peck at them.
 * - A bald eagle tears at a carcass on the bank, or swoops to snatch a
 *   drifting fish from the surface.
 *
 * Seen from under the water the gulls show as bellies and heads dipping
 * through the surface, and the eagle as talons breaking it. Counts follow
 * `quality.envDetail` (Low keeps it to a few draw calls).
 */
import * as THREE from 'three';
import { spawnState } from '../sim/stages/spawn';
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';
import { createEagle, createGull, type Animal } from './animals';
import { createFish, setSwim, type FishLook } from './fishMesh';
import { setGore } from './goreShader';
import { quality } from './quality';
import { SCAVENGERS as C } from './scavengersConfig';
import { hash01, placeWound, type Wound } from './wounds';

type Ground = (x: number, z: number) => number;

interface Gull {
  animal: Animal;
  pos: THREE.Vector3;
  yaw: number;
  /** Seconds this gull has been settled at its target. */
  settled: number;
}

interface Drifter {
  mesh: THREE.Mesh;
  /** Hidden while the eagle carries it off; back upstream when it wraps. */
  taken: boolean;
  lastX: number;
}

interface Target {
  pos: THREE.Vector3;
  /** Where on it a scavenger stands or floats: on the water (gulls) or the bank (eagle). */
  onBank: boolean;
  /** An id for the eagle to stay on the same meal. */
  key: string;
  drifter?: number;
}

type EagleState = 'away' | 'circle' | 'swoop' | 'carry' | 'perch';

const LOOK: Record<string, FishLook> = { male: 'spawnMale', female: 'spawnFemale', jack: 'spawnJack' };
const SHAPE: Record<string, { depth: number; hump: number; kype: number; yolk: number }> = {
  male: { depth: 1.15, hump: 1, kype: 1, yolk: 0 },
  female: { depth: 1.05, hump: 0.15, kype: 0, yolk: 0 },
  jack: { depth: 1, hump: 0.3, kype: 0.4, yolk: 0 },
};

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** How late in the season it is for the scavengers: 0 early, 1 when the fish are dying. */
export function lateness(vigour: number): number {
  return smooth(C.lateFrom, C.lateFull, 1 - vigour);
}

/** How many gulls and drifting fish a detail level draws. */
export function scavengerCounts(envDetail: 0 | 1 | 2): { gulls: number; drifters: number } {
  return { gulls: C.gulls[envDetail], drifters: C.drifters[envDetail] };
}

export class ScavengerLayer {
  readonly group = new THREE.Group();
  private readonly carcasses = new Map<number, THREE.Mesh>();
  private readonly spareCarcasses: THREE.Mesh[] = [];
  private readonly drifters: Drifter[] = [];
  private readonly gulls: Gull[] = [];
  private eagle: Animal | null = null;
  private eagleState: EagleState = 'away';
  private eagleT = 0;
  private eaglePos = new THREE.Vector3(0, C.eagle.height, 0);
  private eagleYaw = 0;
  private eagleTarget: Target | null = null;
  private eagleFish: THREE.Mesh | null = null;
  private readonly meals = new Map<string, THREE.Mesh>();
  private world: World | null = null;

  constructor() {
    this.group.name = 'scavengers';
  }

  /** Called once a frame after the entities are placed. `ending` is the player's carcass in the post-spawn sequence. */
  update(w: World, dt: number, opts: { bears: readonly THREE.Object3D[]; objects: ReadonlyMap<number, THREE.Object3D>; ending: THREE.Vector3 | null; ground: Ground; gore: number }): void {
    if (w !== this.world) {
      this.world = w;
      this.reset();
    }
    const on = w.stageId === 'spawn';
    this.group.visible = on;
    if (!on) return;
    const s = spawnState(w);
    const late = opts.ending ? 1 : lateness(s?.vigour ?? 1);
    const surface = w.arena.surfaceY;
    this.syncCarcasses(w, opts.ground, opts.gore);
    this.syncMeal(w, opts.objects, opts.gore);
    this.syncDrifters(w, late, surface, opts.gore);

    // What there is to scavenge: bank carcasses, drifting fish, and the player's own carcass at the end.
    const targets: Target[] = [];
    for (const e of w.live('carcass')) {
      const m = this.carcasses.get(e.id);
      if (m) targets.push({ pos: m.position, onBank: true, key: `c${e.id}` });
    }
    this.drifters.forEach((d, i) => {
      if (d.mesh.visible && !d.taken) targets.push({ pos: d.mesh.position, onBank: false, key: `d${i}`, drifter: i });
    });
    // The crowd's dead washed up along the edges (spawn/crowd.ts): the gulls work them from the water.
    this.crowdTargets(w, opts.ground, targets);
    if (opts.ending) targets.push({ pos: opts.ending, onBank: false, key: 'player' });
    this.updateGulls(w, dt, targets, late, surface);
    this.updateEagle(w, dt, targets, late, surface, opts.ground);
  }

  private readonly crowdSpots = new Map<number, THREE.Vector3>();

  /** Up to C.crowdTargets of the crowd's carcasses lodged at the edges, oldest first. */
  private crowdTargets(w: World, ground: Ground, out: Target[]): void {
    const edge = w.p.get('spawn.crowd.carcassEdge') - 0.3;
    const lodged = w.entities.filter((e) => e.alive && e.kind === 'crowdCarcass' && (w.fish.habitat === 'beach' ? e.pos.z : Math.abs(e.pos.z)) >= edge);
    lodged.sort((a, b) => a.id - b.id);
    const keep = new Set<number>();
    for (const e of lodged.slice(0, C.crowdTargets[quality.envDetail])) {
      keep.add(e.id);
      let v = this.crowdSpots.get(e.id);
      if (!v) this.crowdSpots.set(e.id, (v = new THREE.Vector3()));
      v.set(e.pos.x, ground(e.pos.x, e.pos.z), e.pos.z);
      out.push({ pos: v, onBank: false, key: `k${e.id}` });
    }
    for (const id of this.crowdSpots.keys()) if (!keep.has(id)) this.crowdSpots.delete(id);
  }

  private reset(): void {
    for (const m of this.carcasses.values()) {
      m.visible = false;
      this.spareCarcasses.push(m);
    }
    this.carcasses.clear();
    for (const g of this.gulls) g.settled = -1;
    this.eagleState = 'away';
    this.eagleTarget = null;
  }

  // ---------- carcasses at the water's edge ----------

  private syncCarcasses(w: World, ground: Ground, gore: number): void {
    const live = new Set<number>();
    for (const e of w.live('carcass')) {
      live.add(e.id);
      let m = this.carcasses.get(e.id);
      if (!m || m.userData.kind !== e.state) {
        if (m) this.retire(e.id, m);
        m = this.takeCarcassMesh(e.state);
        this.carcasses.set(e.id, m);
        this.placeCarcass(w, e, m, ground);
      }
      setGore(m.material as THREE.Material, C.carcassWear + C.carcassWearEaten * (1 - (e.value ?? 0)), m.userData.wounds as Wound[], gore);
    }
    for (const [id, m] of this.carcasses) if (!live.has(id)) this.retire(id, m);
  }

  private takeCarcassMesh(kind: string): THREE.Mesh {
    const i = this.spareCarcasses.findIndex((m) => m.userData.kind === kind);
    if (i >= 0) {
      const m = this.spareCarcasses.splice(i, 1)[0]!;
      m.visible = true;
      return m;
    }
    const m = createFish(SHAPE[kind] ?? SHAPE.male!, LOOK[kind] ?? 'spawnMale');
    m.userData.kind = kind;
    this.group.add(m);
    return m;
  }

  private retire(id: number, m: THREE.Mesh): void {
    m.visible = false;
    this.carcasses.delete(id);
    this.spareCarcasses.push(m);
  }

  /** Lying on its side at the water's edge, torn where the bear fed. */
  private placeCarcass(w: World, e: Entity, m: THREE.Mesh, ground: Ground): void {
    const surface = w.arena.surfaceY;
    const side = Math.sign(e.pos.z) || 1;
    // Walk in from the bank until the ground is just under the surface.
    let z = side * 6;
    for (let i = 0; i < 80 && ground(e.pos.x, z) < surface - C.edgeDepth; i++) z += side * 0.1;
    const size = e.radius;
    m.scale.setScalar(size);
    m.position.set(e.pos.x, ground(e.pos.x, z) + 0.06 * size, z);
    m.rotation.set(0, -e.yaw, 0);
    m.rotateX(Math.PI / 2);
    setSwim(m, 1.3, 0.03);
    // Bites where it was eaten: more of them the less is left.
    const eaten = 1 - (e.value ?? 0);
    const n = 1 + Math.round(eaten * C.maxBites);
    const wounds: Wound[] = [];
    for (let i = 0; i < n; i++) {
      const wd = placeWound(i === 0 ? 'claw' : 'bite', hash01(e.id, i, 3), hash01(e.id, i, 5), hash01(e.id, i, 7) < 0.5 ? -1 : 1, 0.8 + 0.2 * hash01(e.id, i, 9));
      wd.size *= 1.6;
      wounds.push(wd);
    }
    m.userData.wounds = wounds;
  }

  // ---------- the bear's meal ----------

  private syncMeal(w: World, objects: ReadonlyMap<number, THREE.Object3D>, gore: number): void {
    const bear = w.live('bear').find((b) => b.state === 'eat');
    const kind = spawnState(w)?.bearMeal || 'male';
    const obj = bear ? objects.get(bear.id) : undefined;
    const jaws = obj?.getObjectByName('mouth');
    for (const m of this.meals.values()) m.visible = false;
    if (!bear || !obj || !jaws) return;
    // One mesh per kind of fish, kept for reuse (no materials freed and recompiled).
    let m = this.meals.get(kind);
    if (!m) {
      m = createFish(SHAPE[kind] ?? SHAPE.male!, LOOK[kind] ?? 'spawnMale');
      this.meals.set(kind, m);
      this.group.add(m);
    }
    m.visible = true;
    obj.updateMatrixWorld(true);
    jaws.getWorldPosition(tmpV);
    // Held crosswise under the jaws, its tail hanging to the ground.
    m.position.copy(tmpV);
    m.position.y -= 0.12;
    m.rotation.set(0, obj.rotation.y + Math.PI / 2, 0);
    m.rotateX(Math.PI / 2);
    m.rotateZ(-0.4);
    setSwim(m, 1.2, 0.04);
    setGore(m.material as THREE.Material, C.carcassWear, [], gore);
  }

  // ---------- spent fish drifting dead downstream ----------

  private syncDrifters(w: World, late: number, surface: number, gore: number): void {
    const max = scavengerCounts(quality.envDetail).drifters;
    while (this.drifters.length < max) {
      const i = this.drifters.length;
      const look = i % 2 ? 'female' : 'male';
      const mesh = createFish(SHAPE[look]!, LOOK[look]!);
      mesh.visible = false;
      this.group.add(mesh);
      this.drifters.push({ mesh, taken: false, lastX: 0 });
    }
    const span = w.arena.max.x - w.arena.min.x + 2 * C.drift.margin;
    const want = Math.round(late * max);
    this.drifters.forEach((d, i) => {
      const m = d.mesh;
      if (i >= want || i >= max) {
        m.visible = false;
        return;
      }
      // Downstream with the current, each from its own start; back to the top once past the bottom.
      const x0 = hash01(i, 41) * span;
      const raw = x0 - C.drift.speed * w.time;
      const x = w.arena.min.x - C.drift.margin + (((raw % span) + span) % span);
      if (x > d.lastX + span / 2) d.taken = false;
      d.lastX = x;
      m.visible = !d.taken;
      const z = (hash01(i, 43) * 2 - 1) * C.drift.halfWidth + Math.sin(w.time * 0.2 + i) * 0.6;
      // Belly up, turning slowly as it goes.
      m.position.set(x, surface - C.drift.float, z);
      m.rotation.set(0, w.time * 0.07 * (i % 2 ? 1 : -1) + i, 0);
      m.rotateX(Math.PI * 0.6);
      setSwim(m, 0.6 + i, 0.025);
      setGore(m.material as THREE.Material, C.carcassWear, [], gore);
    });
  }

  // ---------- gulls ----------

  private updateGulls(w: World, dt: number, targets: Target[], late: number, surface: number): void {
    const max = scavengerCounts(quality.envDetail).gulls;
    while (this.gulls.length < max) {
      const i = this.gulls.length;
      const a = createGull();
      a.root.scale.setScalar(C.gullScale);
      this.group.add(a.root);
      this.gulls.push({ animal: a, pos: new THREE.Vector3(20 + i * 3, C.gullHigh, (i % 2 ? 1 : -1) * 4), yaw: i, settled: -1 });
    }
    // Gulls come as carcasses turn up; more of them late in the season.
    const active = targets.length ? Math.min(max, Math.max(1, Math.round(max * Math.max(late, targets.length / 4)))) : 0;
    this.gulls.forEach((g, i) => {
      const root = g.animal.root;
      if (i >= max) {
        root.visible = false;
        return;
      }
      const t = targets.length && i < active ? targets[i % targets.length]! : null;
      let goal: THREE.Vector3;
      if (t) {
        // Float beside it, each gull on its own side (on the water's side of a bank carcass).
        const a = i * 2.4 + 0.6;
        const r = C.gullRing * (0.8 + 0.4 * hash01(i, 3));
        goal = tmpW.set(t.pos.x + Math.cos(a) * r, surface - 0.02, t.pos.z + Math.sin(a) * r);
        if (t.onBank) goal.z = t.pos.z - Math.sign(t.pos.z) * Math.abs(Math.sin(a) * r);
      } else {
        // Nothing to eat: off and away, high over the stream.
        goal = tmpW.set(g.pos.x + 10, C.gullHigh * 2, g.pos.z);
      }
      const d = g.pos.distanceTo(goal);
      root.visible = t !== null || g.pos.y < C.gullHigh * 1.8;
      if (d > C.gullSettle) {
        // Fly in: an arc that comes down onto the water at the end.
        g.settled = -1;
        const step = Math.min(d, C.gullSpeed * dt);
        tmpV.subVectors(goal, g.pos).normalize();
        g.pos.addScaledVector(tmpV, step);
        const flatD = Math.hypot(goal.x - g.pos.x, goal.z - g.pos.z);
        g.pos.y = Math.max(goal.y, Math.min(g.pos.y, goal.y + flatD * 0.6 + 0.2));
        g.yaw = Math.atan2(tmpV.z, tmpV.x);
        g.animal.update({ mode: 'fly', t: w.time * 1.1 + i });
      } else {
        // On the water, drifting with its meal and pecking at it.
        g.settled = Math.max(0, g.settled) + dt;
        g.pos.lerp(goal, Math.min(1, dt * 3));
        if (t) g.yaw = Math.atan2(t.pos.z - g.pos.z, t.pos.x - g.pos.x);
        const peck = Math.max(0, Math.sin(w.time * C.peckRate + i * 1.9)) ** 2;
        g.animal.update({ mode: 'float', t: w.time + i, pitch: C.peckPitch * peck });
      }
      root.position.copy(g.pos);
      root.rotation.set(0, -g.yaw, 0);
    });
  }

  // ---------- the eagle ----------

  private updateEagle(w: World, dt: number, targets: Target[], late: number, surface: number, ground: Ground): void {
    if (!this.eagle) {
      this.eagle = createEagle();
      this.eagle.root.scale.setScalar(C.eagle.scale);
      this.group.add(this.eagle.root);
      this.eagleFish = createFish(SHAPE.female!, LOOK.female!);
      this.eagleFish.visible = false;
      this.group.add(this.eagleFish);
    }
    const eagle = this.eagle;
    const root = eagle.root;
    const fish = this.eagleFish!;
    const E = C.eagle;
    this.eagleT += dt;
    const wanted = late >= E.comeAt || targets.some((t) => t.onBank);
    const centre = tmpW.set((w.arena.min.x + w.arena.max.x) / 2, E.height, 0);
    let mode = 'glide';
    switch (this.eagleState) {
      case 'away':
        root.visible = false;
        fish.visible = false;
        if (wanted) {
          this.eagleState = 'circle';
          this.eagleT = 0;
          this.eaglePos.set(centre.x - 30, E.height + 6, 0);
        }
        break;
      case 'circle': {
        root.visible = true;
        // Circling high over the stream, looking for a meal.
        const a = this.eagleT * E.circleRate;
        const goal = tmpV.set(centre.x + Math.cos(a) * E.circleRadius, E.height, Math.sin(a) * E.circleRadius * 0.6);
        this.eaglePos.lerp(goal, Math.min(1, dt * 0.8));
        this.eagleYaw = a + Math.PI / 2;
        mode = Math.sin(this.eagleT * 0.7) > 0.6 ? 'fly' : 'glide';
        if (!wanted) this.eagleState = 'away';
        else if (this.eagleT > E.circleTime) {
          // A carcass on the bank first; else a fish drifting on the surface.
          this.eagleTarget = targets.find((t) => t.onBank) ?? targets.find((t) => t.drifter !== undefined) ?? null;
          if (this.eagleTarget) {
            this.eagleState = this.eagleTarget.onBank ? 'perch' : 'swoop';
            this.eagleT = 0;
          }
        }
        break;
      }
      case 'swoop': {
        const t = this.eagleTarget;
        if (!t || (t.drifter !== undefined && this.drifters[t.drifter]?.taken)) {
          this.eagleState = 'circle';
          break;
        }
        // A long glide down onto the fish; feet forward at the end.
        const goal = tmpV.set(t.pos.x, surface + E.grabHeight, t.pos.z);
        const d = this.eaglePos.distanceTo(goal);
        const step = Math.min(d, E.swoopSpeed * dt);
        tmpW.subVectors(goal, this.eaglePos).normalize();
        this.eaglePos.addScaledVector(tmpW, step);
        this.eagleYaw = Math.atan2(tmpW.z, tmpW.x);
        mode = d < E.grabFrom ? 'grab' : 'glide';
        if (d < 0.15) {
          if (t.drifter !== undefined) this.drifters[t.drifter]!.taken = true;
          this.eagleState = 'carry';
          this.eagleT = 0;
        }
        break;
      }
      case 'carry': {
        // Away up and over the bank with the fish in its talons.
        tmpW.set(Math.cos(this.eagleYaw), 0.5, Math.sin(this.eagleYaw)).normalize();
        this.eaglePos.addScaledVector(tmpW, E.carrySpeed * dt);
        mode = 'fly';
        fish.visible = true;
        const talons = root.getObjectByName('talons');
        root.updateMatrixWorld(true);
        talons?.getWorldPosition(fish.position);
        fish.rotation.set(0, -this.eagleYaw, 0);
        fish.rotateZ(-0.3);
        setSwim(fish, this.eagleT * 14, 0.08 * Math.max(0, 1 - this.eagleT / 2));
        if (this.eagleT > E.carryTime) {
          fish.visible = false;
          this.eagleState = 'circle';
          this.eagleT = 0;
        }
        break;
      }
      case 'perch': {
        const t = this.eagleTarget;
        if (!t || !targets.some((x) => x.key === t.key)) {
          this.eagleState = 'circle';
          this.eagleT = 0;
          break;
        }
        // Down onto the carcass at the water's edge, standing on it to tear at it.
        const side = Math.sign(t.pos.z) || 1;
        const gx = t.pos.x - Math.cos(this.eagleYaw) * 0.25;
        const gz = t.pos.z + side * 0.25;
        const goal = tmpV.set(gx, Math.max(ground(gx, gz), surface) + E.standHeight, gz);
        const d = this.eaglePos.distanceTo(goal);
        if (d > 0.1) {
          const step = Math.min(d, E.swoopSpeed * dt);
          tmpW.subVectors(goal, this.eaglePos).normalize();
          this.eaglePos.addScaledVector(tmpW, step);
          if (d > 1) this.eagleYaw = Math.atan2(tmpW.z, tmpW.x);
          mode = d < 1.5 ? 'mantle' : 'glide';
        } else {
          mode = Math.sin(this.eagleT * 0.4) > 0.7 ? 'mantle' : 'perch';
        }
        break;
      }
    }
    root.position.copy(this.eaglePos);
    root.rotation.set(0, -this.eagleYaw, 0);
    const tear = Math.max(0, Math.sin(w.time * 2.6)) ** 2;
    eagle.update({ mode, t: w.time, pitch: 0.15 + 0.45 * tear });
    if (!root.visible) fish.visible = false;
  }
}

