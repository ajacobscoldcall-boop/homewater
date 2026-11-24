/** The ocean as a journey (Track 2.6): route, seasons, food, growth, hunters where the food is, checkpoints. */
import { describe, expect, it } from 'vitest';
import { lateSizeChange, oceanView } from '../../src/sim/stages/ocean';
import { AFTER_REVEAL, firstYearPlan, fullPlan, huntsShallow, laterPlan, seasonFood, sizeOnRoute, warmthFrom } from '../../src/sim/stages/oceanRoute';
import type { Intent } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { oceanMapLayout } from '../../src/ui/oceanMap';
import { intent, newWorld, params, run, steer3 } from './helpers';

const SEC = 60;
const p = params();

/** Feed on whichever patch is asked for; no dodging. */
const feeder = (shallow: boolean) => (w: World): Intent => {
  const v = oceanView(w);
  if (!v || v.phase !== 'season') return intent();
  const patch = v.patches.find((pa) => pa.shallow === shallow) ?? v.patches[0];
  if (!patch) return intent();
  let best: { x: number; y: number; z: number } | null = null;
  let bd = Infinity;
  for (const h of w.live('herring')) {
    if (Math.hypot(h.pos.x - patch.x, h.pos.y - patch.y, h.pos.z - patch.z) > 9) continue;
    const d = Math.hypot(h.pos.x - w.body.pos.x, h.pos.y - w.body.pos.y, h.pos.z - w.body.pos.z);
    if (d < bd) {
      bd = d;
      best = h.pos;
    }
  }
  const to = best ?? patch;
  return steer3(w, to.x, to.y, to.z);
};

describe('the route', () => {
  it('has a summer on the coast and an autumn on the shelf before the reveal, then a loop of seasons per year and the turn for home', () => {
    expect(firstYearPlan(false).map((s) => `${s.season}:${s.place}`)).toEqual(['summer:coast', 'autumn:shelf']);
    expect(firstYearPlan(true)[1]?.encounter).toBe('pinks');
    for (const years of [1, 2, 3]) {
      const later = laterPlan(years, false);
      expect(later.length).toBe(1 + 4 * (years - 1) + 1);
      expect(later[0]).toMatchObject({ year: 1, season: 'winter', place: 'gyre' });
      expect(later[later.length - 1]).toMatchObject({ year: years + 1, season: 'spring', place: 'homeward', encounter: 'home' });
      // Every season but the last has a hunter or the pinks; the winters are far out.
      for (const s of later.slice(0, -1)) expect(['seal', 'orca', 'shark', 'pinks']).toContain(s.encounter);
      for (const s of later.filter((x) => x.season === 'winter')) expect(s.place).toBe('gyre');
    }
    expect(fullPlan(null, false).length).toBe(AFTER_REVEAL);
    expect(laterPlan(3, true).filter((s) => s.encounter === 'pinks').length).toBe(1);
  });

  it('a warm year, winter and a crowded summer mean less food; a cool year more', () => {
    const summer = { year: 1, season: 'summer', place: 'offshore', encounter: 'orca' } as const;
    const winter = { ...summer, season: 'winter', place: 'gyre' } as const;
    expect(seasonFood(p, summer, 'warm', false)).toBeLessThan(seasonFood(p, summer, 'typical', false));
    expect(seasonFood(p, summer, 'cool', false)).toBeGreaterThan(seasonFood(p, summer, 'typical', false));
    expect(seasonFood(p, summer, 'typical', true)).toBeLessThan(seasonFood(p, summer, 'typical', false));
    expect(seasonFood(p, winter, 'typical', true)).toBe(seasonFood(p, winter, 'typical', false));
    expect(seasonFood(p, winter, 'typical', false)).toBeLessThan(seasonFood(p, summer, 'typical', false));
    expect(warmthFrom(p, 0)).toBe('warm');
    expect(warmthFrom(p, 0.999)).toBe('typical');
  });

  it('the hunter hunts the richer patch: seals near the surface, sharks deep', () => {
    expect(huntsShallow(p, { year: 1, season: 'summer', place: 'coast', encounter: 'seal' })).toBe(true);
    expect(huntsShallow(p, { year: 1, season: 'winter', place: 'gyre', encounter: 'shark' })).toBe(false);
    expect(huntsShallow(p, { year: 2, season: 'winter', place: 'gyre', encounter: 'orca' })).toBe(false);
    expect(huntsShallow(p, { year: 2, season: 'spring', place: 'offshore', encounter: 'orca' })).toBe(true);
  });

  it('the drawn size grows season by season and ends at the adult size', () => {
    const plan = fullPlan(3, false);
    const sizes = plan.map((_, i) => sizeOnRoute(p, plan, i, 1.0, 0.5));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    expect(sizes[0]).toBeCloseTo(p.get('ocean.entryScale'));
    expect(sizes[sizes.length - 1]).toBe(1.0);
    // A well-fed fish looks bigger between encounters than a hungry one.
    expect(sizeOnRoute(p, plan, 5, 1.0, 1)).toBeGreaterThan(sizeOnRoute(p, plan, 5, 1.0, 0));
  });

  it('late feeding nudges adult size around a typical fish', () => {
    expect(lateSizeChange(p, p.get('ocean.lateTypical') * 100, 100)).toBeCloseTo(0);
    expect(lateSizeChange(p, 120, 100)).toBeGreaterThan(0);
    expect(lateSizeChange(p, 10, 100)).toBeLessThan(0);
    expect(lateSizeChange(p, 5, 0)).toBe(0);
  });

  it('the ocean map marks the season being played and says "2 or 3 years" until the reveal', () => {
    const before = oceanMapLayout(firstYearPlan(false), 1, null, 0.8, 'warm', false);
    expect(before.undecided).toBe(true);
    expect(before.stops.map((s) => s.state)).toEqual(['done', 'now']);
    expect(before.title).toContain('autumn');
    expect(before.sub).toContain('warm');
    const after = oceanMapLayout(fullPlan(2, true), 5, 2, 0.8, 'typical', true);
    expect(after.undecided).toBe(false);
    expect(after.stops.filter((s) => s.state === 'now').length).toBe(1);
    expect(after.route[after.route.length - 1]).toEqual(after.mouth);
    for (const s of after.stops) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(320);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(190);
    }
  });
});

