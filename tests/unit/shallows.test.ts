import { describe, expect, it } from 'vitest';
import { swimStep } from '../../src/sim/swim';
import { HABITATS } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { intent, newWorld } from './helpers';

/** Where the bed leaves no room for the fish under the surface (a beach or a bar). */
const dry = (w: World, x: number, z: number) => w.arena.floor(x, z) + 0.6 * w.body.scale > w.arena.surfaceY;

/** A wet point beside dry ground, found on a grid over the arena. */
function shore(w: World): { wet: { x: number; z: number }; dryAt: { x: number; z: number } } | null {
  const a = w.arena;
  const step = 0.5;
  for (let x = a.min.x + 1; x < a.max.x - 1; x += step) {
    for (let z = a.min.z + 1; z < a.max.z - 1; z += step) {
      if (!dry(w, x, z)) continue;
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
        if (!dry(w, x + dx, z + dz)) return { wet: { x: x + dx, z: z + dz }, dryAt: { x, z } };
      }
    }
  }
  return null;
}

describe('shallows', () => {
  const cases = [1, 2, 3, 4, 5].map((stage) => ({ stage, habitat: undefined as (typeof HABITATS)[number] | undefined }));
  for (const habitat of HABITATS) cases.push({ stage: 5, habitat });
  for (const c of cases) {
    it(`stage ${c.stage}${c.habitat ? ` (${c.habitat})` : ''}: a fish can't swim up onto ground above the surface`, () => {
      const { w } = newWorld({ startStage: c.stage, ...(c.habitat ? { habitat: c.habitat } : {}) });
      const s = shore(w);
      if (!s) return; // this arena has no beach
      w.body.pos.x = s.wet.x;
      w.body.pos.z = s.wet.z;
      w.body.pos.y = w.arena.surfaceY - 0.3 * w.body.scale;
      w.body.yaw = Math.atan2(s.dryAt.z - s.wet.z, s.dryAt.x - s.wet.x);
      w.body.pitch = 0;
      for (let i = 0; i < 600; i++) {
        swimStep(w, intent({ forward: 1, burst: i % 3 === 0 }), 1 / 60);
        expect(dry(w, w.body.pos.x, w.body.pos.z)).toBe(false);
      }
    });
  }
});
