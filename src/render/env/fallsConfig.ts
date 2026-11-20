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
  /** The side channel's white water before it opens (a trickle), as a share of its full strength. */
  chuteClosed: 0.25,
  /** Seconds for the driftwood jam to swing aside. */
  jamSwing: 1.6,
  /** White water fades out between these distances from the camera. */
  fadeNear: 14,
  fadeFar: 34,
} as const;
