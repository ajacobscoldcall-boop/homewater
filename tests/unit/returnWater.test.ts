/** Water temperature and oxygen on the return (src/sim/stages/returnWater.ts). */
import { describe, expect, it } from 'vitest';
import { returnLayout, trackZ } from '../../src/sim/stages/return';
import { heatStress, isRefuge, returnWaterView, riverWarmth, seeps, waterAt, waterEffects } from '../../src/sim/stages/returnWater';
import type { Difficulty } from '../../src/sim/params';
import type { YearConditions } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { fallsPilot, intent, lakePilot, newWorld, run, steerTo } from './helpers';
import { fallsView } from '../../src/sim/stages/falls';

const SEC = 60;
const ORDINARY: YearConditions = { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 };
const HOT: YearConditions = { flow: 0.75, temperature: 1.25, oceanCrowding: 1, runSize: 1 };

function returnWorld(cond: YearConditions, opts: { seed?: number; difficulty?: Difficulty } = {}) {
  const { w } = newWorld({ seed: opts.seed ?? 7, ...(opts.difficulty ? { difficulty: opts.difficulty } : {}) });
  Object.assign(w.conditions, cond);
  w.fish.z.runTiming = 0;
  w.debugJumpTo(4);
  w.progress.adultSize = 0.4; // slips the nets, so the tests measure the water
  return w;
}

const at = (x: number, y: number, z: number) => ({ x, y, z });

/** Same as the world test's navigator: track, nets, home mouth, home branch. */
function navigator(ww: World, over = {}) {
  const L = returnLayout(ww);
  if (!L) return intent();
  // The falls and rapids (falls.ts) need their own pilot, as in the world test.
  const falls = fallsPilot(ww) ?? lakePilot(ww);
  if (falls) return falls;
  const x = ww.body.pos.x;
  const nextGap = ww
    .live('netGap')
    .filter((g) => g.pos.x > x - 0.5)
    .sort((a, b) => a.pos.x - b.pos.x || Math.abs(a.pos.z - ww.body.pos.z) - Math.abs(b.pos.z - ww.body.pos.z))[0];
  if (nextGap && nextGap.pos.x - x < 14) return steerTo(ww, nextGap.pos.x + 3, nextGap.pos.z, over);
  if (x < L.coast - 6) return steerTo(ww, x + 10, trackZ(ww, x + 10), over);
  if (x < L.coast + 4) return steerTo(ww, L.coast + 8, L.homeMouth, over);
  const tz = x > L.fork - 12 ? L.homeMouth + L.homeSide * 4 : L.homeMouth;
  return steerTo(ww, x + 10, tz, over);
}

function clearThreats(ww: World) {
  for (const b of ww.live('bear')) b.alive = false;
  for (const l of ww.live('lure')) l.alive = false;
}

describe('return water field', () => {
  it('an ordinary year is cool and well oxygenated everywhere, with no warm pattern', () => {
    const w = returnWorld(ORDINARY);
    const L = returnLayout(w)!;
    expect(riverWarmth(w)).toBe(0);
    for (let x = L.coast + 2; x < 240; x += 3) {
      const r = waterAt(w, at(x, -1, L.homeMouth));
      const e = waterEffects(w, r);
      expect(r.temp).toBeLessThan(w.p.get('return.water.comfortTemp'));
      expect(e.fatFactor).toBe(1);
      expect(e.regenFactor).toBe(1);
      expect(e.burstFactor).toBe(1);
      expect(e.heat).toBe(0);
      expect(isRefuge(w, r)).toBe(false);
    }
  });

  it('in a hot, low-water year: riffles and the lower river warm, pools and seeps cool, the afternoon warms', () => {
    const w = returnWorld(HOT);
    const L = returnLayout(w)!;
    expect(riverWarmth(w)).toBeGreaterThan(0.9);
    // Find the shallowest and deepest spots along the centre line.
    let riffle = L.coast + 10;
    let pool = L.coast + 10;
    // The riffles and pools below the rapids (the falls reshape the bed above them).
    const below = (fallsView(w)?.rapidsStart ?? L.fork) - 4;
    for (let x = L.coast + 10; x < below; x += 0.5) {
      if (w.arena.floor(x, L.homeMouth) > w.arena.floor(riffle, L.homeMouth)) riffle = x;
      if (w.arena.floor(x, L.homeMouth) < w.arena.floor(pool, L.homeMouth)) pool = x;
    }
    const tRiffle = waterAt(w, at(riffle, -0.8, L.homeMouth));
    const tPool = waterAt(w, at(pool, w.arena.floor(pool, L.homeMouth) + 0.3, L.homeMouth));
    expect(tRiffle.temp).toBeGreaterThan(tPool.temp + 3);
    expect(tRiffle.oxygen).toBeLessThan(tPool.oxygen);
    expect(tRiffle.temp).toBeGreaterThan(w.p.get('return.water.stressTemp'));
    // The same riffle shape one period upstream is cooler: the lower river runs warmer.
    let riffle2 = riffle + 20;
    for (let x = riffle + 20; x < riffle + 50; x += 0.5) if (w.arena.floor(x, L.homeMouth) > w.arena.floor(riffle2, L.homeMouth)) riffle2 = x;
    expect(waterAt(w, at(riffle2, -0.8, L.homeMouth)).temp).toBeLessThan(tRiffle.temp);
    // Seeps: cold whatever the year.
    const sp = seeps(w);
    expect(sp.length).toBeGreaterThanOrEqual(2);
    for (const s of sp) {
      const r = waterAt(w, at(s.x, w.arena.floor(s.x, s.z) + 0.3, s.z));
      expect(r.temp).toBeLessThan(w.p.get('return.water.comfortTemp'));
      expect(isRefuge(w, r)).toBe(true);
      expect(r.seep).toBeGreaterThan(0.9);
    }
    // Afternoon is warmer than dawn.
    const dawn = waterAt(w, at(riffle, -0.8, L.homeMouth)).temp;
    w.stageTime = w.p.get('return.water.dayLength') / 2;
    expect(waterAt(w, at(riffle, -0.8, L.homeMouth)).temp).toBeGreaterThan(dawn + 1.5);
  });

  it('warm water burns fat faster, slows recovery and low oxygen weakens the burst', () => {
    const w = returnWorld(HOT);
    const cool = waterEffects(w, { temp: 12, oxygen: 10.5, warmth: 1, seep: 0 });
    const hot = waterEffects(w, { temp: 23, oxygen: 7, warmth: 1, seep: 0 });
    expect(hot.fatFactor).toBeGreaterThan(cool.fatFactor);
    expect(hot.regenFactor).toBeLessThan(cool.regenFactor);
    expect(hot.burstFactor).toBeLessThan(1);
    expect(cool.burstFactor).toBe(1);
    expect(hot.heat).toBeGreaterThan(0);
  });

  it('seeps are found from the layout, in pools of the home river', () => {
    const w = returnWorld(HOT, { seed: 3 });
    const L = returnLayout(w)!;
    for (const s of seeps(w)) {
      expect(s.x).toBeGreaterThan(L.coast);
      expect(Math.abs(s.z - L.homeMouth)).toBeLessThan(L.riverHalf);
      if (s.x > L.fork) expect(Math.sign(s.z - L.homeMouth)).toBe(L.homeSide);
    }
  });
});

