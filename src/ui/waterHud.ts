/**
 * Rows for the details bar (H) on the return: water temperature, dissolved
 * oxygen and, in a warm year, heat stress and the lasting heat toll. Readings
 * come from src/sim/stages/returnWater.ts and heatToll.ts; the HUD only formats them.
 * On the spawning grounds, `heatTollBar` shows the toll the fish arrived with.
 */
import type { Params } from '../sim/params';
import type { ReturnWaterView } from '../sim/stages/returnWater';
import type { GroundsHeat } from '../sim/stages/heatToll';

export interface WaterBar {
  name: string;
  value: number;
  low: boolean;
}

/** Bar ranges for display only: the bar is full at the hot end of the scale. */
const TEMP_SCALE: [number, number] = [6, 26];
const O2_FULL = 12;

export function waterBars(p: Params, v: ReturnWaterView): WaterBar[] {
  const stressT = p.get('return.water.stressTemp');
  const rows: WaterBar[] = [
    { name: `water ${Math.round(v.temp)}°C`, value: (v.temp - TEMP_SCALE[0]) / (TEMP_SCALE[1] - TEMP_SCALE[0]), low: v.temp >= stressT },
    { name: `O₂ ${v.oxygen.toFixed(1)} mg/L`, value: v.oxygen / O2_FULL, low: v.oxygen < p.get('return.water.o2Low') },
  ];
  if (v.stress > 0.005 || v.warmth >= p.get('return.water.refugeWarmth')) rows.push({ name: 'heat stress', value: v.stress, low: v.stress > 0.5 });
  if (v.toll > 0.005) rows.push({ name: 'heat toll', value: v.toll, low: v.toll >= p.get('heat.tollHighCaption') });
  return rows;
}

/** On the grounds: the burden the fish carries from a warm year (the river's toll plus crowding in warm water). */
export function heatTollBar(p: Params, g: GroundsHeat | null): WaterBar | null {
  if (!g || g.burden <= 0.005) return null;
  return { name: 'heat toll', value: g.burden, low: g.burden > p.get('heat.prespawnFrom') };
}
