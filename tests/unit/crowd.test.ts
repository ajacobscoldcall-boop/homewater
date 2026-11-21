/**
 * The crowd on the spawning grounds (src/sim/stages/spawn/crowd.ts) and the
 * egg thieves (eggThieves.ts): how many fish there are, what they do, and how
 * the crowd feeds the stage's existing rules.
 */
import { describe, expect, it } from 'vitest';
import { crowdCount, crowdCounts, crowdDensity, crowdOpening, eggSurvival, patchContest, rivalFemaleInterval, spawnState } from '../../src/sim/stages/spawn';
import { chooseBearTarget } from '../../src/sim/stages/spawn/bears';
import { crowdOf, crowdReddNear, rivalFromCrowd } from '../../src/sim/stages/spawn/crowd';
import { targetCatch } from '../../src/sim/population';
import type { Entity, Habitat, Sex } from '../../src/sim/types';
import { distXZ } from '../../src/sim/vec';
import type { World } from '../../src/sim/world';
import { intent, newWorld, params, run } from './helpers';

const SEC = 60;
const p = params();

/** A spawning-stage world with this run size, filled for that run. */
function grounds(opts: { run?: number; sex?: Sex; jack?: boolean; seed?: number; habitat?: Habitat } = {}): World {
  const { w } = newWorld({ sex: opts.sex ?? 'F', preset: opts.jack ? 'jack' : 'quick', seed: opts.seed ?? 7, startStage: 5, habitat: opts.habitat });
  const c = w.conditions as { runSize: number; harvestRate?: number };
  c.runSize = opts.run ?? 1;
  delete c.harvestRate;
  w.startStage(5, 0);
  return w;
}

const noBears = (w: World) => {
  for (const b of w.live('bear')) b.alive = false;
  const s = spawnState(w) as { bearTimer: number };
  s.bearTimer = 1e9;
};

describe('how crowded the grounds are', () => {
  it('follows the run: a handful in a small run, dozens in a typical year, many more in a big one', () => {
    const small = crowdCount(p, 0.4);
    const typical = crowdCount(p, 1);
    const big = crowdCount(p, 2.2);
    expect(typical).toBe(p.get('spawn.crowd.typical'));
    expect(small).toBeLessThan(typical / 2);
    expect(big).toBeGreaterThan(typical * 1.8);
    expect(crowdCount(p, 0.01)).toBe(p.get('spawn.crowd.min'));
    expect(crowdCount(p, 50)).toBe(p.get('spawn.crowd.max'));
  });

  it('is the run when the catch is typical, and thinner when the fishery took more', () => {
    const base = { flow: 1, temperature: 1, oceanCrowding: 1 };
    expect(crowdDensity(p, { ...base, runSize: 1.6 })).toBeCloseTo(1.6, 6);
    expect(crowdDensity(p, { ...base, runSize: 1, harvestRate: targetCatch(p, 1) })).toBeCloseTo(1, 6);
    expect(crowdDensity(p, { ...base, runSize: 1.6, harvestRate: 0.65 })).toBeLessThan(crowdDensity(p, { ...base, runSize: 1.6, harvestRate: 0.3 }));
  });

  it('fills the grounds with females on redds, males and the first dead, kept clear of the player', () => {
    const w = grounds({ run: 1 });
    const n = crowdCounts(w);
    expect(n.female + n.male + n.jack).toBe(p.get('spawn.crowd.typical'));
    expect(n.female).toBeGreaterThan(8);
    expect(n.male).toBeGreaterThan(8);
    expect(n.redd).toBeGreaterThanOrEqual(n.female - 2);
    expect(n.carcass).toBeGreaterThan(0);
    // The middle of every gravel patch is left for the player.
    for (const g of w.live('gravelPatch')) expect(crowdReddNear(w, g.pos, 1.5)).toBe(false);
    for (const r of w.live('crowdRedd')) expect(distXZ(r.pos, w.body.pos)).toBeGreaterThan(2);
  });

  it('is busier in a big run than a small one', () => {
    const big = crowdCounts(grounds({ run: 2.2 }));
    const small = crowdCounts(grounds({ run: 0.4 }));
    expect(big.female + big.male).toBeGreaterThan(3 * (small.female + small.male));
  });
});

