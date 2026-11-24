import { describe, expect, it } from 'vitest';
import { freshwaterScore, fryView, lakeGrowth } from '../../src/sim/stages/fry';
import { crowdedYear, decideMaturation, oceanView } from '../../src/sim/stages/ocean';
import type { Entity, Intent } from '../../src/sim/types';
import { dist } from '../../src/sim/vec';
import type { World } from '../../src/sim/world';
import { intent, newWorld, params, run, steerTo } from './helpers';

const SEC = 60;

/** Steer toward a point in 3D: yaw with the keyboard, depth with rise/dive. */
function swimTo(w: World, x: number, y: number, z: number, over: Partial<Intent> = {}): Intent {
  const dy = y - w.body.pos.y;
  return steerTo(w, x, z, { rise: dy > 0.4, dive: dy < -0.4, ...over });
}

function nearest(w: World, list: Entity[], score: (e: Entity) => number = (e) => dist(e.pos, w.body.pos)): Entity | null {
  let best: Entity | null = null;
  let bs = Infinity;
  for (const e of list) {
    const s = score(e);
    if (s < bs) {
      bs = s;
      best = e;
    }
  }
  return best;
}

/**
 * A sensible fry: feed, read the warnings, run for the weeds from a char, dive deep from a merganser,
 * keep deep by day and feed up high at dusk and dawn (cycle), rest in winter.
 * Without `cycle` it ignores the time of day and feeds wherever the food is.
 */
const fryBot =
  (choice: 'leave' | 'stay' = 'leave', cycle = true) =>
  (w: World): Intent => {
    const v = fryView(w);
    if (!v || v.phase === 'skip') return intent();
    const fish = w.body.pos;
    if (v.phase === 'decide') {
      if (choice === 'leave') return swimTo(w, 29, -3, 0);
      return fish.x > v.weedEdge - 4 ? swimTo(w, v.weedEdge - 6, -2, fish.z) : intent();
    }
    const bird = w.live('merganser').find((m) => m.state === 'warn' || m.state === 'dive' || m.state === 'chase');
    if (bird && v.birdReach) return swimTo(w, Math.max(fish.x, v.weedEdge + 5), -9.5, fish.z, { burst: bird.state === 'chase' && w.body.energy > 0.15 });
    const threat = w.live('trout').find((t) => t.state === 'warn' || t.state === 'chase' || dist(t.pos, fish) < 7);
    if (threat) {
      if (v.inWeeds && fish.x < v.weedEdge - 2) return intent();
      const close = dist(threat.pos, fish) < 9;
      return swimTo(w, v.weedEdge - 5, -4.5, fish.z, { burst: threat.state === 'chase' && close && w.body.energy > 0.15 });
    }
    const food = w.live('plankton');
    if (v.phase === 'winter') {
      const f = nearest(w, food);
      if (f && dist(f.pos, fish) < 9 && w.body.energy > 0.12) return swimTo(w, f.pos.x, f.pos.y, f.pos.z, { forward: 0.7 });
      return intent();
    }
    if (cycle && (v.tod === 'day' || v.tod === 'night')) {
      // Deep and dark: take only food that is down here and close.
      const f = nearest(w, food.filter((e) => e.pos.y < -4.5 && e.pos.x > v.weedEdge + 1));
      if (f && dist(f.pos, fish) < 6) return swimTo(w, f.pos.x, f.pos.y, f.pos.z, { forward: 0.6 });
      const hold = { x: Math.max(fish.x, v.weedEdge + 6), y: -8.5, z: fish.z };
      return Math.abs(fish.y - hold.y) > 0.6 || fish.x < hold.x - 0.5 ? swimTo(w, hold.x, hold.y, hold.z, { forward: 0.5 }) : intent();
    }
    // Prefer rich plankton, but not far from the weeds.
    const f = nearest(w, food, (e) => dist(e.pos, fish) - (e.value === 1 ? 6 : 0) + Math.max(0, e.pos.x - 12) * 0.5);
    if (!f) return intent();
    return swimTo(w, f.pos.x, f.pos.y, f.pos.z);
  };

