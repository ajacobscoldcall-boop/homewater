/**
 * Pure decisions for the sound: how dangerous the moment is, which music
 * slot fits, which ambience to hear, and which cue an event plays. No Web
 * Audio here, so these can be unit-tested.
 */
import type { Entity, EntityKind, SimEvent, StageId } from '../sim/types';
import { AUDIO, type AmbienceProfile, type Cue, type MusicSlot } from './config';

export type { Cue } from './config';

/** Predators, and the states in which they are a threat (as in App.updateThreats). */
export const PREDATORS: ReadonlySet<EntityKind> = new Set<EntityKind>(['trout', 'birdShadow', 'merganser', 'seal', 'orca', 'shark', 'bear', 'lure']);
export const HOT_STATES: ReadonlySet<string> = new Set(['chase', 'strike', 'lunge', 'charge', 'dive', 'hooked']);
export const WARN_STATES: ReadonlySet<string> = new Set(['warn']);

type EntityLike = Pick<Entity, 'kind' | 'state' | 'alive'>;

/**
 * 0..1: 0 when no predator is active, the warn weight while one is warning,
 * and 1 while one is attacking.
 */
export function dangerLevel(entities: readonly EntityLike[]): number {
  let d = 0;
  for (const e of entities) {
    if (!e.alive || !PREDATORS.has(e.kind)) continue;
    if (HOT_STATES.has(e.state)) return AUDIO.danger.hotWeight;
    if (WARN_STATES.has(e.state)) d = Math.max(d, AUDIO.danger.warnWeight);
  }
  return d;
}

export type Phase = 'title' | 'menu' | 'playing' | 'paused' | 'end';

export interface MusicChoice {
  /** The calm base slot, or null for silence. */
  base: MusicSlot | null;
  /** 0..1 level for the 'music.danger' layer on top. */
  danger: number;
}

/** Which music slot plays, given where the player is and how tense things are. */
export function chooseMusic(phase: Phase, stage: StageId | null, danger: number): MusicChoice {
  if (phase === 'end') return { base: 'music.end', danger: 0 };
  if (phase === 'title' || !stage) return { base: 'music.title', danger: 0 };
  const base = `music.${stage}` as MusicSlot;
  // Danger is only scored while actually playing; menus and pause stay calm.
  return { base, danger: phase === 'playing' ? clamp01(danger) : 0 };
}

