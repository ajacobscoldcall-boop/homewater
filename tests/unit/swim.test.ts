import { describe, expect, it } from 'vitest';
import { SWIM_GLSL, SWIM_WAVE, swimOffset } from '../../src/render/swimWave';

/**
 * The swimming bend (swimWave.ts) never folds a fish into an S: the head and
 * front half stay steady, and the body bends as one sweep toward the tail.
 *
 * "Excess turning" measures an S: walk down the body adding up how much its
 * direction turns, and subtract the overall change from head to tail. A single
 * C-shaped bend has none; an S has as much as its counter-bend.
 */
function shape(amp: number, phase: number): { excess: number; front: number; tail: number } {
  const n = 200;
  const angles: number[] = [];
  for (let j = 0; j <= n; j++) {
    const x = 0.5 - j / n;
    const dx = 1 / n;
    const dy = swimOffset(x - dx / 2, amp, phase) - swimOffset(x + dx / 2, amp, phase);
    angles.push(Math.atan2(dy, dx));
  }
  let total = 0;
  for (let j = 1; j < angles.length; j++) total += Math.abs(angles[j]! - angles[j - 1]!);
  const net = Math.max(...angles) - Math.min(...angles);
  let front = 0;
  for (let j = 0; j <= n; j++) {
    const x = 0.5 - j / n;
    if (x > 0.1) front = Math.max(front, Math.abs(swimOffset(x, amp, phase) - swimOffset(0.5, amp, phase)));
  }
  return { excess: total - net, front, tail: Math.abs(swimOffset(-0.5, amp, phase)) };
}

function worst(amp: number): { excess: number; front: number; tail: number } {
  let excess = 0;
  let front = 0;
  let tail = 0;
  for (let i = 0; i < 64; i++) {
    const s = shape(amp, (i / 64) * Math.PI * 2);
    excess = Math.max(excess, s.excess);
    front = Math.max(front, s.front);
    tail = Math.max(tail, s.tail);
  }
  return { excess, front, tail };
}

describe('swimming bend', () => {
  it('cruising and bursting: one sweep toward the tail, no S', () => {
    // The player's fish swims at 0.04-0.11 (Renderer.syncPlayer).
    for (const amp of [0.04, 0.07, 0.11]) {
      const s = worst(amp);
      expect(s.excess, `amp ${amp}`).toBeLessThan(0.35);
      // The front half barely moves: under half a percent of the body length.
      expect(s.front, `amp ${amp}`).toBeLessThan(0.005);
      // But the tail still sweeps.
      expect(s.tail, `amp ${amp}`).toBeGreaterThan(amp * 0.8);
    }
  });

  it('fighting males thrash harder but still do not fold', () => {
    const s = worst(0.18);
    expect(s.excess).toBeLessThan(0.55);
    expect(s.front).toBeLessThan(0.008);
  });

  it('the shader uses the same numbers', () => {
    expect(SWIM_GLSL).toContain(SWIM_WAVE.wavenumber.toFixed(4));
    expect(SWIM_GLSL).toContain(SWIM_WAVE.hinge.toFixed(4));
    expect(SWIM_GLSL).toContain(SWIM_WAVE.power.toFixed(4));
  });
});
