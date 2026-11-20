/**
 * Photo mode tuning: camera limits and speeds, looks, focus blur and capture
 * sizes. Presentation only (like cinematicsConfig.ts), so it lives here and
 * not in src/data/params.json: nothing here touches the simulation.
 */
import type { QualityLevel } from './quality';

export interface PhotoLimits {
  /** Closest the camera gets to the point it orbits (m). */
  minDist: number;
  /** Farthest the camera gets from the point it orbits (m). */
  maxDist: number;
  /** How far the orbit point can be flown away from the fish (m). */
  maxTarget: number;
  /** Speed of flying the orbit point (m/s). */
  moveSpeed: number;
  /** Clearance kept under the water's surface (m), so the camera never pops out of the water. */
  surfaceMargin: number;
  /** Clearance kept above the ground, banks and bed (m). */
  groundMargin: number;
}

/** The redd (egg stage) is a few hand-spans of gravel; everywhere else is open water. */
export const PHOTO_LIMITS: { redd: PhotoLimits; open: PhotoLimits } = {
  redd: { minDist: 0.12, maxDist: 1.3, maxTarget: 0.6, moveSpeed: 0.35, surfaceMargin: 0.04, groundMargin: 0.04 },
  open: { minDist: 0.3, maxDist: 7, maxTarget: 4, moveSpeed: 1.6, surfaceMargin: 0.15, groundMargin: 0.2 },
};

export const PHOTO = {
  /** Orbit speed with keys or the right stick (rad/s). */
  orbitSpeed: 1.5,
  /** Orbit per pixel of mouse drag (rad). */
  dragOrbit: 0.006,
  /** Pan per pixel of right-drag, as a share of the orbit distance. */
  dragPan: 0.002,
  /** Zoom per second with keys or triggers (log scale). */
  zoomSpeed: 1.2,
  /** Zoom per wheel unit (log scale). */
  wheelZoom: 0.0012,
  /** Tilt limit (rad) so the view never flips over the top. */
  maxPitch: 1.45,
  /** Steps along the line from the orbit point to the camera when checking for scenery. */
  armSteps: 24,
  /** Field of view range and default (degrees). The play camera uses 65. */
  fovMin: 20,
  fovMax: 100,
  fovDefault: 55,
  /** Seconds before the control hint fades. */
  hintTime: 7,
};

export const LOOKS = ['natural', 'contrast', 'mono', 'warm', 'cool'] as const;
export type Look = (typeof LOOKS)[number];

export const LOOK_LABELS: Record<Look, string> = {
  natural: 'Natural',
  contrast: 'High contrast',
  mono: 'Black and white',
  warm: 'Warm',
  cool: 'Cool',
};

/**
 * A look as a simple grade: saturation, contrast about mid-grey, a colour
 * multiply and a lift, applied in display (sRGB) space.
 */
export interface Grade {
  saturation: number;
  contrast: number;
  tint: [number, number, number];
  lift: number;
}

export const GRADES: Record<Look, Grade> = {
  natural: { saturation: 1, contrast: 1, tint: [1, 1, 1], lift: 0 },
  contrast: { saturation: 1.18, contrast: 1.35, tint: [1, 1, 1], lift: -0.02 },
  mono: { saturation: 0, contrast: 1.2, tint: [1, 1, 1], lift: 0 },
  warm: { saturation: 1.05, contrast: 1.05, tint: [1.12, 1.0, 0.82], lift: 0.01 },
  cool: { saturation: 0.95, contrast: 1.05, tint: [0.86, 1.0, 1.14], lift: 0.0 },
};

/** Letterbox: the picture's height as a share of its width (2.39:1 film frame). */
export const LETTERBOX_ASPECT = 1 / 2.39;

/**
 * Focus blur (depth of field): taps per pixel by quality level; 0 turns it off.
 * Low has none, to stay cheap.
 */
export const FOCUS_TAPS: Record<QualityLevel, number> = { low: 0, medium: 8, high: 16 };
/** Largest blur radius, as a share of the picture's height. */
export const FOCUS_MAX_BLUR = 0.012;
/** Depth range kept sharp around the fish, as a share of the focus distance. */
export const FOCUS_RANGE = 0.35;

/** Largest capture size multiplier by quality level (1× is the window's size in CSS pixels). */
export const CAPTURE_MAX_SCALE: Record<QualityLevel, number> = { low: 1, medium: 1.5, high: 2 };
/** Never capture more pixels than this, whatever the window (about 4K). */
export const CAPTURE_MAX_PIXELS = 3840 * 2400;

/** The small mark in the corner. */
export const MARK = {
  text: 'Homewater',
  /** Text height as a share of the picture's height. */
  size: 0.028,
  /** Distance from the corner as a share of the picture's height. */
  inset: 0.03,
  alpha: 0.72,
};
