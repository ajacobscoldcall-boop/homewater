import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ANIMALS } from '../../src/render/animals';
import { buildFishGeometry } from '../../src/render/fishMesh';

/** Procedural models: draw-call budget, and the bear's strike reaching the water. */
describe('procedural models', () => {
  it('every animal is one to five draw calls', () => {
    for (const [name, make] of Object.entries(ANIMALS)) {
      const a = make();
      let meshes = 0;
      a.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      expect(meshes, name).toBeGreaterThanOrEqual(1);
      expect(meshes, name).toBeLessThanOrEqual(5);
    }
  });

  it("a bear stands on the bank and lunges its head into the water; its body stays above", () => {
    // A bank sloping into the water: the surface is 0.3 below the bear's feet, and the bed
    // drops 0.6 for every metre out (local x is towards the water).
    const surface = -0.3;
    const ground = (x: number) => Math.min(0.2, -0.6 * x);
    const v = new THREE.Vector3();
    const at = (bear: { root: THREE.Group }, name: string, x = 0, y = 0) => {
      const o = bear.root.getObjectByName(name)!;
      return o.localToWorld(v.set(x, y, 0)).clone();
    };
    const bear = ANIMALS.bear!();
    // A fish near the bank: the jaws reach it.
    const near = new THREE.Vector3(1.8, surface - 0.35, 0.3);
    bear.update({ mode: 'strike', t: 0, k: 1, target: near, surface, ground: (x) => ground(x) });
    bear.root.updateMatrixWorld(true);
    expect(at(bear, 'mouth').distanceTo(near)).toBeLessThan(0.1);
    // The head is in the water, the torso above it.
    expect(at(bear, 'mouth').y).toBeLessThan(surface);
    expect(at(bear, 'rig', -0.5, 1.0).y).toBeGreaterThan(surface + 0.3);
    // A fish far out: the bear wades no deeper than its legs and does not follow it in.
    const far = new THREE.Vector3(7, surface - 0.6, 0);
    bear.update({ mode: 'strike', t: 0, k: 1, target: far, surface, ground: (x) => ground(x) });
    bear.root.updateMatrixWorld(true);
    expect(at(bear, 'rig', -0.5, 1.0).y).toBeGreaterThan(surface + 0.3);
    expect(at(bear, 'mouth').y).toBeLessThan(surface);
    const hind = at(bear, 'rig', -0.7, 0);
    expect(surface - ground(hind.x)).toBeLessThan(0.6);
    // Standing, its jaws are well above the ground.
    bear.update({ mode: 'idle', t: 0 });
    bear.root.updateMatrixWorld(true);
    expect(at(bear, 'mouth').y).toBeGreaterThan(0.6);
  });

  it('pink salmon carry spots that sockeye lack, at both levels of detail', () => {
    for (const lod of ['high', 'low'] as const) {
      const shape = { depth: 0.95, hump: 0, kype: 0, yolk: 0 };
      const pink = buildFishGeometry(shape, 'pink', { lod }).attributes.position!.count;
      const sockeye = buildFishGeometry(shape, 'ocean', { lod }).attributes.position!.count;
      expect(pink, lod).toBeGreaterThan(sockeye);
    }
  });

  it('fish geometry records where the eye is (for the carcass)', () => {
    const eye = buildFishGeometry({ depth: 1, hump: 0, kype: 0, yolk: 0 }, 'spawnFemale').userData.eye as number[];
    expect(eye).toHaveLength(4);
    expect(eye[0]).toBeGreaterThan(0.38);
    expect(eye[3]).toBeGreaterThan(0);
  });
});
