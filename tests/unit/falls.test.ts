import { describe, expect, it } from 'vitest';
import { currentAt } from '../../src/sim/swim';
import { eddyFactor, FACE, fallsState, fallsView, LIP_END, POOL_START, RAPIDS_START } from '../../src/sim/stages/falls';
import { migrantView } from '../../src/sim/stages/migrants';
import { returnLayout } from '../../src/sim/stages/return';
import type { Difficulty } from '../../src/sim/params';
import type { World } from '../../src/sim/world';
import type { Intent } from '../../src/sim/types';
import { fallsPilot, fallsPilotTries, intent, newWorld, run, steer3, steerTo } from './helpers';


const SEC = 60;

/** A world on the return, the fish placed in the home river at x, bears and lures cleared. */
function atFalls(opts: { seed?: number; difficulty?: Difficulty; x?: number; dz?: number; y?: number } = {}): World {
  const { w } = newWorld({ startStage: 4, seed: opts.seed ?? 7, difficulty: opts.difficulty ?? 'fieldGuide' });
  const L = returnLayout(w)!;
  w.body.pos = { x: opts.x ?? 128, y: opts.y ?? -2, z: L.homeMouth + (opts.dz ?? 0) };
  w.progress.fat = 0.8;
  clearThreats(w);
  return w;
}

function clearThreats(w: World): void {
  for (const b of w.live('bear')) b.alive = false;
  for (const l of w.live('lure')) l.alive = false;
}

/** Launch the player at a given speed from a given spot, bursting and rising, and see the leap through. */
function leapFrom(w: World, x: number, dz: number, speed: number): boolean {
  const v = fallsView(w)!;
  const z = v.notchZ + dz;
  w.body.pos = { x, y: -0.6, z };
  w.body.vel = { x: speed, y: 0, z: 0 };
  w.body.yaw = 0;
  w.body.pitch = 0.2;
  w.body.energy = 1;
  w.step(intent({ forward: 1, burst: true, rise: true, burstPressed: true }));
  expect(fallsView(w)!.leapT).not.toBeNull();
  for (let i = 0; i < 2 * SEC && fallsView(w)!.leapT !== null; i++) w.step(intent());
  return fallsView(w)!.passed;
}

