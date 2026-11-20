/**
 * Third-person camera feel (presentation tuning, not params.json).
 * Units are world units and seconds; rates are 1/s for exponential follow.
 */
export const CAMERA = {
  /** Boom behind the fish: distance = scale * perScale + base; height = share of that. */
  boom: { perScale: 1.6, base: 1.0, back: 0.8, up: 0.75 },
  /** The camera's heading follows the fish's with this rate: a little lag on turns. */
  yawFollow: 4.2,
  /** Reduced motion: stiffer, so the view swings less. */
  yawFollowReduced: 9,
  /** Pitch of the boom follows the fish's pitch (times pitchShare) at this rate. */
  pitchFollow: 3.5,
  pitchShare: 0.4,
  /** The point the boom hangs from follows the fish at this rate (high: nearly rigid). */
  pivotFollow: 14,
  /** Look ahead of the fish: along its heading, plus a short lead along its velocity; `down` lowers the gaze (share of the look-ahead) so the fish sits nearer the middle of the frame, above the captions. */
  lookAhead: { perScale: 0.9, base: 0.6, velLead: 0.07, maxLead: 0.6, down: 0.6 },
  /** Look-at point follows at this rate. */
  lookFollow: 8,
  /** Keep this far from the ground, banks, walls and scenery. */
  margin: 0.28,
  /** Under the surface by at least this much: the surface is a hard visual line. */
  surfaceMargin: 0.18,
  /** Never pull the boom shorter than this share of its full length (then rise instead). */
  minBoom: 0.28,
  /** When the boom is pulled in below this share even after rising, swing it aside by one of these offsets (rad), easing at `follow`. */
  dodge: { below: 0.45, offsets: [0.5, -0.5, 1.0, -1.0, 1.5, -1.5] as readonly number[], follow: 3 },
  /** Solid scenery closer to the fish than this is ignored by the camera's ray (the fish is touching it). */
  rayNear: 0.3,
  /** Samples along the boom when looking for ground and walls. */
  samples: 14,
  /** Boom length: pulls in fast when blocked, eases back out slowly. */
  pullIn: 22,
  easeOut: 2.6,
  /** Near-miss shake: amplitude (units, times fish scale + 0.5), length (s), frequency (Hz). Off with reduced motion. */
  shake: { amp: 0.07, length: 0.38, freq: 23 },
  /** Banking into turns (render): roll per rad/s of yaw rate, capped, and how fast it follows. */
  bank: { perYawRate: 0.2, max: 0.42, follow: 7 },
} as const;
