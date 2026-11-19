import { describe, expect, it } from 'vitest';
import { bearWeight, fightWinChance, spawnState } from '../../src/sim/stages/spawn';
import type { World } from '../../src/sim/world';
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
function playSpawn(role: 'female' | 'largeMale' | 'jack', seed: number): { status: string; cause: string | null; detail?: string } {
  const opts = role === 'female' ? { sex: 'F' as const } : role === 'jack' ? { sex: 'M' as const, preset: 'jack' as const } : { sex: 'M' as const };
  const { w } = newWorld({ ...opts, seed, startStage: 5 });
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
      return d > 1.5 ? steerTo(ww, best.pos.x, best.pos.z) : intent({ action: true, hold: true });
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
