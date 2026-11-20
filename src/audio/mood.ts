/**
 * Pure decisions for the sound: how dangerous the moment is, which music
 * slot fits, which ambience to hear, and which cue an event plays. No Web
 * Audio here, so these can be unit-tested.
 */
import type { Entity, EntityKind, SimEvent, StageId } from '../sim/types';
import { AUDIO, type AmbienceProfile, type MusicSlot } from './config';

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
  return { base, danger: phase === 'playing' ? Math.max(0, Math.min(1, danger)) : 0 };
}

/** Where the fish is within a stage, as far as the ambience cares. */
export interface Place {
  stage: StageId;
  /** Return: inside the home river (past the coastline). */
  inRiver?: boolean;
  /** Return: over a riffle. */
  riffle?: boolean;
  /** Smolt: in the river mouth, near the sea. */
  mouth?: boolean;
}

/** The ambience profile for a place. Writes into `out` to avoid allocating every frame. */
export function ambienceFor(place: Place, out: AmbienceProfile): AmbienceProfile {
  const base = place.stage === 'return' && place.inRiver ? AUDIO.returnRiver : AUDIO.ambience[place.stage];
  Object.assign(out, base);
  if (place.stage === 'return' && place.inRiver && place.riffle) {
    const r = AUDIO.returnRiffle;
    out.washLevel *= r.level;
    out.textureLevel *= r.level;
    out.textureFreq *= r.textureFreq;
    out.wobbleRate *= r.wobbleRate;
    out.bubbleRate *= r.bubbleRate;
    out.muffle *= r.muffle;
  }
  if (place.stage === 'smolt' && place.mouth) {
    out.washCutoff *= AUDIO.smoltMouth.washCutoff;
    out.droneLevel *= AUDIO.smoltMouth.droneLevel;
  }
  return out;
}

export type Cue = 'sting' | 'pulse' | 'splash' | 'surge' | 'eat' | 'wriggle' | 'opening' | 'spawned' | 'stageComplete' | 'death';

/** The one-shot cue for a simulation event, or null for none. */
export function cueForEvent(ev: Pick<SimEvent, 'type' | 'key'>): Cue | null {
  switch (ev.type) {
    case 'warning':
      if (ev.key === 'orca' || ev.key === 'shark') return 'pulse';
      if (ev.key === 'opening') return 'opening';
      if (ev.key === 'flow' || ev.key === 'flood') return 'surge';
      return 'sting';
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

/** The cue for a predator changing state: strikes from above splash, charges from the deep pulse. */
export function cueForStrike(kind: EntityKind, from: string | undefined, to: string): Cue | null {
  if (from === undefined || from === to) return null;
  if ((kind === 'birdShadow' || kind === 'bear') && to === 'strike') return 'splash';
  if (kind === 'merganser' && to === 'dive') return 'splash';
  if (kind === 'seal' && to === 'lunge') return 'splash';
  if ((kind === 'orca' || kind === 'shark') && to === 'charge') return 'pulse';
  return null;
}

/** 0..1 how weak the fish is: low energy, or low fat on the return. */
export function weakness(energy: number, fat: number): number {
  return Math.max(0, Math.min(1, Math.max(1 - energy, 1 - fat * AUDIO.heart.fatScale)));
}

/** Seconds between heartbeats for a weakness, or null when the fish is fine. */
export function heartInterval(weak: number): number | null {
  const h = AUDIO.heart;
  if (weak < h.threshold) return null;
  const k = (weak - h.threshold) / (1 - h.threshold);
  return h.slowInterval + (h.fastInterval - h.slowInterval) * Math.min(1, k);
}
