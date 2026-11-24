/** Presentation tuning for the falls and rapids scenery (render only; the rules are in params.json). */
export const FALLS_FX = {
  /** White-water particles per part, at full scenery detail. */
  sheet: 420,
  curtain: 320,
  boil: 260,
  wave: 360,
  poolFoam: 220,
  perRock: 45,
  rapids: 520,
  chute: 260,
  /** Height of the rapids' boulder tops (the surface is 0). */
  rockTop: -0.3,
  /** The side channel's white water before it opens, as a share of its full strength (enough to see the way is there). */
  chuteClosed: 0.5,
  /** White water breaking over the practice ledge in the rapids. */
  practice: 160,
  /**
   * The launch spot: a patch of brighter foam on the underside of the surface over the standing wave, under the
   * low step (sized by the sim's return.leapWaveReach and return.leapNotchReach). Peak opacity, and how much it
   * breathes (0..1) over `pulse` seconds.
   */
  launch: { opacity: 0.8, breathe: 0.25, pulse: 2.4 },
  /** Bubbles boiling up just under the launch spot, so it reads from the side too (particles at full detail). */
  launchBoil: 320,
  /** Extra brightness of the falling curtain under the low step, where a leap clears most easily. */
  notchBright: 0.35,
  /** Seconds for the driftwood jam to swing aside. */
  jamSwing: 1.6,
  /** White water fades out between these distances from the camera. */
  fadeNear: 14,
  fadeFar: 34,
} as const;
