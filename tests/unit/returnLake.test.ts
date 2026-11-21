import { describe, expect, it } from 'vitest';
import { returnLayout } from '../../src/sim/stages/return';
import { atSite, lakeView, lakeWater, nearestOnPlume, plumeAt, siteWater, type LakeLayout } from '../../src/sim/stages/returnLake';
import { heatStress, riverWarmth, waterAt, yearRiverTemp } from '../../src/sim/stages/returnWater';
import type { Habitat, YearConditions } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { foundLineage } from '../../src/sim/lineage';
import { World as SimWorld } from '../../src/sim/world';
import { intent, lakePilot, params, run, steer3 } from './helpers';

const SEC = 60;
const ORDINARY: YearConditions = { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 };
const HOT: YearConditions = { flow: 0.7, temperature: 1.3, oceanCrowding: 1, runSize: 1 };

function lakeWorld(o: { habitat?: Habitat; conditions?: YearConditions; seed?: number; difficulty?: 'fieldGuide' | 'wild' } = {}) {
  const d = o.difficulty ?? 'fieldGuide';
  const p = params(d);
  const lineage = foundLineage(p, { preset: 'quick', sex: 'F', name: 'Lake', difficulty: d, seed: o.seed ?? 7, ...(o.habitat ? { habitat: o.habitat } : {}) });
  const w = new SimWorld(p, { fish: lineage.current, conditions: o.conditions ?? ORDINARY, difficulty: d, siblings: 2, seed: o.seed ?? 7, startStage: 0 });
  w.debugJumpTo(4);
  return w;
}

const lay = (w: World): LakeLayout => lakeView(w)!.layout;

/** Drop the fish into the lake, past the river's trough, with the river behind it. */
function intoLake(w: World, at?: { x: number; y: number; z: number }) {
  const L = lay(w);
  for (const b of w.live('bear')) b.alive = false;
  for (const l of w.live('lure')) l.alive = false;
  (w.stage as { falls: { passed: boolean; above: boolean } }).falls.passed = true;
  w.body.pos = at ?? { x: L.start + 30, y: -3, z: (L.inletZ0 + L.inletZ1) / 2 * 0.5 };
  w.body.vel = { x: 0, y: 0, z: 0 };
  w.progress.fat = 0.8;
  w.step(intent());
}

