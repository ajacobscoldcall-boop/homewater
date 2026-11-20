/**
 * How bears on the spawning grounds choose and eat fish. Pure functions of
 * params and the year, used by the spawning stage (src/sim/stages/spawn.ts).
 *
 * Advisor: bears take males first, then large females, jacks last. The game
 * keeps those weights (`spawn.bearPref*`, as `bearWeight` in spawn.ts) and adds, as placeholders:
 * - Large females are favoured over small ones (`spawn.bearSizePref`).
 * - In a big run a bear is choosier: the preference weights are sharpened
 *   (`spawn.bearChoosy`), it eats less of each fish (`spawn.bearPartialPlenty`)
 *   and goes back for another sooner (`spawn.bearPlentyRate`).
 */
import type { Params } from './params';

export type BearPreyKind = 'male' | 'female' | 'jack';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** How big the run is for the bears: 0 in an average year, 1 at `spawn.bearPlentyRange` above it, negative in small years. */
export function runPlenty(p: Params, runSize: number): number {
  return clamp((runSize - 1) / p.get('spawn.bearPlentyRange'), -1, 1);
}

/** Exponent on the preference weights: 1 in an average or small year, higher in a big one. */
export function bearChoosiness(p: Params, runSize: number): number {
  return 1 + p.get('spawn.bearChoosy') * Math.max(0, runPlenty(p, runSize));
}

/** How much a bear wants this fish: males, then large females, jacks last; sharper in a big run. */
export function bearTargetWeight(p: Params, kind: BearPreyKind, size: number, runSize: number): number {
  const sizeFactor = kind === 'female' ? Math.pow(Math.max(0.1, size), p.get('spawn.bearSizePref')) : 1;
  const pref = p.get(kind === 'male' ? 'spawn.bearPrefMale' : kind === 'female' ? 'spawn.bearPrefFemale' : 'spawn.bearPrefJack');
  return Math.pow(pref * sizeFactor, bearChoosiness(p, runSize));
}

/** Share of a caught fish the bear eats before going back for more. */
export function bearShareEaten(p: Params, runSize: number): number {
  return clamp(p.get('spawn.bearEatShare') - p.get('spawn.bearPartialPlenty') * Math.max(0, runPlenty(p, runSize)), p.get('spawn.bearEatShareMin'), 1);
}

/** Seconds the bear spends eating a fish on the bank. */
export function bearEatTime(p: Params, share: number): number {
  return p.get('spawn.bearEatTime') * share;
}

/** Strikes come this many times as often in a big run (1 in an average or small year). */
export function bearPlentyRate(p: Params, runSize: number): number {
  return 1 + p.get('spawn.bearPlentyRate') * Math.max(0, runPlenty(p, runSize));
}
