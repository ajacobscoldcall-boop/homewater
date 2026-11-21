/**
 * Water temperature and dissolved oxygen along the return (advisor: low water
 * kills through heat stress and low oxygen).
 *
 * Pure functions of the world: the year's conditions, the river's layout (read
 * through `returnLayout` and the arena's floor, never changed), the fish's
 * position and the time of day. In an ordinary year the river is cool
 * everywhere and nothing here matters. In a warm, low-water year:
 *   - the lower river is warmer than the upper river;
 *   - shallow riffles are warmer, deep pools cooler, cooler still near the bottom;
 *   - a few spring-fed seeps in the pools stay cold whatever the year;
 *   - the water warms through the day (the stage starts at a cool dawn);
 *   - warmer water holds less oxygen; riffles mix a little more in.
 *
 * Effects (applied by `stepWater`, called from the return stage):
 *   - warm water burns fat faster and slows recovery of energy;
 *   - low oxygen weakens the burst;
 *   - above a stress temperature (or below an oxygen floor) heat stress builds,
 *     and at 1 the fish dies (`heat`); resting in cool water lets it ease.
 *
 * Every number is a param (`return.water.*`, placeholders).
 */
import { yearEffects } from '../genetics';
import type { Vec3 } from '../types';
import type { World } from '../world';
import { fallsLayout } from './falls';
import { returnLayout } from './return';
import { lakeWater } from './returnLake';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface Seep {
  x: number;
  z: number;
}

export interface WaterReading {
  /** Water temperature, °C. */
  temp: number;
  /** Dissolved oxygen, mg/L. */
  oxygen: number;
  /** 0 in a cool year, 1 in a hot, low-water year: how strongly the river's pattern shows. */
  warmth: number;
  /** 0..1: how much a spring seep is cooling this spot. */
  seep: number;
}

interface WaterState {
  heatStress?: number;
}
const wst = (w: World) => w.stage as unknown as WaterState;

/** The year's river temperature before local differences, °C. */
export function yearRiverTemp(w: World): number {
  const p = w.p;
  const t = yearEffects(p, w.fish, w.conditions).temperature;
  return p.get('return.water.baseTemp') + p.get('return.water.yearTemp') * (t - 1) + p.get('return.water.lowWaterTemp') * Math.max(0, 1 - w.conditions.flow);
}

/** 0..1: how warm this year's river runs above an ordinary one. */
export function riverWarmth(w: World): number {
  return clamp01((yearRiverTemp(w) - w.p.get('return.water.baseTemp')) / w.p.get('return.water.warmSpan'));
}

/** 0 at dawn, 1 in the afternoon heat, then cooling again. */
export function dayWarming(w: World): number {
  const day = w.p.get('return.water.dayLength');
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * w.stageTime) / day);
}

const seepCache = new WeakMap<object, Seep[]>();

/**
 * Spring seeps sit in the deepest part of every `seepEvery`-th pool of the home
 * river, against alternating banks (past the fork, on the home branch). Found
 * from the arena's floor, so they follow whatever layout the river has.
 */
export function seeps(w: World): Seep[] {
  const lay = returnLayout(w);
  if (!lay) return [];
  const cached = seepCache.get(w.arena);
  if (cached) return cached;
  const L = w.p.get('return.length');
  const every = Math.max(1, Math.round(w.p.get('return.water.seepEvery')));
  const f = (x: number) => w.arena.floor(x, lay.homeMouth);
  const pools: number[] = [];
  for (let x = lay.coast + 3; x < L - 3; x += 0.5) {
    const y = f(x);
    if (y < f(x - 0.5) && y <= f(x + 0.5) && y < f(x - 4) - 0.3 && y < f(x + 4) - 0.3) pools.push(x);
  }
  const out: Seep[] = [];
  // The bed through the rapids and falls is shaped by falls.ts: no seeps there, but the deep plunge pool under the falls is a cool refuge.
  const falls = fallsLayout(w);
  const inFalls = (x: number) => !!falls && x > falls.rapidsStart - 2 && x < falls.lipEnd + 2;
  if (falls) out.push({ x: (falls.poolStart + falls.face) / 2, z: lay.homeMouth });
  pools.filter((x) => !inFalls(x)).forEach((x, i) => {
    if (i % every !== 0) return;
    const past = x > lay.fork;
    const side = past ? lay.homeSide : i % (2 * every) === 0 ? 1 : -1;
    const off = past ? lay.riverHalf * 0.55 : lay.riverHalf - 2;
    out.push({ x, z: lay.homeMouth + side * off });
  });
  seepCache.set(w.arena, out);
  return out;
}

