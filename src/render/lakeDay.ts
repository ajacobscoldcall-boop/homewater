/**
 * The lake's sky through a summer day (render only): which two of the above-water sky looks to blend
 * (above.ts `setSky`) for the fry stage's surface light. Day blends to dusk as the light falls to the
 * dusk level, then dusk to night (with stars) below it; dawn runs the same way back. Pure, unit tested.
 */
export interface SkyBlend {
  from: 'day' | 'dusk';
  to: 'dusk' | 'night';
  k: number;
}

export function fryDaySky(light: number, duskLight: number, nightLight: number): SkyBlend {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  if (light >= duskLight) return { from: 'day', to: 'dusk', k: clamp01((1 - light) / Math.max(0.05, 1 - duskLight)) };
  return { from: 'dusk', to: 'night', k: clamp01((duskLight - light) / Math.max(0.05, duskLight - nightLight)) };
}

/**
 * A merganser over the lake: splash sizes (splash.ts `burst` size), how often its paddling rings the surface (s),
 * and how far its model sits back (in its own lengths) under water so the bill leads at the sim's point.
 */
export const LAKE_SPLASH = { land: 1.6, dive: 2.2, paddle: 0.6, paddleEvery: 0.7, billLead: -0.42 } as const;
