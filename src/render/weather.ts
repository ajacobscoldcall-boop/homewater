/**
 * Weather and season (render only): cloud, rain, wind and ice for what the
 * fish sees, read from the stage, the year's conditions and the stage clock.
 *
 * Pure and deterministic: no randomness from the world's Rng (the sim's random
 * numbers are untouched); one life's sky differs from the next through a hash of
 * the year's own numbers. A wet (high-flow) year is cloudier and showery, a warm,
 * low-water year clear and calm; the open sea is windiest; the fry's winter is
 * under ice; the egg stage's flood comes with rain. Tuning in weatherConfig.ts.
 */
import type { StageId } from '../sim/types';
import { WEATHER, type Season } from './weatherConfig';

export interface WeatherInput {
  stage: StageId;
  /** The year's flow and temperature multipliers (YearConditions). */
  flow: number;
  temperature: number;
  /** The stage clock (s): showers and gusts come and go with it. */
  t: number;
  /** Fry stage phase (fryView), if any: winter is under ice, the spring decision is spring. */
  fryPhase?: string | null;
  /** Ocean moment (oceanView): the maturation reveal is autumn. */
  oceanMoment?: string | null;
  /** Egg stage flood level 0..1 (alevinView): the flood comes with rain. */
  flood?: number;
}

export interface Weather {
  /** Cloud cover, 0 clear to 1 low grey overcast. */
  overcast: number;
  /** Rain on the surface now, 0 none to 1 heavy. */
  rain: number;
  /** Wind on the surface now, 0 calm to 1 a stiff breeze. */
  wind: number;
  /** Ice over the water (fry winter), 0 or 1. */
  ice: number;
  season: Season;
}

export const CLEAR: Weather = { overcast: 0, rain: 0, wind: 0, ice: 0, season: 'summer' };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clamp11 = (v: number) => Math.min(1, Math.max(-1, v));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** A number 0..1 fixed by the inputs (the same year and stage always give the same sky). */
export function weatherHash(a: number, b: number, c: number): number {
  let h = Math.imul(Math.round(a * 1000) | 0, 374761393) ^ Math.imul(Math.round(b * 1000) | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const STAGE_INDEX: Record<StageId, number> = { egg: 0, fry: 1, smolt: 2, ocean: 3, return: 4, spawn: 5 };

export function seasonOf(input: Pick<WeatherInput, 'stage' | 'fryPhase' | 'oceanMoment'>): Season {
  switch (input.stage) {
    case 'egg':
      return 'winter';
    case 'fry':
      return input.fryPhase === 'winter' ? 'winter' : input.fryPhase === 'decide' ? 'spring' : 'summer';
    case 'smolt':
      return 'spring';
    case 'ocean':
      return input.oceanMoment === 'reveal' ? 'autumn' : 'summer';
    case 'return':
      return 'summer';
    case 'spawn':
      return 'autumn';
  }
}

export function weatherFor(input: WeatherInput): Weather {
  const W = WEATHER;
  const season = seasonOf(input);
  const si = STAGE_INDEX[input.stage];
  const h1 = weatherHash(input.flow, input.temperature, si * 7 + 1);
  const h2 = weatherHash(input.flow, input.temperature, si * 7 + 2);
  const h3 = weatherHash(input.flow, input.temperature, si * 7 + 3);
  const wet = clamp11((input.flow - 1) / W.flowSpan);
  const warm = clamp11((input.temperature - 1) / W.tempSpan);
  const overcast = clamp01(W.overcast[input.stage] + W.wetCloud * wet - W.warmClear * warm + W.vary * (h1 - 0.5));
  const ice = input.stage === 'fry' && input.fryPhase === 'winter' ? 1 : 0;
  // Showers: rain only under heavy cloud, coming and going on the stage clock.
  const peak = smooth(W.rainFrom, 1, overcast);
  const cycle = 0.5 + 0.5 * Math.sin((2 * Math.PI * input.t) / W.showerPeriod + h3 * 2 * Math.PI);
  const shower = smooth(1 - W.showerShare, 1 - W.showerShare * 0.4, cycle);
  let rain = ice ? 0 : peak * shower;
  // The egg stage's flood comes with rain on the river.
  if (input.stage === 'egg') rain = Math.max(rain, clamp01(input.flood ?? 0));
  const base = clamp01(W.wind[input.stage] + W.cloudWind * overcast + 0.3 * (h2 - 0.5));
  const gust = 1 - W.gust + W.gust * (0.5 + 0.5 * Math.sin((2 * Math.PI * input.t) / W.gustPeriod + h2 * 9));
  const wind = ice ? 0 : clamp01(base * gust + 0.3 * rain);
  return { overcast: ice ? Math.max(overcast, 0.5) : overcast, rain, wind, ice, season };
}
