/**
 * Input feel (presentation tuning, not params.json): how keys and sticks
 * become the turn and pitch values in Intent. The simulation is unchanged;
 * bots in the balance simulator build Intent directly.
 */
export const INPUT_FEEL = {
  /** Seconds for a held steer key to reach full turn: a tap makes a small correction. */
  keyTurnRamp: 0.16,
  /** Seconds to settle back to straight once the key is let go (or to swing across to the other side). */
  keyTurnRelease: 0.06,
  /** Stick response curve exponent: finer near the centre, full at the edge. */
  stickCurve: 1.6,
} as const;

/** One sim step of the keyboard turn ramp, towards `target` (-1, 0 or 1). */
export function rampTurn(current: number, target: number, dt: number): number {
  const releasing = target === 0 || Math.sign(target) !== Math.sign(current);
  const rate = 1 / (releasing ? INPUT_FEEL.keyTurnRelease : INPUT_FEEL.keyTurnRamp);
  const step = rate * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

/** Stick response: sign kept, magnitude curved, ±1 still ±1. */
export function stickCurve(v: number): number {
  return Math.sign(v) * Math.abs(v) ** INPUT_FEEL.stickCurve;
}