describe('falls and rapids', () => {
  it('the rock step cannot be swum up, from either side', () => {
    const w = atFalls({ x: FACE - 2, y: -2.5 });
    run(w, 6 * SEC, (ww) => steerTo(ww, FACE + 10, fallsView(ww)!.notchZ, { burst: ww.body.energy > 0.3 }));
    expect(w.body.pos.x).toBeLessThan(FACE);
    expect(fallsView(w)!.passed).toBe(false);
    const above = atFalls({ x: LIP_END + 2, y: -1.5 });
    run(above, 4 * SEC, (ww) => steerTo(ww, FACE - 10, ww.body.pos.z));
    expect(above.body.pos.x).toBeGreaterThan(LIP_END);
  });

  it('the rapids run fast, with slack water behind each boulder', () => {
    const w = atFalls();
    const v = fallsView(w)!;
    const L = returnLayout(w)!;
    const rock = v.rocks[2]!;
    // Open water in the rapids, averaged over the shifting lanes, against the pool below them.
    let open = 0;
    let n = 0;
    for (let i = 0; i < 400; i++) {
      w.stageTime = i * 0.37;
      const x = RAPIDS_START + 1 + (i % 11);
      const zc = -6 + ((i * 7) % 13);
      if (eddyFactor(w, x, zc) < 1) continue;
      open += Math.abs(currentAt(w, { x, y: -1.5, z: L.homeMouth + zc }).x);
      n++;
    }
    open /= n;
    const behind = Math.abs(currentAt(w, { x: rock.x - rock.r - 0.4, y: -1.5, z: rock.z }).x);
    const pool = Math.abs(currentAt(w, { x: 128, y: -1.5, z: L.homeMouth }).x);
    expect(open).toBeGreaterThan(pool * 1.3);
    expect(behind).toBeLessThan(open * 0.4);
    expect(eddyFactor(w, rock.x - rock.r - 0.4, rock.z - L.homeMouth)).toBeLessThan(0.4);
  });

  it('a fast leap from the standing wave under the low step clears; slow, far or too close does not', () => {
    const v = fallsView(atFalls())!;
    expect(leapFrom(atFalls(), v.waveX, 0, 8.5)).toBe(true);
    // Too slow: barely moving.
    expect(leapFrom(atFalls(), v.waveX, 0, 2)).toBe(false);
    // Into the falling water at the face.
    expect(leapFrom(atFalls(), FACE - 0.4, 0, 8.5)).toBe(false);
  });

  it('a failed leap costs energy and fat and drops the fish back into the pool', () => {
    const w = atFalls();
    const v = fallsView(w)!;
    const fat = w.progress.fat;
    expect(leapFrom(w, v.waveX, 0, 2)).toBe(false);
    expect(w.body.pos.x).toBeLessThan(FACE - 1);
    expect(w.body.pos.x).toBeGreaterThan(POOL_START);
    expect(w.body.energy).toBeLessThan(1 - w.p.get('return.leapEnergy'));
    expect(w.progress.fat).toBeLessThan(fat - w.p.get('return.leapFailFat') * 0.9);
    expect(fallsView(w)!.failures).toBe(1);
    // The miss says why.
    expect(fallsView(w)!.lastMiss).toBe('slow');
    expect(w.events.some((e) => e.key === 'return.leapMiss.slow')).toBe(true);
  });

  it('a miss costs half what it used to: energy and fat', () => {
    const p = atFalls().p;
    expect(p.get('return.leapEnergy') + p.get('return.leapFailEnergy')).toBeCloseTo(0.16, 5);
    expect(p.get('return.leapFailFat')).toBeCloseTo(0.01, 5);
  });

  it('the spot matters: on Wild, full speed away from the low step and the wave clears at most half the time; the best spot always does', () => {
    const tries = (dz: number, dx: number) =>
      Array.from({ length: 12 }, (_, i) => {
        const w = atFalls({ difficulty: 'wild', seed: 100 + i });
        return leapFrom(w, fallsView(w)!.waveX + dx, dz, 8.5);
      }).filter(Boolean).length;
    expect(tries(0, 0)).toBe(12);
    expect(tries(5, -1.5)).toBeLessThanOrEqual(6);
  });

  it('Field guide forgives a leap that Wild does not', () => {
    const score = (difficulty: Difficulty) =>
      Array.from({ length: 16 }, (_, i) => {
        const w = atFalls({ difficulty, seed: 200 + i });
        return leapFrom(w, fallsView(w)!.waveX - 1, 3.5, 7);
      }).filter(Boolean).length;
    expect(score('fieldGuide')).toBeGreaterThan(score('wild'));
  });

  it('after a few failures (2 Field guide, 3 Wild) the side channel opens: it passes the falls, at a cost in fat', () => {
    for (const difficulty of ['fieldGuide', 'wild'] as const) {
      const w = atFalls({ difficulty });
      const need = Math.round(w.p.get('return.fallsSideAfter'));
      expect(need).toBe(difficulty === 'wild' ? 3 : 2);
      for (let i = 0; i < need; i++) {
        expect(fallsView(w)!.sideOpen).toBe(false);
        // Slow, far from the spot: a sure miss even with Field guide's help on later tries.
        leapFrom(w, fallsView(w)!.waveX - 1.7, 5, 1.2);
      }
      const v = fallsView(w)!;
      expect(v.failures).toBe(need);
      expect(v.sideOpen).toBe(true);
      expect(w.events.some((e) => e.key === 'return.sideChannel')).toBe(true);
      const cz = (v.chute[0] + v.chute[1]) / 2;
      w.body.pos = { x: FACE - 2.5, y: -1.5, z: cz };
      w.body.energy = 1;
      const fat = w.progress.fat;
      for (let i = 0; i < 12 * SEC && !fallsView(w)!.passed; i++) w.step(steer3(w, w.body.pos.x + 6, -1.2, cz, { burst: w.body.energy > 0.4 }));
      expect(fallsView(w)!.passed, difficulty).toBe(true);
      expect(w.body.pos.x).toBeGreaterThan(LIP_END);
      expect(w.progress.fat).toBeLessThan(fat - w.p.get('return.chuteFatCost') * 0.9);
      expect(w.events.some((e) => e.key === 'return.chuteUp')).toBe(true);
    }
  });

  it('a careful fish gets from the pools below the rapids over the falls in well under half a minute', () => {
    for (const difficulty of ['fieldGuide', 'wild'] as const) {
      for (const seed of [3, 4, 5]) {
        const w = atFalls({ difficulty, seed });
        for (let i = 0; i < 40 * SEC && !fallsView(w)!.passed; i++) {
          clearThreats(w);
          w.step(fallsPilot(w) ?? steerTo(w, w.body.pos.x + 10, returnLayout(w)!.homeMouth));
        }
        expect(fallsView(w)!.passed, `${difficulty}/${seed}`).toBe(true);
        expect(w.stageTime, `${difficulty}/${seed}`).toBeLessThan(25);
        // The pilot records each try and why it missed; it clears within three.
        const tries = fallsPilotTries(w);
        expect(tries.length, `${difficulty}/${seed}`).toBeGreaterThan(0);
        expect(tries.length, `${difficulty}/${seed} ${JSON.stringify(tries)}`).toBeLessThanOrEqual(3);
        expect(tries.at(-1)!.result).toBe('clear');
        for (const t of tries.slice(0, -1)) expect(['slow', 'deep', 'close', 'spot', 'nearly']).toContain(t.result);
      }
    }
  });

  it('passing the falls is a checkpoint: a sibling resumes above them', () => {
    const w = atFalls();
    expect(leapFrom(w, fallsView(w)!.waveX, 0, 8.5)).toBe(true);
    expect(w.checkpoint.marker).toBe(2);
    w.die('bear');
    w.continueWithSibling('Sib');
    expect(w.stageId).toBe('return');
    expect(w.body.pos.x).toBeGreaterThan(LIP_END);
    expect(fallsView(w)!.passed).toBe(true);
  });

  it('the bear nearest the falls waits at the lip', () => {
    const { w } = newWorld({ startStage: 4, seed: 9 });
    const bears = w.live('bear');
    expect(bears.some((b) => Math.abs(b.pos.x - (FACE + 0.5)) < 0.01)).toBe(true);
    expect(bears.some((b) => b.pos.x > RAPIDS_START && b.pos.x < POOL_START)).toBe(false);
  });
});