describe('the lake at the end of the return', () => {
  it('has three streams for a creek home, three beaches for a beach home, one of them home', () => {
    for (const habitat of ['creek', 'river', 'beach'] as const) {
      const w = lakeWorld({ habitat });
      const L = lay(w);
      expect(L.sites).toHaveLength(3);
      expect(L.sites.filter((q) => q.home)).toHaveLength(1);
      expect(L.sites.every((q) => q.kind === (habitat === 'beach' ? 'beach' : 'inflow'))).toBe(true);
      expect(returnLayout(w)?.lake).toBe(L);
    }
  });

  it('is deep in the middle, dry beyond the shore, and the river runs on into it without a step', () => {
    const w = lakeWorld();
    const L = lay(w);
    const a = w.arena;
    const mid = L.start + L.len * 0.55;
    expect(a.floor(mid, 0)).toBeLessThan(-w.p.get('return.lake.depth') + 1);
    expect(a.floor(mid, L.half + 1)).toBeGreaterThan(a.surfaceY);
    expect(a.floor(L.start + 4, -Math.sign((L.inletZ0 + L.inletZ1) / 2) * 20)).toBeGreaterThan(a.surfaceY);
    for (let z = L.inletZ0 + 0.5; z < L.inletZ1 - 0.5; z += 0.5) expect(Math.abs(a.floor(L.start + 0.05, z) - a.floor(L.start - 0.05, z))).toBeLessThan(0.3);
    // Each stream's channel is water all the way to its dead end.
    for (const q of L.sites) for (let x = L.end - 6; x < L.end + L.inflowLen - 1; x += 1) expect(a.floor(x, q.z)).toBeLessThan(a.surfaceY - 1);
  });

  it('a beach site is shallow water along the side shore', () => {
    const w = lakeWorld({ habitat: 'beach' });
    const L = lay(w);
    for (const q of L.sites) {
      const water = w.arena.surfaceY - w.arena.floor(q.x, q.z);
      expect(water).toBeGreaterThan(0.8);
      expect(water).toBeLessThan(w.p.get('return.lake.beachDepth'));
      expect(atSite(w, L, q, { x: q.x, y: -0.5, z: q.z })).toBe(true);
    }
  });

  it('entering marks checkpoint 3, and a sibling resumes there, in the lake', () => {
    const w = lakeWorld();
    const L = lay(w);
    intoLake(w, { x: L.start + 8, y: -3, z: (L.inletZ0 + L.inletZ1) / 2 });
    expect(w.checkpoint.marker).toBe(3);
    expect(w.events.some((e) => e.key === 'return.lake.enter')).toBe(true);
    expect(lakeView(w)?.entered).toBe(true);
    w.die('bear');
    w.continueWithSibling('Sib');
    expect(w.stageId).toBe('return');
    expect(w.body.pos.x).toBeGreaterThan(L.start);
    expect(lakeView(w)?.inside).toBe(true);
  });

  it('home is closed until the colours have come on; a wrong stream says so and never ends the stage', () => {
    const w = lakeWorld();
    const L = lay(w);
    intoLake(w);
    const home = L.sites[L.home]!;
    const wrong = L.sites.find((q) => !q.home)!;
    // Up a wrong stream, ready: nothing.
    (w.stage as { lake: { ripe: number } }).lake.ripe = 1;
    w.body.pos = { x: L.end + 8, y: -1.2, z: wrong.z };
    run(w, 2 * SEC, () => intent({ hold: true }));
    expect(w.status).toBe('playing');
    expect(w.events.some((e) => e.key === 'return.lake.wrongInflow')).toBe(true);
    // Home, not ready: nothing.
    (w.stage as { lake: { ripe: number } }).lake.ripe = 0.5;
    w.body.pos = { x: L.end + 8, y: -1.2, z: home.z };
    run(w, SEC, () => intent({ hold: true }));
    expect(w.status).toBe('playing');
    expect(w.events.some((e) => e.key === 'return.lake.notReady')).toBe(true);
    // Wait until ready: home.
    run(w, 60 * SEC, () => intent({ hold: true }));
    expect(w.status).toBe('stageComplete');
    expect(w.events.some((e) => e.key === 'return.lake.ready')).toBe(true);
  });

  it('a pilot that knows the way gets home in either habitat, on both difficulties', () => {
    for (const habitat of ['creek', 'beach'] as const)
      for (const difficulty of ['fieldGuide', 'wild'] as const) {
        const w = lakeWorld({ habitat, difficulty, seed: 21 });
        intoLake(w);
        run(w, 120 * SEC, (ww) => lakePilot(ww) ?? intent());
        expect(w.status, `${habitat}/${difficulty}: ${w.deathCause}`).toBe('stageComplete');
        expect(w.events.some((e) => e.key === (habitat === 'beach' ? 'return.arriveBeach' : 'return.arrive'))).toBe(true);
      }
  });

  it('in a warm year the top of the lake is warm and the deep water cool; heat builds above and eases below', () => {
    const w = lakeWorld({ conditions: HOT });
    const L = lay(w);
    expect(riverWarmth(w)).toBeGreaterThan(0.5);
    const x = L.start + L.len * 0.55;
    const top = waterAt(w, { x, y: -0.5, z: 0 }).temp;
    const deep = waterAt(w, { x, y: -9, z: 0 }).temp;
    expect(top).toBeGreaterThan(w.p.get('return.water.stressTemp'));
    expect(deep).toBeLessThanOrEqual(w.p.get('return.lake.deepTemp') + 0.01);
    // The beach shelf is warm all the way down.
    const shelf = lakeWater(w, L, { x, y: -1.5, z: L.half * 0.95 }, yearRiverTemp(w), riverWarmth(w), 0);
    expect(shelf).toBeGreaterThan(w.p.get('return.water.stressTemp'));
    intoLake(w, { x, y: -0.6, z: 0 });
    run(w, 10 * SEC, () => intent({ hold: true, rise: true }));
    const built = heatStress(w);
    expect(built).toBeGreaterThan(0.1);
    run(w, 25 * SEC, () => intent({ hold: true, dive: true }));
    expect(heatStress(w)).toBeLessThan(built);
    expect(w.events.some((e) => e.key === 'return.lake.coolDeep')).toBe(true);
  });

  it('an ordinary year has no warm layer to speak of', () => {
    const w = lakeWorld();
    const L = lay(w);
    expect(waterAt(w, { x: L.start + 60, y: -0.5, z: 0 }).temp).toBeLessThan(w.p.get('return.water.comfortTemp'));
  });

  it('fat burns slower in the still lake than in the river for the same swimming', () => {
    const burn = (inLake: boolean) => {
      const w = lakeWorld();
      const L = lay(w);
      intoLake(w, inLake ? { x: L.start + 60, y: -4, z: 0 } : { x: 120, y: -1.5, z: returnLayout(w)!.homeMouth });
      w.progress.fat = 0.8;
      run(w, 5 * SEC, () => intent({ hold: true }));
      return 0.8 - w.progress.fat;
    };
    expect(burn(true)).toBeLessThan(burn(false) * 0.5);
  });

  it('home scent comes along the plume; off it there is none, and wrong sites smell weaker than home to a clear fish', () => {
    const w = lakeWorld({ seed: 31 });
    const L = lay(w);
    const home = L.sites[L.home]!;
    const on = plumeAt(L, home, 0.4);
    intoLake(w, { x: on.x, y: -3, z: on.z });
    run(w, 5 * SEC, () => intent({ hold: true }));
    const specks = w.live('scent').filter((s) => s.state === 'lake');
    expect(specks.length).toBeGreaterThan(5);
    for (const s of specks) expect(nearestOnPlume(L, home, s.pos.x, s.pos.z).d).toBeLessThan(12);
    // Far off the plume: no new home scent, and the caption about losing it.
    for (const s of w.live('scent')) s.alive = false;
    const off = L.sites.find((q) => !q.home)!;
    const far = siteWater(off);
    w.body.pos = { x: (far.x + L.start + 40) / 2, y: -3, z: far.z };
    if (nearestOnPlume(L, home, w.body.pos.x, w.body.pos.z).d > 20) {
      run(w, 6 * SEC, () => intent({ hold: true }));
      expect(w.live('scent').filter((s) => s.state === 'lake' && s.timer > 8).length).toBe(0);
      expect(w.events.some((e) => e.key === 'return.lake.lostScent')).toBe(true);
    }
    const stray = w.live('scent').filter((s) => s.state === 'lakeStray');
    for (const s of stray) expect(s.value ?? 0).toBeLessThan(0.6);
  });

  it('a lake bear takes a fish in the shallows by its stream, but cannot reach deep water', () => {
    const outcome = (deep: boolean, seed: number) => {
      const w = lakeWorld({ seed });
      const L = lay(w);
      intoLake(w);
      const home = L.sites[L.home]!;
      // Put back the bear at home's mouth.
      const ws = lakeWorld({ seed });
      const bear = ws.live('bear').find((b) => b.pos.x > L.start && Math.abs(b.pos.z - home.z) < 8);
      if (!bear) return null;
      w.spawn('bear', { ...bear.pos }, { radius: 1.2, ...(bear.size ? { size: { ...bear.size } } : {}) });
      w.body.pos = deep ? { x: L.end - 16, y: -6.5, z: home.z } : { x: L.end + 1, y: -0.6, z: home.z };
      w.body.vel = { x: 0, y: 0, z: 0 };
      run(w, 6 * SEC, () => (deep ? intent({ hold: true, dive: true }) : steer3(w, L.end + 1, -0.6, home.z, { forward: 0 })));
      return w.deathCause === 'bear';
    };
    const shallow = [1, 2, 3, 4, 5, 6].map((s) => outcome(false, s)).filter((x) => x !== null);
    const deep = [1, 2, 3, 4, 5, 6].map((s) => outcome(true, s)).filter((x) => x !== null);
    expect(shallow.length).toBeGreaterThan(2);
    expect(shallow.some((x) => x)).toBe(true);
    expect(deep.every((x) => !x)).toBe(true);
  });
});
