import { describe, expect, it } from 'vitest';
import { yearJackFraction } from '../../src/sim/genetics';
import { Params } from '../../src/sim/params';
import {
  bearWeight,
  eggSurvival,
  fightWinChance,
  jackFrequencyFactor,
  jackSneakShare,
  largeMaleSneakLoss,
  rivalFemaleInterval,
  rivalJackCount,
  senescenceRate,
  spawnState,
} from '../../src/sim/stages/spawn';
import { World } from '../../src/sim/world';
import { foundLineage } from '../../src/sim/lineage';
import type { Habitat } from '../../src/sim/types';
import { FILE, intent, newWorld, params, run } from './helpers';
import { playSpawn } from './spawnBot';

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

/** A spawning-stage world built from params with some values replaced. */
function worldWith(over: Record<string, number>, opts: { sex: 'F' | 'M'; preset?: 'quick' | 'jack'; seed: number; habitat?: Habitat }): World {
  const file = structuredClone(FILE);
  for (const e of file.params) if (e.id in over) e.value = over[e.id] as number;
  const p = new Params(file, 'fieldGuide');
  const lineage = foundLineage(p, { preset: opts.preset ?? 'quick', sex: opts.sex, name: 'T', difficulty: 'fieldGuide', seed: opts.seed, habitat: opts.habitat ?? 'creek' });
  const w = new World(p, { fish: lineage.current, conditions: { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 }, difficulty: 'fieldGuide', siblings: 3, seed: opts.seed });
  w.debugJumpTo(5);
  return w;
}

describe('frequency-dependent jack success', () => {
  it('a sneak is worth less the commoner jacks are, and 1x at the reference share', () => {
    const p = params();
    const ref = p.get('spawn.jackFreqRef');
    expect(jackFrequencyFactor(p, ref)).toBeCloseTo(1, 6);
    expect(jackFrequencyFactor(p, ref / 2)).toBeGreaterThan(1);
    expect(jackFrequencyFactor(p, ref * 2)).toBeLessThan(1);
    let last = Infinity;
    for (const f of [0, 0.01, 0.02, 0.04, 0.08, 0.2]) {
      const share = jackSneakShare(p, f);
      expect(share).toBeLessThan(last);
      last = share;
    }
  });

  it('more jacks on the grounds when jacks are common, and big males lose more to them', () => {
    const p = params();
    expect(rivalJackCount(p, 0.005)).toBeGreaterThanOrEqual(1);
    expect(rivalJackCount(p, 0.12)).toBeGreaterThan(rivalJackCount(p, 0.02));
    expect(rivalJackCount(p, 0.9)).toBeLessThanOrEqual(p.get('spawn.rivalJacksMax'));
    expect(largeMaleSneakLoss(p, 0.1)).toBeLessThan(largeMaleSneakLoss(p, 0.01));
  });

  it("the run's jack share follows the habitat's base rate and the run size", () => {
    const { w } = newWorld({ sex: 'M', preset: 'jack', seed: 5, startStage: 5 });
    expect(spawnState(w)?.jackFraction).toBeCloseTo(yearJackFraction(w.p, 'creek', w.conditions), 6);
    expect(yearJackFraction(w.p, 'creek', { ...w.conditions, runSize: 1.3 })).toBeGreaterThan(yearJackFraction(w.p, 'creek', w.conditions));
  });

  it('on the grounds, a jack in a jack-rich year fertilizes fewer eggs than in a jack-poor year', () => {
    const share = (rate: number) => {
      let total = 0;
      for (let i = 0; i < 6; i++) {
        const w = worldWith({ 'genetics.jackBaseRate.creek': rate }, { sex: 'M', preset: 'jack', seed: 400 + i });
        total += playSpawn('jack', 0, 'creek', { world: w }).w.spawnResult?.relativeFitness ?? 0;
      }
      return total / 6;
    };
    const rich = share(0.12);
    const poor = share(0.01);
    console.log(`jack relative fitness: jack-poor year ${poor.toFixed(2)}, jack-rich year ${rich.toFixed(2)}`);
    expect(rich).toBeLessThan(poor);
  });
});