describe('fellow migrants', () => {
  it('a school joins the fish in the home river and travels upstream with it', () => {
    const { w } = newWorld({ startStage: 4, seed: 21 });
    const L = returnLayout(w)!;
    expect(w.live('migrant')).toHaveLength(0);
    w.body.pos = { x: L.coast + 4, y: -2, z: L.homeMouth };
    w.step(intent());
    const n = Math.round(w.p.get('return.migrants'));
    expect(w.live('migrant')).toHaveLength(n);
    expect(w.events.some((e) => e.key === 'return.migrants')).toBe(true);
    run(w, 6 * SEC, (ww) => {
      clearThreats(ww);
      return steerTo(ww, ww.body.pos.x + 10, L.homeMouth);
    });
    const school = w.live('migrant');
    const meanX = school.reduce((s, m) => s + m.pos.x, 0) / school.length;
    expect(meanX).toBeGreaterThan(L.coast + 12);
    expect(Math.abs(meanX - w.body.pos.x)).toBeLessThan(10);
    for (const m of school) expect(Math.abs(m.pos.z - L.homeMouth)).toBeLessThan(L.riverHalf);
  });

  it('migrants try the falls: some fail and drop back, some get over', () => {
    const w = atFalls({ seed: 31 });
    w.body.pos = { x: returnLayout(w)!.coast + 4, y: -2, z: returnLayout(w)!.homeMouth };
    w.step(intent());
    // The player goes up and waits above the falls; the school catches up and tries.
    w.body.pos = { x: LIP_END + 3, y: -1.5, z: returnLayout(w)!.homeMouth };
    for (const m of w.live('migrant')) m.pos = { x: FACE - 2.5 - (m.id % 3), y: -1.2, z: m.pos.z };
    run(w, 30 * SEC, () => intent({ hold: true }));
    const v = migrantView(w)!;
    expect(v.leaps).toBeGreaterThan(v.over);
    expect(v.over).toBeGreaterThan(0);
    expect(w.live('migrant').some((m) => m.pos.x > LIP_END)).toBe(true);
  });

  it('a bear among migrants often takes one of them instead of the player', () => {
    const trial = (crowd: boolean, seed: number) => {
      const { w } = newWorld({ startStage: 4, seed });
      const L = returnLayout(w)!;
      w.body.pos = { x: L.coast + 4, y: -2, z: L.homeMouth };
      w.step(intent());
      for (const l of w.live('lure')) l.alive = false;
      const bear = w.live('bear')[0]!;
      for (const b of w.live('bear')) if (b !== bear) b.alive = false;
      w.body.pos = { x: bear.pos.x - 2, y: -0.8, z: L.homeMouth };
      w.body.vel = { x: 0, y: 0, z: 0 };
      for (const m of w.live('migrant')) {
        if (crowd) m.pos = { x: bear.pos.x - 2 + ((m.id % 5) - 2) * 0.4, y: -0.8, z: L.homeMouth + ((m.id % 3) - 1) * 0.5 };
        else m.alive = false;
      }
      const lost = () => migrantView(w)!.lost;
      run(w, 3 * SEC, () => intent({ hold: true }));
      return { dead: w.status === 'dead', lost: lost() };
    };
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const alone = seeds.map((s) => trial(false, s));
    const crowd = seeds.map((s) => trial(true, s));
    const rate = (r: { dead: boolean }[]) => r.filter((x) => x.dead).length / r.length;
    expect(rate(alone)).toBeGreaterThan(0.8);
    expect(rate(crowd)).toBeLessThan(rate(alone) * 0.6);
    expect(crowd.some((r) => r.lost > 0)).toBe(true);
  });

  it('fallsState is only there on the return', () => {
    const { w } = newWorld({ startStage: 3 });
    expect(fallsState(w)).toBeNull();
    expect(migrantView(w)).toBeNull();
  });
});