describe('heat stress', () => {
  it('builds in hot shallows and kills, with its own death cause', () => {
    const w = returnWorld(HOT);
    const L = returnLayout(w)!;
    let riffle = L.coast + 10;
    const below = (fallsView(w)?.rapidsStart ?? L.fork) - 4;
    for (let x = L.coast + 10; x < below; x += 0.5) if (w.arena.floor(x, L.homeMouth) > w.arena.floor(riffle, L.homeMouth)) riffle = x;
    run(w, 400 * SEC, (ww) => {
      clearThreats(ww);
      ww.body.pos = at(riffle, -0.6, L.homeMouth);
      ww.progress.fat = 1;
      return intent({ forward: 0.2 });
    });
    expect(w.status).toBe('dead');
    expect(w.deathCause).toBe('heat');
    expect(w.events.some((e) => e.key === 'return.heatStress')).toBe(true);
  });

  it('eases while resting in a cool seep, and the first refuge gets a caption', () => {
    const w = returnWorld(HOT);
    const s = seeps(w)[0]!;
    (w.stage as { heatStress?: number }).heatStress = 0.6;
    run(w, 40 * SEC, (ww) => {
      clearThreats(ww);
      ww.body.pos = at(s.x, ww.arena.floor(s.x, s.z) + 0.4, s.z);
      return intent({ hold: true });
    });
    expect(w.status).toBe('playing');
    expect(heatStress(w)).toBeLessThan(0.3);
    expect(w.events.some((e) => e.key === 'return.coolSeep')).toBe(true);
    expect(returnWaterView(w)?.feel).toBe(-1);
  });

  it('an ordinary year never builds heat stress', () => {
    const w = returnWorld(ORDINARY);
    let worst = 0;
    run(w, 120 * SEC, (ww) => {
      clearThreats(ww);
      worst = Math.max(worst, heatStress(ww));
      return navigator(ww);
    });
    expect(w.status).toBe('stageComplete');
    expect(worst).toBe(0);
  });

  it('in an extreme year on Wild, pushing straight through kills; resting at the seeps gets home with less fat', () => {
    const EXTREME: YearConditions = { flow: 0.65, temperature: 1.35, oceanCrowding: 1, runSize: 1 };
    for (const seed of [1, 2, 3]) {
      const outcome = (rest: boolean) => {
        const w = returnWorld(EXTREME, { seed, difficulty: 'wild' });
        let resting: number | null = null;
        const used = new Set<number>();
        run(w, 300 * SEC, (ww) => {
          clearThreats(ww);
          if (rest) {
            const sp = seeps(ww).find((q) => !used.has(q.x) && Math.abs(q.x - ww.body.pos.x) < 14 && q.x > ww.body.pos.x - 4);
            if (resting === null && sp && heatStress(ww) > 0.2) resting = sp.x;
            if (resting !== null && heatStress(ww) < 0.12) {
              used.add(resting);
              resting = null;
            }
            const rs = seeps(ww).find((q) => q.x === resting);
            if (rs) return Math.hypot(rs.x - ww.body.pos.x, rs.z - ww.body.pos.z) > 1.2 ? steerTo(ww, rs.x, rs.z) : intent({ hold: true, dive: true });
          }
          return navigator(ww);
        });
        return { status: w.status, cause: w.deathCause, fat: w.progress.fat };
      };
      const push = outcome(false);
      const wait = outcome(true);
      expect(push.cause, `seed ${seed}`).toBe('heat');
      expect(wait.status, `seed ${seed}: ${wait.cause} fat ${wait.fat.toFixed(2)}`).toBe('stageComplete');
      expect(wait.fat).toBeLessThan(0.5);
    }
  });
});
