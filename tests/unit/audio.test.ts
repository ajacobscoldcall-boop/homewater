import { describe, expect, it } from 'vitest';
import { AUDIO, MUSIC_SLOTS, type AmbienceProfile } from '../../src/audio/config';
import { ambienceFor, brownNoise, chooseMusic, crowdSplashRate, cueForEvent, cueForStrike, cueForWarning, dangerLevel, fallsNear, heartInterval, nextDegree, seamless, weakness } from '../../src/audio/mood';
import { STAGE_IDS, type EntityKind } from '../../src/sim/types';

const ent = (kind: EntityKind, state: string, alive = true) => ({ kind, state, alive });

describe('audio mood', () => {
  it('reads danger from predators that are warning or attacking', () => {
    expect(dangerLevel([])).toBe(0);
    expect(dangerLevel([ent('plankton', 'idle'), ent('trout', 'patrol')])).toBe(0);
    expect(dangerLevel([ent('orca', 'warn')])).toBe(AUDIO.danger.warnWeight);
    expect(dangerLevel([ent('orca', 'warn'), ent('seal', 'lunge')])).toBe(AUDIO.danger.hotWeight);
    expect(dangerLevel([ent('bear', 'strike', false)])).toBe(0);
    // Rivals are not predators.
    expect(dangerLevel([ent('rival', 'charge')])).toBe(0);
  });

  it('picks a calm slot per stage, with danger only while playing', () => {
    for (const s of STAGE_IDS) {
      const m = chooseMusic('playing', s, 0.5);
      expect(m.base).toBe(`music.${s}`);
      expect(MUSIC_SLOTS).toContain(m.base);
      expect(m.danger).toBe(0.5);
      expect(chooseMusic('paused', s, 1).danger).toBe(0);
    }
    expect(chooseMusic('end', 'spawn', 1)).toEqual({ base: 'music.end', danger: 0 });
    expect(chooseMusic('title', null, 0).base).toBe('music.title');
  });

  it('has a generated pad for every base slot', () => {
    for (const slot of MUSIC_SLOTS) if (slot !== 'music.danger') expect(AUDIO.pad[slot]).toBeDefined();
  });

  it('makes riffles louder and more turbulent than the river', () => {
    const river = ambienceFor({ stage: 'return', inRiver: true }, {} as AmbienceProfile);
    const riffle = ambienceFor({ stage: 'return', inRiver: true, riffle: true }, {} as AmbienceProfile);
    const coast = ambienceFor({ stage: 'return', inRiver: false }, {} as AmbienceProfile);
    expect(riffle.washLevel).toBeGreaterThan(river.washLevel);
    expect(riffle.wobbleRate).toBeGreaterThan(river.wobbleRate);
    expect(coast.washCutoff).toBeLessThan(river.washCutoff);
  });

  it('maps events and strikes to cues', () => {
    expect(cueForEvent({ type: 'warning', key: 'orca' })).toBe('warnOrca');
    expect(cueForEvent({ type: 'warning', key: 'opening' })).toBe('opening');
    expect(cueForEvent({ type: 'warning', key: 'char' })).toBe('warnChar');
    expect(cueForEvent({ type: 'warning', key: 'something-new' })).toBe('sting');
    expect(cueForEvent({ type: 'eat' })).toBe('eat');
    expect(cueForEvent({ type: 'caption', key: 'egg.intro' })).toBeNull();
    expect(cueForStrike('birdShadow', 'warn', 'strike')).toBe('strikeBird');
    expect(cueForStrike('birdShadow', undefined, 'strike')).toBeNull();
    expect(cueForStrike('bear', 'warn', 'strike')).toBe('strikeBear');
    expect(cueForStrike('seal', 'warn', 'lunge')).toBe('strikeSeal');
    expect(cueForStrike('orca', 'warn', 'charge')).toBe('chargeDeep');
    expect(cueForStrike('trout', 'warn', 'chase')).toBeNull();
  });

  it('gives each kind of threat its own warning figure', () => {
    // Every warning key the simulation emits (grep "emit('warning'" in src/sim).
    const threats = ['trout', 'bird', 'gull', 'merganser', 'seal', 'orca', 'shark', 'bear', 'hooked', 'rival'];
    const cues = threats.map(cueForWarning);
    expect(cues).not.toContain('sting');
    // Char in the lake and char at the redds share one; every other threat is different.
    expect(cueForWarning('char')).toBe(cueForWarning('trout'));
    expect(new Set(cues).size).toBe(threats.length);
    expect(cueForWarning('flow')).toBe('surge');
    expect(cueForWarning('flood')).toBe('surge');
  });

  it('makes each place sound like itself', () => {
    const a = (p: Parameters<typeof ambienceFor>[0]) => ambienceFor(p, {} as AmbienceProfile);
    // The falls roar rises as the fish nears them, from nothing far off.
    expect(fallsNear(1000)).toBe(0);
    expect(fallsNear(5)).toBeGreaterThan(fallsNear(20));
    const far = a({ stage: 'return', inRiver: true, falls: fallsNear(40) });
    const near = a({ stage: 'return', inRiver: true, falls: fallsNear(3) });
    expect(near.roarLevel).toBeGreaterThan(far.roarLevel);
    expect(near.roarCutoff).toBeGreaterThan(far.roarCutoff);
    expect(a({ stage: 'return', inRiver: true }).roarLevel).toBe(0);
    // Rapids are rougher than a riffle.
    expect(a({ stage: 'return', inRiver: true, rapids: true }).washLevel).toBeGreaterThan(a({ stage: 'return', inRiver: true, riffle: true }).washLevel);
    // The lake crossing is quiet.
    expect(a({ stage: 'return', inRiver: true, lake: true }).washLevel).toBeLessThan(a({ stage: 'return', inRiver: true }).washLevel);
    // The estuary's surf grows toward the sea while the river's rush fades.
    const e0 = a({ stage: 'smolt', estuary: 0 });
    const e1 = a({ stage: 'smolt', estuary: 1 });
    expect(e1.swellLevel).toBeGreaterThan(e0.swellLevel);
    expect(e1.washLevel).toBeLessThan(a({ stage: 'smolt' }).washLevel);
    // The egg's flood rumbles and rolls stones.
    expect(a({ stage: 'egg', flood: 1 }).washLevel).toBeGreaterThan(a({ stage: 'egg', flood: 0 }).washLevel);
    expect(a({ stage: 'egg', flood: 1 }).gravelRate).toBeGreaterThan(a({ stage: 'egg' }).gravelRate);
    // The lake at night has fewer plops than by day.
    expect(a({ stage: 'fry', light: 0 }).plopRate).toBeLessThan(a({ stage: 'fry', light: 1 }).plopRate);
    // Orcas call only in the open ocean; swells fade with depth.
    for (const s of STAGE_IDS) if (s !== 'ocean') expect(a({ stage: s }).callRate).toBe(0);
    expect(a({ stage: 'ocean' }).callRate).toBeGreaterThan(0);
    expect(a({ stage: 'ocean', depth: 30 }).swellLevel).toBeLessThan(a({ stage: 'ocean', depth: 0 }).swellLevel);
    // A bigger crowd splashes more, up to a cap.
    expect(crowdSplashRate(110)).toBeGreaterThan(crowdSplashRate(6));
    expect(crowdSplashRate(10000)).toBe(AUDIO.spawnCrowd.maxRate);
    expect(a({ stage: 'spawn', crowd: 80 }).splashRate).toBeGreaterThan(a({ stage: 'spawn', crowd: 10 }).splashRate);
  });

  it('keeps noise loops seamless and melodies inside the scale', () => {
    const d = new Float32Array(1000);
    let x = 0.3;
    brownNoise(d, () => ((x = (x * 9301 + 49297) % 233280) / 233280));
    expect(Math.max(...Array.from(d, Math.abs))).toBeLessThanOrEqual(0.9 + 1e-6);
    const seam = 100;
    seamless(d, seam);
    // The loop plays 0..len; its last sample runs straight on into the first.
    const len = d.length - seam;
    expect(Math.abs((d[0] as number) - (d[len] as number))).toBeLessThan(1e-6);
    for (let i = 0; i < 200; i++) {
      const n = nextDegree(i % 8, 8, (i * 0.37) % 1);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(8);
    }
  });

  it('beats the heart only when the fish is weak, faster when weaker', () => {
    expect(heartInterval(weakness(1, 1))).toBeNull();
    const weak = heartInterval(weakness(0.2, 1));
    const weaker = heartInterval(weakness(0, 1));
    expect(weak).not.toBeNull();
    expect(weaker as number).toBeLessThan(weak as number);
    expect(heartInterval(weakness(1, 0.1))).not.toBeNull();
  });
});
