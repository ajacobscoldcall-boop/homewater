/**
 * Presentation tuning for the lake on the way home (lakeHome.ts). Render
 * only; the lake's shape and depths are the simulation's (`return.lake.*`).
 */
export const LAKE_HOME = {
  /** Land drawn past the arena's edges (u). */
  margin: 30,
  /** Terrain grid spacing by detail level (Low, Medium, High). */
  step: [1.5, 1.0, 0.7] as [number, number, number],
  /** Terrain chunk length along x (u): fewer, larger chunks than the river, since the lake is open. */
  chunk: 34,
  /** Counts at High detail (Low keeps 40%, Medium 70%). */
  weeds: 260,
  tufts: 260,
  boulders: 220,
  bedRocks: 70,
  cobbles: 700,
  logs: 14,
} as const;