const captionsOf = (w: World): string[] => w.events.filter((e) => e.type === 'caption' || e.type === 'reveal').map((e) => e.key ?? '');

describe('fry in the lake', () => {
  it('a sensible fry gets through every moment and leaves after one year (Field guide)', () => {
    const times: number[] = [];
    let done = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { w } = newWorld({ startStage: 1, seed });
      const phases = new Set<string>();
      let steps = 0;
      run(w, 300 * SEC, (ww) => {
        steps++;
        const v = fryView(ww);
        if (v) phases.add(v.phase);
        return fryBot('leave')(ww);
      });
      // Predators are real: a sensible fry usually, not always, gets through.
      if (w.status !== 'stageComplete') continue;
      done++;
      for (const ph of ['lesson', 'summer', 'winter', 'decide', 'skip']) expect(phases.has(ph), ph).toBe(true);
      const caps = captionsOf(w);
      for (const id of ['fry.lesson', 'fry.summer', 'fry.day', 'fry.dusk', 'fry.night', 'fry.dawn', 'fry.winter', 'fry.winterHint', 'fry.iceOut', 'fry.decide', 'fry.leave']) expect(caps, id).toContain(id);
      expect(w.progress.fryBites).toBeGreaterThan(0);
      times.push(steps / SEC);
    }
    expect(done).toBeGreaterThanOrEqual(6);
    console.log(`fry (later life) seconds: ${times.map((t) => t.toFixed(0)).join(', ')}`);
    for (const t of times) expect(t).toBeLessThan(150);
  });

  it('the first life lasts about two and a half to three minutes', () => {
    // The first seed whose fry gets through (a predator can end any one life).
    for (const seed of [3, 4, 5, 6, 7]) {
      const { w } = newWorld({ startStage: 1, seed });
      (w as { firstLife: boolean }).firstLife = true;
      w.debugJumpTo(1);
      let steps = 0;
      run(w, 400 * SEC, (ww) => (steps++, fryBot('leave')(ww)));
      if (w.status !== 'stageComplete') continue;
      console.log(`fry first life: ${(steps / SEC).toFixed(0)} s`);
      expect(steps / SEC).toBeGreaterThan(130);
      expect(steps / SEC).toBeLessThan(210);
      return;
    }
    throw new Error('no fry got through');
  });

  it('the lesson Dolly Varden warns, then chases, and the weeds end the chase', () => {
    const { w } = newWorld({ startStage: 1, seed: 8 });
    const saw = new Set<string>();
    run(w, 30 * SEC, (ww) => {
      for (const t of ww.live('trout')) saw.add(t.state);
      if (fryView(ww)?.phase !== 'lesson') ww.status = 'stageComplete';
      return fryBot()(ww);
    });
    expect(saw.has('warn')).toBe(true);
    expect(saw.has('chase')).toBe(true);
    const caps = captionsOf(w);
    expect(caps).toContain('fry.trout');
    expect(caps).toContain('fry.lessonDone');
  });

  it('a fry that ignores the Dolly Varden in the open is caught', () => {
    let caught = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { w } = newWorld({ startStage: 1, seed });
      // Feed outside the weeds and never react.
      run(w, 40 * SEC, (ww) => swimTo(ww, -12, -3, 0, { forward: ww.body.pos.x < -13 ? 1 : 0 }));
      if (w.deathCause === 'trout') caught++;
    }
    expect(caught).toBeGreaterThanOrEqual(3);
  });

  it('winter rewards resting: a fish that swims hard all winter starves and loses growth', () => {
    const winterRun = (policy: 'rest' | 'thrash') => {
      const { w } = newWorld({ startStage: 1, seed: 5 });
      w.restore({ stageIndex: 1, marker: 1, progress: { ...w.progress, fryBites: 12, fryRichBites: 5 } });
      const start = lakeGrowth(w.p, w.progress);
      for (const t of w.live('trout')) t.alive = false;
      run(w, 20 * SEC, (ww) => (policy === 'rest' ? intent() : intent({ forward: 1, burst: true, turn: Math.sin(ww.stageTime) })));
      return { w, start, end: lakeGrowth(w.p, w.progress), energy: w.body.energy };
    };
    const rest = winterRun('rest');
    const thrash = winterRun('thrash');
    expect(fryView(rest.w)?.phase).toBe('winter');
    expect(rest.energy).toBeGreaterThan(0.2);
    expect(thrash.energy).toBeLessThan(0.1);
    expect(thrash.end).toBeLessThan(thrash.start);
    expect(rest.end).toBeGreaterThanOrEqual(rest.start - 1e-9);
    expect(captionsOf(thrash.w)).toContain('fry.starving');
  });

  it('cold slows the fish under the ice', () => {
    const speed = (marker: number) => {
      const { w } = newWorld({ startStage: 1, seed: 6 });
      w.restore({ stageIndex: 1, marker, progress: { ...w.progress, fryBites: 12, fryRichBites: 5 } });
      for (const t of w.live('trout')) t.alive = false;
      run(w, 2 * SEC, () => intent({ forward: 1 }));
      return Math.hypot(w.body.vel.x, w.body.vel.z);
    };
    expect(speed(1)).toBeLessThan(speed(2) * 0.8);
  });

  it('staying a second year means a bigger fish and a higher freshwater score, with more predators', () => {
    const outcomes = (choice: 'leave' | 'stay') => {
      const res: { score: number; years: number; trout: number }[] = [];
      for (const seed of [11, 12, 13, 14, 15, 16]) {
        const { w } = newWorld({ startStage: 1, seed });
        let years = 1;
        let trout = 0;
        run(w, 400 * SEC, (ww) => {
          const v = fryView(ww);
          if (v) years = Math.max(years, v.lakeYears);
          trout = Math.max(trout, ww.live('trout').length);
          return fryBot(choice)(ww);
        });
        if (w.status === 'stageComplete') res.push({ score: freshwaterScore(w.p, w.progress), years, trout });
      }
      return res;
    };
    const leave = outcomes('leave');
    const stay = outcomes('stay');
    expect(leave.length).toBeGreaterThanOrEqual(4);
    expect(stay.length).toBeGreaterThanOrEqual(3);
    for (const r of leave) expect(r.years).toBe(1);
    for (const r of stay) expect(r.years).toBe(2);
    const mean = (rs: { score: number }[]) => rs.reduce((s, r) => s + r.score, 0) / rs.length;
    expect(mean(stay)).toBeGreaterThan(mean(leave) + 0.15);
    expect(Math.max(...stay.map((r) => r.trout))).toBeGreaterThan(Math.max(...leave.map((r) => r.trout)));
    console.log(`freshwater score: one year ${mean(leave).toFixed(2)}, two years ${mean(stay).toFixed(2)}`);
  });

  it('a sibling resumes at the winter checkpoint with the summer growth kept', () => {
    const { w } = newWorld({ startStage: 1, seed: 21 });
    run(w, 300 * SEC, (ww) => {
      if (fryView(ww)?.phase === 'winter') ww.die('trout');
      return fryBot()(ww);
    });
    expect(w.status).toBe('dead');
    const bites = w.checkpoint.progress.fryBites;
    expect(w.checkpoint.marker).toBe(1);
    expect(bites).toBeGreaterThan(0);
    w.continueWithSibling('Sib');
    expect(fryView(w)?.phase).toBe('winter');
    expect(w.progress.fryBites).toBe(bites);
  });
});

