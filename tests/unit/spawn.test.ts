import { describe, expect, it } from 'vitest';
import { bearWeight, fightWinChance, spawnState } from '../../src/sim/stages/spawn';
import type { World } from '../../src/sim/world';
import { foundLineage } from '../../src/sim/lineage';
import type { Habitat } from '../../src/sim/types';
import { intent, newWorld, params, run, steerTo } from './helpers';

const SEC = 60;

describe('large-male fights', () => {
  it('size decides most, but side-on and early help', () => {
    const p = params();
    const bigSideEarly = fightWinChance(p, 1.0, 0.8, 1, 1);
    const bigHeadLate = fightWinChance(p, 1.0, 0.8, 0, 0);
    const smallSideEarly = fightWinChance(p, 0.7, 0.9, 1, 1);
    const smallHeadLate = fightWinChance(p, 0.7, 0.9, 0, 0);
    expect(bigSideEarly).toBeGreaterThan(bigHeadLate);
    expect(smallSideEarly).toBeGreaterThan(smallHeadLate);
    expect(bigHeadLate).toBeGreaterThan(smallHeadLate);
    // Good technique narrows a size gap but does not erase it.
    expect(smallSideEarly).toBeLessThan(bigSideEarly);
  });
});

describe('bears on the spawning grounds', () => {
  it('prefer males, then large females, then jacks', () => {
    const p = params();
    expect(bearWeight(p, 'male')).toBeGreaterThan(bearWeight(p, 'female'));
    expect(bearWeight(p, 'female')).toBeGreaterThan(bearWeight(p, 'jack'));
  });
});

/** Play a spawning stage with a simple, sensible bot. Returns the outcome. */
function playSpawn(role: 'female' | 'largeMale' | 'jack', seed: number, habitat: Habitat = 'creek'): { status: string; cause: string | null; detail?: string } {
  const opts = role === 'female' ? { sex: 'F' as const } : role === 'jack' ? { sex: 'M' as const, preset: 'jack' as const } : { sex: 'M' as const };
  const { w } = newWorld({ ...opts, seed, startStage: 5, habitat });
  if (role === 'largeMale') {
    w.progress.isJack = false;
    w.progress.adultSize = 0.9;
    w.debugJumpTo(5);
    w.progress.isJack = false;
    w.progress.adultSize = 0.9;
    w.startStage(5, 0);
  }
  const bot = (ww: World) => {
    const s = spawnState(ww);
    const bear = ww.live('bear').find((b) => b.state === 'warn');
    if (bear?.home && Math.hypot(bear.home.x - ww.body.pos.x, bear.home.z - ww.body.pos.z) < 3.5) {
      return steerTo(ww, ww.body.pos.x + (bear.home.x > ww.body.pos.x ? -6 : 6), ww.body.pos.z > 0 ? -2 : 2, { burst: true });
    }
    if (role === 'female') {
      const best = ww.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      const rival = ww.live('rival').find((r) => r.state === 'approach');
      if (rival && s?.spawned) return steerTo(ww, rival.pos.x, rival.pos.z, { burst: Math.hypot(rival.pos.x - ww.body.pos.x, rival.pos.z - ww.body.pos.z) < 2 });
      if (!best) return intent();
      const d = Math.hypot(best.pos.x - ww.body.pos.x, best.pos.z - ww.body.pos.z);
      return d > 1.5 ? steerTo(ww, best.pos.x, best.pos.z, { forward: Math.max(0.6, Math.min(1, d / 3)) }) : intent({ action: true, hold: true });
    }
    const female = ww.live('female')[0];
    if (!female) return intent();
    if (role === 'largeMale') {
      const rival = ww.live('rival').find((r) => r.state === 'approach');
      if (rival) {
        // Meet him side-on, between him and the female.
        const tx = (rival.pos.x + female.pos.x) / 2;
        const tz = (rival.pos.z + female.pos.z) / 2 + 1.5;
        const close = Math.hypot(rival.pos.x - ww.body.pos.x, rival.pos.z - ww.body.pos.z) < 2;
        return steerTo(ww, close ? rival.pos.x : tx, close ? rival.pos.z : tz, { burst: close });
      }
      const d = Math.hypot(female.pos.x - ww.body.pos.x, female.pos.z - ww.body.pos.z);
      return d > 2.5 ? steerTo(ww, female.pos.x - 1.5, female.pos.z) : intent({ hold: true });
    }
    // Jack: claim a spot (charging out a holder), dart in during the opening.
    const open = (s?.windowUntil ?? 0) > ww.stageTime;
    if (open) return steerTo(ww, female.pos.x, female.pos.z, { burst: true, actionPressed: Math.hypot(female.pos.x - ww.body.pos.x, female.pos.z - ww.body.pos.z) < 2.2 });
    const spots = s?.spots ?? [];
    const mine = s?.owners.indexOf(0) ?? -1;
    const target = spots[mine >= 0 ? mine : 0];
    if (!target) return intent();
    const d = Math.hypot(target.x - ww.body.pos.x, target.z - ww.body.pos.z);
    return d > 0.8 ? steerTo(ww, target.x, target.z, { burst: mine < 0 && d < 1.3 }) : intent({ hold: true, burst: mine < 0 });
  };
  run(w, 70 * SEC, bot);
  return { status: w.status, cause: w.deathCause, detail: w.spawnResult?.detail };
}

