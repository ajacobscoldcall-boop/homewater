/** Presentation tuning for the return's water feel (src/render/waterFeel.ts). Render only, so not in params.json. */
export const WATER_FEEL = {
  /** Fog colour in a cool refuge, and how far it is blended in at full feel. */
  cool: 0x2f6f8e,
  coolTint: 0.35,
  /** Fog density multiplier at full refuge (below 1 is clearer). */
  coolClear: 0.7,
  /** Fog colour in hot, low-oxygen water: a pale green-brown haze. */
  warm: 0x7d8a5a,
  warmTint: 0.3,
  /** Fog density multiplier at full heat. */
  warmHaze: 1.35,
  /** Seconds to ease halfway to a new feel. */
  ease: 0.6,
  /** Shimmer motes per seep by quality.envDetail (0, 1, 2). */
  motes: [10, 22, 36] as const,
  /** Height (m) the motes rise before fading, and their speed (m/s). */
  rise: 2.6,
  speed: 0.45,
  /** Mote size (m) and opacity at full warmth (they fade out in cool years). */
  size: 0.09,
  opacity: 0.5,
  color: 0xd8ecf2,
};