/** Hold keys the way a player reads the on-screen instruction, at the plunge pool. */
function playPool(w: World, keys: (w: World, t: number) => Partial<Intent>, secs = 5): { leapt: boolean; passed: boolean } {
  let leapt = false;
  let prevBurst = false;
  for (let i = 0; i < secs * SEC && !fallsView(w)!.passed; i++) {
    clearThreats(w);
    const k = keys(w, i / SEC);
    const burst = !!k.burst;
    w.step(intent({ ...k, burstPressed: burst && !prevBurst }));
    prevBurst = burst;
    if (fallsView(w)!.leapT !== null) leapt = true;
  }
  return { leapt, passed: fallsView(w)!.passed };
}

describe('the leap as the instruction says (playtest bug hunt)', () => {
  const nz = (w: World) => fallsView(w)!.notchZ;

  it('the old bug: a fish that reaches the falling water and then bursts and rises no longer presses at the surface in silence', () => {
    // The playtest: swim (W) to the falls, then burst and rise together (Shift, Space) with the nose at the face.
    // Before the fix the rock step zeroed the fish's speed every step, so no leap could ever start there.
    // Pressed as it arrives, the run-up still counts: a leap, and a miss names the falling water.
    const w = atFalls({ x: POOL_START + 0.5, y: -1 });
    w.body.pos.z = nz(w);
    let arrived = -1;
    const r = playPool(w, (ww, t) => {
      if (arrived < 0 && ww.body.pos.x > FACE - 0.45) arrived = t;
      const go = arrived >= 0;
      return { ...steerTo(ww, FACE + 5, nz(ww)), burst: go, rise: go };
    });
    expect(r.leapt).toBe(true);
    expect(w.events.find((e) => e.type === 'leap')?.key).toBe('close');
    expect(w.events.some((e) => e.key === 'return.leapMiss.close')).toBe(true);
    // Pressed long after it stopped there: no leap, but the caption says to drop back and build speed.
    const late = atFalls({ x: POOL_START + 0.5, y: -1 });
    late.body.pos.z = nz(late);
    let since = -1;
    playPool(late, (ww, t) => {
      if (since < 0 && ww.body.pos.x > FACE - 0.45) since = t;
      const go = since >= 0 && t > since + 1.5;
      return { ...steerTo(ww, FACE + 5, nz(ww)), burst: go, rise: go };
    }, 6);
    expect(late.events.some((e) => e.key === 'return.noLeap.slow')).toBe(true);
  });

  it('one input: swim at the falls high in the water and burst at the white water; it clears on Field guide', () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = atFalls({ x: POOL_START + 0.5, y: -1.2, seed });
      w.body.pos.z = nz(w);
      const r = playPool(w, (ww) => ({ ...steerTo(ww, FACE + 5, nz(ww)), burst: ww.body.pos.x > fallsView(ww)!.waveX - 0.4 }));
      expect(r.leapt, `seed ${seed}`).toBe(true);
      expect(r.passed, `seed ${seed}`).toBe(true);
    }
  });

  it('burst held through the whole run-up, without rise, leaps at the standing wave', () => {
    const w = atFalls({ x: POOL_START + 0.5, y: -1.8 });
    w.body.pos.z = nz(w);
    let at = 0;
    for (let i = 0; i < 4 * SEC && fallsView(w)!.leapT === null; i++) {
      w.step({ ...steerTo(w, FACE + 5, nz(w)), burst: true, burstPressed: i === 0 });
      at = w.body.pos.x;
    }
    expect(fallsView(w)!.leapT).not.toBeNull();
    expect(Math.abs(at - fallsView(w)!.waveX)).toBeLessThan(0.8);
  });

  it('a burst below the white water builds speed and does not leap yet', () => {
    const w = atFalls({ x: POOL_START + 0.3, y: -1 });
    w.body.pos.z = nz(w);
    w.step({ ...steerTo(w, FACE + 5, nz(w)), burst: true, burstPressed: true });
    for (let i = 0; i < 20; i++) w.step({ ...steerTo(w, FACE + 5, nz(w)), burst: true });
    expect(fallsView(w)!.leapT).toBeNull();
    expect(w.body.vel.x).toBeGreaterThan(4);
  });

  it('a burst that starts no leap says why: too deep, too slow, facing away', () => {
    const deep = atFalls({ x: FACE - 2, y: -4.2 });
    deep.step(intent({ forward: 1, burst: true, burstPressed: true }));
    expect(fallsView(deep)!.leapT).toBeNull();
    expect(deep.events.some((e) => e.key === 'return.noLeap.deep')).toBe(true);
    const still = atFalls({ x: FACE - 2, y: -1 });
    still.body.vel = { x: 0, y: 0, z: 0 };
    still.step(intent({ burst: true, burstPressed: true }));
    expect(still.events.some((e) => e.key === 'return.noLeap.slow')).toBe(true);
    const away = atFalls({ x: FACE - 2, y: -1 });
    away.body.yaw = Math.PI;
    away.body.vel = { x: -3, y: 0, z: 0 };
    away.step(intent({ forward: 1, burst: true, burstPressed: true }));
    expect(away.events.some((e) => e.key === 'return.noLeap.heading')).toBe(true);
  });

  it('each miss names its reason', () => {
    const miss = (x: number, dz: number, speed: number, y = -0.6, difficulty: Difficulty = 'wild') => {
      const w = atFalls({ difficulty });
      const v = fallsView(w)!;
      w.body.pos = { x, y, z: v.notchZ + dz };
      w.body.vel = { x: speed, y: 0, z: 0 };
      w.body.yaw = 0;
      w.body.energy = 1;
      w.step(intent({ forward: 1, burst: true, burstPressed: true }));
      for (let i = 0; i < 2 * SEC && fallsView(w)!.leapT !== null; i++) w.step(intent());
      return fallsView(w)!;
    };
    const v0 = fallsView(atFalls())!;
    expect(miss(v0.waveX, 0, 2).lastMiss).toBe('slow');
    expect(miss(FACE - 0.3, 0, 8).lastMiss).toBe('close');
    expect(miss(v0.waveX - 1.75, 5, 7.5).lastMiss).toBe('spot');
    expect(miss(v0.waveX, 0, 5.5, -3.1).lastMiss).toBe('deep');
  });

  it('Field guide helps from the second try; Wild does not', () => {
    const tries = (difficulty: Difficulty, before: number) =>
      Array.from({ length: 12 }, (_, i) => {
        const w = atFalls({ difficulty, seed: 300 + i });
        fallsState(w)!.leaps = before;
        return leapFrom(w, fallsView(w)!.waveX - 1.5, 3, 6);
      }).filter(Boolean).length;
    expect(tries('fieldGuide', 1)).toBe(12);
    expect(tries('fieldGuide', 0)).toBeLessThan(9);
    expect(tries('wild', 1)).toBe(0);
  });

  it('resting deep in the plunge pool recovers energy faster than in open water', () => {
    const gain = (x: number, y: number) => {
      const w = atFalls({ x, y });
      w.body.energy = 0.3;
      run(w, 2 * SEC, () => intent({ hold: true }));
      return w.body.energy - 0.3;
    };
    expect(gain(FACE - 3, -3.5)).toBeGreaterThan(gain(120, -1.5) * 1.4);
  });

  it('on Field guide the bear on the lip leaves the player alone for the first two tries; on Wild it warns longer', () => {
    const w = atFalls({ x: FACE - 2, y: -0.8 });
    const lip = () => newWorld({ startStage: 4, seed: 7 }).w;
    void lip;
    const { w: fg } = newWorld({ startStage: 4, seed: 7 });
    const bear = fg.live('bear').find((b) => Math.abs(b.pos.x - (FACE + 0.5)) < 0.01)!;
    const L = returnLayout(fg)!;
    fg.body.pos = { x: FACE - 2, y: -0.8, z: L.homeMouth };
    for (const b of fg.live('bear')) if (b !== bear) b.alive = false;
    run(fg, 3 * SEC, () => intent({ hold: true }));
    expect(bear.state).toBe('idle');
    fallsState(fg)!.leaps = 2;
    run(fg, 1, () => intent({ hold: true }));
    expect(bear.state).toBe('warn');
    expect(fg.events.some((e) => e.key === 'return.lipBear')).toBe(true);
    const { w: wild } = newWorld({ startStage: 4, seed: 7, difficulty: 'wild' });
    expect(wild.p.get('return.lipBearWarning')).toBeGreaterThan(fg.p.get('return.lipBearWarning'));
    const wb = wild.live('bear').find((b) => Math.abs(b.pos.x - (FACE + 0.5)) < 0.01)!;
    wild.body.pos = { x: FACE - 2, y: -0.8, z: returnLayout(wild)!.homeMouth };
    run(wild, 1, () => intent({ hold: true }));
    expect(wb.state).toBe('warn');
    expect(wb.timer).toBeGreaterThan(wild.p.get('return.bearWarning') * 1.3);
    void w;
  });
});