describe('a season on the grounds', () => {
  it('pairs dig and spawn, males fight, fish fade and die, and carcasses pile up', () => {
    const w = grounds({ run: 1.4, seed: 11 });
    noBears(w);
    const states = new Set<string>();
    const start = crowdCounts(w);
    let spawned = 0;
    run(w, 100 * SEC, (ww, i) => {
      if (i % 30 === 0) for (const e of ww.entities) if (e.alive && e.kind.startsWith('crowd')) states.add(`${e.kind}:${e.state}`);
      if (i % 30 === 0) spawned = Math.max(spawned, ww.live('crowdRedd').filter((r) => r.state !== 'dug').length);
      return intent({ hold: true });
    });
    const end = crowdCounts(w);
    for (const s of ['crowdFemale:dig', 'crowdFemale:guard', 'crowdMale:court', 'crowdMale:cruise', 'crowdMale:fight', 'crowdMale:flee', 'crowdFemale:fade']) expect(states, s).toContain(s);
    expect(end.carcass).toBeGreaterThan(start.carcass + 5);
    expect(end.female + end.male + end.jack).toBeLessThan(start.female + start.male + start.jack);
    expect(spawned).toBeGreaterThan(start.redd / 3);
  });

  it('is the same from the same seed', () => {
    const a = grounds({ seed: 21 });
    const b = grounds({ seed: 21 });
    run(a, 30 * SEC, () => intent({ hold: true }));
    run(b, 30 * SEC, () => intent({ hold: true }));
    expect(JSON.stringify(crowdOf(a))).toBe(JSON.stringify(crowdOf(b)));
    expect(crowdCounts(a)).toEqual(crowdCounts(b));
  });

  it('dead fish roll along the bed and wash toward the edges', () => {
    const w = grounds({ run: 2, seed: 5 });
    noBears(w);
    run(w, 90 * SEC, () => intent({ hold: true }));
    const edge = p.get('spawn.crowd.carcassEdge');
    const atEdge = w.live('crowdCarcass').filter((k) => Math.abs(k.pos.z) >= edge - 0.01).length;
    expect(atEdge).toBeGreaterThan(0);
    expect(w.live('crowdCarcass').length).toBeLessThanOrEqual(p.get('spawn.crowd.maxCarcasses'));
  });
});

describe('the crowd feeds the existing rules', () => {
  it('a rival comes out of the crowd: an unpaired male, at his own size', () => {
    const w = grounds({ sex: 'M', run: 1.5 });
    const male = w.live('crowdMale').find((m) => m.state === 'cruise')!;
    expect(male).toBeDefined();
    const before = w.live('crowdMale').length;
    // Make him the only unpaired male.
    for (const m of w.live('crowdMale')) if (m !== male && m.state === 'cruise') m.state = 'court';
    rivalFromCrowd(w, w.live('female')[0], 'M', 0.5);
    const rival = w.live('rival').at(-1)!;
    expect(rival.value).toBe(male.value);
    expect(distXZ(rival.pos, male.pos)).toBeLessThan(0.01);
    expect(w.live('crowdMale').length).toBe(before - 1);
  });

  it('rival females come more often to good gravel and on crowded grounds', () => {
    expect(patchContest(p, 0.95)).toBeGreaterThan(1);
    expect(patchContest(p, 0.3)).toBeLessThan(1);
    expect(rivalFemaleInterval(p, 1, 0.5, patchContest(p, 0.95))).toBeLessThan(rivalFemaleInterval(p, 1, 0.5, patchContest(p, 0.3)));
    expect(rivalFemaleInterval(p, 2, 0.5)).toBeLessThan(rivalFemaleInterval(p, 1, 0.5));
  });

  it("a female can't start her redd on top of another's", () => {
    const w = grounds({ run: 1.5 });
    noBears(w);
    const r = w.live('crowdRedd')[0]!;
    const patch = w.live('gravelPatch')[0]!;
    // Stand on a gravel patch that has a crowd redd in the middle of it.
    patch.pos.x = r.pos.x;
    patch.pos.z = r.pos.z;
    w.body.pos = { x: r.pos.x, y: -1.5, z: r.pos.z };
    run(w, 2 * SEC, () => intent({ action: true, hold: true }));
    expect(w.live('redd').length).toBe(0);
    expect(w.events.some((e) => e.key === 'spawn.crowdReddTaken')).toBe(true);
  });

  it('the crowd shields the player from the bear: chosen far less often among a crowd', () => {
    const picks = (run: number) => {
      let player = 0;
      for (let seed = 0; seed < 8; seed++) {
        const w = grounds({ run, seed: 100 + seed });
        const bear = w.live('bear')[0]!;
        const s = spawnState(w) as { bearSide: number };
        // The player and the crowd near the bear on its bank.
        w.body.pos = { x: bear.pos.x, y: -1.5, z: s.bearSide * 3 };
        for (let k = 0; k < 50; k++) if (chooseBearTarget(w, false, 1)?.id === 0) player++;
      }
      return player / 400;
    };
    const alone = picks(0.05);
    const crowded = picks(2.4);
    expect(crowded).toBeLessThan(alone * 0.6);
  });

  it('a jack near a crowd pair whose males fight gets an opening there, and can sneak it', () => {
    const w = grounds({ sex: 'M', jack: true, run: 2.4, seed: 3 });
    noBears(w);
    const s = spawnState(w)!;
    let opened: Entity | null = null;
    for (let i = 0; i < 60 * SEC && !opened && w.status === 'playing'; i++) {
      // Wait beside a digging crowd female until her males fight.
      const f = w.live('crowdFemale').find((e) => e.state === 'dig');
      if (f) w.body.pos = { x: f.pos.x + 3, y: -1.5, z: f.pos.z + 1.5 };
      w.step(intent({ hold: true }));
      opened = crowdOpening(w);
    }
    expect(opened).not.toBeNull();
    const f = opened as unknown as Entity;
    expect(w.events.some((e) => e.type === 'warning' && e.key === 'opening')).toBe(true);
    // Dart in beside her.
    w.body.pos = { x: f.pos.x, y: -1.5, z: f.pos.z + 0.5 };
    w.step(intent({ actionPressed: true }));
    expect(s.sneaks).toBe(1);
  });
});

