/**
 * Third-person camera feel (presentation tuning, not params.json).
 * Units are world units and seconds; rates are 1/s for exponential follow.
 */
export type CameraView = 'chase' | 'high';

export const CAMERA = {
  /**
   * The two third-person views (V cycles chase, high, first-person; Readability page sets the default).
   * - boom: distance behind the fish = scale * perScale + base; `back` and `up` share that distance between behind and above.
   * - side: the boom swings this far (rad) off the fish's tail axis, so the body is seen three-quarter side-on.
   * - pitchShare: share of the fish's climb or dive the boom follows.
   * - look: the gaze sits ahead of the fish (scale * perScale + base); `down` lowers it (share of the look-ahead),
   *   negative raises it so the surface and the water above stay in frame.
   */
  views: {
    /** Default: a low chase camera near the fish's depth, a little above and behind and off to one side. */
    chase: { boom: { perScale: 1.5, base: 0.95, back: 0.98, up: 0.16 }, side: 0.5, pitchShare: 0.3, look: { perScale: 0.4, base: 0.25, down: 0.55 } },
    /** The feel pass's view: behind and above, looking down on the fish's back. */
    high: { boom: { perScale: 1.6, base: 1.0, back: 0.8, up: 0.75 }, side: 0, pitchShare: 0.4, look: { perScale: 0.9, base: 0.6, down: 0.6 } },
  },
  /** The camera's heading follows the fish's with this rate: a little lag on turns. */
  yawFollow: 4.2,
  /** Reduced motion: stiffer, so the view swings less. */
  yawFollowReduced: 9,
  /** Pitch of the boom follows the fish's pitch (times the view's pitchShare) at this rate. */
  pitchFollow: 3.5,
  /** The point the boom hangs from follows the fish at this rate (high: nearly rigid). */
  pivotFollow: 14,
  /** Lead of the gaze along the fish's velocity (s), capped. */
  lookLead: { velLead: 0.07, maxLead: 0.6 },
  /** Look-at point follows at this rate. */
  lookFollow: 8,
  /**
   * Side-on framing (chase view) for the spawning act, fights and leaps at the falls: the boom swings round to
   * `angle` (rad off the tail axis), drops to `up`, and grows by `longer` (share) plus the spread of what is framed.
   * `follow` is how fast it comes and goes.
   */
  frame: { angle: 1.4, up: 0.08, longer: 0.3, follow: 2.2, followReduced: 6 },
  /**
   * A soft look toward a hot threat, so the danger is on screen before it strikes. The boom swings a share of the
   * way toward the threat's bearing (capped), and the gaze moves a share of the way toward it, capped at
   * `maxLook` times the boom's length so the fish itself always stays well inside the frame.
   * Off with reduced motion and while a cinematic shot plays.
   */
  threat: { swingShare: 0.5, maxSwing: 1.0, lookShare: 0.3, maxLook: 0.4, follow: 1.8, range: 30 },
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
  /**
   * The egg stage's fixed views (offsets from the alevin, world units): chase sits low among the stones, side-on to
   * the flow; high looks down on the alevin so its heading against the flow is clear.
   */
  egg: {
    chase: { pos: { x: -0.12, y: 0.5, z: 1.2 }, look: { x: 0.04, y: 0, z: -0.05 } },
    high: { pos: { x: 0.35, y: 1.05, z: 0.75 }, look: { x: 0, y: -0.05, z: 0 } },
  },
  /** The startle (render): when a threat first warns or strikes, the fish flinches away, quick and short. */
  startle: { length: 0.45, yaw: 0.35, roll: 0.5, tail: 0.09 },
} as const;
