/**
 * Every tuning number for the sound, grouped by what it shapes. These are
 * presentation values, not simulation data, so they live here rather than in
 * src/data/params.json. Levels are linear gain (0..1), frequencies in Hz,
 * times in seconds, rates in events per second.
 */
import type { StageId } from '../sim/types';

/**
 * One place's synthesised ambience. The graph has a fixed set of layers
 * (built once); a profile only sets their levels and colours, and the rates
 * of the small one-shot sounds sprinkled over them.
 */
export interface AmbienceProfile {
  /** Broad low wash: lowpassed brown noise. */
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
  /** Swell: lowpassed noise that rises and falls slowly (sea swell, surf, lapping). */
  swellLevel: number;
  swellCutoff: number;
  swellRate: number;
  /** 0..1: how far the swell falls between surges. */
  swellDepth: number;
  /** Roar: broadband white water (rapids and the falls). */
  roarLevel: number;
  roarCutoff: number;
  /** Underwater muffling on the whole world bus (lowpass, Hz). */
  muffle: number;
  /** One-shot sprinkles, per second. */
  bubbleRate: number;
  /** Stones knocking in the gravel. */
  gravelRate: number;
  /** Small bright bubbles of water trickling through gravel. */
  trickleRate: number;
  /** Distant soft plops at the surface. */
  plopRate: number;
  /** Fish splashing nearby (the spawning crowd). */
  splashRate: number;
  /** Distant orca calls (ocean only). */
  callRate: number;
}

/** A calm generated score for one music slot. */
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
  /** A soft sine an octave under the chord's lowest note (0 for none). */
  bass: number;
  /** Melody: scale degrees (semitones from root), the octave it sits in (multiplier on root) and its level. */
  scale: readonly number[];
  octave: number;
  melody: number;
  /** Notes per phrase [min, max] and seconds between phrases [min, max]. */
  notes: readonly [number, number];
  gap: readonly [number, number];
  /** Seconds per note (the bell rings longer than that). */
  step: number;
}

/** Shorthand for a profile: everything absent is 0. */
const amb = (p: Partial<AmbienceProfile>): AmbienceProfile => ({
  washLevel: 0, washCutoff: 300, textureLevel: 0, textureFreq: 600, textureQ: 1, wobbleRate: 0.2, wobbleDepth: 0.5,
  droneLevel: 0, droneFreq: 50, swellLevel: 0, swellCutoff: 300, swellRate: 0.1, swellDepth: 0.6, roarLevel: 0, roarCutoff: 1200,
  muffle: 1200, bubbleRate: 0, gravelRate: 0, trickleRate: 0, plopRate: 0, splashRate: 0, callRate: 0,
  ...p,
});

const ambience: Record<StageId, AmbienceProfile> = {
  // In the gravel: creek water heard through stones, a trickle between them and now and then a stone knocking.
  egg: amb({ washLevel: 0.3, washCutoff: 260, textureLevel: 0.06, textureFreq: 620, textureQ: 1.6, wobbleRate: 0.35, wobbleDepth: 0.5, droneLevel: 0.04, droneFreq: 48, muffle: 1500, bubbleRate: 0.2, gravelRate: 0.5, trickleRate: 2.2 }),
  // The lake: a still hush, a little lapping far above and soft plops at the surface.
  fry: amb({ washLevel: 0.12, washCutoff: 380, textureLevel: 0.025, textureFreq: 900, textureQ: 0.8, wobbleRate: 0.08, wobbleDepth: 0.6, droneLevel: 0.03, droneFreq: 62, swellLevel: 0.05, swellCutoff: 520, swellRate: 0.13, swellDepth: 0.7, muffle: 1300, bubbleRate: 0.3, plopRate: 0.14 }),
  // The river at night: a steady rush.
  smolt: amb({ washLevel: 0.38, washCutoff: 700, textureLevel: 0.11, textureFreq: 1100, textureQ: 0.9, wobbleRate: 0.9, wobbleDepth: 0.4, droneLevel: 0.03, droneFreq: 55, muffle: 1300, bubbleRate: 1.1, gravelRate: 0.15 }),
  // The open ocean: vast, low and slow, long swells overhead and, far off, orcas calling.
  ocean: amb({ washLevel: 0.24, washCutoff: 170, textureLevel: 0.03, textureFreq: 380, textureQ: 0.7, wobbleRate: 0.06, wobbleDepth: 0.8, droneLevel: 0.06, droneFreq: 41, swellLevel: 0.2, swellCutoff: 260, swellRate: 0.075, swellDepth: 0.8, muffle: 900, bubbleRate: 0.15, callRate: 1 / 45 }),
  // The return starts at the coast; see `returnRiver`, `returnLake` and the modifiers below.
  return: amb({ washLevel: 0.24, washCutoff: 240, textureLevel: 0.05, textureFreq: 450, textureQ: 0.7, wobbleRate: 0.1, wobbleDepth: 0.7, droneLevel: 0.05, droneFreq: 44, swellLevel: 0.15, swellCutoff: 320, swellRate: 0.09, swellDepth: 0.75, muffle: 950, bubbleRate: 0.4 }),
  // A shallow creek: bright and babbling, close to the surface; the crowd adds splashes (see `spawnCrowd`).
  spawn: amb({ washLevel: 0.2, washCutoff: 900, textureLevel: 0.11, textureFreq: 1500, textureQ: 1.6, wobbleRate: 2.2, wobbleDepth: 0.55, droneLevel: 0.02, droneFreq: 70, muffle: 1900, bubbleRate: 1.6, gravelRate: 0.4, trickleRate: 0.6 }),
};

