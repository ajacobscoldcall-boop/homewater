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

  it("a bear's strike puts its jaws on the target, below its feet", () => {
    const bear = ANIMALS.bear!();
    const target = new THREE.Vector3(2.0, -0.6, 0.4);
    bear.update({ mode: 'strike', t: 0, k: 1, target });
    bear.root.updateMatrixWorld(true);
    const mouth = bear.root.getObjectByName('mouth')!.getWorldPosition(new THREE.Vector3());
    expect(mouth.distanceTo(target)).toBeLessThan(0.05);
    // Standing, its jaws are well above the ground.
    bear.update({ mode: 'idle', t: 0 });
    bear.root.updateMatrixWorld(true);
    expect(bear.root.getObjectByName('mouth')!.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(0.6);
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
