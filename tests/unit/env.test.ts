import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { returnLayout } from '../../src/sim/stages/return';
import type { Habitat } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { buildEnvironment } from '../../src/render/env';
import { newWorld } from './helpers';

/** Procedural places: built without a GPU, they must match the simulation's geometry. */

const fog = () => new THREE.FogExp2(0x2d5c60, 0.05);

function meshes(g: THREE.Object3D): number {
  let n = 0;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) n++;
  });
  return n;
}

const inWall = (w: World, x: number, z: number) => (w.arena.walls ?? []).some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);

describe('procedural environment', () => {
  const cases: [number, Habitat][] = [
    [0, 'creek'],
    [1, 'creek'],
    [2, 'creek'],
    [3, 'creek'],
    [4, 'creek'],
    [5, 'creek'],
    [5, 'river'],
    [5, 'beach'],
  ];
  for (const [stage, habitat] of cases) {
    it(`builds stage ${stage} (${habitat}) at every detail level, with few draw calls`, () => {
      const { w } = newWorld({ startStage: stage, habitat });
      for (const detail of [0, 2] as const) {
        const env = buildEnvironment(w, { detail, fog: fog() });
        expect(meshes(env.group)).toBeGreaterThan(0);
        // Upper bound on scenery pieces; fog culling draws only some of them at once.
        expect(meshes(env.group)).toBeLessThan(140);
      }
    });
  }

  it('lays the bed exactly where the simulation keeps the fish', () => {
    for (const [stage, habitat] of cases) {
      const { w } = newWorld({ startStage: stage, habitat });
      const env = buildEnvironment(w, { detail: 0, fog: fog() });
      const a = w.arena;
      for (let i = 0; i < 200; i++) {
        const x = a.min.x + ((i * 37) % 100) / 100 * (a.max.x - a.min.x);
        const z = a.min.z + ((i * 61) % 100) / 100 * (a.max.z - a.min.z);
        if (inWall(w, x, z)) continue;
        // Within a few centimetres: never above the floor the fish collides with by more than that.
        expect(env.ground(x, z) - a.floor(x, z)).toBeLessThan(0.07);
        expect(env.ground(x, z) - a.floor(x, z)).toBeGreaterThan(-0.07);
      }
    }
  });

  it('return: banks rise above the surface inside the walls and start at their edges', () => {
    const { w } = newWorld({ startStage: 4 });
    const env = buildEnvironment(w, { detail: 0, fog: fog() });
    const lay = returnLayout(w);
    expect(lay).not.toBeNull();
    if (!lay) return;
    // Well inside the land between the river mouths, the bank is out of the water.
    for (const wall of w.arena.walls ?? []) {
      const cx = (wall.min.x + wall.max.x) / 2;
      const cz = (wall.min.z + wall.max.z) / 2;
      if (wall.max.z - wall.min.z < 2.5 || wall.max.x - wall.min.x < 2.5) continue;
      expect(env.ground(cx, cz)).toBeGreaterThan(w.arena.surfaceY);
    }
    // The fork's divider (2 wide) still breaks the surface along its middle.
    expect(env.ground(lay.fork + 10, lay.homeMouth)).toBeGreaterThan(w.arena.surfaceY);
    // Right at the home river's edge the bank starts from the bed.
    const edge = lay.homeMouth + lay.riverHalf;
    expect(env.ground(lay.coast + 20, edge)).toBeLessThan(w.arena.floor(lay.coast + 20, edge) + 0.1);
  });

  it('draws weeds and bank cover itself, where the simulation put them', () => {
    const fry = newWorld({ startStage: 1 }).w;
    expect(buildEnvironment(fry, { detail: 0, fog: fog() }).handles.has('weed')).toBe(true);
    const spawn = newWorld({ startStage: 5 }).w;
    expect(buildEnvironment(spawn, { detail: 0, fog: fog() }).handles.has('cover')).toBe(true);
  });
});
