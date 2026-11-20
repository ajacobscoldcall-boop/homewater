/**
 * Every tuning number for the sound, grouped by what it shapes. These are
 * presentation values, not simulation data, so they live here rather than in
 * src/data/params.json. Levels are linear gain (0..1), frequencies in Hz,
 * times in seconds.
 */
import type { StageId } from '../sim/types';

/** One stage's synthesised ambience: two noise layers, a drone and bubbles. */
export interface AmbienceProfile {
  /** Broad low wash: lowpassed noise. */
  washLevel: number;
  washCutoff: number;
  /** Mid texture: band-passed noise with a slow wobble (babble, turbulence). */
  textureLevel: number;
  textureFreq: number;
  textureQ: number;
  /** Wobble rate and depth of the texture layer (0..1 of its level). */
  wobbleRate: number;
  wobbleDepth: number;
  /** Low sine drone under everything. */
  droneLevel: number;
  droneFreq: number;
  /** Bubbles per second (0 for none). */
  bubbleRate: number;
  /** Underwater muffling on the whole world bus. */
  muffle: number;
}

/** A calm generated pad for one music slot: chord roots and colour. */
export interface PadMood {
  /** Chords as semitone offsets from `root`. */
  chords: readonly (readonly number[])[];
  /** Root frequency, Hz. */
  root: number;
  level: number;
  /** Lowpass on the pad. */
  cutoff: number;
  /** Seconds a chord holds, before the next one (or a rest). */
  hold: number;
  /** Chance that a phrase is a rest instead of a chord. */
  restChance: number;
}

const ambience: Record<StageId, AmbienceProfile> = {
  // In the gravel: muffled creek water heard through stones. Daylight is ignored.
  egg: { washLevel: 0.34, washCutoff: 260, textureLevel: 0.07, textureFreq: 520, textureQ: 1.4, wobbleRate: 0.35, wobbleDepth: 0.5, droneLevel: 0.05, droneFreq: 48, bubbleRate: 0.25, muffle: 520 },
  // The lake: a still hush, soft and wide.
  fry: { washLevel: 0.16, washCutoff: 420, textureLevel: 0.03, textureFreq: 900, textureQ: 0.8, wobbleRate: 0.08, wobbleDepth: 0.6, droneLevel: 0.035, droneFreq: 62, bubbleRate: 0.35, muffle: 1100 },
  // The river at night: a steady rush.
  smolt: { washLevel: 0.42, washCutoff: 700, textureLevel: 0.12, textureFreq: 1100, textureQ: 0.9, wobbleRate: 0.9, wobbleDepth: 0.4, droneLevel: 0.03, droneFreq: 55, bubbleRate: 1.2, muffle: 1300 },
  // The ocean: vast, low and slow.
  ocean: { washLevel: 0.3, washCutoff: 180, textureLevel: 0.04, textureFreq: 380, textureQ: 0.7, wobbleRate: 0.06, wobbleDepth: 0.8, droneLevel: 0.07, droneFreq: 41, bubbleRate: 0.2, muffle: 800 },
  // The return starts at the coast; see `returnRiver` and `returnRiffle` below.
  return: { washLevel: 0.28, washCutoff: 240, textureLevel: 0.06, textureFreq: 450, textureQ: 0.7, wobbleRate: 0.1, wobbleDepth: 0.7, droneLevel: 0.05, droneFreq: 44, bubbleRate: 0.4, muffle: 900 },
  // A shallow creek: bright, babbling, close to the surface.
  spawn: { washLevel: 0.22, washCutoff: 900, textureLevel: 0.13, textureFreq: 1500, textureQ: 1.6, wobbleRate: 2.2, wobbleDepth: 0.55, droneLevel: 0.02, droneFreq: 70, bubbleRate: 2.0, muffle: 1900 },
};

const C = [0, 3, 7, 10] as const; // minor seventh
const pad: Record<string, PadMood> = {
  'music.egg': { chords: [[0, 7, 14], [-2, 5, 12], [0, 7, 15]], root: 110, level: 0.05, cutoff: 600, hold: 12, restChance: 0.4 },
  'music.fry': { chords: [[0, 7, 16], [5, 12, 16], [-3, 4, 12]], root: 147, level: 0.05, cutoff: 900, hold: 10, restChance: 0.35 },
  'music.smolt': { chords: [[0, 7, 15], [-4, 3, 12], [-2, 5, 14]], root: 123, level: 0.05, cutoff: 750, hold: 9, restChance: 0.3 },
  'music.ocean': { chords: [[0, 7, 14], [-5, 2, 10], [-3, 7, 12]], root: 82, level: 0.06, cutoff: 650, hold: 14, restChance: 0.35 },
  'music.return': { chords: [[0, 7, 12, 16], [-3, 4, 12], [5, 9, 16]], root: 98, level: 0.055, cutoff: 850, hold: 11, restChance: 0.3 },
  'music.spawn': { chords: [[0, 4, 7, 14], [-3, 4, 9], [5, 9, 12, 16]], root: 131, level: 0.05, cutoff: 1000, hold: 10, restChance: 0.3 },
  'music.end': { chords: [[0, 7, 16], [-3, 4, 12, 19], [5, 12, 16]], root: 110, level: 0.07, cutoff: 1100, hold: 5, restChance: 0 },
  'music.title': { chords: [C, [-2, 5, 9], [-4, 3, 10]], root: 110, level: 0.04, cutoff: 700, hold: 12, restChance: 0.5 },
};