/** Where the fish is within a stage, as far as the ambience cares. */
export interface Place {
  stage: StageId;
  /** Return: inside the home river (past the coastline). */
  inRiver?: boolean;
  /** Return: over a riffle. */
  riffle?: boolean;
  /** Return: in the rapids below the falls. */
  rapids?: boolean;
  /** Return: 0..1 how near the falls are (see `fallsNear`). */
  falls?: number;
  /** Return: crossing the nursery lake at the end. */
  lake?: boolean;
  /** Smolt: in the river mouth, near the sea. */
  mouth?: boolean;
  /** Smolt: 0..1 through the estuary (0 at its start, 1 at the sea end). */
  estuary?: number;
  /** Egg: 0..1 flood level. */
  flood?: number;
  /** Fry: 0..1 daylight. */
  light?: number;
  /** Depth below the surface, world units. */
  depth?: number;
  /** Spawn: how many other spawners are on the grounds. */
  crowd?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0..1 how loud the falls are at a distance (world units) from the face. */
export function fallsNear(dist: number): number {
  const f = AUDIO.falls;
  return Math.pow(clamp01(1 - dist / f.range), f.curve);
}

/** Splashes per second on the spawning grounds for a crowd of `n` spawners. */
export function crowdSplashRate(n: number): number {
  const c = AUDIO.spawnCrowd;
  return Math.min(c.maxRate, c.base + c.perFish * Math.max(0, n));
}

/** The ambience profile for a place. Writes into `out` to avoid allocating every frame. */
export function ambienceFor(place: Place, out: AmbienceProfile): AmbienceProfile {
  const st = place.stage;
  const base = st === 'return' && place.lake ? AUDIO.returnLake : st === 'return' && place.inRiver ? AUDIO.returnRiver : AUDIO.ambience[st];
  Object.assign(out, base);
  if (st === 'return' && place.inRiver && !place.lake) {
    const r = place.rapids ? AUDIO.rapids : place.riffle ? AUDIO.returnRiffle : null;
    if (r) {
      out.washLevel *= r.level;
      out.textureLevel *= r.level;
      out.textureFreq *= r.textureFreq;
      out.wobbleRate *= r.wobbleRate;
      out.bubbleRate *= r.bubbleRate;
      out.muffle *= r.muffle;
      if ('gravelRate' in r) out.gravelRate *= r.gravelRate;
    }
  }
  const near = st === 'return' ? clamp01(place.falls ?? 0) : 0;
  if (near > 0) {
    const f = AUDIO.falls;
    out.roarLevel = f.level * near;
    out.roarCutoff = f.cutoffLow + (f.cutoffHigh - f.cutoffLow) * near;
    out.washLevel *= 1 + f.washBoost * near;
    out.bubbleRate += f.bubbleRate * near;
  }
  if (st === 'smolt' && place.mouth) {
    out.washCutoff *= AUDIO.smoltMouth.washCutoff;
    out.droneLevel *= AUDIO.smoltMouth.droneLevel;
    out.swellLevel = AUDIO.smoltMouth.swellLevel;
  }
  if (st === 'smolt' && (place.estuary ?? -1) >= 0) {
    const e = clamp01(place.estuary ?? 0);
    const s = AUDIO.estuary;
    out.swellLevel = Math.max(out.swellLevel, AUDIO.smoltMouth.swellLevel + (s.swellLevel - AUDIO.smoltMouth.swellLevel) * e);
    out.swellCutoff = s.swellCutoffFrom + (s.swellCutoffTo - s.swellCutoffFrom) * e;
    out.swellRate = s.swellRate;
    out.swellDepth = s.swellDepth;
    out.washLevel *= 1 - s.riverFade * e;
    out.textureLevel *= 1 - s.riverFade * e;
    out.washCutoff *= AUDIO.smoltMouth.washCutoff;
    out.droneLevel *= AUDIO.smoltMouth.droneLevel;
    out.plopRate = s.plopRate * e;
    out.gravelRate = 0;
  }
  if (st === 'egg' && place.flood) {
    const k = clamp01(place.flood);
    const f = AUDIO.flood;
    out.washLevel *= 1 + f.wash * k;
    out.washCutoff *= 1 + f.washCutoff * k;
    out.droneLevel *= 1 + f.drone * k;
    out.textureLevel *= 1 + f.texture * k;
    out.gravelRate += f.gravelRate * k;
    out.muffle *= 1 + f.muffle * k;
  }
  if ((st === 'fry' || (st === 'return' && place.lake)) && place.light !== undefined) {
    const night = 1 - clamp01(place.light);
    out.plopRate *= 1 - (1 - AUDIO.lakeNight.plopRate) * night;
    out.washLevel *= 1 - (1 - AUDIO.lakeNight.wash) * night;
  }
  if (st === 'ocean' && place.depth !== undefined) {
    const d = clamp01(place.depth / AUDIO.oceanDepth.depthScale);
    out.swellLevel *= 1 - AUDIO.oceanDepth.swellFade * d;
  }
  if (st === 'spawn') {
    const n = Math.max(0, place.crowd ?? 0);
    const c = AUDIO.spawnCrowd;
    out.splashRate = crowdSplashRate(n);
    out.textureLevel *= Math.min(c.textureMax, c.textureFrom + c.texturePer * n);
  }
  return out;
}

/** The cue for a warning, by its key: each kind of threat has its own figure. */
export function cueForWarning(key: string | undefined): Cue {
  switch (key) {
    case 'trout':
    case 'char':
      return 'warnChar';
    case 'bird':
      return 'warnBird';
    case 'gull':
      return 'warnGull';
    case 'merganser':
      return 'warnMerganser';
    case 'seal':
      return 'warnSeal';
    case 'orca':
      return 'warnOrca';
    case 'shark':
      return 'warnShark';
    case 'bear':
      return 'warnBear';
    case 'hooked':
      return 'warnHook';
    case 'rival':
      return 'warnRival';
    case 'opening':
      return 'opening';
    case 'flow':
    case 'flood':
      return 'surge';
    default:
      return 'sting';
  }
}

/** The one-shot cue for a simulation event, or null for none. */
export function cueForEvent(ev: Pick<SimEvent, 'type' | 'key'>): Cue | null {
  switch (ev.type) {
    case 'warning':
      return cueForWarning(ev.key);
    case 'eat':
      return 'eat';
    case 'wriggle':
      return 'wriggle';
    case 'spawned':
      return 'spawned';
    case 'death':
      return 'death';
    case 'stageComplete':
      return 'stageComplete';
    default:
      return null;
  }
}

/** The cue for a predator changing state: strikes from above splash, lunges whoosh, charges from the deep pulse. */
export function cueForStrike(kind: EntityKind, from: string | undefined, to: string): Cue | null {
  if (from === undefined || from === to) return null;
  if (kind === 'birdShadow' && to === 'strike') return 'strikeBird';
  if (kind === 'merganser' && to === 'dive') return 'strikeBird';
  if (kind === 'bear' && to === 'strike') return 'strikeBear';
  if (kind === 'seal' && to === 'lunge') return 'strikeSeal';
  if ((kind === 'orca' || kind === 'shark') && to === 'charge') return 'chargeDeep';
  return null;
}

/** 0..1 how weak the fish is: low energy, or low fat on the return. */
export function weakness(energy: number, fat: number): number {
  return clamp01(Math.max(1 - energy, 1 - fat * AUDIO.heart.fatScale));
}

/** Seconds between heartbeats for a weakness, or null when the fish is fine. */
export function heartInterval(weak: number): number | null {
  const h = AUDIO.heart;
  if (weak < h.threshold) return null;
  const k = (weak - h.threshold) / (1 - h.threshold);
  return h.slowInterval + (h.fastInterval - h.slowInterval) * Math.min(1, k);
}

/**
 * Melody: the next scale index from `prev` (a short random walk that stays
 * inside the scale), given a uniform random number in [0, 1).
 */
export function nextDegree(prev: number, size: number, r: number): number {
  const steps = [-2, -1, -1, 1, 1, 2];
  let n = prev + (steps[Math.floor(r * steps.length)] ?? 1);
  if (n < 0) n = 1;
  if (n >= size) n = size - 2;
  return Math.max(0, Math.min(size - 1, n));
}

/** A noise buffer's samples with the loop seam crossfaded, so the loop never clicks. */
export function seamless(data: Float32Array, seam: number): void {
  const n = Math.min(seam, Math.floor(data.length / 2));
  const len = data.length - n;
  // The last n samples fade into the first n; the loop then plays 0..len.
  for (let i = 0; i < n; i++) {
    const k = i / n;
    data[i] = (data[i] as number) * k + (data[len + i] as number) * (1 - k);
  }
}

/** Fill `data` with brown-ish noise (integrated white noise, leaky), normalised to ±1. */
export function brownNoise(data: Float32Array, rnd: () => number): void {
  let last = 0;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02;
    data[i] = last;
    peak = Math.max(peak, Math.abs(last));
  }
  const s = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] as number) * s;
}
