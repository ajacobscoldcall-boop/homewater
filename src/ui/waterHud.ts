/**
 * Rows for the details bar (H) on the return: water temperature, dissolved
 * oxygen and, in a warm year, heat stress. Readings come from
 * src/sim/stages/returnWater.ts; the HUD only formats them.
 */
import type { Params } from '../sim/params';
import type { ReturnWaterView } from '../sim/stages/returnWater';

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
  return rows;
}