/** A sensible ocean fish: feed on the herring, cross the path of chargers, turn away from lunges. */
const oceanBot = (w: World): Intent => {
  const v = oceanView(w);
  if (!v || v.phase === 'skip') return intent();
  const b = w.body;
  const fish = b.pos;
  const hunter = [...w.live('orca'), ...w.live('shark'), ...w.live('seal')].find((o) => o.state === 'charge' || o.state === 'lunge' || o.state === 'warn');
  if (hunter && (hunter.state !== 'warn' || dist(hunter.pos, fish) < 25)) {
    // Swim across its line of approach: perpendicular to the line from it to us.
    const dx = fish.x - hunter.pos.x;
    const dz = fish.z - hunter.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    let px = -dz / l;
    let pz = dx / l;
    // Pick the side we are already heading toward.
    if (px * Math.cos(b.yaw) + pz * Math.sin(b.yaw) < 0) {
      px = -px;
      pz = -pz;
    }
    const hot = hunter.state !== 'warn';
    return swimTo(w, fish.x + px * 20, Math.max(-25, Math.min(-2, fish.y)), fish.z + pz * 20, { burst: hot && b.energy > 0.15 });
  }
  const f = nearest(w, w.live('herring'));
  if (!f) return intent({ forward: 0.4 });
  return swimTo(w, f.pos.x, f.pos.y, f.pos.z);
};

