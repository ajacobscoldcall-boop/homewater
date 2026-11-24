/**
 * Presentation tuning for what lies at and above the surface: the bear's
 * stance and strike, the splash, the sky and the shore seen through Snell's
 * window. Render only, so it lives here and not in src/data/params.json.
 */

/** The bear standing on the bank or in the shallows and lunging into the water. */
export const BEAR_STRIKE = {
  /** Deepest water (m) the bear wades into, measured at its forefeet: legs wet, back dry. */
  wade: 0.5,
  /** Where its sim spot is under water, the bear stands back up the bank until the water at its feet is this shallow (m). */
  standDepth: 0.15,
  /** It walks out only until its jaws are this far (m, level) from the target; the lunge does the rest. */
  reach: 0.9,
  /** Steepest nose-down body pitch in a strike (radians). Deeper fish are out of reach. */
  maxPitch: 0.85,
  /** How far (m) the hind feet push forward in the lunge, at most. */
  lunge: 0.6,
  /** The body follows the bank's slope between hind and forefeet, within these pitches (radians). */
  slopePitch: [-0.12, 0.45] as const,
};

/** The splash where the bear's head and forepaws break the surface. */
export const SPLASH = {
  /** Spray and bubble particles per splash object (High; Medium draws 60%, Low 35%). */
  particles: 140,
  /** Seconds a burst lasts. */
  life: 1.1,
  /** White-water ring on the surface: radius it grows to (m) and seconds it lasts. */
  ringRadius: 1.4,
  ringLife: 0.9,
};

/** Sky colours (sRGB hex), blended by the renderer from each stage's light. */
export interface SkyLook {
  zenith: number;
  horizon: number;
  /** Low glow on one side of the sky (sun or afterglow), and its strength. */
  glow: number;
  glowStrength: number;
  /** Tree line and shore silhouettes. */
  trees: number;
  /** Far hills (lake and coast), hazier than the near tree line. */
  hills: number;
}

export const SKY: Record<'day' | 'dusk' | 'night' | 'winter', SkyLook> = {
  day: { zenith: 0x6fa6d6, horizon: 0xd6e6ea, glow: 0xfff3d6, glowStrength: 0.35, trees: 0x1e2c22, hills: 0x6d8790 },
  dusk: { zenith: 0x34446e, horizon: 0xe0956a, glow: 0xffb070, glowStrength: 0.9, trees: 0x161614, hills: 0x4a4458 },
  // A clear night with a bright moon (the smolt run): a deep blue sky, paler toward the moon's side (water.ts draws the moon).
  night: { zenith: 0x14223a, horizon: 0x2c3c56, glow: 0xaec2e0, glowStrength: 0.4, trees: 0x05080a, hills: 0x121a26 },
  winter: { zenith: 0x9aa8b2, horizon: 0xd2d6d4, glow: 0xf2f0e6, glowStrength: 0.15, trees: 0x2a302e, hills: 0x8a949a },
};

/** The shore seen from the water: a skyline height map built from the scenery's ground. */
export const SHORE = {
  /** Trees grow this far (m) back from the water's edge... */
  treeSetback: 2.5,
  /** ...to about this height (m), with this much variation (share). */
  treeHeight: 14,
  treeVary: 0.3,
  /** Alder and willow: a low band (m high) from this far back from the water to about this far. */
  alderHeight: 4.5,
  alderFrom: 0.6,
  alderTo: 4,
  /** Broadleaf stands: noise scale (1/m) and the noise level above which they replace the conifers. */
  broadleafScale: 0.03,
  broadleafFrom: 0.56,
  /** Margin (m) of land mapped around the arena. Beyond it the edge of the map repeats. */
  margin: 50,
  /** Height map cells across the longer side. */
  cells: 192,
  /** Tallest skyline height stored (m). */
  maxHeight: 32,
  /** Far shore around open water: hill height (m) at this distance (m). The lake has one; the ocean none. */
  farHills: { lake: [26, 260], bayCreek: [40, 420] } as Partial<Record<string, [number, number]>>,
};