describe('the redd: spawning, burial and guarding', () => {
  it('egg survival rises with gravel quality and burial, and falls each time the redd is dug over', () => {
    const p = params();
    expect(eggSurvival(p, 0.9, 1, 0)).toBeGreaterThan(eggSurvival(p, 0.5, 1, 0));
    expect(eggSurvival(p, 0.9, 1, 0)).toBeGreaterThan(eggSurvival(p, 0.9, 0.5, 0));
    expect(eggSurvival(p, 0.9, 0.5, 0)).toBeGreaterThan(eggSurvival(p, 0.9, 0, 0));
    expect(eggSurvival(p, 0.9, 0, 0)).toBeCloseTo(0.9 * p.get('spawn.unburiedSurvival'), 6);
    expect(eggSurvival(p, 0.9, 1, 2)).toBeLessThan(eggSurvival(p, 0.9, 1, 1));
    expect(eggSurvival(p, 1, 1, 0)).toBe(1);
  });

  it('rival females come more often late in the season and in big runs', () => {
    const p = params();
    expect(rivalFemaleInterval(p, 1, 0.9)).toBeLessThan(rivalFemaleInterval(p, 1, 0.1));
    expect(rivalFemaleInterval(p, 1.4, 0.5)).toBeLessThan(rivalFemaleInterval(p, 0.7, 0.5));
  });

  it('she does not spawn without a finished redd', () => {
    const { w } = newWorld({ sex: 'F', seed: 11, startStage: 5 });
    // Hold still in open water, away from gravel: no redd, no spawn.
    run(w, 60 * SEC, () => intent({ hold: true }));
    expect(spawnState(w)?.spawned).toBe(false);
  });

  it('she does not spawn on a finished redd with no male beside her', () => {
    const r = playSpawn('female', 12, 'creek', {
      each: (ww) => {
        for (const m of ww.live('guardMale')) m.alive = false;
      },
    });
    expect(spawnState(r.w)?.dig).toBe(1);
    expect(r.status).toBe('dead');
    expect(r.cause).toBe('noSpawn');
  });

  it('she spawns with the male that wins the fight beside her redd', () => {
    const r = playSpawn('female', 13);
    const keys = r.w.events.map((e) => e.key);
    expect(keys).toContain('spawn.femaleChoice');
    expect(keys.indexOf('spawn.femaleChoice')).toBeLessThan(keys.indexOf('spawn.femaleSpawned'));
  });

  it('covering the eggs marks the redd buried and raises the young that survive', () => {
    const young = (bury: boolean) => {
      let total = 0;
      for (let i = 0; i < 8; i++) {
        const r = playSpawn('female', 500 + i, 'creek', { bury });
        if (bury && r.status === 'lifeComplete') {
          expect(spawnState(r.w)?.burial).toBe(1);
          expect(r.w.entities.find((e) => e.kind === 'redd')?.state).toBe('buried');
        }
        total += r.w.spawnResult?.relativeFitness ?? 0;
      }
      return total;
    };
    expect(young(true)).toBeGreaterThan(young(false));
  });

  it('a rival female left at the redd after spawning digs over the eggs', () => {
    let superimposed = 0;
    for (let i = 0; i < 4; i++) {
      // Spawn and cover the eggs, then stop guarding.
      const r = playSpawn('female', 600 + i, 'creek', { idleAfterBurial: true });
      superimposed += spawnState(r.w)?.superimposed ?? 0;
    }
    expect(superimposed).toBeGreaterThan(0);
  });
});

