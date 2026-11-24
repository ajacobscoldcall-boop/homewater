/**
 * The behaviour stream: flocking schools, predator personalities, and bears
 * that patrol, choose and feed selectively on the spawning grounds.
 */
import { describe, expect, it } from 'vitest';
import { bearChoosiness, bearEatTime, bearPlentyRate, bearShareEaten, bearTargetWeight, runPlenty } from '../../src/sim/bearFeeding';
import { flockStep, flockTuning, isFlashing, schoolSpread, type FlockGoal, type FlockTuning } from '../../src/sim/flock';
import { curvedChase, personalityFrom, personalityOf } from '../../src/sim/personality';
import { oceanView } from '../../src/sim/stages/ocean';
import type { Entity } from '../../src/sim/types';
import { dist, v3 } from '../../src/sim/vec';
import { lateness, scavengerCounts } from '../../src/render/scavengers';
import { intent, newWorld, params, run, steerTo } from './helpers';

const SEC = 60;

function member(id: number, x: number, z: number): Entity {
  return { id, kind: 'smolt', pos: v3(x, -2, z), vel: v3(), yaw: 0, radius: 0.2, state: 'idle', timer: 0, alive: true };
}

const TUNING: FlockTuning = flockTuning(params(), 'flock.smolt');

describe('flocking', () => {
  it('keeps members apart and holds each near its place', () => {
    const a = member(1, 0, 0);
    const b = member(2, 0.1, 0);
    const goal = (e: Entity): FlockGoal => ({ pos: v3(e.id === 1 ? -0.3 : 0.3, -2, 0) });
    for (let i = 0; i < 120; i++) {
      flockStep([a, b], goal, [], TUNING, 1 / 60);
      for (const m of [a, b]) {
        m.pos.x += m.vel.x / 60;
        m.pos.z += m.vel.z / 60;
      }
    }
    expect(dist(a.pos, b.pos)).toBeGreaterThan(0.4);
    expect(Math.abs(a.pos.x + 0.3)).toBeLessThan(0.3);
  });

  it('bursts away from a striking predator (flash expansion), then regroups', () => {
    const school = Array.from({ length: 12 }, (_, i) => member(i + 1, Math.cos(i) * 1.2, Math.sin(i) * 1.2));
    const places = new Map(school.map((m) => [m.id, { ...m.pos }]));
    const goal = (e: Entity): FlockGoal => ({ pos: places.get(e.id)! });
    const move = () => {
      for (const m of school) {
        m.pos.x += m.vel.x / 60;
        m.pos.y += m.vel.y / 60;
        m.pos.z += m.vel.z / 60;
      }
    };
    const before = schoolSpread(school);
    flockStep(school, goal, [{ pos: v3(0, -2, 0), striking: true }], TUNING, 1 / 60);
    expect(school.every(isFlashing)).toBe(true);
    // Every member is moving away from the strike, fast.
    for (const m of school) {
      const out = m.vel.x * m.pos.x + m.vel.z * m.pos.z;
      expect(out).toBeGreaterThan(0);
    }
    for (let i = 0; i < 20; i++) {
      move();
      flockStep(school, goal, [], TUNING, 1 / 60);
    }
    expect(schoolSpread(school)).toBeGreaterThan(before * 1.3);
    for (let i = 0; i < 6 * 60; i++) {
      move();
      flockStep(school, goal, [], TUNING, 1 / 60);
    }
    expect(school.some(isFlashing)).toBe(false);
    expect(schoolSpread(school)).toBeLessThan(before * 1.25);
  });

  it('does not depend on the order members are visited in', () => {
    const make = () => Array.from({ length: 8 }, (_, i) => member(i + 1, i * 0.3, (i % 3) * 0.4));
    const goal = (e: Entity): FlockGoal => ({ pos: v3(e.id, -2, 0) });
    const a = make();
    const b = make().reverse();
    flockStep(a, goal, [{ pos: v3(1, -2, 0.5), striking: true }], TUNING, 1 / 60);
    flockStep(b, goal, [{ pos: v3(1, -2, 0.5), striking: true }], TUNING, 1 / 60);
    for (const m of a) {
      const o = b.find((x) => x.id === m.id)!;
      expect(o.vel.x).toBeCloseTo(m.vel.x, 12);
      expect(o.vel.z).toBeCloseTo(m.vel.z, 12);
    }
  });

  it('keeps the smolt school around the player, so it still shields', () => {
    const { w } = newWorld({ startStage: 2, seed: 4 });
    // Predators held off: just swimming downstream for 20 seconds.
    run(w, 20 * SEC, (ww) => {
      for (const e of ww.entities) if (e.kind !== 'smolt' && e.kind !== 'cover') e.alive = false;
      (ww.stage as { birdTimer: number }).birdTimer = 99;
      (ww.stage as { mergTimer: number }).mergTimer = 99;
      (ww.stage as { sealTimer: number }).sealTimer = 99;
      return steerTo(ww, ww.body.pos.x + 10, 0, { forward: 0.7 });
    });
    const school = w.live('smolt');
    const near = school.filter((s) => dist(s.pos, w.body.pos) < 6).length;
    expect(near / school.length).toBeGreaterThan(0.7);
  });

  it('scatters the ocean food patch from a charging shark', () => {
    const { w } = newWorld({ startStage: 3, seed: 7 });
    run(w, 3 * SEC, () => intent());
    const c = oceanView(w)!.patches[0]!;
    // The shallow patch (the season has two; oceanRoute.ts).
    const patch = () => w.live('herring').filter((h) => h.home && h.home.y === c.y);
    const before = schoolSpread(patch());
    w.spawn('shark', v3(c.x - 6, c.y, c.z), { radius: 1.5, state: 'charge', timer: 3, vel: v3(10, 0, 0) });
    run(w, 30, () => intent());
    expect(patch().some(isFlashing)).toBe(true);
    expect(schoolSpread(patch())).toBeGreaterThan(before);
  });
});