describe('the practice ledge in the rapids', () => {
  it('cannot be swum over, but a hop over it works and says so', () => {
    const w = atFalls({ x: 136, y: -1.2 });
    const v = fallsView(w)!;
    const z = (v.practiceZ[0] + v.practiceZ[1]) / 2;
    w.body.pos = { x: v.practiceX[0] - 2.6, y: -1.4, z };
    // Swimming at it deep, without bursting: stopped.
    run(w, 3 * SEC, (ww) => steerTo(ww, v.practiceX[1] + 5, z, { dive: true }));
    expect(w.body.pos.x).toBeLessThan(v.practiceX[0]);
    expect(fallsView(w)!.practiced).toBe(false);
    // Back off, then run at it high in the water and burst close to it.
    w.body.pos = { x: v.practiceX[0] - 2.8, y: -0.8, z };
    w.body.vel = { x: 0, y: 0, z: 0 };
    w.body.energy = 1;
    const r = playPool(w, (ww) => ({ ...steerTo(ww, v.practiceX[1] + 5, z), burst: ww.body.pos.x > v.practiceX[0] - 1.1 }), 3);
    expect(r.leapt).toBe(true);
    expect(fallsView(w)!.practiced).toBe(true);
    expect(w.body.pos.x).toBeGreaterThan(v.practiceX[1]);
    expect(w.events.some((e) => e.key === 'return.practiceLeap')).toBe(true);
    // A practice hop is not a try at the falls.
    expect(fallsView(w)!.leaps).toBe(0);
  });
});
