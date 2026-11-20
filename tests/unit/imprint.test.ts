import { describe, expect, it } from 'vitest';
import { FRY_PLUME, imprintLevel, imprintOf, inFryPlume, learn, scentClarity } from '../../src/sim/imprint';
import { returnUpstream } from '../../src/sim/stages/return';
import { scentBlur, wrongReach, wrongStrength, type ScentLayout } from '../../src/sim/stages/returnScent';
import { v3 } from '../../src/sim/vec';
import type { World } from '../../src/sim/world';
import { intent, newWorld, params, run } from './helpers';

const scentCount = (w: World, state: string) => w.entities.filter((e) => e.alive && e.kind === 'scent' && e.state === state).length;

describe('imprinting: learning home', () => {
  it('a new fish starts with no imprint; a fish jumped to the return gets the average', () => {
    const { w, p } = newWorld({ seed: 3 });
    expect(w.progress.imprint).toBe(0);
    const j = newWorld({ seed: 3, startStage: 4 }).w;
    expect(j.progress.imprint).toBeCloseTo(p.get('imprint.default'), 6);
  });

  it('each stage adds at most its share, never past 1, with its caption once', () => {
    const { w, p } = newWorld({ seed: 4 });
    const added = learn(w, 'egg', 5);
    expect(added).toBeCloseTo(p.get('imprint.eggMax'), 9);
    expect(learn(w, 'egg', 1)).toBe(0);
    expect(w.events.filter((e) => e.key === 'imprint.egg')).toHaveLength(1);
    w.progress.imprint = 0.98;
    w.stage.imprintGain = 0;
    expect(learn(w, 'egg', 1)).toBeCloseTo(0.02, 9);
    expect(w.progress.imprint).toBeCloseTo(1, 9);
  });

  it('old progress without an imprint counts as average', () => {
    const p = params();
    expect(imprintOf(p, {})).toBe(p.get('imprint.default'));
    expect(imprintOf(p, { imprint: 0.3 })).toBe(0.3);
  });

  it('alevin facing into the flow learn home; the egg stage alone cannot go past its share', () => {
    const { w, p } = newWorld({ seed: 5 });
    // Hold still, facing as the stage starts (into the current), through hatching and beyond.
    run(w, 60 * 20, () => intent());
    expect(w.progress.imprint).toBeGreaterThan(0.05);
    expect(w.progress.imprint).toBeLessThanOrEqual(p.get('imprint.eggMax') + 1e-9);
  });

  it('fry learn inside the home-water plume, not elsewhere in the lake', () => {
    const inside = newWorld({ seed: 6, startStage: 1 }).w;
    const mid = v3((FRY_PLUME.start.x + FRY_PLUME.end.x) / 2, (FRY_PLUME.start.y + FRY_PLUME.end.y) / 2, (FRY_PLUME.start.z + FRY_PLUME.end.z) / 2);
    expect(inFryPlume(mid.x, mid.y, mid.z)).toBe(true);
    expect(inFryPlume(0, -3, 15)).toBe(false);
    const before = inside.progress.imprint;
    run(inside, 240, (w) => {
      w.body.pos = { ...mid };
      return intent();
    });
    expect(inside.progress.imprint - before).toBeGreaterThan(0.05);
    expect(scentCount(inside, 'plume')).toBeGreaterThan(5);

    const outside = newWorld({ seed: 6, startStage: 1 }).w;
    const b2 = outside.progress.imprint;
    run(outside, 240, (w) => {
      w.body.pos = v3(-25, -3, 12);
      return intent();
    });
    expect(outside.progress.imprint).toBeCloseTo(b2, 9);
  });

  it('smolts learn when swimming calmly with the school, not when bursting in a panic', () => {
    const calm = newWorld({ seed: 7, startStage: 2 }).w;
    const c0 = calm.progress.imprint;
    run(calm, 180, () => intent({ forward: 0.4 }));
    const panic = newWorld({ seed: 7, startStage: 2 }).w;
    const p0 = panic.progress.imprint;
    run(panic, 180, () => intent({ forward: 1, burst: true }));
    expect(calm.progress.imprint - c0).toBeGreaterThan(0.02);
    expect(panic.progress.imprint - p0).toBeLessThan((calm.progress.imprint - c0) * 0.25);
  });
});

