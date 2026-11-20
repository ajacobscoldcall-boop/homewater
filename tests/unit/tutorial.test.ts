import { describe, expect, it } from 'vitest';
import { STAGE_IDS, type SimEvent } from '../../src/sim/types';
import {
  advanceGuide,
  countGuideEvents,
  freshGuideState,
  guideKey,
  guidePrompt,
  guideSnapshot,
  guideSteps,
  type GuideSnapshot,
  type GuideState,
} from '../../src/ui/tutorial';
import { intent, newWorld, run } from './helpers';

const snap = (over: Partial<GuideSnapshot> = {}): GuideSnapshot => ({
  fishId: 'f1',
  stage: 'egg',
  role: null,
  alevin: null,
  yolk: 1,
  thrust: 0,
  depth: 1,
  x: 0,
  fryGrowth: 0,
  fryPhase: null,
  smoltSection: null,
  schoolNear: 0,
  coast: null,
  spawn: null,
  yaw: 0,
  burst: false,
  ...over,
});

const ev = (type: SimEvent['type'], key?: string): SimEvent => ({ t: 0, type, ...(key ? { key } : {}) });

function start(s: GuideSnapshot): GuideState {
  return freshGuideState(guideKey(s));
}

describe('guide steps', () => {
  it('every stage and spawning role has a few steps ending in a standing one', () => {
    const cases: [(typeof STAGE_IDS)[number], 'female' | 'largeMale' | 'jack' | null][] = [
      ...STAGE_IDS.filter((s) => s !== 'spawn').map((s) => [s, null] as [typeof s, null]),
      ['spawn', 'female'],
      ['spawn', 'largeMale'],
      ['spawn', 'jack'],
    ];
    for (const [stage, role] of cases) {
      const steps = guideSteps(stage, role);
      expect(steps.length, stage).toBeGreaterThanOrEqual(3);
      // The fry stage carries the onboarding (steer, depth, burst) in front of its own steps.
      expect(steps.length, stage).toBeLessThanOrEqual(stage === 'fry' ? 7 : 5);
      const last = steps.at(-1);
      expect(last?.done(snap({ stage, role }), { eat: 99 }, freshGuideState('x').obs)).toBe(false);
    }
  });
});

