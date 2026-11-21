/**
 * The estuary at the end of the smolt run: presentation tuning, render only.
 * The simulation's salinity and readiness are in src/sim/stages/estuary.ts.
 *
 * - First light: the run's night (nightConfig.ts) brightens to dawn from the
 *   river mouth across the estuary, so the next stage (the open sea by day)
 *   follows on.
 * - Brackish water: the distance takes the colour of the water around the
 *   camera, tea-brown river water above, green-grey sea water below.
 * - The halocline: a faint shimmering sheet where the fresher top layer meets
 *   the salt water below (the way mixing water bends light).
 * - The last parr marks fade from the player's smolt as it gets ready for salt.
 * Colours are sRGB hex.
 */
export const ESTUARY = {
  /** Dawn runs from this far before the river mouth to this far into the estuary (world units along the run). */
  dawnFrom: -25,
  dawnTo: 80,
  /** Dawn light (blended from NIGHT by the dawn fraction). */
  dawn: {
    fog: 0x2f4a4c,
    fogDensity: 1.05,
    sky: 0xc9b9a6,
    ground: 0x1c2018,
    hemi: 0.75,
    sun: 0xffc48a,
    sunStrength: 0.95,
    /** Low in the sky, seaward (+x). */
    sunDir: [0.85, 0.42, 0.25] as readonly [number, number, number],
    water: 0.7,
    shafts: 0.22,
    shaftColor: 0xffd7a8,
    /** Glow on the school and the player's moonlit rim fade out by day. */
    glowLeft: 0.25,
  },
  /** Water colour by salinity around the camera: fresher (tea-brown) and salt (green-grey), and how strongly each tints. */
  freshTint: 0x3b3a26,
  saltTint: 0x1f4b50,
  tint: 0.45,
  /** The halocline sheet. */
  halocline: {
    colour: 0xbfd6cf,
    /** Opacity at the strongest salinity step. */
    opacity: 0.16,
    /** Noise texture repeats (u along the run, v across) and drift speed (texture units per second). */
    repeat: [26, 3] as readonly [number, number],
    drift: 0.012,
    /** Segments along the run. */
    segments: 90,
  },
  /** Parr marks left on the player's smolt: full strength at readiness `from`, gone at the sim's readyDone; drawn in `steps` steps. */
  parr: { from: 0.2, strength: 0.6, steps: 6 },
} as const;