/** Minor pentatonic and friends, as semitones. */
const PENT = [0, 3, 5, 7, 10, 12, 15, 17] as const;
const MAJ_PENT = [0, 2, 4, 7, 9, 12, 14, 16] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14] as const;

const pad: Record<string, PadMood> = {
  // Under the gravel: low, slow and close; a few muffled bell notes.
  'music.egg': { chords: [[0, 7, 14], [-2, 5, 12], [0, 7, 15]], root: 110, level: 0.05, cutoff: 600, hold: 12, restChance: 0.35, bass: 0.035, scale: PENT, octave: 4, melody: 0.022, notes: [2, 3], gap: [9, 16], step: 1.1 },
  // The lake: open and light, the most melodic stage.
  'music.fry': { chords: [[0, 7, 16], [5, 12, 16], [-3, 4, 12], [2, 9, 14]], root: 147, level: 0.05, cutoff: 950, hold: 10, restChance: 0.3, bass: 0.03, scale: MAJ_PENT, octave: 2, melody: 0.026, notes: [3, 5], gap: [6, 12], step: 0.6 },
  // The night run: hushed, unsettled.
  'music.smolt': { chords: [[0, 7, 15], [-4, 3, 12], [-2, 5, 14]], root: 123, level: 0.05, cutoff: 750, hold: 9, restChance: 0.3, bass: 0.035, scale: PENT, octave: 2, melody: 0.02, notes: [2, 4], gap: [8, 14], step: 0.7 },
  // The ocean: wide and deep, long notes far apart.
  'music.ocean': { chords: [[0, 7, 14], [-5, 2, 10], [-3, 7, 12]], root: 82, level: 0.06, cutoff: 650, hold: 14, restChance: 0.3, bass: 0.045, scale: DORIAN, octave: 4, melody: 0.02, notes: [2, 3], gap: [10, 18], step: 1.4 },
  // Home: hopeful, a little warmer.
  'music.return': { chords: [[0, 7, 12, 16], [-3, 4, 12], [5, 9, 16], [7, 11, 14]], root: 98, level: 0.055, cutoff: 850, hold: 11, restChance: 0.25, bass: 0.04, scale: MAJ_PENT, octave: 4, melody: 0.022, notes: [3, 4], gap: [8, 14], step: 0.8 },
  // The grounds: bright and full.
  'music.spawn': { chords: [[0, 4, 7, 14], [-3, 4, 9], [5, 9, 12, 16]], root: 131, level: 0.05, cutoff: 1000, hold: 10, restChance: 0.25, bass: 0.035, scale: MAJ_PENT, octave: 2, melody: 0.024, notes: [3, 5], gap: [7, 12], step: 0.55 },
  // The end of a life: slow and warm.
  'music.end': { chords: [[0, 7, 16], [-3, 4, 12, 19], [5, 12, 16]], root: 110, level: 0.07, cutoff: 1100, hold: 6, restChance: 0, bass: 0.04, scale: MAJ_PENT, octave: 4, melody: 0.028, notes: [3, 5], gap: [5, 9], step: 0.9 },
  'music.title': { chords: [[0, 3, 7, 10], [-2, 5, 9], [-4, 3, 10]], root: 110, level: 0.05, cutoff: 700, hold: 12, restChance: 0.45, bass: 0.03, scale: PENT, octave: 4, melody: 0.022, notes: [2, 4], gap: [8, 14], step: 0.9 },
};