describe('ocean years', () => {
  const crowd = (w: World, c: number) => ((w.conditions as { oceanCrowding: number }).oceanCrowding = c);

  it('a sensible fish travels the route through every season, uncrowded and crowded (Field guide)', () => {
    const times: number[] = [];
    let finished = 0;
    const hunters = new Set<string>();
    for (const crowding of [1, 1.3]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { w } = newWorld({ startStage: 3, seed, sex: 'F' });
        crowd(w, crowding);
        w.debugJumpTo(3);
        expect(crowdedYear(w)).toBe(crowding > 1.1);
        let steps = 0;
        const moments = new Set<string>();
        const seasons: string[] = [];
        run(w, 700 * SEC, (ww) => {
          steps++;
          const v = oceanView(ww);
          if (v?.moment && v.phase !== 'skip') moments.add(v.moment);
          const key = v?.season ? `${v.season.year}${v.season.season}` : '';
          if (v?.phase === 'season' && seasons[seasons.length - 1] !== key) seasons.push(key);
          return oceanBot(ww);
        });
        const label = `crowding ${crowding} seed ${seed}: ${w.deathCause ?? ''} in ${oceanView(w)?.season?.season}`;
        // A sensible fish dies only to the unseen roll for later years, or now and then to a hunter.
        if (w.status === 'stageComplete') {
          finished++;
          const years = w.progress.oceanYears ?? 0;
          // Summer, autumn and winter of year 1; four seasons for each later year; the last spring.
          expect(seasons.length, label).toBe(3 + 4 * (years - 1) + 1);
          expect(seasons[0]).toBe('1summer');
          expect(seasons[seasons.length - 1]).toBe(`${years + 1}spring`);
          expect(moments.has('home')).toBe(true);
        }
        expect(moments.has('reveal'), label).toBe(true);
        if (crowding > 1.1) expect(moments.has('pinks'), label).toBe(true);
        else expect(moments.has('pinks')).toBe(false);
        const caps = captionsOf(w);
        for (const id of ['ocean.intro', 'ocean.huntZone', 'ocean.shelf', 'ocean.autumn']) expect(caps, `${label} ${id}`).toContain(id);
        for (const id of ['ocean.orca', 'ocean.seal', 'ocean.shark']) if (caps.includes(id)) hunters.add(id);
        if (crowding > 1.1) for (const id of ['ocean.crowded', 'ocean.pinks', 'ocean.pinksGone']) expect(caps, id).toContain(id);
        expect(caps.some((c) => c.startsWith('ocean.reveal'))).toBe(true);
        expect(w.progress.isJack).not.toBeNull();
        times.push(steps / SEC);
      }
    }
    console.log(`ocean (later life) seconds: ${times.map((t) => t.toFixed(0)).join(', ')}`);
    expect(finished).toBeGreaterThanOrEqual(6);
    expect(hunters.size).toBe(3);
    // Later lives: about 1-4 minutes for 1-3 years at sea.
    for (const t of times) expect(t).toBeLessThan(330);
  });

  it('a first life at sea takes about 4-6 minutes for 2-3 years, under 2.5 for a jack', () => {
    const lengthOf = (sex: 'M' | 'F', preset: 'quick' | 'jack', seed: number) => {
      const { w } = newWorld({ startStage: 3, seed, sex, preset });
      (w as { firstLife: boolean }).firstLife = true;
      w.debugJumpTo(3);
      let steps = 0;
      run(w, 700 * SEC, (ww) => {
        steps++;
        // Hunters removed: this measures the route, not the dodging.
        for (const e of ww.entities) if (e.kind === 'orca' || e.kind === 'seal' || e.kind === 'shark') e.alive = false;
        return oceanBot(ww);
      });
      return { s: steps / SEC, years: w.progress.oceanYears, status: w.status, cause: w.deathCause };
    };
    const jack = lengthOf('M', 'jack', 4);
    expect(jack.status).toBe('stageComplete');
    expect(jack.years).toBe(1);
    expect(jack.s).toBeGreaterThan(80);
    expect(jack.s).toBeLessThan(150);
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const f = lengthOf('F', 'quick', seed);
      if (f.status !== 'stageComplete') continue;
      checked++;
      console.log(`ocean first life: ${f.years} years, ${f.s.toFixed(0)} s`);
      expect(f.s).toBeGreaterThan(f.years === 2 ? 200 : 300);
      expect(f.s).toBeLessThan(f.years === 2 ? 290 : 400);
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('a fish that ignores the predators is taken', () => {
    let taken = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { w } = newWorld({ startStage: 3, seed });
      // Drift straight ahead, never turning: through the rich shallow patch in summer.
      run(w, 600 * SEC, () => intent({ forward: 0.5, rise: true }));
      if (w.deathCause && ['orca', 'seal', 'shark'].includes(w.deathCause)) taken++;
    }
    expect(taken).toBeGreaterThanOrEqual(4);
  });

  it('pink salmon take food that would have been the player’s', () => {
    const bitesIn = (removePinks: boolean) => {
      let total = 0;
      for (const seed of [1, 2, 3]) {
        const { w } = newWorld({ startStage: 3, seed, sex: 'F' });
        crowd(w, 1.3);
        w.debugJumpTo(3);
        let before = -1;
        let during = 0;
        run(w, 120 * SEC, (ww) => {
          const v = oceanView(ww);
          if (v?.moment === 'pinks' && v.phase === 'season') {
            if (before < 0) before = ww.progress.oceanBites;
            if (removePinks) for (const pk of ww.live('pink')) pk.alive = false;
            during = ww.progress.oceanBites - before;
          }
          for (const o of [...ww.live('orca'), ...ww.live('shark'), ...ww.live('seal')]) o.alive = false;
          return oceanBot(ww);
        });
        total += during;
      }
      return total;
    };
    const withPinks = bitesIn(false);
    const without = bitesIn(true);
    console.log(`bites in the pink season: with pinks ${withPinks}, without ${without}`);
    expect(withPinks).toBeLessThan(without * 0.8);
  });

  it('stays within the 20-40 m band', () => {
    const { w } = newWorld({ startStage: 3, seed: 2 });
    let deepest = 0;
    run(w, 200 * SEC, (ww) => {
      deepest = Math.min(deepest, ww.body.pos.y, ...ww.entities.filter((e) => e.alive).map((e) => e.pos.y));
      return intent({ forward: 1, dive: true });
    });
    expect(w.arena.min.y).toBe(-30);
    expect(deepest).toBeGreaterThanOrEqual(-30);
  });

  it('extra years at sea carry an unseen roll at the turn of each year; jacks skip it', () => {
    let lost = 0;
    let rolled = 0;
    let extra = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { w } = newWorld({ startStage: 3, seed, sex: 'F', difficulty: 'wild' });
      // No hunters: only the roll can end it.
      run(w, 700 * SEC, (ww) => {
        for (const e of ww.entities) if (e.kind !== 'herring') e.alive = false;
        return oceanBot(ww);
      });
      if ((w.progress.oceanYears ?? 1) > 1) rolled++;
      extra += (w.progress.oceanYears ?? 1) - 1;
      if (w.deathCause === 'sea') lost++;
      else expect(w.status, String(w.deathCause)).toBe('stageComplete');
    }
    expect(rolled).toBe(60);
    // Wild survives each extra year's unseen roll with life.lateOceanSurvival ^ ocean.lateRollShare; the rest of
    // the later years' risk is the hunters in their seasons. Bounds allow for sampling noise.
    const p = params('wild');
    const surv = Math.pow(p.get('life.lateOceanSurvival'), p.get('ocean.lateRollShare'));
    const mean = extra / rolled;
    const expected = 1 - Math.pow(surv, mean);
    expect(lost / rolled).toBeGreaterThan(expected * 0.4);
    expect(lost / rolled).toBeLessThan(expected * 1.8 + 0.05);

    const { w: jack } = newWorld({ startStage: 3, seed: 3, sex: 'M', preset: 'jack', difficulty: 'wild' });
    run(jack, 400 * SEC, (ww) => {
      for (const e of ww.entities) if (e.kind !== 'herring') e.alive = false;
      return oceanBot(ww);
    });
    expect(jack.status).toBe('stageComplete');
    expect(jack.progress.oceanYears).toBe(1);
    expect(captionsOf(jack)).not.toContain('ocean.yearsAtSea');
  });
});

