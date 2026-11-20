/**
 * The smolt run's night (smolts leave the lake at night): presentation tuning,
 * read by the Renderer when the stage has no light of its own. Render only.
 *
 * The aim is a real night that stays playable: dark blue-black water that
 * swallows the distance, a moonlit surface overhead (Snell's window shows the
 * moon and a pale sky), and fish lit faintly from above so the school reads as
 * silver backs and dark shapes against the surface. Threat cues keep their
 * contrast: a bird's shadow crosses the pale window, markers are drawn by the HUD.
 */
export const NIGHT = {
  /** Water colour in the distance (fog) and its thickness relative to the river's day value. */
  fog: 0x0a1820,
  fogDensity: 1.25,
  /** Hemisphere: moonlit sky above, black bed below, and its strength. */
  sky: 0x7d94b8,
  ground: 0x06080a,
  hemi: 0.42,
  /** The moon: a cool light from high overhead (the sky shader in water.ts draws the moon in the same direction). */
  moon: 0xbfd0ee,
  moonStrength: 0.8,
  moonDir: [-0.25, 1, 0.35] as readonly [number, number, number],
  /** Caustics and surface brightness (sharedWater.uLight). */
  water: 0.32,
  /** Light shafts: faint moonbeams. */
  shafts: 0.07,
  shaftColor: 0xa9c0e6,
  /** A faint cool glow on the smolt school-mates, so their shapes stay readable in the dark. */
  schoolGlow: 0x0b1620,
  /** The player's own smolt glows a little more, so it never sinks into the dark. */
  playerGlow: 0x14222c,
  /**
   * The player's own smolt, seen from the low chase camera against dark water: a moonlit rim along the back
   * and edges (fishMesh.ts uRim), a little light from the camera's side on the silver flank (uFill), and less
   * metal, so the flank takes the moonlight instead of mirroring a black sky. Colours are sRGB hex.
   */
  playerRim: 0x6f8fb8,
  playerFill: 0x8aa2bf,
  playerMetalness: 0.08,
  playerRoughness: 0.4,
} as const;
