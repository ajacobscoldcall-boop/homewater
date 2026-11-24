/** The lasting heat toll (src/sim/stages/heatToll.ts): built on the return, carried to the grounds, pre-spawn death. */
import { describe, expect, it } from 'vitest';
import { returnLayout } from '../../src/sim/stages/return';
import { heatStress, riverWarmth, seeps, waterAt } from '../../src/sim/stages/returnWater';
import { arrivingToll, crowdHeat, groundsHeat, groundsWarmth, heatToll, lethalTemp, noSpawnCause, prespawnHazard, senescenceFactor, stepHeatToll } from '../../src/sim/stages/heatToll';
import { spawnState } from '../../src/sim/stages/spawn';
import type { Difficulty } from '../../src/sim/params';
import type { YearConditions } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { intent, newWorld, params, run } from './helpers';

const SEC = 60;
const ORDINARY: YearConditions = { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 };
const HOT: YearConditions = { flow: 0.75, temperature: 1.25, oceanCrowding: 1, runSize: 1 };

function world(cond: YearConditions, stage: number, opts: { seed?: number; difficulty?: Difficulty; sex?: 'F' | 'M' } = {}) {
  const { w } = newWorld({ seed: opts.seed ?? 7, sex: opts.sex ?? 'F', ...(opts.difficulty ? { difficulty: opts.difficulty } : {}) });
  Object.assign(w.conditions, cond);
  w.fish.z.runTiming = 0;
  w.debugJumpTo(stage);
  return w;
}

const clearThreats = (w: World) => {
  for (const k of ['bear', 'lure'] as const) for (const e of w.live(k)) e.alive = false;
};

/** Sit in warm water that is past the stress temperature but well short of the lethal one. */
function warmSpot(w: World): { x: number; y: number; z: number } {
  const L = returnLayout(w)!;
  const stressT = w.p.get('return.water.stressTemp');
  for (let x = L.coast + 4; x < L.fork; x += 0.5) {
    const pos = { x, y: w.arena.floor(x, L.homeMouth) + 0.5, z: L.homeMouth };
    const t = waterAt(w, pos).temp;
    if (t > stressT + 1.5 && t < lethalTemp(w) - 1.5) return pos;
  }
  throw new Error('no warm spot');
}

describe('the heat toll on the return', () => {
  it('builds while heat-stressed, never eases, and is carried in the world (not the save)', () => {
    const w = world(HOT, 4);
    const spot = warmSpot(w);
    run(w, 120 * SEC, (ww) => {
      clearThreats(ww);
      ww.body.pos = { ...spot };
      ww.progress.fat = 1;
      return intent({ forward: 0.2 });
    });
    expect(w.status).toBe('playing');
    const built = heatToll(w);
    expect(built).toBeGreaterThan(w.p.get('heat.tollCaption'));
    expect(w.carry.heatToll).toBe(built);
    expect(w.events.some((e) => e.key === 'return.heatToll')).toBe(true);
    // Rest in a cold seep: the strain eases; once it is below the toll's threshold, the toll stays where it is.
    const s = seeps(w)[0]!;
    const rest = (ww: World) => {
      clearThreats(ww);
      ww.body.pos = { x: s.x, y: ww.arena.floor(s.x, s.z) + 0.4, z: s.z };
      return intent({ hold: true });
    };
    run(w, 60 * SEC, rest);
    expect(heatStress(w)).toBeLessThan(w.p.get('heat.tollFrom'));
    const eased = heatToll(w);
    expect(eased).toBeGreaterThanOrEqual(built);
    run(w, 30 * SEC, rest);
    expect(heatStress(w)).toBeLessThan(0.1);
    expect(heatToll(w)).toBeCloseTo(eased, 9);
    // Not part of the saved progress or checkpoint.
    expect(JSON.stringify(w.progress)).not.toContain('heatToll');
    expect(JSON.stringify(w.checkpoint)).not.toContain('heatToll');
  });

  it('full heat stress does not kill in warm water short of the lethal temperature', () => {
    const w = world(HOT, 4);
    const spot = warmSpot(w);
    (w.stage as { heatStress?: number }).heatStress = 1;
    expect(stepHeatToll(w, w.dt, 1, lethalTemp(w) - 0.5)).toBe(false);
    expect(stepHeatToll(w, w.dt, 0.99, lethalTemp(w) + 1)).toBe(false);
    expect(stepHeatToll(w, w.dt, 1, lethalTemp(w) + 0.1)).toBe(true);
    expect(spot.x).toBeGreaterThan(0);
  });

  it('an ordinary year builds no toll and the grounds carry no burden', () => {
    const w = world(ORDINARY, 5);
    expect(riverWarmth(w)).toBe(0);
    expect(groundsHeat(w)).toBeNull();
    expect(spawnState(w)?.vigour).toBe(1);
    expect(senescenceFactor(w)).toBe(1);
    expect(arrivingToll(w)).toBe(0);
  });

  it('Field guide builds the toll more slowly than Wild', () => {
    expect(params('fieldGuide').get('heat.tollRate')).toBeLessThan(params('wild').get('heat.tollRate'));
    expect(params('fieldGuide').get('heat.prespawnRate')).toBeLessThan(params('wild').get('heat.prespawnRate'));
  });
});

