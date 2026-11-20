/**
 * The swimming bend shared by every fish model (fishMesh.ts, the migrants'
 * instanced school): a travelling wave down the body whose size grows steeply
 * toward the tail. Salmon swim like most fast fish (subcarangiform): the head
 * barely moves, the front half stays nearly straight, and the bend is a single
 * sweep through the back half and tail, with a wavelength a little over one body
 * length. A shorter wave, or one reaching the head, folds the body into an S.
 *
 * The same numbers drive the GLSL and the TypeScript copy, which the unit
 * tests use to check the body never folds (tests/unit/swim.test.ts).
 * Coordinates are the fish geometry's: snout at +0.5, tail fin tips near -0.52.
 */
export const SWIM_WAVE = {
  /** Radians of wave per unit of body length: 2π / wavelength (about 1.25 body lengths). */
  wavenumber: 5.0,
  /** Where the bend starts (x): ahead of it the body is rigid. */
  hinge: 0.25,
  /** Distance (x) from the hinge to the tail at which the envelope reaches 1. */
  span: 0.77,
  /** How steeply the bend grows toward the tail. */
  power: 2.2,
  /** Largest envelope (fin tips past the tail). */
  cap: 1.25,
} as const;

/** Envelope at x: 0 ahead of the hinge, about 1 at the tail. */
export function swimEnvelope(x: number): number {
  const u = Math.min(SWIM_WAVE.cap, Math.max(0, (SWIM_WAVE.hinge - x) / SWIM_WAVE.span));
  return Math.pow(u, SWIM_WAVE.power);
}

/** Sideways offset of the body at x for a given amplitude and phase (the uniforms uAmp and uTime). */
export function swimOffset(x: number, amp: number, phase: number): number {
  return amp * swimEnvelope(x) * Math.sin(SWIM_WAVE.wavenumber * x - phase);
}

/**
 * GLSL for the same bend: declares `hwSwimW(x)` and `hwSwim(x, amp, phase)`.
 * Include it in a vertex shader's `common` section.
 */
export const SWIM_GLSL = /* glsl */ `
float hwSwimW(float x) {
  float u = clamp((${SWIM_WAVE.hinge.toFixed(4)} - x) / ${SWIM_WAVE.span.toFixed(4)}, 0.0, ${SWIM_WAVE.cap.toFixed(4)});
  return pow(u, ${SWIM_WAVE.power.toFixed(4)});
}
float hwSwim(float x, float amp, float phase) {
  return amp * hwSwimW(x) * sin(${SWIM_WAVE.wavenumber.toFixed(4)} * x - phase);
}
`;