/** Every cue the engine can play. */
export type Cue =
  | 'sting'
  | 'warnChar'
  | 'warnBird'
  | 'warnGull'
  | 'warnMerganser'
  | 'warnSeal'
  | 'warnOrca'
  | 'warnShark'
  | 'warnBear'
  | 'warnHook'
  | 'warnRival'
  | 'strikeBird'
  | 'strikeBear'
  | 'strikeSeal'
  | 'chargeDeep'
  | 'surge'
  | 'eat'
  | 'wriggle'
  | 'opening'
  | 'leap'
  | 'spawned'
  | 'stageComplete'
  | 'death'
  | 'nearMiss'
  | 'lifeEnd'
  /** One distant orca call (the ocean's ambience plays these at random). */
  | 'farCall';

export const AUDIO = {
  /** Overall loudness before the player's volume. */
  master: { level: 1, defaultVolume: 0.7 },
  /** A gentle limiter after the master volume, so stacked sounds never clip. */
  limiter: { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 },
  /** Bus levels under the master. */
  bus: { world: 1.0, music: 1.0, sfx: 0.9, alert: 1.0 },
  /** Warnings skip the heavy underwater muffle (a lighter lowpass, not ducked), so they stay clear in every place. */
  alertMuffle: 3200,
  /** The texture's wobble drifts in rate by this share, so babble never sounds like a steady pulse. */
  wobbleDrift: { rate: 0.23, depth: 0.45 },
  /** Level of everything in each app phase. */
  phase: { playing: 1, menu: 0.55, paused: 0.18, end: 0.85, fade: 0.6 },
  /** Changing stage: dip and morph the ambience over this many seconds. */
  crossfade: { time: 2.4, dip: 0.25 },
  /** Lower music and ambience while a narration line plays. */
  duck: { level: 0.35, attack: 0.25, release: 0.9 },
  /** The music bus is low-passed too, but more gently than the world. */
  musicMuffle: 2400,
  /** An echo for the score and distant sounds: delay, feedback (kept well under 1), damping and return level. */
  space: { delay: 0.37, feedback: 0.38, damp: 1700, level: 0.55 },
  /** How often continuous parameters are refreshed. */
  controlInterval: 0.1,
  /** Time constant for continuous parameter changes. */
  smoothing: 0.35,
  ambience,
  /** The return, once inside the home river. */
  returnRiver: amb({ washLevel: 0.34, washCutoff: 620, textureLevel: 0.09, textureFreq: 950, textureQ: 1.0, wobbleRate: 0.7, wobbleDepth: 0.45, droneLevel: 0.03, droneFreq: 52, muffle: 1300, bubbleRate: 1.0, gravelRate: 0.25 }),
  /** The return's crossing of the nursery lake: quiet again, with the inflowing streams far off. */
  returnLake: amb({ washLevel: 0.13, washCutoff: 360, textureLevel: 0.03, textureFreq: 1200, textureQ: 1.2, wobbleRate: 0.15, wobbleDepth: 0.6, droneLevel: 0.035, droneFreq: 58, swellLevel: 0.05, swellCutoff: 480, swellRate: 0.12, swellDepth: 0.7, muffle: 1200, bubbleRate: 0.3, plopRate: 0.1 }),
  /** Multipliers on the river profile over a riffle: louder and more turbulent. */
  returnRiffle: { level: 1.45, textureFreq: 1.5, wobbleRate: 2.2, bubbleRate: 2.5, muffle: 1.25 },
  /** The rapids below the falls: rougher than a riffle. */
  rapids: { level: 1.6, textureFreq: 1.7, wobbleRate: 3, bubbleRate: 3.5, gravelRate: 4, muffle: 1.35 },
  /** The falls' roar: its level and brightness rise as the fish nears the face (0..1 nearness from `fallsNear`). */
  falls: { range: 45, curve: 1.7, level: 0.42, cutoffLow: 500, cutoffHigh: 2600, washBoost: 0.6, bubbleRate: 4 },
  /** The smolt run's river mouth hears the sea; the estuary's surf rises toward the sea end. */
  smoltMouth: { washCutoff: 0.6, droneLevel: 1.8, swellLevel: 0.07 },
  estuary: { swellLevel: 0.26, swellCutoffFrom: 380, swellCutoffTo: 900, swellRate: 0.11, swellDepth: 0.85, riverFade: 0.65, plopRate: 0.2 },
  /** The egg stage's flood (0..1 from the sim's flood level): a deep, rising rumble and rolling stones. */
  flood: { wash: 1.6, washCutoff: 0.9, drone: 2.5, texture: -0.5, gravelRate: 7, muffle: -0.35 },
  /** Lake light (fry): fewer plops and a softer hush at night. */
  lakeNight: { plopRate: 0.35, wash: 0.8 },
  /** Ocean: the swell fades as the fish goes deeper (depth in world units over `depthScale`). */
  oceanDepth: { depthScale: 18, swellFade: 0.6 },
  /** The spawning crowd: splashes per second for each spawner present, and the texture rising with numbers. */
  spawnCrowd: { base: 0.15, perFish: 0.025, maxRate: 3, textureFrom: 0.8, texturePer: 0.006, textureMax: 1.5 },
  /** Rain on the surface (from the weather hook, 0..1): a hiss and drops, fading with depth. */
  rain: { level: 0.12, cutoff: 3200, dropRate: 6, dropLevel: 0.03, depthFade: 10, smoothing: 1.2 },
  /** Bubble voices: a sine whose pitch rises as it decays. */
  bubble: { minFreq: 380, maxFreq: 1400, rise: 1.9, length: 0.09, level: 0.045 },
  /** Sprinkle voices. */
  sprinkle: {
    gravel: { clicks: [2, 4] as readonly [number, number], gap: 0.045, freqLow: 2200, freqHigh: 4800, length: 0.012, level: 0.07 },
    trickle: { minFreq: 1300, maxFreq: 2800, length: 0.05, level: 0.022, rise: 1.5 },
    plop: { minFreq: 380, maxFreq: 760, length: 0.14, level: 0.05, send: 0.6 },
    splash: { minLevel: 0.04, maxLevel: 0.11, from: 1800, to: 380, minLength: 0.22, maxLength: 0.5, doubleChance: 0.3, send: 0.25 },
    call: { from: [700, 1100] as readonly [number, number], peak: 1.45, end: 0.75, length: [1.1, 1.9] as readonly [number, number], vibrato: 6, vibratoDepth: 18, level: 0.016, send: 0.9 },
  },
  /** At most this many one-shot voices at once; sprinkles wait, cues always play. */
  voices: { max: 22 },
  /** The fish's own movement. */
  swim: { level: 0.09, burstLevel: 0.22, freq: 380, burstFreq: 900, q: 0.7, whooshLevel: 0.3, whooshLength: 0.45, speedForFull: 3 },
  /** Weak-fish heartbeat: a lub-dub, slow at first and quickening. */
  heart: { fatScale: 2.2, threshold: 0.62, slowInterval: 1.25, fastInterval: 0.7, freq: 52, level: 0.3, gap: 0.22, length: 0.16, thump: 0.08 },
  /** Danger smoothing: how fast the danger layer rises and falls (time constants). */
  danger: { attack: 0.4, release: 3.0, hotWeight: 1, warnWeight: 0.6, thinMelody: 0.3, thinPad: 0.5 },
  /** The danger layer of the score: a low drone with a slow tremolo against a minor second. */
  dangerLayer: { level: 0.085, freq: 55, interval: 1.0595, tremoloRate: 1.6, cutoff: 420 },
  /** Calm generated scores, one per music slot. */
  pad,
  /** Pad voices and envelope; a slow sweep on the pad's filter keeps long chords alive. */
  padVoice: { count: 4, detune: 6, attack: 3.5, release: 4.5, sweepRate: 0.045, sweepDepth: 0.3 },
  /** Melody bells: partial ratio and level, decay, and how much goes to the echo. */
  bell: { partial: 2.76, partialLevel: 0.25, ring: 2.6, send: 0.7 },
  /** Recorded music slots fade in and out over this many seconds. */
  recordedFade: 2.5,
  /** One-shot event sounds. Each threat has its own short figure so it can be learned by ear. */
  cue: {
    sting: { freq: 330, interval: 1.0595, level: 0.07, length: 0.9 },
    /** Char and trout: two low, woody notes rising a fourth, with a swish. */
    warnChar: { freq: 110, ratio: 1.335, level: 0.22, length: 0.45, gap: 0.17, swish: 0.12 },
    /** Birds above the smolt run: three soft wingbeats, then a high falling note. */
    warnBird: { beats: 3, beatGap: 0.09, beatLevel: 0.3, beatFreq: 1400, freq: 1320, end: 880, level: 0.1, length: 0.5 },
    /** A gull: two short high notes, falling. */
    warnGull: { freqs: [1568, 1318] as readonly number[], gap: 0.13, length: 0.14, level: 0.12 },
    /** A merganser: four paddling ticks. */
    warnMerganser: { ticks: 4, gap: 0.16, freq: 700, length: 0.07, level: 0.45 },
    /** A seal: a rising swoosh over a falling tone. */
    warnSeal: { from: 300, to: 1200, length: 0.8, level: 0.25, toneFrom: 180, toneTo: 90, toneLevel: 0.14 },
    /** An orca: a deep double pulse and a faint whistle. */
    warnOrca: { freq: 46, level: 0.32, length: 1.3, repeats: 2, gap: 0.55, whistle: 1100, whistleLevel: 0.035 },
    /** A salmon shark: lower and slower, with a rough overtone and no whistle. */
    warnShark: { freq: 36, overtone: 1.5, level: 0.34, overtoneLevel: 0.12, length: 1.6, repeats: 2, gap: 0.7 },
    /** A bear: two heavy footfalls on gravel. */
    warnBear: { freq: 70, end: 40, level: 0.4, length: 0.32, gap: 0.45, thud: 260, thudLevel: 0.22 },
    /** A lure taking hold: a reel's ratchet over a thin tone. */
    warnHook: { clicks: 8, gap: 0.035, freq: 2200, clickLevel: 0.35, tone: 1250, toneLevel: 0.06, length: 0.3 },
    /** A rival male: two mid knocks. */
    warnRival: { freq: 130, end: 90, level: 0.22, length: 0.15, gap: 0.22, knock: 520, knockLevel: 0.2 },
    strikeBird: { level: 0.45, length: 0.45, startFreq: 3000, endFreq: 600 },
    strikeBear: { level: 0.4, length: 0.8, startFreq: 1800, endFreq: 250, thump: 60, thumpLevel: 0.3 },
    strikeSeal: { level: 0.4, length: 0.35, startFreq: 400, endFreq: 1600, splash: 0.35 },
    chargeDeep: { freq: 44, level: 0.3, length: 1.2, repeats: 2, gap: 0.45 },
    surge: { level: 0.3, length: 1.6, startFreq: 200, endFreq: 700 },
    eat: { bubbles: 3, spread: 0.15, snapFreq: 3400, snapLevel: 0.06, snapLength: 0.015, gulpFreq: 320, gulpEnd: 160, gulpLevel: 0.12, gulpLength: 0.12 },
    /** A strike that just missed (feel pass): a rush of water past the fish and a low thump. */
    nearMiss: { level: 0.4, length: 0.45, startFreq: 3200, endFreq: 380, thumpFreq: 70, thumpEnd: 38, thumpLevel: 0.32, thumpLength: 0.32, minGap: 0.4 },
    wriggle: { level: 0.25, length: 0.18, freq: 700 },
    opening: { freq: 880, ratio: 1.5, level: 0.06, length: 1.6 },
    /** A leap at the falls: a rush up out of the water, then the splash back in. */
    leap: { up: 0.35, level: 0.3, splashDelay: 0.6, splashLevel: 0.4 },
    spawned: { freq: 220, ratios: [1, 1.25, 1.5, 2] as readonly number[], level: 0.06, gap: 0.35 },
    stageComplete: { freq: 440, ratio: 1.335, level: 0.05, gap: 0.3 },
    /** Death: a soft low fall with the world muffled, not a shock. */
    death: { startFreq: 196, endFreq: 98, level: 0.2, length: 2.6, fifth: 1.5, fifthLevel: 0.08, muffle: 240, attack: 0.15 },
    /** The life's end (the post-spawn sequence): a slow, warm rising chord of bells. */
    lifeEnd: { freq: 147, ratios: [1, 1.5, 2, 2.52, 3] as readonly number[], gap: 0.55, level: 0.05 },
  },
  /** Event sounds fade with distance from the fish (world units); never below `min`. */
  hearing: { range: 45, min: 0.2 },
  /** Seconds of noise in each shared buffer (looped, with the seam crossfaded). */
  noiseSeconds: 6.3,
  noiseSeam: 0.25,
  /**
   * Node budget (checked by tests/unit/audioGraph.test.ts): nodes built once,
   * and nodes alive at once for one-shot sounds in any stage.
   */
  budget: { persistent: 70, transient: 120 },
} as const;

export type MusicSlot = 'music.title' | 'music.egg' | 'music.fry' | 'music.smolt' | 'music.ocean' | 'music.return' | 'music.spawn' | 'music.danger' | 'music.end';

export const MUSIC_SLOTS: readonly MusicSlot[] = ['music.title', 'music.egg', 'music.fry', 'music.smolt', 'music.ocean', 'music.return', 'music.spawn', 'music.danger', 'music.end'];