describe('imprinting on the return: the home scent', () => {
  it('clarity rises with imprint and with the homing trait; average gives the old fixed strength', () => {
    const p = params();
    const avg = p.get('imprint.default');
    expect(scentClarity(p, avg, { homing: 0 })).toBeCloseTo(p.get('imprint.clarityBase'), 9);
    expect(scentClarity(p, 1, { homing: 0 })).toBeGreaterThan(scentClarity(p, avg, { homing: 0 }));
    expect(scentClarity(p, 0, { homing: 0 })).toBeLessThan(scentClarity(p, avg, { homing: 0 }));
    expect(scentClarity(p, avg, { homing: 1 })).toBeGreaterThan(scentClarity(p, avg, { homing: -1 }));
    expect(scentClarity(p, 0, { homing: -5 })).toBe(p.get('imprint.clarityMin'));
    expect(scentClarity(p, 1, { homing: 5 })).toBe(1);
    expect(imprintLevel(p, 0.9)).toBe('strong');
    expect(imprintLevel(p, 0.1)).toBe('weak');
    expect(imprintLevel(p, avg)).toBe('fair');
  });

  it("a well imprinted fish smells wrong rivers fainter and fading sooner", () => {
    const { w } = newWorld({ seed: 8, startStage: 4 });
    const lay: ScentLayout = { coast: 90, fork: 175, length: 245, riverHalf: 7, homeMouth: 0, homeSide: 1, wrongMouths: [-26, 26], wrongHalf: 3.5, wrongLen: 30 };
    expect(wrongReach(w, lay, 1)).toBeLessThan(wrongReach(w, lay, 0.3));
    expect(wrongStrength(w, 1) / 1).toBeLessThan(wrongStrength(w, 0.3) / 0.3);
    // Never smells stronger than home.
    for (const c of [0.25, 0.4, 0.65, 0.9]) expect(wrongStrength(w, c)).toBeLessThanOrEqual(c);
  });

  it('an average fish or better gets the home scent as it always was; only a worse one is blurred', () => {
    const { w, p } = newWorld({ seed: 8, startStage: 4 });
    expect(scentBlur(w, p.get('imprint.clarityBase'))).toBe(0);
    expect(scentBlur(w, 1)).toBe(0);
    expect(scentBlur(w, p.get('imprint.clarityMin'))).toBe(1);
    expect(scentBlur(w, 0.45)).toBeGreaterThan(0);
  });

  function riverWorld(imprint: number, homing: number) {
    const { w } = newWorld({ seed: 9, startStage: 4 });
    w.fish = { ...w.fish, z: { ...w.fish.z, homing } };
    w.progress.imprint = imprint;
    w.restore({ stageIndex: 4, marker: 1, progress: { ...w.progress } });
    w.drainEvents();
    return w;
  }

  it('home scent comes thicker and steadier for a well imprinted fish, and the caption says so', () => {
    const good = riverWorld(1, 0.5);
    const poor = riverWorld(0, -0.5);
    let gSum = 0;
    let pSum = 0;
    for (let i = 0; i < 600; i++) {
      for (const w of [good, poor]) {
        w.body.pos = v3(96, -2.5, w.body.pos.z);
        w.body.vel = v3();
        w.step(intent());
      }
      gSum += good.entities.filter((e) => e.alive && e.kind === 'scent' && e.state === 'idle').length;
      pSum += poor.entities.filter((e) => e.alive && e.kind === 'scent' && e.state === 'idle').length;
    }
    expect(gSum).toBeGreaterThan(pSum * 1.5);
    expect(good.drainEvents().some((e) => e.key === 'return.scent.strong')).toBe(true);
    expect(poor.drainEvents().some((e) => e.key === 'return.scent.weak')).toBe(true);
    // Wrong rivers smell farther up their channels to the poorly imprinted fish.
    const reachOf = (w: World) => Math.max(0, ...w.entities.filter((e) => e.alive && e.kind === 'scent' && e.state === 'stray').map((e) => e.pos.x - 90));
    expect(reachOf(poor)).toBeGreaterThan(reachOf(good));
  });

  it('the climb up the home river is remembered for the body change and never goes back', () => {
    const w = riverWorld(0.6, 0);
    expect(returnUpstream(w)).toBe(0);
    w.body.pos = v3(150, -2.5, w.body.pos.z);
    w.step(intent());
    const up = returnUpstream(w);
    expect(up).toBeGreaterThan(0.3);
    w.body.pos = v3(100, -2.5, w.body.pos.z);
    w.step(intent());
    expect(returnUpstream(w)).toBe(up);
  });
});
