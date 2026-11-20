/**
 * Fellow migrants on the return, drawn (render only; the school's rules are in
 * src/sim/stages/migrants.ts): one instanced draw of return-coloured sockeye,
 * each with its own swimming wave, tilted along its path when it leaps; and
 * splashes where the player or a migrant breaks the surface at the falls.
 * Low quality draws half the school (qualityRender.ts SCHOOL_KINDS).
 */
import * as THREE from 'three';
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';
import { buildFishGeometry } from './fishMesh';
import { quality } from './quality';
import type { Splashes } from './splash';
import { SWIM_GLSL } from './swimWave';

/** Presentation tuning. */
export const MIGRANT_FX = {
  /** Most fish drawn. */
  max: 40,
  /** Drawn size relative to the sim's size value. */
  scale: 0.85,
  swimAmp: 0.05,
  /** Wave speed: base, and extra per unit of speed. */
  swimRate: 5,
  swimRatePerSpeed: 1.2,
  /** Splash size where a leaping fish leaves and re-enters the water. */
  splashOut: 0.55,
  splashIn: 0.85,
} as const;

const tmpE = new THREE.Euler();

export class MigrantLayer {
  private uniforms = { uTime: { value: 0 }, uAmp: { value: MIGRANT_FX.swimAmp } };
  private lastY = new Map<number, number>();
  private playerY: number | null = null;

  /** Geometry and material for the Renderer's instanced 'migrant' kind; made fresh for each stage build. */
  make(): { geo: THREE.BufferGeometry; mat: THREE.Material } {
    const geo = buildFishGeometry({ depth: 1.05, hump: 0.15, kype: 0.1, yolk: 0 }, 'returnBlush', { lod: quality.fishDetail });
    // A phase per instance slot, so the school doesn't beat in step.
    const phase = new Float32Array(MIGRANT_FX.max);
    for (let i = 0; i < phase.length; i++) phase[i] = (i * 2.399) % (Math.PI * 2);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    // Drawn after the water's surface (render order 2): from under the water every fish below the
    // surface is nearer than it, and one leaping above shows through it, as if seen through Snell's window.
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.12, side: THREE.DoubleSide, transparent: true });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uAmp;\nattribute float aPhase;\n${SWIM_GLSL}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // The same bend as every other fish (swimWave.ts).
          transformed.z += hwSwim(position.x, uAmp, uTime + aPhase);`,
        );
    };
    mat.customProgramCacheKey = () => 'migrant-fish';
    return { geo, mat };
  }

  /** Pose one migrant for its instance slot. */
  pose(e: Entity, pos: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3): void {
    pos.set(e.pos.x, e.pos.y, e.pos.z);
    const pitch = Math.atan2(e.vel.y, Math.max(0.3, Math.hypot(e.vel.x, e.vel.z)));
    q.setFromEuler(tmpE.set(0, -e.yaw, Math.max(-1.1, Math.min(1.1, pitch)), 'YXZ'));
    s.setScalar(MIGRANT_FX.scale * (e.value ?? 1));
  }

  /** Every frame: the swimming wave, splashes where fish cross the surface, and the leaping player drawn through it. */
  update(w: World, dt: number, splash: Splashes, player: THREE.Mesh | null): void {
    if (player) {
      // In the air at the falls, the player is drawn after the surface so the leap shows from below.
      const above = w.stageId === 'return' && w.body.pos.y > w.arena.surfaceY - 0.05;
      const mat = player.material as THREE.Material;
      if (mat.transparent !== above && !(mat.opacity < 1)) mat.transparent = above;
      player.renderOrder = above ? 2 : 0;
    }
    this.uniforms.uTime.value += dt * (MIGRANT_FX.swimRate + MIGRANT_FX.swimRatePerSpeed * 4);
    if (w.stageId !== 'return') {
      this.lastY.clear();
      this.playerY = null;
      return;
    }
    const sy = w.arena.surfaceY;
    const cross = (prev: number | null | undefined, y: number, x: number, z: number) => {
      if (prev === null || prev === undefined) return;
      if (prev <= sy && y > sy) splash.burst(x, z, sy, MIGRANT_FX.splashOut);
      else if (prev > sy && y <= sy) splash.burst(x, z, sy, MIGRANT_FX.splashIn);
    };
    const b = w.body.pos;
    cross(this.playerY, b.y, b.x, b.z);
    this.playerY = b.y;
    for (const m of w.entities) {
      if (m.kind !== 'migrant') continue;
      if (!m.alive) {
        this.lastY.delete(m.id);
        continue;
      }
      cross(this.lastY.get(m.id), m.pos.y, m.pos.x, m.pos.z);
      this.lastY.set(m.id, m.pos.y);
    }
  }
}