describe('growth contract: lake and ocean feeding feed growthPerf', () => {
  it('more lake growth and more ocean bites both raise growthPerf and adult size', () => {
    const perf = (fryBites: number, fryRichBites: number, oceanBites: number) => {
      const { w } = newWorld({ startStage: 3, seed: 5, sex: 'F' });
      Object.assign(w.progress, { fryBites, fryRichBites, oceanBites });
      decideMaturation(w);
      return { g: w.progress.growthPerf, size: w.progress.adultSize ?? 0 };
    };
    const base = perf(10, 5, 12);
    expect(perf(20, 10, 12).g).toBeGreaterThan(base.g);
    expect(perf(10, 5, 24).g).toBeGreaterThan(base.g);
    expect(perf(10, 5, 24).size).toBeGreaterThan(base.size);
    expect(perf(0, 0, 12).g).toBeLessThan(perf(20, 10, 12).g);
    for (const r of [perf(0, 0, 0), perf(200, 200, 200)]) {
      expect(r.g).toBeGreaterThanOrEqual(0);
      expect(r.g).toBeLessThanOrEqual(1);
    }
  });

  it('the old fry record still reads sensibly (rich bites count for more)', () => {
    const { p, w } = newWorld();
    const plain = { ...w.progress, fryBites: 14, fryRichBites: 0 };
    const rich = { ...w.progress, fryBites: 14, fryRichBites: 8 };
    expect(lakeGrowth(p, rich)).toBeGreaterThan(lakeGrowth(p, plain));
    expect(freshwaterScore(p, { ...w.progress, fryBites: 0, fryRichBites: 0 })).toBe(0);
  });

  it('a fry that fed well matures with a higher growthPerf than one that fed poorly', () => {
    const lakeThenSea = (feed: boolean) => {
      const { w } = newWorld({ startStage: 1, seed: 31, sex: 'M' });
      run(w, 400 * SEC, (ww) => {
        if (!feed) for (const e of ww.live('plankton')) e.alive = false;
        return fryBot()(ww);
      });
      expect(w.status, String(w.deathCause)).toBe('stageComplete');
      w.progress.oceanBites = 12;
      decideMaturation(w);
      return w.progress.growthPerf;
    };
    expect(lakeThenSea(true)).toBeGreaterThan(lakeThenSea(false) + 0.05);
  });
});

describe('smolt size follows lake growth', () => {
  it('a fish that grew more in the lake is a bigger smolt', () => {
    const scaleWith = (bites: number) => {
      const { w } = newWorld({ seed: 5 });
      w.debugComplete(); // egg
      w.advance();
      w.debugComplete(); // fry
      w.progress.fryBites = bites;
      w.progress.fryRichBites = 0;
      w.advance();
      expect(w.stageId).toBe('smolt');
      return w.body.scale;
    };
    expect(scaleWith(60)).toBeGreaterThan(scaleWith(10));
  });
});