/** Temperature and oxygen at a point of the return, now. */
export function waterAt(w: World, pos: Vec3): WaterReading {
  const p = w.p;
  const lay = returnLayout(w);
  const warmth = riverWarmth(w);
  const day = p.get('return.water.dayWarm') * warmth * dayWarming(w);
  const o2 = (temp: number, extra: number) =>
    Math.max(0, (p.get('return.water.o2At10') + p.get('return.water.o2PerDeg') * (temp - 10)) * (1 + extra - p.get('return.water.lowWaterO2') * Math.max(0, 1 - w.conditions.flow) * warmth));
  if (!lay || pos.x < lay.coast) {
    const t = yearEffects(p, w.fish, w.conditions).temperature;
    const temp = p.get('return.water.seaTemp') + p.get('return.water.seaYearTemp') * (t - 1);
    return { temp, oxygen: o2(temp, 0), warmth, seep: 0 };
  }
  const L = p.get('return.length');
  // The lake: a warm top layer over cool deep water in a warm year (returnLake.ts).
  if (lay.lake && pos.x > lay.riverEnd) {
    const temp = lakeWater(w, lay.lake, pos, yearRiverTemp(w), warmth, day);
    return { temp, oxygen: o2(temp, 0), warmth, seep: 0 };
  }
  const along = clamp01((pos.x - lay.coast) / Math.max(1, L - lay.coast));
  const surface = w.arena.surfaceY;
  const depth = Math.max(0.1, surface - w.arena.floor(pos.x, pos.z));
  const shallow = clamp01((p.get('return.water.poolDepth') - depth) / (p.get('return.water.poolDepth') - p.get('return.water.riffleDepth')));
  const deep = 1 - shallow;
  const nearBottom = clamp01((surface - pos.y) / depth);
  let temp =
    yearRiverTemp(w) +
    day +
    p.get('return.water.lowerWarm') * warmth * (1 - along) +
    p.get('return.water.shallowWarm') * warmth * shallow -
    p.get('return.water.poolCool') * warmth * deep * (0.4 + 0.6 * nearBottom);
  // Spring water comes up through the gravel at the same cold temperature in any year.
  const r = p.get('return.water.seepRadius');
  let seep = 0;
  for (const s of seeps(w)) seep = Math.max(seep, Math.exp(-((pos.x - s.x) ** 2 + (pos.z - s.z) ** 2) / (r * r)));
  const seepTemp = p.get('return.water.seepTemp');
  if (temp > seepTemp) temp += (seepTemp - temp) * p.get('return.water.seepStrength') * seep;
  return { temp, oxygen: o2(temp, p.get('return.water.riffleAeration') * shallow), warmth, seep };
}

export interface WaterEffects {
  /** Multiplier on the fat drain (1 in cool water). */
  fatFactor: number;
  /** Multiplier on energy recovery (1 in cool water). */
  regenFactor: number;
  /** Multiplier on the burst's extra speed (1 with plenty of oxygen). */
  burstFactor: number;
  /** 0..1 thermal load above the stress temperature. */
  heat: number;
  /** 0..1 oxygen shortfall below the comfortable level. */
  hypoxia: number;
}

/** What water of this temperature and oxygen does to a fish. */
export function waterEffects(w: World, r: WaterReading): WaterEffects {
  const p = w.p;
  const comfort = p.get('return.water.comfortTemp');
  const stress = p.get('return.water.stressTemp');
  const over = Math.max(0, r.temp - comfort);
  const hypoxia = clamp01((p.get('return.water.o2Low') - r.oxygen) / p.get('return.water.o2Span'));
  return {
    fatFactor: 1 + p.get('return.water.fatPerDeg') * over,
    regenFactor: 1 - p.get('return.water.regenLoss') * clamp01(over / (stress + p.get('return.water.stressSpan') - comfort)),
    burstFactor: 1 - p.get('return.water.burstLoss') * hypoxia,
    heat: Math.max(0, (r.temp - stress) / p.get('return.water.stressSpan')),
    hypoxia,
  };
}

/** Accumulated heat stress, 0..1 (1 kills). */
export function heatStress(w: World): number {
  return wst(w).heatStress ?? 0;
}

/** True when this water is a refuge worth noticing: a warm year, and cool water here. */
export function isRefuge(w: World, r: WaterReading): boolean {
  return r.warmth >= w.p.get('return.water.refugeWarmth') && r.temp <= w.p.get('return.water.stressTemp') - w.p.get('return.water.refugeMargin');
}

/**
 * One step of heat stress for the fish where it is. Stress builds above the
 * stress temperature and in low oxygen, and eases in cool water, fastest when
 * resting. Returns the reading and its effects for the stage to apply.
 */
export function stepWater(w: World, dt: number, resting: boolean): { reading: WaterReading; effects: WaterEffects } {
  const p = w.p;
  const s = wst(w);
  const reading = waterAt(w, w.body.pos);
  const effects = waterEffects(w, reading);
  let stress = s.heatStress ?? 0;
  const load = effects.heat + p.get('return.water.hypoxiaStress') * effects.hypoxia;
  if (load > 0) stress += p.get('return.water.stressRate') * load * dt;
  else {
    const cool = clamp01((p.get('return.water.stressTemp') - reading.temp) / p.get('return.water.recoverSpan'));
    stress -= p.get('return.water.recoverRate') * cool * (resting ? 1 : p.get('return.water.recoverMoving')) * dt;
  }
  s.heatStress = clamp01(stress);
  if (isRefuge(w, reading)) {
    const lay = returnLayout(w);
    const inLake = !!lay?.lake && w.body.pos.x > lay.riverEnd;
    w.emitOnce('caption', reading.seep > 0.4 ? 'return.coolSeep' : inLake ? 'return.lake.coolDeep' : 'return.coolPool');
  }
  if (s.heatStress > p.get('return.water.stressCaption')) w.emitOnce('caption', 'return.heatStress');
  return { reading, effects };
}

/** What the HUD and renderer read: the water at the fish, and its heat stress. */
export interface ReturnWaterView extends WaterReading {
  stress: number;
  /** -1 cool refuge .. 0 comfortable .. 1 stressful heat, for tinting the water. */
  feel: number;
}

export function returnWaterView(w: World): ReturnWaterView | null {
  if (w.stageId !== 'return') return null;
  const r = waterAt(w, w.body.pos);
  const p = w.p;
  const comfort = p.get('return.water.comfortTemp');
  const stressT = p.get('return.water.stressTemp');
  const refuge = isRefuge(w, r);
  const feel = refuge ? -1 : clamp01((r.temp - comfort) / (stressT + p.get('return.water.stressSpan') - comfort));
  return { ...r, stress: heatStress(w), feel };
}
