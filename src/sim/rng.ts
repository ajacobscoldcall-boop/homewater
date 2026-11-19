/**
 * Seeded random-number generator (mulberry32). All chance in the simulation
 * goes through an Rng so runs can be replayed and tested.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Current internal state, for saving. */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('Rng.pick on empty list');
    return item;
  }

  /** Derive an independent child generator. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}

/** Inverse of the standard normal CDF (Acklam's approximation). */
export function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  const A = (i: number) => a[i] as number;
  const B = (i: number) => b[i] as number;
  const C = (i: number) => c[i] as number;
  const D = (i: number) => d[i] as number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((C(0) * q + C(1)) * q + C(2)) * q + C(3)) * q + C(4)) * q + C(5)) / ((((D(0) * q + D(1)) * q + D(2)) * q + D(3)) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((C(0) * q + C(1)) * q + C(2)) * q + C(3)) * q + C(4)) * q + C(5)) / ((((D(0) * q + D(1)) * q + D(2)) * q + D(3)) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((A(0) * r + A(1)) * r + A(2)) * r + A(3)) * r + A(4)) * r + A(5)) * q) / (((((B(0) * r + B(1)) * r + B(2)) * r + B(3)) * r + B(4)) * r + 1);
}