describe('predator personalities', () => {
  it('are never faster than tuned on Field guide, and never warn for less time', () => {
    const spreads = { speed: 0.12, patience: 0.3, angle: 0.35 };
    for (let i = 0; i <= 10; i++) {
      const u = [i / 10, 1 - i / 10, (i * 7) % 10 / 10] as [number, number, number];
      const fair = personalityFrom(u, spreads, true);
      expect(fair.speed).toBeLessThanOrEqual(1);
      expect(fair.patience).toBeGreaterThanOrEqual(1);
      expect(Math.abs(fair.angle)).toBeLessThanOrEqual(0.35);
      const wild = personalityFrom(u, spreads, false);
      expect(Math.abs(wild.speed - 1)).toBeLessThanOrEqual(0.12 + 1e-12);
    }
  });

  it('are seeded per predator: the same one behaves the same, others differ', () => {
    const { w } = newWorld({ startStage: 2, seed: 9 });
    const a = w.spawn('seal', v3(), {});
    const b = w.spawn('seal', v3(), {});
    expect(personalityOf(w, a)).toEqual(personalityOf(w, a));
    expect(personalityOf(w, a)).not.toEqual(personalityOf(w, b));
    // No numbers are taken from the world's random stream.
    const state = w.rng.state;
    personalityOf(w, a);
    expect(w.rng.state).toBe(state);
  });

  it('curve in from the side but straighten up close to the target', () => {
    const far = curvedChase(20, 0, 0, 0.4, 4);
    expect(Math.atan2(far.z, far.x)).toBeCloseTo(0.4, 6);
    const near = curvedChase(1, 0, 0, 0.4, 4);
    expect(Math.atan2(near.z, near.x)).toBeCloseTo(0.1, 6);
    expect(Math.hypot(near.x, near.y, near.z)).toBeCloseTo(1, 9);
  });
});

