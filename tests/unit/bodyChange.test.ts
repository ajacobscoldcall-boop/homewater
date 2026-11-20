import { describe, expect, it } from 'vitest';
import { bodyLook, fatDepth, riverStage, type BodyRole } from '../../src/render/bodyChange';
import { BODY_CHANGE } from '../../src/render/bodyConfig';
import { buildFishGeometry, shapeKey } from '../../src/render/fishMesh';

const river = (role: BodyRole, upstream: number, fat = 0.6) => bodyLook({ role, bodyDepth: 0, fat, place: 'river', upstream });

describe('body change on the return', () => {
  it('thins as fat drains', () => {
    expect(fatDepth(1)).toBe(1);
    expect(fatDepth(0)).toBeCloseTo(1 - BODY_CHANGE.fatThin, 9);
    const full = bodyLook({ role: 'female', bodyDepth: 0, fat: 1, place: 'sea' }).shape.depth;
    const spent = bodyLook({ role: 'female', bodyDepth: 0, fat: 0.2, place: 'sea' }).shape.depth;
    expect(spent).toBeLessThan(full);
  });

  it('dress, hump and jaw grow step by step up the river and never reach full dress before the grounds', () => {
    let last = river('largeMale', 0);
    expect(last.look).toBe('returnBlush');
    for (const u of [0.25, 0.5, 0.75, 1]) {
      const next = river('largeMale', u);
      expect(next.shape.dress!).toBeGreaterThanOrEqual(last.shape.dress ?? 0);
      expect(next.shape.hump).toBeGreaterThanOrEqual(last.shape.hump);
      expect(next.shape.kype).toBeGreaterThanOrEqual(last.shape.kype);
      last = next;
    }
    expect(last.shape.dress!).toBeLessThan(1);
    expect(last.shape.hump).toBeLessThan(1);
    const grounds = bodyLook({ role: 'largeMale', bodyDepth: 0, fat: 0.6, place: 'grounds' });
    expect(grounds.look).toBe('spawnMale');
    expect(grounds.shape.hump).toBe(1);
  });

  it('females darken less and jacks change more subtly than large males', () => {
    const m = river('largeMale', 1).shape;
    const f = river('female', 1).shape;
    const j = river('jack', 1).shape;
    expect(f.dress!).toBeLessThan(m.dress!);
    expect(f.hump).toBeLessThan(m.hump);
    expect(j.hump).toBeLessThan(m.hump);
    expect(j.kype).toBeLessThan(m.kype);
    expect(river('jack', 1).shape.dressTo).toBe('spawnJack');
  });

  it('only a few distinct meshes are built on the way up (each step is one rebuild)', () => {
    const keys = new Set<string>();
    for (let i = 0; i <= 200; i++) keys.add(shapeKey(river('largeMale', i / 200, 0.6).shape));
    expect(riverStage(0.5)).toBeCloseTo(Math.round(Math.pow(0.5, BODY_CHANGE.curve) * BODY_CHANGE.steps) / BODY_CHANGE.steps, 9);
    expect(keys.size).toBeLessThanOrEqual(BODY_CHANGE.steps + 1);
  });

  it('builds a part-dressed fish without errors, with the colours in between', () => {
    const g = buildFishGeometry(river('largeMale', 0.6).shape, 'returnBlush');
    expect(g.getAttribute('position').count).toBeGreaterThan(100);
    const col = g.getAttribute('color').array as Float32Array;
    expect([...col].every((c) => Number.isFinite(c))).toBe(true);
  });
});