describe('the toll on the spawning grounds', () => {
  it('a carried toll takes strength off the start, speeds senescence and says so', () => {
    const w = world(HOT, 4);
    w.carry.heatToll = 0.6;
    w.startStage(5, 0);
    const g = groundsHeat(w)!;
    expect(g.toll).toBeCloseTo(0.6, 6);
    expect(g.crowd).toBeCloseTo(crowdHeat(w, spawnState(w)!.crowd!.rel), 6);
    expect(g.burden).toBeGreaterThan(0.6);
    expect(spawnState(w)!.vigour).toBeLessThan(1 - 0.5 * w.p.get('heat.vigourLoss'));
    expect(senescenceFactor(w)).toBeGreaterThan(1);
    expect(w.events.some((e) => e.key === 'spawn.heatTollHigh')).toBe(true);
  });

  it('a fish that did not swim the return (sibling, reload, jump) gets the year\'s typical toll', () => {
    const w = world(HOT, 5);
    expect(w.carry.heatToll).toBeUndefined();
    expect(groundsWarmth(w)).toBeGreaterThan(0.5);
    expect(arrivingToll(w)).toBeCloseTo(w.p.get('heat.yearToll') * groundsWarmth(w), 6);
    w.carry.heatToll = 0.9;
    w.die('bear');
    w.continueWithSibling('Sib');
    expect(w.carry.heatToll).toBeUndefined();
    expect(groundsHeat(w)!.toll).toBeCloseTo(w.p.get('heat.yearToll') * groundsWarmth(w), 6);
  });

  it('crowding in warm water adds to the burden, more in a big run', () => {
    const w = world(HOT, 5);
    expect(crowdHeat(w, 2)).toBeGreaterThan(crowdHeat(w, 1));
    expect(crowdHeat(w, 1)).toBeGreaterThan(0);
    const cool = world(ORDINARY, 5);
    expect(crowdHeat(cool, 3)).toBe(0);
  });

  it('the pre-spawn hazard is zero below its threshold and rises with the burden', () => {
    const w = world(HOT, 5);
    const from = w.p.get('heat.prespawnFrom');
    expect(prespawnHazard(w, from)).toBe(0);
    expect(prespawnHazard(w, from + 0.2)).toBeGreaterThan(0);
    expect(prespawnHazard(w, 1)).toBeCloseTo(w.p.get('heat.prespawnRate'), 9);
    expect(prespawnHazard(w, 0.9)).toBeLessThan(prespawnHazard(w, 1));
  });

  it('a heavily burdened fish that waits around often dies before spawning (prespawn)', () => {
    let prespawn = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = world(HOT, 4, { seed, difficulty: 'wild' });
      w.carry.heatToll = 1;
      w.startStage(5, 0);
      run(w, 200 * SEC, (ww) => {
        for (const b of ww.live('bear')) b.alive = false;
        return intent();
      });
      if (w.deathCause === 'prespawn') prespawn++;
      if (w.status === 'dead') expect(['prespawn', 'noSpawn']).toContain(w.deathCause);
    }
    expect(prespawn).toBeGreaterThan(6);
  });

  it('noSpawnCause: a burdened fish whose strength ran out died before spawning', () => {
    const w = world(HOT, 4);
    w.carry.heatToll = 0.8;
    w.startStage(5, 0);
    expect(noSpawnCause(w, 0)).toBe('prespawn');
    expect(noSpawnCause(w, 0.5)).toBe('noSpawn');
    const cool = world(ORDINARY, 5);
    expect(noSpawnCause(cool, 0)).toBe('noSpawn');
  });

  it('draws no random numbers in a year without a burden', () => {
    const a = world(ORDINARY, 5, { seed: 3 });
    const b = world(ORDINARY, 5, { seed: 3 });
    for (let i = 0; i < 600; i++) {
      a.step(intent({ forward: 0.5 }));
      b.step(intent({ forward: 0.5 }));
    }
    expect(a.rng.state).toEqual(b.rng.state);
    expect(groundsHeat(a)).toBeNull();
  });
});
