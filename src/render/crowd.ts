/**
 * The crowd on the spawning grounds, drawn (render only; the rules are in
 * src/sim/stages/spawn/crowd.ts): other females, large males and jacks in
 * full spawning dress, each kind one instanced draw with its own tail beat;
 * their redds as pale patches of cleaned gravel; and the dead lying on the bed.
 *
 * - Females digging roll onto their side in pulses; males courting quiver
 *   beside them; fighting males thrash; spent fish list and pale.
 * - Low quality draws half of the fish and carcasses (qualityRender.ts
 *   SCHOOL_KINDS), chosen by id so the same fish stay drawn.
 */
import * as THREE from 'three';
import { crowdVigour } from '../sim/stages/spawn';
import type { Entity, EntityKind } from '../sim/types';
import type { World } from '../sim/world';
import { CROWD_FX as C } from './crowdConfig';
import { buildFishGeometry, type FishLook, type FishShape } from './fishMesh';
import { quality } from './quality';
import { SWIM_GLSL } from './swimWave';

type FishKind = 'crowdFemale' | 'crowdMale' | 'crowdJack' | 'crowdCarcass';

const LOOK: Record<FishKind, { look: FishLook; shape: FishShape }> = {
  crowdFemale: { look: 'spawnFemale', shape: { depth: 1.05, hump: 0.15, kype: 0, yolk: 0 } },
  crowdMale: { look: 'spawnMale', shape: { depth: 1.15, hump: 1, kype: 1, yolk: 0 } },
  crowdJack: { look: 'spawnJack', shape: { depth: 1, hump: 0.3, kype: 0.4, yolk: 0 } },
  // The dead: one model for all, tinted per instance.
  crowdCarcass: { look: 'spawnFemale', shape: { depth: 0.95, hump: 0.3, kype: 0.2, yolk: 0 } },
};

const SCALE: Record<FishKind, number> = { crowdFemale: C.scale.F, crowdMale: C.scale.M, crowdJack: C.scale.J, crowdCarcass: 1 };

const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();
const smooth = (x: number) => x * x * (3 - 2 * x);

export const CROWD_KINDS: readonly EntityKind[] = ['crowdFemale', 'crowdMale', 'crowdJack', 'crowdCarcass', 'crowdRedd'];

export class CrowdLayer {
  private uniforms = { uTime: { value: 0 } };
  private amps = new Map<EntityKind, THREE.InstancedBufferAttribute>();

