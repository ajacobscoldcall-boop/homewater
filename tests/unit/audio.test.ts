import { describe, expect, it } from 'vitest';
import { AUDIO, MUSIC_SLOTS, type AmbienceProfile } from '../../src/audio/config';
import { ambienceFor, chooseMusic, cueForEvent, cueForStrike, dangerLevel, heartInterval, weakness } from '../../src/audio/mood';
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
    expect(cueForEvent({ type: 'warning', key: 'orca' })).toBe('pulse');
    expect(cueForEvent({ type: 'warning', key: 'opening' })).toBe('opening');
    expect(cueForEvent({ type: 'warning', key: 'char' })).toBe('sting');
    expect(cueForEvent({ type: 'eat' })).toBe('eat');
    expect(cueForEvent({ type: 'caption', key: 'egg.intro' })).toBeNull();
    expect(cueForStrike('birdShadow', 'warn', 'strike')).toBe('splash');
    expect(cueForStrike('birdShadow', undefined, 'strike')).toBeNull();
    expect(cueForStrike('orca', 'warn', 'charge')).toBe('pulse');
    expect(cueForStrike('trout', 'warn', 'chase')).toBeNull();
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
