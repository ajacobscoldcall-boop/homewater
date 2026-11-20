/**
 * Light shafts (water.ts LightShafts): presentation tuning, render only.
 *
 * The shafts are flat camera-facing planes. From the low chase camera they are
 * seen side-on at the fish's depth, so every hard edge shows: the top where a
 * plane meets (or pokes through) the surface, the sides of a near plane filling
 * the screen, and far planes that never fogged out. These numbers keep them soft
 * beams instead: clipped at the surface and faded in just below it, faded near
 * the camera and into the fog, ragged at the sides, and brighter looking up
 * toward the light than looking along them.
 */
export const SHAFTS = {
  /** Depth below the surface over which a shaft fades in (world units), so it never meets the surface as a step. */
  topFade: 1.6,
  /** Fraction of the shaft's height at the bottom over which it fades out. */
  bottomFade: 0.35,
  /** Brightness falls off with depth below the surface: exp(-falloff * depth). */
  falloff: 0.07,
  /** Distance from the camera over which a shaft fades in (from, to; world units): a near plane never fills the screen. */
  near: [3, 9] as readonly [number, number],
  /** How much of the scene's fog the shafts take (1 = the same fog as the scenery). */
  fog: 1,
  /** Brightness looking straight along the shaft (level view) relative to looking up into it. */
  level: 0.45,
  /** Width at the bottom relative to the top: beams spread a little as they go down. */
  spread: 1.5,
  /** Ragged sides: strength and frequency of the streaks across a shaft. */
  streaks: 0.35,
  streakFreq: 17,
  /** Overall gain, since fog and the fades above take away light the old flat planes had. */
  gain: 1.35,
} as const;