describe('spawning playthroughs', () => {
  for (const role of ['female', 'largeMale', 'jack'] as const) {
    it(`a sensible ${role} usually spawns`, () => {
      const results = Array.from({ length: 12 }, (_, i) => playSpawn(role, 100 + i));
      const spawned = results.filter((r) => r.status === 'lifeComplete').length;
      const causes = results.filter((r) => r.status !== 'lifeComplete').map((r) => r.cause);
      console.log(`${role}: spawned ${spawned}/12, failures: ${JSON.stringify(causes)}`);
      expect(spawned).toBeGreaterThanOrEqual(6);
    });
  }

  it('other jacks take the hiding spots when the player waits in the open', () => {
    const { w } = newWorld({ sex: 'M', preset: 'jack', seed: 7, startStage: 5 });
    run(w, 12 * SEC, () => intent({ hold: true }));
    const s = spawnState(w);
    expect(s?.owners.filter((o) => o > 0).length).toBe(s?.spots.length);
  });
});

describe('spawning habitats', () => {
  for (const habitat of ['river', 'beach'] as const) {
    it(`each role can spawn in a ${habitat}`, () => {
      for (const role of ['female', 'largeMale', 'jack'] as const) {
        const results = Array.from({ length: 8 }, (_, i) => playSpawn(role, 200 + i, habitat));
        const spawned = results.filter((r) => r.status === 'lifeComplete').length;
        console.log(`${habitat}/${role}: spawned ${spawned}/8`);
        expect(spawned, `${habitat}/${role}`).toBeGreaterThanOrEqual(4);
      }
    });
  }

  it('river and beach populations are larger and deeper-bodied than creek fish', () => {
    const p = params();
    const mean = (habitat: Habitat, t: 'size' | 'bodyDepth') => {
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += foundLineage(p, { preset: 'quick', sex: 'F', name: 'x', difficulty: 'fieldGuide', seed: 1000 + i, habitat }).current.z[t];
      return sum / 400;
    };
    expect(mean('river', 'bodyDepth')).toBeGreaterThan(mean('creek', 'bodyDepth'));
    expect(mean('beach', 'bodyDepth')).toBeGreaterThan(mean('river', 'bodyDepth'));
    expect(mean('beach', 'size')).toBeGreaterThan(mean('creek', 'size'));
  });

  it('bears come least often on a beach and most often in a creek', () => {
    const p = params();
    expect(p.get('spawn.bearRate.creek')).toBeGreaterThan(p.get('spawn.bearRate.river'));
    expect(p.get('spawn.bearRate.river')).toBeGreaterThan(p.get('spawn.bearRate.beach'));
  });
});

describe('bet hedging on the spawning grounds', () => {
  it('big runs give jacks more openings than small runs', () => {
    const openings = (runSize: number) => {
      let total = 0;
      for (let seed = 0; seed < 6; seed++) {
        const { w } = newWorld({ sex: 'M', preset: 'jack', seed: 300 + seed, startStage: 5 });
        (w as unknown as { conditions: { runSize: number } }).conditions.runSize = runSize;
        run(w, 44 * SEC, (ww) => {
          for (const b of ww.live('bear')) b.alive = false;
          return intent({ hold: true });
        });
        total += w.events.filter((e) => e.type === 'warning' && e.key === 'opening').length;
      }
      return total;
    };
    expect(openings(1.4)).toBeGreaterThan(openings(0.7));
  });
});
