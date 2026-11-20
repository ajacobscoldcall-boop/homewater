/**
 * The home scent on the return, shaped by imprinting (see ../imprint.ts).
 *
 * - Home scent drifts down the home river (and its home branch past the fork)
 *   and out of the mouth. A clear scent (well imprinted, faithful homing
 *   trait) comes often, strong and steady; an unclear one comes less often,
 *   weaker, flickering, wandering, and now and then leaks into the wrong
 *   branch.
 * - Each wrong river carries a river smell of its own (state 'stray'). To a
 *   well imprinted fish it is faint and fades within a few lengths of the
 *   mouth, so the mistake is plain; to a poorly imprinted fish it is nearly
 *   as strong as home and carries well up the channel, so it is easy to stray
 *   into a dead end.
 *
 * Scent specks are 'scent' entities: value is how strong they look.
 */
import { imprintLevel, imprintOf, worldClarity } from '../imprint';
import { v3 } from '../vec';
import type { World } from '../world';

export interface ScentLayout {
  coast: number;
  fork: number;
  length: number;
  riverHalf: number;
  homeMouth: number;
  homeSide: 1 | -1;
  /** Centre z of each wrong river's mouth. */
  wrongMouths: readonly number[];
  wrongHalf: number;
  wrongLen: number;
}

export interface ScentState {
  scentTimer: number;
  strayTimer?: number;
}

/** How far up a wrong river its misleading smell carries (u), for a given clarity. */
export function wrongReach(w: World, lay: ScentLayout, clarity: number): number {
  const p = w.p;
  return lay.wrongLen * Math.min(1, p.get('imprint.wrongReachBase') + p.get('imprint.wrongReachLoss') * (1 - clarity));
}

/** How strong a wrong river's smell looks at its mouth, for a given clarity (home scent looks `clarity`): never stronger than home. */
export function wrongStrength(w: World, clarity: number): number {
  return Math.min(clarity, w.p.get('imprint.wrongSmell') * (1 - clarity));
}

/**
 * 0..1: how blurred the home scent is. Zero for an average fish or better (the scent as it always was),
 * rising to 1 at the faintest clarity.
 */
export function scentBlur(w: World, clarity: number): number {
  const base = w.p.get('imprint.clarityBase');
  const min = w.p.get('imprint.clarityMin');
  return Math.max(0, Math.min(1, (base - clarity) / Math.max(1e-6, base - min)));
}

export function stepReturnScent(w: World, lay: ScentLayout, s: ScentState, dt: number): void {
  const p = w.p;
  const fish = w.body.pos;
  const c = worldClarity(w);
  const blur = scentBlur(w, c);
  const noise = blur * p.get('imprint.scentNoise');
  const flicker = blur * p.get('imprint.scentFlicker');

  if (fish.x > lay.coast - 22) {
    const level = imprintLevel(p, imprintOf(p, w.progress));
    w.emitOnce('caption', `return.scent.${level}`);
  }

  // Home scent.
  s.scentTimer -= dt;
  if (s.scentTimer <= 0) {
    s.scentTimer = p.get('imprint.scentInterval') / c;
    const sx = Math.min(lay.length - 2, Math.max(fish.x + 6, lay.coast + 2) + w.rng.range(0, 34));
    let side: number = lay.homeSide;
    if (sx > lay.fork && w.rng.chance(blur * p.get('imprint.scentMisbranch'))) side = -lay.homeSide;
    const branch = sx > lay.fork ? side * w.rng.range(1.8, lay.riverHalf - 1) : w.rng.range(-lay.riverHalf + 1, lay.riverHalf - 1);
    w.spawn('scent', v3(sx, w.rng.range(-2.5, -0.5), lay.homeMouth + branch), { radius: 0.2, timer: 9, value: c });
  }

  // Each wrong river's own smell, near the coast only.
  const reach = wrongReach(w, lay, c);
  const strength = wrongStrength(w, c);
  s.strayTimer = (s.strayTimer ?? 0) - dt;
  if (s.strayTimer <= 0 && fish.x > lay.coast - 30 && fish.x < lay.coast + lay.wrongLen + 10) {
    s.strayTimer = p.get('imprint.wrongInterval');
    for (const m of lay.wrongMouths) {
      const into = w.rng.range(0, reach);
      w.spawn('scent', v3(lay.coast + into, w.rng.range(-2.2, -0.6), m + w.rng.range(-lay.wrongHalf + 0.8, lay.wrongHalf - 0.8)), {
        radius: 0.2,
        timer: 9,
        state: 'stray',
        value: strength * (1 - into / Math.max(1, reach)),
        home: v3(m, 0, 0),
      });
    }
  }

  for (const sc of w.entities) {
    if (!sc.alive || sc.kind !== 'scent') continue;
    sc.timer -= dt;
    sc.pos.x -= 1.6 * dt;
    if (sc.state === 'stray') {
      // A wrong river's smell fades as it drifts out and mixes along the coast.
      sc.value = Math.max(0, (sc.value ?? 0) - p.get('imprint.wrongFadeRate') * dt);
      if (sc.pos.x < lay.coast) sc.pos.z += Math.sin(sc.id + w.stageTime) * 0.6 * dt;
      if (sc.timer <= 0 || sc.value <= 0.02 || sc.pos.x < lay.coast - 12) sc.alive = false;
      continue;
    }
    if (sc.pos.x < lay.fork && sc.pos.x > lay.coast) sc.pos.z = lay.homeMouth + (sc.pos.z - lay.homeMouth) * (1 - 0.4 * (1 - blur) * dt);
    // An unclear scent wanders across the river and flickers.
    if (noise > 0) {
      sc.pos.z += Math.sin(sc.id * 1.37 + w.stageTime * 1.9) * noise * dt;
      if (sc.pos.x > lay.coast) sc.pos.z = Math.max(lay.homeMouth - lay.riverHalf + 0.4, Math.min(lay.homeMouth + lay.riverHalf - 0.4, sc.pos.z));
    }
    sc.value = c * (1 - flicker * (0.5 + 0.5 * Math.sin(w.stageTime * 3.1 + sc.id * 2.3)));
    if (sc.pos.x < lay.coast) sc.pos.z += Math.sin(sc.id + w.stageTime) * 0.6 * dt;
    if (sc.timer <= 0 || sc.pos.x < lay.coast - 18) sc.alive = false;
  }

  // Close to a wrong river's smell: a poorly imprinted fish can't tell it from home.
  if (fish.x > lay.coast - 4 && Math.abs(fish.z - lay.homeMouth) > lay.riverHalf + 1) {
    const near = w.entities.some((e) => e.alive && e.kind === 'scent' && e.state === 'stray' && (e.value ?? 0) > 0.08 && Math.abs(e.pos.x - fish.x) < 4 && Math.abs(e.pos.z - fish.z) < 3);
    if (near) w.emitOnce('caption', c < p.get('imprint.confusedBelow') ? 'return.strayScent' : 'return.strayScentClear');
  }
}