describe('a large male after spawning', () => {
  it('may leave for a second female (costing strength) or stay', () => {
    let leftAndSpawned = 0;
    for (let i = 0; i < 8; i++) {
      let before = -1;
      let after = -1;
      const r = playSpawn('largeMale', 700 + i, 'creek', {
        leave: true,
        each: (ww) => {
          const s = spawnState(ww);
          if (s?.phase === 'decide') before = s.vigour;
          else if (s?.phase === 'seeking' && after < 0) after = s.vigour;
        },
      });
      const s = spawnState(r.w);
      if (after >= 0) expect(before - after).toBeGreaterThanOrEqual(r.w.p.get('spawn.seekVigourCost') - 0.01);
      if (r.status === 'lifeComplete' && (s?.secondShare ?? 0) > 0) {
        leftAndSpawned++;
        expect(r.w.events.some((e) => e.key === 'spawn.maleSpawnedAgain')).toBe(true);
        expect(r.w.spawnResult?.detail).toMatch(/two females/);
      }
    }
    expect(leftAndSpawned).toBeGreaterThanOrEqual(3);
    let stayed = 0;
    for (let i = 0; i < 6; i++) {
      const r = playSpawn('largeMale', 700 + i, 'creek', { leave: false });
      // A bear can chase the bot over to the second female; that counts as leaving.
      if (r.status !== 'lifeComplete' || r.w.events.some((e) => e.key === 'spawn.maleLeaves')) continue;
      stayed++;
      expect(r.w.events.some((e) => e.key === 'spawn.maleStays')).toBe(true);
      expect(spawnState(r.w)?.secondShare).toBe(0);
    }
    expect(stayed).toBeGreaterThanOrEqual(3);
  });

  it('bears come more often while he is away looking for her', () => {
    let first = 0;
    let firstTime = 0;
    let seeking = 0;
    let seekTime = 0;
    for (let i = 0; i < 12; i++) {
      playSpawn('largeMale', 800 + i, 'creek', {
        leave: true,
        each: (ww) => {
          const s = spawnState(ww);
          const fresh = ww.events.filter((e) => e.type === 'warning' && e.key === 'bear' && e.t >= ww.time - ww.dt / 2).length;
          if (s?.phase === 'first') {
            first += fresh;
            firstTime += ww.dt;
          } else if (s?.phase === 'seeking') {
            seeking += fresh;
            seekTime += ww.dt;
          }
        },
      });
    }
    expect(seekTime).toBeGreaterThan(20);
    expect(seeking / seekTime).toBeGreaterThan(first / firstTime);
  });
});

describe('senescence', () => {
  it('strength only falls, caps energy, and drains faster when bursting', () => {
    const p = params();
    expect(senescenceRate(p, true)).toBeGreaterThan(senescenceRate(p, false));
    const { w } = newWorld({ sex: 'F', seed: 21, startStage: 5 });
    let last = 1;
    run(w, 40 * SEC, (ww, i) => {
      const s = spawnState(ww);
      expect(s!.vigour).toBeLessThanOrEqual(last);
      expect(ww.body.energy).toBeLessThanOrEqual(s!.vigour + 1e-9);
      last = s!.vigour;
      return intent({ forward: 1, turn: 0.3, burst: i % 120 < 30 });
    });
  });

  it('is the natural end of the stage, before the season runs out', () => {
    const r = playSpawn('female', 31);
    expect(r.status).toBe('lifeComplete');
    expect(r.w.stageTime).toBeLessThan(r.w.p.get('spawn.duration'));
    expect(spawnState(r.w)!.vigour).toBeLessThanOrEqual(r.w.p.get('spawn.senescenceEnd'));
    expect(r.w.events.some((e) => e.key === 'spawn.senescence')).toBe(true);
    expect(r.w.events.some((e) => e.key === 'spawn.spentFemale')).toBe(true);
  });

  it('keeps a first life on the grounds to about two or three minutes', () => {
    for (const role of ['female', 'largeMale', 'jack'] as const) {
      const r = playSpawn(role, 41);
      expect(r.w.stageTime, role).toBeLessThan(180);
      expect(r.w.stageTime, role).toBeGreaterThan(40);
    }
  });
});
