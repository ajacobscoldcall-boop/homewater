/**
 * Distance from land to water, for banks that follow the simulation's walls
 * exactly. Land is any point inside an arena wall box; the bank face starts
 * at the box edge, so what the fish bumps into is what the player sees.
 *
 * A grid distance transform that carries the nearest water cell along, so a
 * bank can also start from the riverbed height at its foot.
 */
import type { Box } from '../../sim/stages';

export class LandMask {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  private seedX: Float32Array;
  private seedZ: Float32Array;
  /** Squared distance to the nearest water cell. */
  private dist: Float32Array;

  constructor(
    private walls: Box[],
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    readonly res = 0.25,
  ) {
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / res) + 1;
    this.nz = Math.ceil((z1 - z0) / res) + 1;
    const n = this.nx * this.nz;
    this.seedX = new Float32Array(n);
    this.seedZ = new Float32Array(n);
    this.dist = new Float32Array(n);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        const x = x0 + i * res;
        const z = z0 + j * res;
        if (this.isLand(x, z)) {
          this.dist[k] = Infinity;
          this.seedX[k] = NaN;
          this.seedZ[k] = NaN;
        } else {
          this.dist[k] = 0;
          this.seedX[k] = x;
          this.seedZ[k] = z;
        }
      }
    }
    this.sweep(1);
    this.sweep(-1);
  }

  /** Strictly inside a wall box (the edges themselves are water, as in the simulation). */
  isLand(x: number, z: number): boolean {
    for (const w of this.walls) if (x > w.min.x && x < w.max.x && z > w.min.z && z < w.max.z) return true;
    return false;
  }

  private sweep(dir: 1 | -1): void {
    const { nx, nz, res } = this;
    const nbr = dir === 1 ? [-1, 0, -1, -1, 0, -1, 1, -1] : [1, 0, 1, 1, 0, 1, -1, 1];
    const j0 = dir === 1 ? 0 : nz - 1;
    const i0 = dir === 1 ? 0 : nx - 1;
    for (let jj = 0; jj < nz; jj++) {
      const j = j0 + dir * jj;
      for (let ii = 0; ii < nx; ii++) {
        const i = i0 + dir * ii;
        const k = j * nx + i;
        if (this.dist[k] === 0) continue;
        const x = this.x0 + i * res;
        const z = this.z0 + j * res;
        for (let q = 0; q < 8; q += 2) {
          const ni = i + nbr[q]!;
          const nj = j + nbr[q + 1]!;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const nk = nj * nx + ni;
          const sx = this.seedX[nk]!;
          if (Number.isNaN(sx)) continue;
          const sz = this.seedZ[nk]!;
          const dx = x - sx;
          const dz = z - sz;
          const d = dx * dx + dz * dz;
          if (d < this.dist[k]!) {
            this.dist[k] = d;
            this.seedX[k] = sx;
            this.seedZ[k] = sz;
          }
        }
      }
    }
  }

  private cell(x: number, z: number): number {
    const i = Math.max(0, Math.min(this.nx - 1, Math.round((x - this.x0) / this.res)));
    const j = Math.max(0, Math.min(this.nz - 1, Math.round((z - this.z0) / this.res)));
    return j * this.nx + i;
  }

  /** Distance from (x, z) to the nearest water, 0 in the water. */
  distance(x: number, z: number): number {
    if (!this.isLand(x, z)) return 0;
    const k = this.cell(x, z);
    const sx = this.seedX[k]!;
    if (Number.isNaN(sx)) return 99;
    return Math.hypot(x - sx, z - this.seedZ[k]!);
  }

  /** The nearest water point to (x, z) (itself in the water). */
  nearestWater(x: number, z: number): [number, number] {
    if (!this.isLand(x, z)) return [x, z];
    const k = this.cell(x, z);
    const sx = this.seedX[k]!;
    if (Number.isNaN(sx)) return [x, z];
    return [sx, this.seedZ[k]!];
  }
}
