/**
 * Presentation tuning for weather and season (render only): how the stage and
 * the year's conditions turn into cloud, rain, wind and ice, and how strongly
 * each shows. Nothing here touches the simulation, so it lives here and not in
 * src/data/params.json. See weather.ts.
 */
import type { StageId } from '../sim/types';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const WEATHER = {
  /** Cloud cover in a typical year, by stage (0 clear, 1 low grey overcast). */
  overcast: { egg: 0.45, fry: 0.3, smolt: 0.35, ocean: 0.5, return: 0.4, spawn: 0.55 } as Record<StageId, number>,
  /** Wind, by stage, before cloud adds to it (0 calm, 1 a stiff breeze). The open sea is windiest. */
  wind: { egg: 0.2, fry: 0.25, smolt: 0.15, ocean: 0.6, return: 0.35, spawn: 0.2 } as Record<StageId, number>,
  /**
   * The year's flow and temperature are multipliers round 1 (params year.flowSd 0.18, year.tempSd 0.2).
   * One of these spans (above or below 1) counts as fully wet or warm.
   */
  flowSpan: 0.3,
  tempSpan: 0.35,
  /** A wet (high-flow) year is cloudier; a warm, low-water year clearer. */
  wetCloud: 0.4,
  warmClear: 0.4,
  /** How far one life's sky differs from the next for the same year (share of cover), seeded from the year. */
  vary: 0.4,
  /** Rain falls only above this cover, and is heaviest at full cover. */
  rainFrom: 0.55,
  /** Showers come and go: one cycle in this many seconds; the share of the cycle it rains at all. */
  showerPeriod: 75,
  showerShare: 0.55,
  /** Wind gusts: share of the wind that comes and goes, and the gust period (s). */
  gust: 0.25,
  gustPeriod: 9,
  /** Cloud cover adds this much wind. */
  cloudWind: 0.25,
};

/** How each part of the weather shows. */
export const WEATHER_LOOK = {
  /** Under full overcast: the sun's share of the light (direct light, caustics, shafts) and the sky's brightness. */
  sunUnderCloud: 0.25,
  skyUnderCloud: 0.7,
  /** The underwater light is flatter and a little darker under cloud: fog colour × this at full cover. */
  fogUnderCloud: 0.84,
  /** Hemisphere (sky) light under full cover: × this (the light is flat, not much less). */
  hemiUnderCloud: 0.92,
  /** Shafts soften to this share at full cover. */
  shaftsUnderCloud: 0.25,
  /** Rain: rings per square metre of surface on High, and the ring cell size (m). */
  rainCell: 0.55,
  /** Rings are drawn only this near the camera (world units); further off they are too small to see. */
  rainFar: 30,
  /** Wind ruffle on the surface: normal tilt at no wind and at full wind. */
  rippleCalm: 0.05,
  rippleWind: 0.12,
  /** Cloud colour mixed from the horizon toward this grey (sRGB). */
  cloud: 0xb4bcc0,
  rainCloud: 0x868e92,
};

/** Leaves and snow on the banks, by season (sRGB). Conifers keep their own colour; alder and willow change. */
export const FOLIAGE: Record<Season, { leaf: number; snow: number }> = {
  spring: { leaf: 0x6f8f3e, snow: 0 },
  summer: { leaf: 0x3e5e2a, snow: 0 },
  autumn: { leaf: 0xb08a2e, snow: 0 },
  winter: { leaf: 0x5a5048, snow: 1 },
};

/** Lake ice seen from below (fry winter). */
export const ICE_LOOK = {
  /** Colour of daylight coming through clear ice inside Snell's window, and of the ice away from it (sRGB). */
  lit: 0xdcf0f6,
  dim: 0x58767f,
  /** Snow lying on the ice: patches that let little light through. */
  snow: 0x34444b,
  /** Crack cell size (m) and line width (m); only this share of the ice is cracked. */
  crackCell: 7,
  crackWidth: 0.06,
  crackShare: 0.6,
  /** Trapped bubbles per cell (High) and their size (m). */
  bubbleCell: 1.3,
  bubbleSize: 0.045,
};

/** Gillnet skiffs and the people working them, at the return's nets (boats.ts). */
export const BOATS = {
  /** Skiff length, beam and freeboard (m in world units; about 7 m long). */
  length: 7.2,
  beam: 2.3,
  freeboard: 0.65,
  /** Draft below the waterline (world units). */
  draft: 0.35,
  /** Where along a net line the boat sits: past the end of the line, this far (world units). */
  offset: 2.5,
  /** People per boat (seen through Snell's window as a figure in rain gear). */
  crew: 2,
  /** Person height (world units) and coat colour (sRGB). */
  height: 1.75,
  /** A person's half-width, as a capsule (world units). */
  personRadius: 0.22,
  headRadius: 0.13,
  /** Light scattered up from the water onto the hull's underside (sRGB). */
  underGlow: 0x18302c,
  coat: 0xe08a1e,
  hull: 0xa8b0b2,
  /** Rocking: angle (rad) and period (s), more with wind. */
  rock: 0.04,
  rockPeriod: 3.4,
  /** The hull's shadow on the bed: opacity and how far it spreads past the hull. */
  shadow: 0.35,
  shadowSpread: 1.6,
};
