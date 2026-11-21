/**
 * Cinematic camera moments: timing and framing. Pure data (no three.js, no DOM).
 *
 * Presentation, not simulation: nothing here changes what happens in the sim,
 * only where the camera looks for a moment. Like goreConfig.ts and quality.ts,
 * it lives here rather than in params.json.
 *
 * Distances are in world units relative to the player's fish (`s` = the fish's
 * scale). `side` is the fish's right, `ahead` its heading, `up` is world up.
 */

export type MomentId = 'hatch' | 'lakeFirstLook' | 'smoltNight' | 'estuaryDawn' | 'sea' | 'maturation' | 'homeRiver' | 'spawning';

export interface ShotTiming {
  /** Whole shot, real seconds (1.5..3). */
  duration: number;
  /** Seconds to blend from the play camera into the shot. */
  easeIn: number;
  /** Seconds to blend back to the play camera at the end. */
  easeOut: number;
}

export const CINEMATICS = {
  /** A moment whose event arrives while a threat is hot waits this long for it to clear, then is dropped. */
  pendingWindow: 2.5,
  /** Blend back to the play camera after a key press or click. */
  skipEaseOut: 0.3,
  /** Letterbox bars, as a fraction of the screen height each (0 for none). */
  letterbox: 0.07,
  /** Keep the camera this far below the surface and above the bottom. */
  surfaceClear: 0.15,
  floorClear: 0.2,
  /** Keep the camera this far outside banks and walls. */
  wallClear: 0.4,
  /** In the egg stage the camera sits down among the cobbles. */
  gravelFloorClear: 0.06,
  /** How many fish-and-moment pairs are remembered per browser (so a reload doesn't replay them). */
  rememberMax: 200,
  shots: {
    /** A low, close shot of the alevin among the cobbles. */
    hatch: { duration: 2.6, easeIn: 0.6, easeOut: 0.6 },
    /** Rising out of the gravel and looking out across the lake. */
    lakeFirstLook: { duration: 3, easeIn: 0.5, easeOut: 0.7 },
    /** The smolt school leaving the lake at night, a wide shot from the side. */
    smoltNight: { duration: 3, easeIn: 0.7, easeOut: 0.7 },
    /** First light over the estuary: from below and behind, the fish against the brightening surface, looking seaward. */
    estuaryDawn: { duration: 2.8, easeIn: 0.7, easeOut: 0.7 },
    /** Reaching the sea: from below, the fish against the bright surface. */
    sea: { duration: 2.6, easeIn: 0.6, easeOut: 0.6 },
    /** The autumn maturation reveal: a slow half-orbit, side-on. */
    maturation: { duration: 3, easeIn: 0.6, easeOut: 0.6 },
    /** The river mouth that smells like home: craning up behind the fish to look up the river. */
    homeRiver: { duration: 2.8, easeIn: 0.6, easeOut: 0.7 },
    /** The spawning act: side-on to the pair over the redd. */
    spawning: { duration: 3, easeIn: 0.5, easeOut: 0.7 },
  } satisfies Record<MomentId, ShotTiming>,
  framing: {
    hatch: { side: 0.5, ahead: 0.32, up: 0.1, dollyFrom: 1.25, dollyTo: 0.9 },
    lakeFirstLook: { behindFrom: 0.5, behindTo: 1.2, upFrom: -0.12, upTo: 0.25, sideTo: 0.3, lookAhead: 6, lookUpFrom: 0.6, lookUpTo: -0.1 },
    smoltNight: { side: 9, up: 0.6, trackFrom: -2.5, trackTo: 2.5, schoolRadius: 12 },
    estuaryDawn: { behind: 2.4, side: 1.2, belowFrom: 0.6, belowTo: 1.4, lookAhead: 7, lookUp: 1.4 },
    sea: { ahead: 2.6, below: 2.2, side: 1.0, dollyFrom: 1.15, dollyTo: 0.9 },
    maturation: { radius: 1.3, radiusPerScale: 1.1, up: 0.15, angleFrom: 0.35, angleTo: 1.35 },
    homeRiver: { behindFrom: 1.4, behindTo: 2.6, upFrom: 0.2, upTo: 0.7, lookAhead: 6, lookUp: -0.1 },
    spawning: { distance: 3.0, distancePerScale: 0.6, up: 0.25, dollyFrom: 1.15, dollyTo: 0.95 },
  },
} as const;
