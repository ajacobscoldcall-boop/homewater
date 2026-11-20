// Low camera fixes (render only; the sim is untouched): fish resting on the drawn bed, light shaft tuning.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BED } from '../../src/render/bedConfig';
import { bellyProfile, drawnBedTop, easeLift, restLift } from '../../src/render/bedRest';
import { buildFishGeometry, createFish } from '../../src/render/fishMesh';
import { SHAFTS } from '../../src/render/shaftConfig';

const lowest = (mesh: THREE.Mesh): number => {
  mesh.updateMatrixWorld();
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < pos.count; i++) low = Math.min(low, v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).y);
  return low;
};

describe('fish rest on the drawn bed', () => {
  it('the belly profile finds the lowest point of the body (fins included)', () => {
    const geo = buildFishGeometry({ depth: 1.05, hump: 0.15, kype: 0, yolk: 0 }, 'spawnFemale');
    geo.computeBoundingBox();
    const belly = bellyProfile(geo);
    expect(belly.length).toBeGreaterThan(5);
    expect(Math.min(...belly.map(([, y]) => y))).toBeCloseTo(geo.boundingBox!.min.y, 5);
  });

  it('a female on coarse gravel is lifted clear of the stones, and not lifted on open bed', () => {
    const fish = createFish({ depth: 1.05, hump: 0.15, kype: 0, yolk: 0 }, 'spawnFemale');
    fish.scale.setScalar(1.2);
    // As the sim keeps her: centre 0.3 × scale above the floor (swim.ts constrain).
    fish.position.set(0, 0.36, 0);
    fish.rotation.set(0, 0, -0.15); // nosing down a little, as when digging
    const coarse = [{ x: 0, z: 0, radius: 2, cobble: 0.4 }];
    const bed = (x: number, z: number) => drawnBedTop(0, x, z, coarse);
    fish.updateMatrixWorld();
    const lift = restLift(fish, bed);
    expect(lift).toBeGreaterThan(0.1);
    fish.position.y += lift;
    expect(lowest(fish)).toBeGreaterThanOrEqual(0.4 * BED.stoneTop - 1e-3);
    // Off the patch the same fish needs no lift.
    fish.position.set(10, 0.36, 0);
    fish.rotation.set(0, 0, 0);
    fish.updateMatrixWorld();
    expect(restLift(fish, bed)).toBe(0);
  });

  it('stones stand full height inside the patch and ease off over the rim', () => {
    const p = [{ x: 0, z: 0, radius: 2, cobble: 0.3 }];
    expect(drawnBedTop(1, 0, 0, p)).toBeCloseTo(1 + 0.3 * BED.stoneTop);
    const atRim = drawnBedTop(1, 1.9, 0, p) - 1;
    expect(atRim).toBeGreaterThan(0);
    expect(atRim).toBeLessThan(0.3 * BED.stoneTop);
    expect(drawnBedTop(1, 2.5, 0, p)).toBe(1);
  });

  it('the lift rises quickly and settles slowly, and never jumps past its target', () => {
    const up = easeLift(0, 0.2, 1 / 60);
    const down = easeLift(0.2, 0, 1 / 60);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(0.2);
    expect(0.2 - down).toBeLessThan(up);
    expect(easeLift(0.1, 0.1, 1 / 60)).toBeCloseTo(0.1);
  });
});

describe('light shafts', () => {
  it('fade in below the surface and near the camera, and are dimmer seen level than looking up', () => {
    expect(SHAFTS.topFade).toBeGreaterThan(0.5);
    expect(SHAFTS.near[0]).toBeGreaterThan(0);
    expect(SHAFTS.near[1]).toBeGreaterThan(SHAFTS.near[0]);
    expect(SHAFTS.level).toBeLessThan(1);
    expect(SHAFTS.fog).toBeGreaterThan(0);
  });
});
