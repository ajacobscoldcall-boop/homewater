import { describe, expect, it } from 'vitest';
import { advanceGeneration, foundLineage, offerOffspring } from '../../src/sim/lineage';
import { alevinView } from '../../src/sim/stages/egg';
import { smoltLosses } from '../../src/sim/stages/smolt';
import { returnLayout, trackZ } from '../../src/sim/stages/return';
import type { World } from '../../src/sim/world';
import { STAGE_IDS } from '../../src/sim/types';
import { intent, newWorld, params, run, steerTo } from './helpers';

const SEC = 60;

describe('egg and alevin stage', () => {
  /** Turn toward upstream; stay low; rise once the yolk is used. */
  const goodAlevin = (w: World) => {
    const v = alevinView(w);
    if (!v || v.phase === 'egg') return intent();
    const upstream = v.currentAngle + Math.PI;
    let d = upstream - w.body.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return intent({ turn: Math.max(-1, Math.min(1, d * 3)), rise: v.ready, dive: !v.ready });
  };

  it('an alevin that never reacts is washed out', () => {
    const { w } = newWorld();
    run(w, 90 * SEC, () => intent());
    expect(w.status).toBe('dead');
    expect(w.deathCause).toBe('scour');
  });

  it('an alevin that rises early and ignores the current is washed out sooner', () => {
    const { w: still } = newWorld({ seed: 9 });
    run(still, 120 * SEC, () => intent());
    const { w: high } = newWorld({ seed: 9 });
    run(high, 120 * SEC, () => intent({ rise: true }));
    expect(high.deathCause).toBe('scour');
    expect(high.stageTime).toBeLessThanOrEqual(still.stageTime);
  });

  it('an alevin that faces the current, stays low and rises when ready emerges', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { w } = newWorld({ seed });
      let steps = 0;
      run(w, 120 * SEC, (ww) => (steps++, goodAlevin(ww)));
      expect(w.status, `seed ${seed}: ${w.deathCause ?? ''}`).toBe('stageComplete');
      expect(steps / SEC).toBeLessThan(70);
    }
  });
});

describe('whole life via stage completion', () => {
  for (const [label, opts] of [
    ['female', { sex: 'F' as const }],
    ['male', { sex: 'M' as const }],
    ['jack preset', { preset: 'jack' as const, sex: 'M' as const }],
  ] as const) {
    it(`reaches the end of life with a result (${label})`, () => {
      const { w } = newWorld(opts);
      for (let i = 0; i < STAGE_IDS.length; i++) {
        expect(w.stageId).toBe(STAGE_IDS[i]);
        w.debugComplete();
        if (i < STAGE_IDS.length - 1) {
          expect(w.status).toBe('stageComplete');
          expect(w.advance()).toBe(true);
        }
      }
      expect(w.status).toBe('lifeComplete');
      expect(w.spawnResult?.eggs).toBeGreaterThan(0);
      if (label === 'jack preset') {
        expect(w.progress.isJack).toBe(true);
        expect(w.progress.oceanYears).toBe(1);
      }
      if (label === 'female') expect(w.progress.isJack).toBe(false);
    });
  }
});

describe('siblings', () => {
  it('a sibling resumes at the last checkpoint', () => {
    const { w } = newWorld();
    w.debugComplete();
    w.advance();
    expect(w.stageId).toBe('fry');
    w.die('trout');
    expect(w.canContinueWithSibling()).toBe(true);
    const before = w.siblingsLeft;
    const sib = w.continueWithSibling('Sib');
    expect(sib.name).toBe('Sib');
    expect(w.stageId).toBe('fry');
    expect(w.status).toBe('playing');
    expect(w.siblingsLeft).toBe(before - 1);
  });

  it('runs out of siblings', () => {
    const { w } = newWorld();
    for (let i = 0; i < 3; i++) {
      w.die('scour');
      w.continueWithSibling(`S${i}`);
    }
    w.die('scour');
    expect(w.canContinueWithSibling()).toBe(false);
  });
});