describe('guide progression', () => {
  it('egg: hatch, face the current after it swings, ride out the flood, then rise when ready', () => {
    let s = snap({ alevin: { hatched: false, aligned: true, turning: false, ready: false } });
    let st = advanceGuide(start(s), s, 0.1);
    expect(st.index).toBe(0);
    s = snap({ alevin: { hatched: true, aligned: true, turning: false, ready: false } });
    st = advanceGuide(st, s, 0.1);
    // Already facing upstream, but the flow hasn't swung yet: not done.
    expect(st.index).toBe(1);
    st = countGuideEvents(st, [ev('warning', 'flow')]);
    s = snap({ alevin: { hatched: true, aligned: false, turning: true, ready: false } });
    st = advanceGuide(st, s, 0.3);
    expect(st.index).toBe(1);
    s = snap({ alevin: { hatched: true, aligned: true, turning: false, ready: false } });
    st = advanceGuide(st, s, 0.3);
    expect(st.index).toBe(1); // needs to hold it for half a second
    st = advanceGuide(st, s, 0.3);
    expect(st.index).toBe(2);
    // The flood: done once it has passed.
    st = advanceGuide(st, s, 5);
    expect(st.index).toBe(2);
    st = countGuideEvents(st, [ev('caption', 'egg.floodOver')]);
    st = advanceGuide(st, s, 0.1);
    expect(st.index).toBe(3);
    expect(guidePrompt(st, s)?.progress).toBe('yolk 100%');
    s = snap({ alevin: { hatched: true, aligned: true, turning: false, ready: true } });
    st = advanceGuide(st, s, 0.1);
    expect(st.index).toBe(4);
    st = advanceGuide(st, s, 10);
    expect(st.index).toBe(4);
    expect(guidePrompt(st, s)).toMatchObject({ step: 5, total: 5 });
    expect(guidePrompt(st, s)?.text).toMatch(/Space/);
  });

  it('a hold resets when the player stops doing the thing', () => {
    const school = snap({ stage: 'smolt', smoltSection: 'outlet', schoolNear: 5, thrust: 1 });
    const alone = snap({ stage: 'smolt', smoltSection: 'outlet', schoolNear: 0, thrust: 1 });
    let st = advanceGuide(start(school), school, 1);
    st = advanceGuide(st, alone, 0.1);
    st = advanceGuide(st, school, 1);
    expect(st.index).toBe(0);
    st = advanceGuide(st, school, 0.6);
    expect(st.index).toBe(1);
  });

  it('fry onboarding: steer both ways, dive and rise, then burst, each done by doing it', () => {
    const s = snap({ stage: 'fry', thrust: 1 });
    let st = advanceGuide(start(s), s, 0.1);
    expect(st.index).toBe(0);
    expect(guidePrompt(st, s)?.keys).toContain('steer');
    // Turning one way only is not enough.
    for (let i = 1; i <= 4; i++) st = advanceGuide(st, { ...s, yaw: i * 0.2 }, 0.1);
    expect(st.index).toBe(0);
    for (let i = 3; i >= -1; i--) st = advanceGuide(st, { ...s, yaw: i * 0.2 }, 0.1);
    expect(st.index).toBe(1);
    st = advanceGuide(st, { ...s, depth: 2 }, 0.1);
    expect(st.index).toBe(1);
    st = advanceGuide(st, { ...s, depth: 1 }, 0.1);
    expect(st.index).toBe(2);
    expect(guidePrompt(st, s)?.keys).toEqual(['burst']);
    st = advanceGuide(st, { ...s, burst: true }, 0.1);
    expect(st.index).toBe(3);
    expect(guidePrompt(st, s)?.text).toMatch(/plankton/);
  });

  /** Steer both ways, dive and rise, and burst: the onboarding steps at the start of the fry stage. */
  function onboard(s: GuideSnapshot): GuideState {
    let st = start(s);
    for (const o of [{ yaw: 0.8 }, { yaw: -0.8 }, { depth: 2 }, { depth: 1 }, { burst: true }, { burst: false }]) st = advanceGuide(st, { ...s, ...o }, 0.1);
    return st;
  }

  it('fry: counts eat events toward the goal', () => {
    const s = snap({ stage: 'fry', thrust: 1 });
    let st = onboard(s);
    expect(st.index).toBe(3);
    st = countGuideEvents(st, [ev('eat'), ev('eat'), ev('caption', 'fry.intro'), ev('eat'), ev('eat')]);
    st = advanceGuide(st, s, 0.1);
    expect(st.index).toBe(3);
    expect(guidePrompt(st, s)?.progress).toBe('4 / 5 eaten');
    st = advanceGuide(countGuideEvents(st, [ev('eat')]), s, 0.1);
    expect(st.index).toBe(4);
    // Escaping into the weeds completes the next step...
    const escaped = advanceGuide(countGuideEvents(st, [ev('caption', 'fry.safeWeeds')]), s, 0.1);
    expect(escaped.index).toBe(5);
    // ...and if no Dolly Varden ever gave chase, it is passed over once winter comes.
    const winter = snap({ stage: 'fry', thrust: 1, fryGrowth: 0.8, fryPhase: 'winter' });
    const grown = advanceGuide(st, winter, 0.1);
    expect(grown.index).toBe(5);
    expect(guidePrompt(grown, winter)?.progress).toBe('grown 80%');
    // Spring brings the choice to leave or stay.
    const spring = snap({ stage: 'fry', fryPhase: 'decide' });
    expect(guidePrompt(advanceGuide(grown, spring, 0.1), spring)?.text).toMatch(/^Spring/);
  });

  it('an escape that happened earlier in the stage still counts', () => {
    const s = snap({ stage: 'fry', thrust: 1 });
    let st = countGuideEvents(onboard(s), [ev('caption', 'fry.safeWeeds'), ...Array.from({ length: 5 }, () => ev('eat'))]);
    st = advanceGuide(st, s, 2);
    expect(st.index).toBe(5);
  });

  it('smolt: school, then past the outlet, then dive under a bird', () => {
    let s = snap({ stage: 'smolt', smoltSection: 'outlet', schoolNear: 5, thrust: 1 });
    let st = advanceGuide(start(s), s, 2);
    expect(st.index).toBe(1);
    s = snap({ stage: 'smolt', smoltSection: 'river', depth: 1 });
    st = advanceGuide(st, s, 0.1);
    expect(st.index).toBe(2);
    st = advanceGuide(countGuideEvents(st, [ev('warning', 'bird')]), s, 0.1);
    expect(st.index).toBe(2);
    st = advanceGuide(st, snap({ stage: 'smolt', smoltSection: 'river', depth: 3 }), 0.1);
    expect(st.index).toBe(3);
  });

  it('ocean: an early orca skips the feeding step', () => {
    const s = snap({ stage: 'ocean' });
    let st = advanceGuide(countGuideEvents(start(s), [ev('eat'), ev('warning', 'orca')]), s, 0.1);
    expect(st.index).toBe(1);
    st = advanceGuide(countGuideEvents(st, [ev('caption', 'ocean.orcaGone')]), s, 0.1);
    expect(st.index).toBe(2);
    st = advanceGuide(countGuideEvents(st, [ev('caption', 'ocean.sharkGone')]), s, 0.1);
    expect(st.index).toBe(3);
  });

  it('return: a sibling resuming in the home river goes straight to the falls, or past them to the last step', () => {
    const s = snap({ stage: 'return', coast: 90, x: 140 });
    let st = advanceGuide(start(s), s, 0.1);
    expect(st.index).toBe(3);
    st = advanceGuide(countGuideEvents(st, [ev('caption', 'return.firstLeap')]), s, 0.1);
    expect(st.index).toBe(4);
    const above = snap({ stage: 'return', coast: 90, x: 165 });
    expect(advanceGuide(start(above), above, 0.1).index).toBe(4);
    const atSea = snap({ stage: 'return', coast: 90, x: 10 });
    expect(advanceGuide(start(atSea), atSea, 0.1).index).toBe(0);
    expect(advanceGuide(start(atSea), snap({ stage: 'return', coast: 90, x: 50 }), 0.1).index).toBe(1);
  });

  it('spawn: steps follow the role', () => {
    const female = snap({ stage: 'spawn', role: 'female', spawn: { dig: 0, spawned: false, hiding: false, nearFemale: false, burial: 0 } });
    expect(guidePrompt(start(female), female)?.text).toMatch(/cobble/);
    let st = advanceGuide(start(female), { ...female, spawn: { dig: 0.3, spawned: false, hiding: false, nearFemale: false, burial: 0 } }, 0.1);
    expect(st.index).toBe(1);
    st = advanceGuide(st, { ...female, spawn: { dig: 1, spawned: false, hiding: false, nearFemale: false, burial: 0 } }, 0.1);
    expect(st.index).toBe(2);
    expect(guidePrompt(st, female)?.text).toMatch(/for a male/);
    st = advanceGuide(st, { ...female, spawn: { dig: 1, spawned: true, hiding: false, nearFemale: false, burial: 0.5 } }, 0.1);
    expect(st.index).toBe(3);
    expect(guidePrompt(st, { ...female, spawn: { dig: 1, spawned: true, hiding: false, nearFemale: false, burial: 0.5 } })?.progress).toBe('covered 50%');
    st = advanceGuide(st, { ...female, spawn: { dig: 1, spawned: true, hiding: false, nearFemale: false, burial: 1 } }, 0.1);
    expect(st.index).toBe(4);

    const jack = snap({ stage: 'spawn', role: 'jack', spawn: { dig: 0, spawned: false, hiding: true, nearFemale: false, burial: 0 } });
    st = advanceGuide(start(jack), jack, 0.1);
    expect(st.index).toBe(1);
    st = advanceGuide(countGuideEvents(st, [ev('spawned', 'spawn.jackSuccess')]), jack, 0.1);
    expect(st.index).toBe(2);

    const male = snap({ stage: 'spawn', role: 'largeMale', spawn: { dig: 0, spawned: false, hiding: false, nearFemale: true, burial: 0 } });
    st = advanceGuide(start(male), male, 1);
    expect(st.index).toBe(0);
    st = advanceGuide(st, male, 1);
    expect(st.index).toBe(1);
    st = advanceGuide(countGuideEvents(st, [ev('caption', 'spawn.fightWonSide')]), male, 0.1);
    expect(st.index).toBe(2);
    st = advanceGuide(st, { ...male, spawn: { dig: 0, spawned: true, hiding: false, nearFemale: true, burial: 0 } }, 0.1);
    expect(st.index).toBe(3);
    expect(guidePrompt(st, male)?.text).toMatch(/Another female/);
  });

  it('starts afresh for a new stage or a new fish', () => {
    const fry = snap({ stage: 'fry', thrust: 1 });
    let st = onboard(fry);
    expect(st.index).toBe(3);
    const sibling = { ...fry, fishId: 'f2', thrust: 0 };
    st = advanceGuide(st, sibling, 0.1);
    expect(st.index).toBe(0);
    expect(st.key).toBe(guideKey(sibling));
    const smolt = snap({ stage: 'smolt', smoltSection: 'outlet' });
    st = advanceGuide(st, smolt, 0.1);
    expect(st.key).toBe(guideKey(smolt));
    expect(st.index).toBe(0);
  });
});

describe('guide snapshot from a real world', () => {
  it('reads the alevin, the school and the spawning role through public helpers', () => {
    const egg = newWorld({ seed: 3 }).w;
    let s = guideSnapshot(egg);
    expect(s.stage).toBe('egg');
    expect(s.alevin).toMatchObject({ hatched: false, aligned: true });
    run(egg, 60 * 6, () => intent());
    s = guideSnapshot(egg);
    expect(s.alevin?.hatched).toBe(true);

    const smolt = newWorld({ seed: 3, startStage: 2 }).w;
    s = guideSnapshot(smolt);
    expect(s.smoltSection).toBe('outlet');
    expect(s.schoolNear).toBeGreaterThan(3);

    const ret = newWorld({ seed: 3, startStage: 4 }).w;
    expect(guideSnapshot(ret).coast).toBeGreaterThan(0);

    const spawn = newWorld({ seed: 3, startStage: 5, sex: 'F' }).w;
    s = guideSnapshot(spawn);
    expect(s.role).toBe('female');
    expect(s.spawn).toMatchObject({ dig: 0, spawned: false });
  });
});
