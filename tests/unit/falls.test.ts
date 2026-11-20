import { describe, expect, it } from 'vitest';
import { currentAt } from '../../src/sim/swim';
import { eddyFactor, FACE, fallsState, fallsView, LIP_END, POOL_START, RAPIDS_START } from '../../src/sim/stages/falls';
import { migrantView } from '../../src/sim/stages/migrants';
import { returnLayout } from '../../src/sim/stages/return';
import type { Difficulty } from '../../src/sim/params';
import type { World } from '../../src/sim/world';
import { fallsPilot, intent, newWorld, run, steer3, steerTo } from './helpers';


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
  w.step(intent({ forward: 1, burst: true, rise: true }));
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
    expect(w.events.some((e) => e.key === 'return.leapFail')).toBe(true);
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

  it('after several failures a side channel opens: it passes the falls, at a cost in fat', () => {
    for (const difficulty of ['fieldGuide', 'wild'] as const) {
      const w = atFalls({ difficulty });
      const need = Math.round(w.p.get('return.fallsSideAfter'));
      for (let i = 0; i < need; i++) {
        expect(fallsView(w)!.sideOpen).toBe(false);
        leapFrom(w, fallsView(w)!.waveX, 0, 1.5);
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