export const AUDIO = {
  /** Overall loudness before the player's volume. */
  master: { level: 1, defaultVolume: 0.7 },
  /** Bus levels under the master. */
  bus: { world: 1.0, music: 0.8, sfx: 0.9 },
  /** Level of everything in each app phase. */
  phase: { playing: 1, menu: 0.55, paused: 0.18, end: 0.85, fade: 0.6 },
  /** Changing stage: dip and morph the ambience over this many seconds. */
  crossfade: { time: 2.4, dip: 0.25 },
  /** Lower music and ambience while a narration line plays. */
  duck: { level: 0.35, attack: 0.25, release: 0.9 },
  /** The music bus is low-passed too, but more gently than the world. */
  musicMuffle: 2400,
  /** How often continuous parameters are refreshed. */
  controlInterval: 0.1,
  /** Time constant for continuous parameter changes. */
  smoothing: 0.35,
  ambience,
  /** The return, once inside the home river. */
  returnRiver: { washLevel: 0.36, washCutoff: 620, textureLevel: 0.1, textureFreq: 950, textureQ: 1.0, wobbleRate: 0.7, wobbleDepth: 0.45, droneLevel: 0.03, droneFreq: 52, bubbleRate: 1.0, muffle: 1300 } satisfies AmbienceProfile,
  /** Multipliers on the river profile over a riffle: louder and more turbulent. */
  returnRiffle: { level: 1.45, textureFreq: 1.5, wobbleRate: 2.2, bubbleRate: 2.5, muffle: 1.25 },
  /** The smolt run's last section, the river mouth, hears the sea. */
  smoltMouth: { washCutoff: 0.6, droneLevel: 1.8 },
  /** Bubble voices: a sine whose pitch rises as it decays. */
  bubble: { minFreq: 380, maxFreq: 1400, rise: 1.9, length: 0.09, level: 0.05 },
  /** The fish's own movement. */
  swim: { level: 0.09, burstLevel: 0.22, freq: 380, burstFreq: 900, q: 0.7, whooshLevel: 0.3, whooshLength: 0.45, speedForFull: 3 },
  /** Weak-fish heartbeat. */
  heart: { fatScale: 2.2, threshold: 0.62, slowInterval: 1.25, fastInterval: 0.7, freq: 52, level: 0.32, gap: 0.22, length: 0.16 },
  /** Danger smoothing: how fast the danger layer rises and falls (time constants). */
  danger: { attack: 0.4, release: 3.0, hotWeight: 1, warnWeight: 0.6 },
  /** The danger layer of the score: a low drone with a slow tremolo against a minor second. */
  dangerLayer: { level: 0.09, freq: 55, interval: 1.0595, tremoloRate: 1.6, cutoff: 420 },
  /** Calm generated pads, one per music slot. */
  pad,
  /** Pad voices and envelope. */
  padVoice: { count: 4, detune: 6, attack: 3.5, release: 4.5 },
  /** Recorded music slots fade in and out over this many seconds. */
  recordedFade: 2.5,
  /** One-shot event sounds. */
  cue: {
    sting: { freq: 330, interval: 1.0595, level: 0.08, length: 0.9 },
    pulse: { freq: 46, level: 0.45, length: 1.4, repeats: 2, gap: 0.55 },
    splash: { level: 0.5, length: 0.55, startFreq: 2600, endFreq: 500 },
    surge: { level: 0.32, length: 1.6, startFreq: 200, endFreq: 700 },
    eat: { bubbles: 4, spread: 0.18, gulpFreq: 300, gulpEnd: 170, gulpLevel: 0.11, gulpLength: 0.12 },
    /** A strike that just missed (feel pass): a rush of water past the fish and a low thump. */
    nearMiss: { level: 0.42, length: 0.45, startFreq: 3200, endFreq: 380, thumpFreq: 70, thumpEnd: 38, thumpLevel: 0.35, thumpLength: 0.32, minGap: 0.4 },
    wriggle: { level: 0.12, length: 0.18, freq: 700 },
    opening: { freq: 880, ratio: 1.5, level: 0.07, length: 1.6 },
    spawned: { freq: 220, ratios: [1, 1.25, 1.5, 2] as readonly number[], level: 0.06, length: 4 },
    stageComplete: { freq: 440, ratio: 1.335, level: 0.05, length: 1.4 },
    death: { startFreq: 160, endFreq: 40, level: 0.3, length: 2.2, muffle: 220 },
  },
  /** Event sounds fade with distance from the fish (world units); never below `min`. */
  hearing: { range: 45, min: 0.2 },
  /** Seconds of noise in the shared buffer (looped). */
  noiseSeconds: 2.5,
} as const;

export type MusicSlot = 'music.title' | 'music.egg' | 'music.fry' | 'music.smolt' | 'music.ocean' | 'music.return' | 'music.spawn' | 'music.danger' | 'music.end';

export const MUSIC_SLOTS: readonly MusicSlot[] = ['music.title', 'music.egg', 'music.fry', 'music.smolt', 'music.ocean', 'music.return', 'music.spawn', 'music.danger', 'music.end'];
