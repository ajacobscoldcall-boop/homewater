/**
 * Presentation tuning for the scavengers on the spawning grounds
 * (src/render/scavengers.ts). Render only, so not in params.json.
 */
export const SCAVENGERS = {
  /** Lateness: 1 - strength; dead fish start drifting at lateFrom and are at their most at lateFull. */
  lateFrom: 0.35,
  lateFull: 0.8,
  /** Gulls and drifting dead fish per environment detail level (Low, Medium, High). */
  gulls: [2, 3, 5] as const,
  drifters: [1, 2, 3] as const,
  /** Bear leftovers: wear (1 = spent; more = decaying), extra wear for how much was eaten, bites at most. */
  carcassWear: 1.2,
  carcassWearEaten: 0.3,
  maxBites: 3,
  /** Water depth at which a carcass at the edge comes to rest. */
  edgeDepth: 0.35,
  drift: { speed: 0.7, margin: 6, halfWidth: 5.5, float: 0.12 },
  gullScale: 1.25,
  gullHigh: 9,
  gullSpeed: 6,
  /** Distance at which a gull lands, and how far round its meal it floats. */
  gullSettle: 0.4,
  gullRing: 0.75,
  peckRate: 3.1,
  peckPitch: 0.75,
  eagle: {
    scale: 1.25,
    /** Lateness at which the eagle comes even without a carcass on the bank. */
    comeAt: 0.5,
    height: 11,
    circleRate: 0.18,
    circleRadius: 14,
    circleTime: 9,
    swoopSpeed: 7,
    /** Height of its body over the surface as the talons take the fish, and the distance at which its feet come forward. */
    grabHeight: 0.4,
    grabFrom: 3,
    carrySpeed: 5,
    carryTime: 4,
    standHeight: 0.38,
  },
};