describe('bears on the spawning grounds', () => {
  const p = params();

  it("keep the advisor's order: males, then large females, jacks last; choosier in a big run", () => {
    for (const run of [0.7, 1, 1.6]) {
      const male = bearTargetWeight(p, 'male', 1, run);
      const female = bearTargetWeight(p, 'female', 1, run);
      const jack = bearTargetWeight(p, 'jack', 1, run);
      expect(male).toBeGreaterThan(female);
      expect(female).toBeGreaterThan(jack);
      expect(bearTargetWeight(p, 'female', 1.2, run)).toBeGreaterThan(bearTargetWeight(p, 'female', 0.8, run));
    }
    expect(bearChoosiness(p, 1)).toBe(1);
    expect(bearChoosiness(p, 0.6)).toBe(1);
    expect(bearChoosiness(p, 1.6)).toBeGreaterThan(1);
    // Choosier: the share of strikes on males rises in a big run.
    const maleShare = (run: number) => bearTargetWeight(p, 'male', 1, run) / (bearTargetWeight(p, 'male', 1, run) + bearTargetWeight(p, 'female', 1, run) + bearTargetWeight(p, 'jack', 1, run));
    expect(maleShare(1.6)).toBeGreaterThan(maleShare(1));
  });

  it('eat less of each fish and come back sooner when salmon are plentiful', () => {
    expect(runPlenty(p, 1)).toBe(0);
    expect(bearShareEaten(p, 1.6)).toBeLessThan(bearShareEaten(p, 1));
    expect(bearShareEaten(p, 5)).toBeGreaterThanOrEqual(p.get('spawn.bearEatShareMin'));
    expect(bearShareEaten(p, 0.6)).toBe(bearShareEaten(p, 1));
    expect(bearEatTime(p, bearShareEaten(p, 1.6))).toBeLessThan(bearEatTime(p, bearShareEaten(p, 1)));
    expect(bearPlentyRate(p, 1.6)).toBeGreaterThan(1);
    expect(bearPlentyRate(p, 1)).toBe(1);
  });

  it('patrol the bank from the start, without a warning', () => {
    const { w } = newWorld({ startStage: 5, seed: 3, sex: 'F', habitat: 'creek' });
    const bear = w.live('bear')[0]!;
    expect(bear.state).toBe('patrol');
    const x0 = bear.pos.x;
    run(w, 2 * SEC, () => intent({ hold: true }));
    expect(bear.pos.x).not.toBe(x0);
    expect(Math.abs(bear.pos.z)).toBeCloseTo(8.6, 5);
    expect(w.events.some((e) => e.type === 'warning' && e.key === 'bear')).toBe(false);
  });

  it('still warn before every strike, take one fish, eat it on the bank and leave the rest', () => {
    const { w } = newWorld({ startStage: 5, seed: 5, sex: 'M', habitat: 'creek' });
    w.progress.isJack = false;
    w.progress.adultSize = 1;
    (w.conditions as { runSize: number }).runSize = 1.8;
    w.startStage(5, 0);
    let strikes = 0;
    let warned = 0;
    let lastState = '';
    let taken = 0;
    let others = w.entities.filter((e) => e.alive && (e.kind === 'rival' || e.kind === 'guardMale' || e.kind === 'jackAI')).length;
    run(w, 28 * SEC, (ww) => {
      const b = ww.live('bear')[0];
      if (b && b.state !== lastState) {
        if (b.state === 'warn') warned++;
        if (b.state === 'strike') {
          strikes++;
          expect(lastState).toBe('warn');
        }
        lastState = b.state;
      }
      const now = ww.entities.filter((e) => e.alive && (e.kind === 'rival' || e.kind === 'guardMale' || e.kind === 'jackAI')).length;
      // Rivals arrive, but a strike never removes more than one fish.
      if (now < others) {
        expect(others - now).toBeLessThanOrEqual(1);
        taken += others - now;
      }
      others = now;
      // Keep the player out of the season's end, and out of the way of any strike aimed at it.
      (ww.stage as { vigour: number }).vigour = 1;
      if (b?.state === 'warn' && b.value === 0 && b.home) ww.body.pos.x = b.home.x > 20 ? b.home.x - 8 : b.home.x + 8;
      return intent({ hold: true });
    });
    // (The large male's season may end without spawning: he was kept away from his female.)
    expect(w.deathCause).not.toBe('bear');
    expect(strikes).toBeGreaterThanOrEqual(2);
    expect(warned).toBeGreaterThanOrEqual(strikes);
    if (taken > 0) {
      expect(w.live('carcass').length).toBeGreaterThan(0);
      // A big run: the bear left most of a fish, and said so.
      expect(w.live('carcass')[0]!.value!).toBeGreaterThan(0.3);
      expect(w.events.some((e) => e.key === 'spawn.bearPartial') || w.entities.some((e) => e.kind === 'carcass')).toBe(true);
    }
  });
});

describe('scavengers (render rules)', () => {
  it('come late in the season and scale with detail', () => {
    expect(lateness(1)).toBe(0);
    expect(lateness(0.1)).toBe(1);
    expect(lateness(0.4)).toBeGreaterThan(lateness(0.6));
    expect(scavengerCounts(0).gulls).toBeLessThan(scavengerCounts(2).gulls);
    expect(scavengerCounts(0).drifters).toBeLessThanOrEqual(scavengerCounts(2).drifters);
  });
});
