import { describe, expect, it } from 'vitest';
import captionFile from '../../src/data/captions.json';
import { CinematicDirector, momentFor, shotWeight, threatHot, type FrameContext } from '../../src/render/cinematicTriggers';
import { CINEMATICS, type MomentId } from '../../src/render/cinematicsConfig';
import type { Entity, SimEvent, StageId } from '../../src/sim/types';
import { v3 } from '../../src/sim/vec';

const CAPTIONS = (captionFile as { captions: Record<string, string> }).captions;
const ev = (type: SimEvent['type'], key?: string): SimEvent => ({ t: 0, type, ...(key ? { key } : {}) });
const at = (stageId: StageId, marker = 0) => ({ stageId, marker });
const ent = (kind: Entity['kind'], state: string, extra: Partial<Entity> = {}): Entity => ({
  id: 1,
  kind,
  pos: v3(),
  vel: v3(),
  yaw: 0,
  radius: 1,
  state,
  timer: 0,
  alive: true,
  ...extra,
});
const frame = (over: Partial<FrameContext> = {}): FrameContext => ({ fishId: 'f1', stageKey: 'f1:0', enabled: true, playing: true, threat: false, reducedMotion: false, ...over });
const evCtx = (stageId: StageId, over: Partial<{ fishId: string; stageKey: string; enabled: boolean; marker: number }> = {}) => ({
  stageId,
  marker: 0,
  fishId: 'f1',
  stageKey: 'f1:0',
  enabled: true,
  ...over,
});

describe('which events start a cinematic moment', () => {
  it('maps the key moments', () => {
    expect(momentFor(ev('caption', 'egg.hatch'), at('egg'))).toBe('hatch');
    expect(momentFor(ev('caption', 'fry.intro'), at('fry'))).toBe('lakeFirstLook');
    expect(momentFor(ev('caption', 'smolt.intro'), at('smolt'))).toBe('smoltNight');
    expect(momentFor(ev('caption', 'ocean.intro'), at('ocean'))).toBe('sea');
    expect(momentFor(ev('reveal', 'ocean.revealFemale'), at('ocean'))).toBe('maturation');
    expect(momentFor(ev('caption', 'return.rightRiver'), at('return'))).toBe('homeRiver');
    for (const k of ['spawn.femaleSpawned', 'spawn.maleSpawned', 'spawn.maleSpawnedAgain', 'spawn.jackSuccess']) expect(momentFor(ev('spawned', k), at('spawn'))).toBe('spawning');
  });

  it('every caption it listens for exists', () => {
    for (const k of ['egg.hatch', 'fry.intro', 'smolt.intro', 'ocean.intro', 'return.rightRiver', 'ocean.revealFemale', 'spawn.femaleSpawned']) expect(CAPTIONS[k]).toBeTruthy();
  });

  it('ignores everything else', () => {
    for (const e of [ev('caption', 'egg.flow'), ev('caption', 'return.wrongRiver'), ev('warning', 'flow'), ev('death', 'bear'), ev('eat'), ev('checkpoint', 'fry.checkpoint'), ev('caption')]) expect(momentFor(e, at('fry'))).toBeNull();
  });

  it('a lake or sea resumed at a later checkpoint is not a first look', () => {
    expect(momentFor(ev('caption', 'fry.intro'), at('fry', 2))).toBeNull();
    expect(momentFor(ev('caption', 'ocean.intro'), at('ocean', 1))).toBeNull();
  });

  it('every moment has a shot of 1.5 to 3 s that eases in and out', () => {
    for (const [id, s] of Object.entries(CINEMATICS.shots)) {
      expect(s.duration, id).toBeGreaterThanOrEqual(1.5);
      expect(s.duration, id).toBeLessThanOrEqual(3);
      expect(s.easeIn + s.easeOut, id).toBeLessThan(s.duration);
      expect(s.easeIn, id).toBeGreaterThan(0);
      expect(s.easeOut, id).toBeGreaterThan(0);
    }
  });
});

describe('threats', () => {
  it('is hot during an attack, a chase, a hook or a fight', () => {
    for (const [kind, state] of [
      ['orca', 'strike'],
      ['seal', 'chase'],
      ['bear', 'charge'],
      ['birdShadow', 'dive'],
      ['lure', 'hooked'],
      ['trout', 'lunge'],
      ['rival', 'fight'],
    ] as const)
      expect(threatHot([ent(kind, state)]), `${kind} ${state}`).toBe(true);
  });

  it('is not hot when threats are idle, warning, dead, or chasing a school-mate', () => {
    expect(threatHot([])).toBe(false);
    expect(threatHot([ent('orca', 'patrol'), ent('seal', 'warn'), ent('bear', 'idle')])).toBe(false);
    expect(threatHot([ent('orca', 'strike', { alive: false })])).toBe(false);
    expect(threatHot([ent('trout', 'chase', { value: 1 })])).toBe(false);
    expect(threatHot([ent('smolt', 'chase')])).toBe(false);
  });
});

