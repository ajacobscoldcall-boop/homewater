/**
 * The magnetic track on the return's sea crossing (presentation tuning, not params.json; the sim's `track`
 * entities, their spacing and timing are in return.ts). Drawn as soft glows of blue light, never as arrows or
 * rings: a stand-in for a sense, clearly visible at every graphics preset and from the low chase camera.
 */
export const TRACK_LOOK = {
  /** Default view: peak world size of a glow (units; an adult is about 1 long), brightness and colour. */
  marker: { size: 0.75, bright: 1.15, colour: 0x8fd4ff },
  /** Documentary view: larger, softer, dimmer, no twinkle. */
  soft: { size: 1.5, bright: 0.38, colour: 0xb5ddff },
  /** A glow never looks smaller than this angle (radians) from the camera, so far ones still read. */
  minAngle: 0.014,
  /** How strongly a faint sense (off the track's centre) still shows: brightness and size at sense 0. */
  faintFloor: 0.4,
  /** Twinkle in the default view: depth (0..1) and speed (rad/s). */
  twinkle: { depth: 0.35, speed: 7 },
  /** Glows fade out between these distances from the camera (they ignore the water's fog, so murky water at Low still shows them). */
  fadeNear: 18,
  fadeFar: 34,
  /** The sim's marker lifetime (s), for the fade in and out. */
  life: 1.4,
} as const;
