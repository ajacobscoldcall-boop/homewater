import { afterEach, describe, expect, it } from 'vitest';
import { AboveWater, shoreSteps } from '../../src/render/above';
import { SHORE } from '../../src/render/aboveConfig';
import { QUALITY_PRESETS, quality } from '../../src/render/quality';
import type { World } from '../../src/sim/world';

/** A straight creek along x: water for |z| < 8, banks 1.4 above the surface beyond. */
const creek = { arena: { kind: 'spawnBed', surfaceY: 0, min: { x: 0, y: -3, z: -8 }, max: { x: 40, y: 0, z: 8 } } } as unknown as World;
const ground = (_x: number, z: number) => (Math.abs(z) < 8 ? -2 : 1.4);

/** The world above the water (above.ts): the shore map and quality levels. */
describe('above the water', () => {
  afterEach(() => Object.assign(quality, QUALITY_PRESETS.high));

  it('Low draws the sky gradient only; Medium marches the shore in fewer steps than High', () => {
    expect(QUALITY_PRESETS.low.aboveWater).toBe(0);
    expect(shoreSteps(0)[0]).toBe(0);
    expect(shoreSteps(1)[0]).toBeGreaterThan(0);
    expect(shoreSteps(1)[0]).toBeLessThan(shoreSteps(2)[0]);
  });

  it('builds a tree line set back from the banks, and nothing over the water', () => {
    const above = new AboveWater();
    above.build(creek, ground);
    const tex = above.uniforms.uSkyline.value as unknown as { image: { data: Uint8Array; width: number; height: number } };
    const { data, width, height } = tex.image;
    expect(width).toBeGreaterThan(2);
    const box = above.uniforms.uSkyBox.value;
    const heightAt = (x: number, z: number) => {
      const i = Math.floor((x - box.x) * box.z * width);
      const j = Math.floor((z - box.y) * box.w * height);
      return (data[(j * width + i) * 4]! / 255) * SHORE.maxHeight;
    };
    expect(heightAt(20, 0)).toBe(0);
    // At the water's edge: bare bank; well back: trees.
    expect(heightAt(20, 8.6)).toBeLessThan(3);
    expect(heightAt(20, 20)).toBeGreaterThan(5);
    expect(heightAt(20, -20)).toBeGreaterThan(5);
  });

  it('the open sea and Low quality have no shore', () => {
    const above = new AboveWater();
    above.build({ arena: { ...creek.arena, kind: 'ocean' } } as unknown as World, ground);
    expect((above.uniforms.uSkyline.value.image as { width: number }).width).toBe(1);
    Object.assign(quality, QUALITY_PRESETS.low);
    above.build(creek, ground);
    expect((above.uniforms.uSkyline.value.image as { width: number }).width).toBe(1);
  });
});