describe('egg thieves', () => {
  /** A female who has just spawned on the best patch; she then does `policy`. */
  function spawned(habitat: Habitat, policy: (w: World) => ReturnType<typeof intent>, seconds = 20): World {
    const w = grounds({ habitat, run: 1, seed: 9 });
    noBears(w);
    const s = spawnState(w) as { dig: number; quality: number; spawned: boolean; rivalTimer: number };
    const g = w.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]!;
    w.body.pos = { x: g.pos.x, y: -1.5, z: g.pos.z };
    w.spawn('redd', { x: g.pos.x, y: -2.2, z: g.pos.z }, { radius: 1.2, value: 1, state: 'dug' });
    s.dig = 1;
    s.quality = g.value ?? 0.6;
    s.spawned = true;
    s.rivalTimer = 1e9;
    run(w, seconds * SEC, (ww) => policy(ww));
    return w;
  }

  it('a char comes for eggs left uncovered, with a warning, and eats them', () => {
    const w = spawned('river', () => intent({ hold: true }));
    const s = spawnState(w)!;
    expect(w.events.some((e) => e.type === 'warning' && e.key === 'char')).toBe(true);
    expect(s.eggsTaken).toBeGreaterThan(0.2);
    // A river redd is too deep for gulls.
    expect(w.live('gull').length).toBe(0);
  });

  it('covering the eggs straight away keeps them out of reach', () => {
    const w = spawned('river', () => intent({ action: true, hold: true }));
    const s = spawnState(w)!;
    expect(s.burial).toBe(1);
    expect(s.eggsTaken).toBeLessThan(0.02);
  });

  it('a charge drives the char off', () => {
    let fled = false;
    spawned('river', (ww) => {
      const ch = ww.live('trout').find((c) => c.state === 'strike' || c.state === 'warn');
      if (ww.live('trout').some((c) => c.state === 'flee')) fled = true;
      if (!ch || fled) return intent({ hold: true });
      // Swim at it and burst.
      ww.body.pos = { x: ch.pos.x - 1, y: ch.pos.y, z: ch.pos.z };
      return intent({ burst: true });
    });
    expect(fled).toBe(true);
  });

  it('over a shallow creek redd a gull comes too, and only covering stops it', () => {
    const w = spawned('creek', () => intent({ hold: true }), 8);
    expect(w.events.some((e) => e.type === 'warning' && e.key === 'gull')).toBe(true);
    expect(w.live('gull')[0]?.state).toBe('strike');
  });

  it('the eggs taken lower egg survival', () => {
    expect(eggSurvival(p, 0.8, 1, 0, 0.3)).toBeCloseTo(eggSurvival(p, 0.8, 1, 0) * 0.7, 9);
    expect(eggSurvival(p, 0.8, 1, 0, 0)).toBe(eggSurvival(p, 0.8, 1, 0));
  });
});

describe('cost', () => {
  it('the biggest crowd steps in well under a millisecond', () => {
    const w = grounds({ run: 3, seed: 2 });
    noBears(w);
    run(w, 5 * SEC, () => intent({ hold: true }));
    const t0 = performance.now();
    run(w, 20 * SEC, () => intent({ hold: true }));
    const perStep = (performance.now() - t0) / (20 * SEC);
    expect(perStep).toBeLessThan(0.5);
  });
});