describe('the ocean stage', () => {
  it('feeding where the hunter comes brings it far more often than feeding on the thin patch', () => {
    const met = (shallow: boolean) => {
      let n = 0;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const { w } = newWorld({ startStage: 3, seed, sex: 'F' });
        w.debugJumpTo(3);
        let seen = false;
        run(w, 30 * SEC, (ww) => {
          if (ww.live('seal').length) seen = true;
          for (const e of ww.live('seal')) e.alive = false;
          return feeder(shallow)(ww);
        });
        if (seen) n++;
      }
      return n;
    };
    const rich = met(true);
    const thin = met(false);
    console.log(`first summer seal: rich patch ${rich}/8, thin patch ${thin}/8`);
    expect(rich).toBe(8);
    expect(thin).toBeLessThanOrEqual(rich - 3);
  });

  it('the rich patch feeds more than the thin one', () => {
    const bites = (shallow: boolean) => {
      let total = 0;
      for (const seed of [1, 2, 3]) {
        const { w } = newWorld({ startStage: 3, seed, sex: 'F' });
        w.debugJumpTo(3);
        run(w, 25 * SEC, (ww) => {
          for (const e of ww.entities) if (e.kind === 'seal') e.alive = false;
          return feeder(shallow)(ww);
        });
        total += w.progress.oceanBites;
      }
      return total;
    };
    expect(bites(true)).toBeGreaterThan(bites(false));
  });

  it('the fish grows between seasons', () => {
    const { w } = newWorld({ startStage: 3, seed: 3, sex: 'F' });
    w.debugJumpTo(3);
    const sizes: number[] = [];
    run(w, 200 * SEC, (ww) => {
      for (const e of ww.entities) if (e.kind === 'seal' || e.kind === 'orca' || e.kind === 'shark') e.alive = false;
      const v = oceanView(ww);
      if (v?.phase === 'season' && sizes.length <= v.index) sizes[v.index] = ww.body.scale;
      return feeder(true)(ww);
    });
    const seen = sizes.filter((x) => x !== undefined);
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen[seen.length - 1]!).toBeGreaterThan(seen[0]! + 0.1);
  });

  it('a sibling resumes at the start of the year at sea it died in, with the route already decided', () => {
    const { w } = newWorld({ startStage: 3, seed: 5, sex: 'F' });
    (w as { siblingsLeft: number }).siblingsLeft = 2;
    w.debugJumpTo(3);
    let springIndex = -1;
    run(w, 700 * SEC, (ww) => {
      for (const e of ww.entities) if (e.kind === 'seal' || e.kind === 'orca' || e.kind === 'shark') e.alive = false;
      const v = oceanView(ww);
      if (v?.phase === 'season' && v.season?.season === 'spring' && v.season.year === 2 && springIndex < 0) {
        springIndex = v.index;
        ww.die('orca');
      }
      return feeder(true)(ww);
    });
    expect(springIndex).toBeGreaterThan(AFTER_REVEAL);
    expect(w.checkpoint.marker).toBe(springIndex);
    const years = w.progress.oceanYears;
    w.continueWithSibling('Sib');
    expect(w.stageId).toBe('ocean');
    expect(w.progress.oceanYears).toBe(years);
    let firstIndex = -1;
    run(w, 10 * SEC, (ww) => {
      const v = oceanView(ww);
      if (v?.phase === 'season' && firstIndex < 0) firstIndex = v.index;
      return intent();
    });
    expect(firstIndex).toBe(springIndex);
  });
});
