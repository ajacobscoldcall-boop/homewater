/**
 * The always-visible minimal HUD (presentation tuning, not params.json): two thin rings in the bottom-left
 * corner (energy, and fat on the return or strength on the grounds), and a water-temperature chip on the
 * return that shows only when the water is near the heat-stress threshold.
 */
export const VITALS = {
  /** Fat ring: amber below `low`, red and pulsing below `critical` (share of a full store). */
  fat: { low: 0.4, critical: 0.2 },
  /**
   * Early warning: the fat ring also turns amber when, at the recent rate of burn, it would run out within
   * `warnSeconds`, and red within `criticalSeconds`. The rate is smoothed over about 1 / `rateFollow` seconds
   * and needs `minWatch` seconds of watching before it counts.
   */
  burn: { warnSeconds: 75, criticalSeconds: 30, rateFollow: 0.35, minWatch: 3 },
  /** Energy (or yolk, or strength) ring: amber below `low`. */
  energy: { low: 0.3, critical: 0.15 },
  /** The water chip shows from this many °C below the heat-stress temperature, or with any heat stress or low oxygen. */
  water: { showBelow: 1.5, stressShown: 0.02 },
  /**
   * The smolt run's estuary: the "salt ready" ring shows from `ringFrom` and the water chip from `chipFrom`
   * (fractions into the estuary; negative is upstream of it, at the river mouth); salinity above `seaAbove`
   * reads as salt water.
   */
  salt: { ringFrom: -0.3, chipFrom: 0, seaAbove: 0.7 },
  /** Ring geometry (SVG units): radius and stroke. */
  ring: { r: 15, stroke: 3 },
} as const;

/** Documentary view's edge shadow: how dark it gets for a warning and for an attack (0..1). */
export const EDGE_SHADOW = { warn: 0.45, hot: 0.8 } as const;
