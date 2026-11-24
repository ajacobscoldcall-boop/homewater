/**
 * The lasting toll of a warm river (Track 2.7, warm-year realism).
 *
 * On the return, heat stress (returnWater.ts) is the fish's strain in the
 * water it is in now: it builds in warm, oxygen-poor water and eases in cool
 * water. Strain above `heat.tollFrom` adds to a lasting toll that never eases
 * (0..1). Only in extreme water (well past the stress temperature) does full
 * strain kill on the spot (`heat`).
 *
 * The toll is carried to the spawning grounds in `World.carry` (not saved:
 * a reloaded or replaced fish gets the toll typical of the year's warmth
 * instead, `heat.yearToll`). There, with crowding in warm water added
 * (`heat.crowdWarm`), it becomes the fish's burden: less strength on arrival,
 * faster senescence, and before spawning a chance of dying first
 * (`prespawn`). In an ordinary year the burden is 0 and nothing here draws
 * random numbers or changes anything.
 *
 * Whether warm years kill directly on the migration, or mostly through fish
 * that reach the grounds and die before spawning (disease in crowded warm
 * water is one suggested reason), is an open advisor question; this is the
 * reversible game choice. Every number is a param (`heat.*`, placeholders).
 */
import type { World } from '../world';
import { riverWarmth } from './returnWater';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface TollState {
  heatToll?: number;
}
const tst = (w: World) => w.stage as unknown as TollState;

/** The fish's burden on the spawning grounds (kept in the spawn stage's scratch, only in a year that has one). */
export interface GroundsHeat {
  /** The toll carried up the river (or the year's typical toll for a fish that did not swim it). */
  toll: number;
  /** Extra from crowding in warm water. */
  crowd: number;
  /** toll + crowd, at most 1. */
  burden: number;
}

/** The lasting toll so far: on the return, what this fish has built; on the grounds, what it arrived with. */
export function heatToll(w: World): number {
  if (w.stageId === 'return') return tst(w).heatToll ?? 0;
  if (w.stageId === 'spawn') return groundsHeat(w)?.toll ?? 0;
  return 0;
}

/** Start of the return: a fresh fish (or a sibling from a checkpoint) carries no toll yet. */
export function resetHeatToll(w: World): void {
  delete w.carry.heatToll;
}

/**
 * One step of the toll on the return, from the strain now and the water
 * temperature. Returns true when the water is extreme and the strain full:
 * the fish dies of heat on the spot.
 */
export function stepHeatToll(w: World, dt: number, stress: number, temp: number): boolean {
  const p = w.p;
  const s = tst(w);
  const over = stress - p.get('heat.tollFrom');
  if (over > 0) {
    const toll = clamp01((s.heatToll ?? 0) + p.get('heat.tollRate') * over * dt);
    s.heatToll = toll;
    w.carry.heatToll = toll;
    if (toll >= p.get('heat.tollCaption')) w.emitOnce('caption', 'return.heatToll');
    if (toll >= p.get('heat.tollHighCaption')) w.emitOnce('caption', 'return.heatTollHigh');
  }
  return stress >= 1 && temp >= lethalTemp(w);
}

/** Water at least this warm kills a fish whose heat stress is full (°C). */
export function lethalTemp(w: World): number {
  return w.p.get('return.water.stressTemp') + w.p.get('heat.lethalOver');
}

/** How warm the year runs for the grounds' rules: 0 up to `heat.warmthFrom` of the river's warmth, 1 at the hottest. */
export function groundsWarmth(w: World): number {
  const from = w.p.get('heat.warmthFrom');
  return clamp01((riverWarmth(w) - from) / Math.max(1e-6, 1 - from));
}

/** The toll a fish arrives on the grounds with: what it carried, or the year's typical toll. */
export function arrivingToll(w: World): number {
  const carried = w.carry.heatToll;
  if (carried !== undefined) return clamp01(carried);
  return clamp01(w.p.get('heat.yearToll') * groundsWarmth(w));
}

/** Extra burden from crowding in warm water: the year's warmth times how crowded the grounds are. */
export function crowdHeat(w: World, crowdRel: number): number {
  return w.p.get('heat.crowdWarm') * groundsWarmth(w) * Math.max(0, crowdRel);
}

/**
 * Start of the spawning stage: work out the burden and, in a year with one,
 * take strength off the start. Returns null (and changes nothing) when there is none.
 */
export function arriveWithToll(w: World, crowdRel: number): GroundsHeat | null {
  const p = w.p;
  const toll = arrivingToll(w);
  const crowd = crowdHeat(w, crowdRel);
  const burden = clamp01(toll + crowd);
  if (burden <= 0) return null;
  const g: GroundsHeat = { toll, crowd, burden };
  const s = w.stage as { vigour: number; heat?: GroundsHeat };
  s.heat = g;
  s.vigour = Math.max(p.get('spawn.senescenceEnd') + 0.05, s.vigour - p.get('heat.vigourLoss') * burden);
  if (toll >= p.get('heat.tollCaption')) w.emit('caption', burden >= p.get('heat.prespawnFrom') ? 'spawn.heatTollHigh' : 'spawn.heatToll');
  if (crowd >= p.get('heat.crowdCaption')) w.emit('caption', 'spawn.warmCrowd');
  return g;
}

/** The burden on the grounds, or null in a year without one. */
export function groundsHeat(w: World): GroundsHeat | null {
  if (w.stageId !== 'spawn') return null;
  return (w.stage as { heat?: GroundsHeat }).heat ?? null;
}

/** Multiplier on the senescence rate: a burdened fish ages faster on the grounds. */
export function senescenceFactor(w: World): number {
  const g = groundsHeat(w);
  return g ? 1 + w.p.get('heat.senescenceBoost') * g.burden : 1;
}

/** Chance per second of dying before spawning, for a burden (0 below `heat.prespawnFrom`). */
export function prespawnHazard(w: World, burden: number): number {
  const from = w.p.get('heat.prespawnFrom');
  if (burden <= from) return 0;
  const k = (burden - from) / Math.max(1e-6, 1 - from);
  return w.p.get('heat.prespawnRate') * k * k;
}

/**
 * One step on the grounds before spawning: a burdened fish may die before it
 * spawns. Returns true if it did. Draws a random number only when there is a hazard.
 */
export function stepPrespawn(w: World, dt: number, spawned: boolean): boolean {
  if (spawned) return false;
  const g = groundsHeat(w);
  if (!g) return false;
  const h = prespawnHazard(w, g.burden);
  if (h <= 0) return false;
  if (!w.rng.chance(h * dt)) return false;
  w.die('prespawn');
  return true;
}

/** Why a fish that never spawned died: a burdened fish whose strength ran out died before spawning; otherwise the season beat it. */
export function noSpawnCause(w: World, vigour: number): 'prespawn' | 'noSpawn' {
  const g = groundsHeat(w);
  return g && g.burden > w.p.get('heat.prespawnFrom') && vigour <= w.p.get('spawn.senescenceEnd') ? 'prespawn' : 'noSpawn';
}