describe('determinism', () => {
  it('replays the same run from the same seed', () => {
    const a = newWorld({ seed: 77, startStage: 1 }).w;
    const b = newWorld({ seed: 77, startStage: 1 }).w;
    const policy = (_w: unknown, i: number) => intent({ forward: 1, turn: Math.sin(i / 50), burst: i % 200 < 30 });
    run(a, 900, policy);
    run(b, 900, policy);
    expect(a.body.pos).toEqual(b.body.pos);
    expect(a.status).toBe(b.status);
  });
});

describe('stage tuning sanity', () => {
  it('a smolt riding the current reaches the sea in about 30-60 s if birds are ignored', () => {
    const { w } = newWorld({ startStage: 2 });
    let steps = 0;
    run(w, 90 * SEC, (ww) => {
      steps++;
      for (const e of ww.entities) if (['birdShadow', 'trout', 'merganser', 'seal'].includes(e.kind)) e.alive = false;
      return steerTo(ww, ww.body.pos.x + 20, 0);
    });
    expect(w.status).toBe('stageComplete');
    expect(steps / SEC).toBeGreaterThan(15);
    expect(steps / SEC).toBeLessThan(70);
  });

  it('the smolt gauntlet takes school-mates, and the school shields the player', () => {
    const trial = (alone: boolean, seed: number) => {
      const { w } = newWorld({ startStage: 2, seed });
      if (alone) for (const f of w.live('smolt')) f.alive = false;
      run(w, 120 * SEC, (ww) => steerTo(ww, ww.body.pos.x + 20, Math.sin(ww.stageTime) * 2, { dive: ww.body.pos.y > -2.6 }));
      return { survived: w.status === 'stageComplete', lost: smoltLosses(w)?.lost ?? 0 };
    };
    const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
    const inSchool = seeds.map((s) => trial(false, s));
    const alone = seeds.map((s) => trial(true, s));
    const rate = (r: { survived: boolean }[]) => r.filter((x) => x.survived).length / r.length;
    expect(inSchool.some((r) => r.lost > 0)).toBe(true);
    expect(rate(inSchool)).toBeGreaterThanOrEqual(rate(alone));
    console.log(`smolt survival: in school ${rate(inSchool).toFixed(2)}, alone ${rate(alone).toFixed(2)}, avg school-mates lost ${(inSchool.reduce((s, r) => s + r.lost, 0) / inSchool.length).toFixed(1)}`);
  });

  /** A fish that follows the track, threads the nets, enters the home mouth and takes the home branch. */
  const navigator = (ww: World) => {
    const L = returnLayout(ww);
    if (!L) return intent();
    const x = ww.body.pos.x;
    const nextGap = ww
      .live('netGap')
      .filter((g) => g.pos.x > x - 0.5)
      .sort((a, b) => a.pos.x - b.pos.x || Math.abs(a.pos.z - ww.body.pos.z) - Math.abs(b.pos.z - ww.body.pos.z))[0];
    if (nextGap && nextGap.pos.x - x < 14) return steerTo(ww, nextGap.pos.x + 3, nextGap.pos.z);
    if (x < L.coast - 6) return steerTo(ww, x + 10, trackZ(ww, x + 10));
    if (x < L.coast + 4) return steerTo(ww, L.coast + 8, L.homeMouth);
    const tz = x > L.fork - 12 ? L.homeMouth + L.homeSide * 4 : L.homeMouth;
    return steerTo(ww, x + 10, tz);
  };

  it('a navigating fish has enough fat to reach home, on both difficulties', () => {
    for (const difficulty of ['fieldGuide', 'wild'] as const) {
      for (const seed of [11, 12, 13]) {
        const { w } = newWorld({ startStage: 4, sex: 'F', difficulty, seed });
        w.progress.adultSize = 0.4; // small enough for the nets, so the test measures navigation and fat
        let steps = 0;
        run(w, 240 * SEC, (ww) => {
          steps++;
          for (const b of ww.live('bear')) b.alive = false;
          for (const l of ww.live('lure')) l.alive = false;
          return navigator(ww);
        });
        expect(w.status, `${difficulty}/${seed}: ${w.deathCause ?? ''} at x=${w.body.pos.x.toFixed(0)}`).toBe('stageComplete');
        expect(w.progress.fat).toBeGreaterThan(0.05);
        expect(steps / SEC).toBeLessThan(130);
      }
    }
  });

  it('a hooked fish that fights escapes; one that does not is landed', () => {
    const hook = (fight: boolean) => {
      const { w } = newWorld({ startStage: 4, seed: 41 });
      const lure = w.live('lure')[0];
      if (!lure) throw new Error('no lure');
      for (const b of w.live('bear')) b.alive = false;
      w.step(intent());
      w.body.pos = { ...lure.pos };
      w.body.vel = { x: 0, y: 0, z: 0 };
      let k = 0;
      run(w, 8 * SEC, () => intent({ forward: fight ? 1 : 0, burst: fight && k++ % 12 < 6 }));
      return { status: w.status, cause: w.deathCause, lure: lure.state };
    };
    expect(hook(false).cause).toBe('angler');
    const fought = hook(true);
    expect(fought.cause).not.toBe('angler');
    expect(fought.lure).not.toBe('hooked');
  });

  it('the magnetic track leads to the home mouth', () => {
    const { w } = newWorld({ startStage: 4, seed: 21 });
    const L = returnLayout(w);
    expect(L).not.toBeNull();
    expect(Math.abs(trackZ(w, L?.coast ?? 0) - (L?.homeMouth ?? 99))).toBeLessThan(0.01);
  });

  it('a wrong river is a dead end that the fish must back out of', () => {
    const { w } = newWorld({ startStage: 4, seed: 22 });
    const L = returnLayout(w);
    if (!L) throw new Error('no layout');
    const wrong = [-26, 0, 26].find((m) => m !== L.homeMouth) ?? 0;
    w.body.pos = { x: L.coast - 3, y: -2.5, z: wrong };
    for (const n of w.live('netLine')) n.alive = false;
    run(w, 30 * SEC, (ww) => steerTo(ww, ww.body.pos.x + 10, wrong));
    expect(w.body.pos.x).toBeLessThan(L.coast + 32);
    expect(w.status, String(w.deathCause)).toBe('playing');
  });

  it('large fish snag in gillnets; jacks slip through', () => {
    const big = newWorld({ startStage: 4, sex: 'M', seed: 31 }).w;
    big.progress.adultSize = 0.75;
    for (const g of big.live('netGap')) g.alive = false;
    run(big, 60 * SEC, (ww) => steerTo(ww, 100, ww.body.pos.z));
    expect(big.deathCause).toBe('gillnet');

    // A jack sits inside the mesh's slip band: most get through, a few are caught.
    let caught = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => 100 + i);
    for (const seed of seeds) {
      const jack = newWorld({ startStage: 4, sex: 'M', seed }).w;
      jack.progress.adultSize = 0.38;
      for (const g of jack.live('netGap')) g.alive = false;
      run(jack, 25 * SEC, (ww) => steerTo(ww, 100, ww.body.pos.z));
      if (jack.deathCause === 'gillnet') caught++;
    }
    expect(caught / seeds.length).toBeLessThan(0.5);
  });
});

describe('generations', () => {
  it('offers three offspring of both sexes and advances the lineage', () => {
    const p = params();
    const l = foundLineage(p, { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed: 3 });
    const kids = offerOffspring(p, l, l.current);
    expect(kids).toHaveLength(3);
    expect(new Set(kids.map((k) => k.sex)).size).toBe(2);
    const chosen = kids[0];
    if (!chosen) throw new Error('no kid');
    advanceGeneration(p, l, chosen, 'Sedge');
    expect(l.generation).toBe(2);
    expect(l.current.name).toBe('Sedge');
    expect(l.current.parentId).toBeDefined();
  });
});
