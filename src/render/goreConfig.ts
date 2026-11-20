/**
 * The gore setting: tuning and plans for wounds, senescence, death beats and
 * the post-spawn sequence. Pure TypeScript (no three.js, no DOM), so it can be
 * unit tested.
 *
 * These numbers are presentation, not simulation: nothing here changes what
 * happens in the sim, only how it is shown. Like the audio tuning in
 * src/audio/config.ts, they live here rather than in params.json.
 */
import type { DeathCause, Sex } from '../sim/types';

/** "Unflinching" shows predation and decay plainly; "Documentary" cuts away before the worst. */
export type GoreMode = 'unflinching' | 'documentary';

export const GORE = {
  wounds: {
    /** Wound slots in the fish shader. */
    max: 8,
    /** World seconds for a fresh wound to stop looking raw. */
    healSeconds: 40,
    /** On each time skip between stages, old wounds fade to this fraction (scars). */
    stageScar: 0.6,
    /** Juvenile wounds (before the ocean) fade further: young fish heal and outgrow them. */
    juvenileScar: 0.3,
    /** Below this strength a wound is dropped. */
    minStrength: 0.12,
  },
  /**
   * Near misses: a predator that strikes or lunges within this many times its
   * catch radius, without catching the fish, leaves a mark.
   */
  near: {
    factor: 1.7,
    /** Catch radii that are fixed in the stage code rather than in params.json. */
    charCatch: 0.9,
    merganserCatch: 0.8,
    /** A bird's strike radius is the shadow's radius; bears use their strike radius. */
    birdFactor: 1.5,
    bearFactor: 1.6,
    /** A bird can only reach a fish this shallow (plus the sim's reach) to scrape it. */
    birdDepthSlack: 0.8,
  },
  /** Senescence on the spawning grounds, 0..1. Advisor: fish stay fit while migrating, then turn ragged after weeks on the grounds. */
  wear: {
    /** On arrival at the grounds. */
    arrive: 0.12,
    /** By the end of the spawning stage from time alone. */
    byEnd: 0.55,
    /** Extra wear after spawning, reached over afterSpawnSeconds. */
    afterSpawn: 0.35,
    afterSpawnSeconds: 20,
    /** Other fish on the grounds: the player's wear times 1 +/- this. */
    othersSpread: 0.35,
    /** The carcass at the end of the post-spawn sequence (1 = spent, more = decaying). */
    carcass: { unflinching: 1.3, documentary: 1.0 },
  },
  /** The death beat: a short moment before the death screen. */
  beat: {
    unflinching: { ms: 1700 },
    /** Documentary: the strike starts, then the screen fades to black. */
    documentary: { ms: 1250, fadeAtMs: 220, fadeMs: 260 },
    /** How far and fast the predator carries the fish away (world units per second, times its scale). */
    carrySpeed: 2.2,
    turnSeconds: 0.55,
    /** A bear holds the fish at least this far under the surface (times the fish's size), so the underwater camera sees it in the jaws. */
    bearHoldDepth: 0.45,
    /** ...and this far (times the fish's size) towards the camera from the middle of its jaws. */
    bearHoldNear: 0.16,
    /** The camera closes in under the water to this far (times the fish's size, m) from the bear's jaws... */
    bearCamNear: 2.6,
    /** ...over this many seconds. */
    bearCamSeconds: 0.9,
  },
  /** Gravel drawn round the carcass after death: stones, radius and stone sizes, times the fish's size. */
  bed: { stones: 160, radius: 1.2, minStone: 0.03, maxStone: 0.075 },
  /** Blood and scales in the water (Unflinching only). */
  cloud: { blood: 220, scales: 46, seconds: 4.5, spread: 0.9 },
  /** The post-spawn sequence: a series of fades, not a cinematic. */
  end: { cardMs: 2300, fadeMs: 650, fastCardMs: 220, fastFadeMs: 60 },
} as const;

/** How a predator takes the fish in the death beat. */
export type BeatStyle = 'carry' | 'lift' | 'line' | 'net';

export interface DeathBeatPlan {
  cause: DeathCause;
  style: BeatStyle;
  /** The entity kind that did it, if it is drawn (the renderer finds the nearest one). */
  killer: 'trout' | 'birdShadow' | 'merganser' | 'seal' | 'orca' | 'shark' | 'bear' | 'lure' | null;
  mode: GoreMode;
  ms: number;
  /** Documentary: when the fade to black starts, and how long it takes. */
  fadeAtMs: number | null;
  fadeMs: number;
  /** Blood in the water. Human-caused deaths are no more graphic than natural ones: scales only. */
  blood: boolean;
}

const KILLERS: Partial<Record<DeathCause, { killer: DeathBeatPlan['killer']; style: BeatStyle; blood: boolean }>> = {
  trout: { killer: 'trout', style: 'carry', blood: true },
  char: { killer: 'trout', style: 'carry', blood: true },
  merganser: { killer: 'merganser', style: 'carry', blood: true },
  seal: { killer: 'seal', style: 'carry', blood: true },
  orca: { killer: 'orca', style: 'carry', blood: true },
  shark: { killer: 'shark', style: 'carry', blood: true },
  bird: { killer: 'birdShadow', style: 'lift', blood: true },
  bear: { killer: 'bear', style: 'lift', blood: true },
  angler: { killer: 'lure', style: 'line', blood: false },
  gillnet: { killer: null, style: 'net', blood: false },
};

/** The death beat for a cause, or null when there is no moment to show (exhaustion, floods, failed spawning, lost at sea). */
export function deathBeatPlan(cause: DeathCause | null, mode: GoreMode): DeathBeatPlan | null {
  const k = cause ? KILLERS[cause] : undefined;
  if (!cause || !k) return null;
  if (mode === 'documentary') {
    const d = GORE.beat.documentary;
    return { cause, ...k, mode, ms: d.ms, fadeAtMs: d.fadeAtMs, fadeMs: d.fadeMs, blood: false };
  }
  return { cause, ...k, mode, ms: GORE.beat.unflinching.ms, fadeAtMs: null, fadeMs: 0 };
}

/** What the 3D view shows during a card of the post-spawn sequence. */
export type EndScene = 'spent' | 'death' | 'carcass' | 'forest' | 'seasons' | 'eggs';

export interface EndCard {
  /** Caption id (captions.json). */
  id: string;
  scene: EndScene;
}

/**
 * The post-spawn sequence: the spent fish, its death, (Unflinching only) the
 * decaying carcass close up, the stream and forest, the seasons, the eggs.
 */
export function endCards(sex: Sex, mode: GoreMode): EndCard[] {
  const cards: EndCard[] = [
    { id: sex === 'F' ? 'end.spentFemale' : 'end.spentMale', scene: 'spent' },
    { id: 'end.decay', scene: 'death' },
  ];
  if (mode === 'unflinching') cards.push({ id: 'end.carcass', scene: 'carcass' });
  cards.push({ id: 'end.forest', scene: 'forest' }, { id: 'end.seasons', scene: 'seasons' }, { id: 'end.hatch', scene: 'eggs' });
  return cards;
}

/** Total length of the sequence in milliseconds, played normally or fast (tests, debug). */
export function endSequenceMs(cards: readonly EndCard[], fast: boolean): number {
  const e = GORE.end;
  return cards.length * (fast ? e.fastCardMs + e.fastFadeMs : e.cardMs + e.fadeMs);
}