  /** Geometry and material for one of the Renderer's instanced crowd kinds; made fresh for each stage build. */
  make(kind: EntityKind): { geo: THREE.BufferGeometry; mat: THREE.Material; max: number } {
    const max = C.max[kind as keyof typeof C.max] ?? 40;
    if (kind === 'crowdRedd') {
      // A dug pit of darker water-worn stones inside a pale rim of cleaned gravel, fading out at the edge.
      // Longer along the stream, the way the current carries the dug gravel down into a mound.
      const geo = new THREE.RingGeometry(0.001, C.redd.radius, 18, 3);
      geo.rotateX(-Math.PI / 2);
      geo.scale(C.redd.stretch, 1, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 4);
      const pit = new THREE.Color(C.redd.pit);
      const rim = new THREE.Color(C.redd.rim);
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i) / C.redd.stretch, pos.getZ(i)) / C.redd.radius;
        const k = smooth(Math.min(1, Math.max(0, (r - 0.25) / 0.4)));
        const c = pit.clone().lerp(rim, k);
        col.set([c.r, c.g, c.b, C.redd.alpha * (1 - smooth(Math.min(1, Math.max(0, (r - 0.7) / 0.3))))], i * 4);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      return { geo, mat, max };
    }
    const k = kind as FishKind;
    // The simple model (about 1,100 triangles, against 5,000) except on High: a big run is a hundred fish.
    const geo = buildFishGeometry(LOOK[k].shape, LOOK[k].look, { lod: C.detailedOn.includes(quality.level) && k !== 'crowdCarcass' ? 'high' : 'low' });
    const phase = new Float32Array(max);
    for (let i = 0; i < max; i++) phase[i] = (i * 2.399) % (Math.PI * 2);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const amp = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    amp.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAmp', amp);
    this.amps.set(kind, amp);
    // On Low the cheaper Lambert shading (a hundred fish fill a lot of the screen in a big run).
    const mat = C.lambertOn.includes(quality.level)
      ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: k === 'crowdCarcass' ? 0.85 : 0.5, metalness: k === 'crowdCarcass' ? 0 : 0.08, side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute float aPhase;\nattribute float aAmp;\n${SWIM_GLSL}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // The same bend as every other fish (swimWave.ts), with each fish's own strength of beat.
          transformed.z += hwSwim(position.x, aAmp, uTime + aPhase);`,
        );
    };
    mat.customProgramCacheKey = () => `crowd-fish-${mat.type}`;
    return { geo, mat, max };
  }

  /** Every frame, before the instances are written. */
  update(dt: number): void {
    this.uniforms.uTime.value += dt * C.swimRate;
  }

  /** After the instances are written: the beat strengths changed. */
  flush(): void {
    for (const a of this.amps.values()) a.needsUpdate = true;
  }

  /** Pose one crowd instance. `ground` is where the drawn bed is. */
  pose(w: World, e: Entity, i: number, mesh: THREE.InstancedMesh, pos: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3, ground: (x: number, z: number) => number): void {
    const t = w.time;
    if (e.kind === 'crowdRedd') {
      pos.set(e.pos.x, ground(e.pos.x, e.pos.z) + C.redd.lift, e.pos.z);
      q.identity();
      s.setScalar(e.state === 'dug' ? 0.45 + 0.55 * (e.value ?? 0) : 1);
      const tint = e.state === 'dug' ? C.redd.dug : e.state === 'buried' ? C.redd.buried : C.redd.left;
      mesh.setColorAt(i, tmpC.setRGB(tint[0], tint[1], tint[2]));
      return;
    }
    const amp = this.amps.get(e.kind);
    if (e.kind === 'crowdCarcass') {
      // On its side on the bed, dull red going grey-brown.
      const size = e.value ?? 1;
      pos.set(e.pos.x, ground(e.pos.x, e.pos.z) + 0.07 * size, e.pos.z);
      q.setFromEuler(tmpE.set(Math.PI / 2, -e.yaw, 0, 'YXZ'));
      s.setScalar(size);
      const k = Math.min(1, (e.timer ?? 0) / C.carcassAge);
      mesh.setColorAt(i, tmpC.setRGB(C.carcassFresh[0] + (C.carcassOld[0] - C.carcassFresh[0]) * k, C.carcassFresh[1] + (C.carcassOld[1] - C.carcassFresh[1]) * k, C.carcassFresh[2] + (C.carcassOld[2] - C.carcassFresh[2]) * k));
      amp?.setX(i, 0);
      return;
    }
    const kind = e.kind as FishKind;
    pos.set(e.pos.x, e.pos.y, e.pos.z);
    let roll = 0;
    let a: number = C.amp.hold;
    const speed = Math.hypot(e.vel.x, e.vel.z);
    switch (e.state) {
      case 'dig':
        // Turning on her side to beat the gravel with her tail, again and again.
        roll = C.digRoll * Math.pow(Math.max(0, Math.sin(t * C.digRate + e.id * 1.3)), C.digSharp);
        a = C.amp.hold + (C.amp.dig - C.amp.hold) * (roll / C.digRoll);
        break;
      case 'spawn':
      case 'court':
        a = C.amp.court;
        roll = 0.08 * Math.sin(t * 17 + e.id);
        break;
      case 'fight':
        a = C.amp.fight;
        roll = C.fightRoll * Math.sin(t * 9 + e.id);
        break;
      case 'fade':
        a = C.amp.fade;
        roll = C.fadeList * (e.id % 2 ? 1 : -1);
        break;
      default:
        a = speed > 0.3 ? C.amp.swim : C.amp.hold;
    }
    q.setFromEuler(tmpE.set(roll, -e.yaw, 0, 'YXZ'));
    s.setScalar(SCALE[kind] * (e.value ?? 1));
    amp?.setX(i, a);
    // Paler and greyer as its strength runs out.
    const v = crowdVigour(w, e.id);
    const f = 1 - Math.max(0, Math.min(1, v / 0.5));
    mesh.setColorAt(i, tmpC.setRGB(1 + (C.fadeTint[0] - 1) * f, 1 + (C.fadeTint[1] - 1) * f, 1 + (C.fadeTint[2] - 1) * f));
  }
}
