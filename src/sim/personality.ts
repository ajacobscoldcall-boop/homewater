/**
 * Predator personalities: small, seeded differences between individual char,
 * mergansers, seals and orcas, so no two attacks are quite alike.
 *
 * - `speed`: how fast this one closes in once it commits (a factor near 1).
 * - `patience`: how long it holds back before committing (a factor >= 1, so
 *   a warning is never shorter than the tuned one).
 * - `angle`: which way, and how far, it curves in from the side (radians).
 *
 * Fair on Field guide: there `speed` is never above 1, so a predator is never
 * faster than the tuned value. On Wild it spreads both ways around 1.
 *
 * Pure and deterministic: drawn from a hash of the fish, the stage and the
 * entity id, so it does not take numbers from the world's random stream and
 * the same predator in a replay behaves the same.
 */
import type { Entity } from './types';
import type { World } from './world';

export interface Personality {
  speed: number;
  patience: number;
  angle: number;
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Three uniforms in [0, 1) from a seed (mulberry32 steps). */
function uniforms(seed: number): [number, number, number] {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return [next(), next(), next()];
}

/** The personality for spreads and three uniforms; `fair` keeps speed at or below 1. */
export function personalityFrom(u: readonly [number, number, number], spreads: { speed: number; patience: number; angle: number }, fair: boolean): Personality {
  const [a, b, c] = u;
  const speed = fair ? 1 - spreads.speed * a : 1 + spreads.speed * (2 * a - 1);
  return { speed, patience: 1 + spreads.patience * b, angle: spreads.angle * (2 * c - 1) };
}

/** This predator's personality in this world. */
export function personalityOf(w: World, e: Entity): Personality {
  const p = w.p;
  const seed = hashString(`${w.fish.id}|${w.stageId}|${e.kind}|${e.id}`);
  return personalityFrom(
    uniforms(seed),
    { speed: p.get('behaviour.speedSpread'), patience: p.get('behaviour.patienceSpread'), angle: p.get('behaviour.angleSpread') },
    w.difficulty === 'fieldGuide',
  );
}

/**
 * A chase direction that curves in from the side: the straight line to the
 * target turned by `angle` (about the vertical), less and less as it closes,
 * so a curving predator still arrives.
 */
export function curvedChase(dx: number, dy: number, dz: number, angle: number, closeAt: number): { x: number; y: number; z: number } {
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-9) return { x: 0, y: 0, z: 0 };
  const a = angle * Math.min(1, d / Math.max(1e-6, closeAt));
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = dx * c - dz * s;
  const z = dx * s + dz * c;
  return { x: x / d, y: dy / d, z: z / d };
}