describe('the director', () => {
  const run = (d: CinematicDirector, seconds: number, ctx: Partial<FrameContext> = {}) => {
    let last = null as ReturnType<CinematicDirector['update']>;
    const seen = new Set<MomentId>();
    for (let t = 0; t < seconds; t += 1 / 60) {
      last = d.update(1 / 60, frame(ctx));
      if (last) seen.add(last.moment);
    }
    return { last, seen };
  };

  it('plays a moment once and then hands the camera back', () => {
    const d = new CinematicDirector();
    expect(d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg'))).toBe('hatch');
    expect(d.update(1 / 60, frame())?.moment).toBe('hatch');
    const f = d.update(1 / 60, frame());
    expect(f!.weight).toBeGreaterThan(0);
    expect(f!.weight).toBeLessThan(0.1); // eases in
    const { last } = run(d, CINEMATICS.shots.hatch.duration + 0.1);
    expect(last).toBeNull();
    expect(d.current).toBeNull();
  });

  it('never plays the same moment twice for the same fish, but does for a sibling', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg'));
    run(d, 4);
    expect(d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg'))).toBeNull();
    expect(run(d, 4).seen.size).toBe(0);
    expect(d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg', { fishId: 'f2', stageKey: 'f2:0' }))).toBe('hatch');
    expect(run(d, 1, { fishId: 'f2', stageKey: 'f2:0' }).seen.has('hatch')).toBe(true);
  });

  it('remembers moments across loads and reports what it has used', () => {
    let saved: string[] = [];
    const d = new CinematicDirector();
    d.onSeen = (k) => (saved = k);
    d.onEvents([ev('spawned', 'spawn.maleSpawned')], evCtx('spawn'));
    d.update(1 / 60, frame());
    expect(saved).toEqual(['f1:spawning']);
    const reloaded = new CinematicDirector(saved);
    expect(reloaded.onEvents([ev('spawned', 'spawn.maleSpawnedAgain')], evCtx('spawn'))).toBeNull();
  });

  it('waits while a threat is hot, then plays once it clears', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'return.rightRiver')], evCtx('return'));
    expect(run(d, 1, { threat: true }).seen.size).toBe(0);
    expect(d.queued).toBe('homeRiver');
    expect(run(d, 0.5).seen.has('homeRiver')).toBe(true);
  });

  it('drops a moment if the threat outlasts the waiting window, and it can come again', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'return.rightRiver')], evCtx('return'));
    run(d, CINEMATICS.pendingWindow + 0.5, { threat: true });
    expect(d.queued).toBeNull();
    expect(run(d, 1).seen.size).toBe(0);
    expect(d.hasSeen('f1', 'homeRiver')).toBe(false);
  });

  it('cuts straight back when a threat turns hot mid-shot', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'ocean.intro')], evCtx('ocean'));
    run(d, 1);
    expect(d.current).toBe('sea');
    expect(d.update(1 / 60, frame({ threat: true }))).toBeNull();
    expect(d.current).toBeNull();
  });

  it('holds while paused and does not start while paused', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'smolt.intro')], evCtx('smolt'));
    expect(run(d, 5, { playing: false }).seen.size).toBe(0);
    expect(d.queued).toBe('smoltNight');
    run(d, 1);
    const before = d.update(0, frame());
    run(d, 10, { playing: false });
    const after = d.update(0, frame());
    expect(after?.u).toBeCloseTo(before!.u, 5);
  });

  it('a key press or click ends the shot with a short blend back', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('reveal', 'ocean.revealJack')], evCtx('ocean'));
    run(d, 1.2);
    const w0 = d.update(0, frame())!.weight;
    expect(d.skip()).toBe(true);
    const w1 = d.update(1 / 60, frame())!.weight;
    expect(Math.abs(w1 - w0)).toBeLessThan(0.15); // no jump
    expect(run(d, CINEMATICS.skipEaseOut + 0.05).last).toBeNull();
  });

  it('does nothing when the setting is off', () => {
    const d = new CinematicDirector();
    expect(d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg', { enabled: false }))).toBeNull();
    d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg'));
    expect(run(d, 1, { enabled: false }).seen.size).toBe(0);
    expect(d.hasSeen('f1', 'hatch')).toBe(false);
  });

  it('a shot from another stage is dropped', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg'));
    expect(run(d, 1, { stageKey: 'f1:1' }).seen.size).toBe(0);
  });

  it('reduced motion cuts in and holds still, and a key cuts straight out', () => {
    const d = new CinematicDirector();
    d.onEvents([ev('caption', 'egg.hatch')], evCtx('egg'));
    const a = d.update(1 / 60, frame({ reducedMotion: true }));
    expect(a).toEqual({ moment: 'hatch', weight: 1, u: 0.5 });
    const b = d.update(1, frame({ reducedMotion: true }));
    expect(b).toEqual(a);
    d.skip(true);
    expect(d.update(1 / 60, frame({ reducedMotion: true }))).toBeNull();
  });
});

describe('shot weight', () => {
  it('eases from 0 to 1 and back', () => {
    expect(shotWeight(0, 3, 0.5, 0.5)).toBe(0);
    expect(shotWeight(0.25, 3, 0.5, 0.5)).toBeCloseTo(0.5, 5);
    expect(shotWeight(1.5, 3, 0.5, 0.5)).toBe(1);
    expect(shotWeight(2.75, 3, 0.5, 0.5)).toBeCloseTo(0.5, 5);
    expect(shotWeight(3, 3, 0.5, 0.5)).toBe(0);
  });
});
