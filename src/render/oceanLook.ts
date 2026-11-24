/**
 * The open-water look along the ocean route (render only): coastal green in the
 * first summer, clear offshore blue, dark grey-blue winter water far out, fewer
 * distant schools in winter, and a warm year a little hazier. Pure apart from
 * the shared uniform the far schools read. Tuning in oceanLookConfig.ts.
 */
import * as THREE from 'three';
import type { OceanView } from '../sim/stages/ocean';
import { OCEAN_LOOK } from './oceanLookConfig';

export interface OceanLook {
  fog: THREE.Color;
  density: number;
  shafts: number;
  schools: number;
  sky: 'day' | 'autumn' | 'winter';
}

/** Read by the far schools' shader (env/ocean.ts): how many show. */
export const oceanSchools = { uAmount: { value: 1 } };

const GREY = new THREE.Color(0x26323a);
const WARM = new THREE.Color(OCEAN_LOOK.warmTint);

/** The target look for the season being played (or coming up). */
export function oceanLook(v: Pick<OceanView, 'season' | 'warmth' | 'moment'>, out?: OceanLook): OceanLook {
  const o = out ?? { fog: new THREE.Color(), density: 1, shafts: 1, schools: 1, sky: 'day' };
  const place = v.season?.place ?? 'offshore';
  const season = v.season?.season ?? 'summer';
  o.fog.setHex(OCEAN_LOOK.fog[place]);
  if (season === 'winter') o.fog.lerp(GREY, OCEAN_LOOK.winterGrey);
  if (v.warmth === 'warm') o.fog.lerp(WARM, OCEAN_LOOK.warmMix);
  o.density = OCEAN_LOOK.density[place] * (v.warmth === 'warm' ? 1.1 : 1);
  o.shafts = OCEAN_LOOK.shafts[season];
  o.schools = OCEAN_LOOK.schools[season];
  o.sky = v.moment === 'reveal' || season === 'autumn' ? 'autumn' : season === 'winter' ? 'winter' : 'day';
  return o;
}

/** Ease `cur` toward `target` (colour, density, shafts, schools) by dt. */
export function easeLook(cur: OceanLook, target: OceanLook, dt: number): OceanLook {
  const k = 1 - Math.exp(-OCEAN_LOOK.ease * dt);
  cur.fog.lerp(target.fog, k);
  cur.density += (target.density - cur.density) * k;
  cur.shafts += (target.shafts - cur.shafts) * k;
  cur.schools += (target.schools - cur.schools) * k;
  cur.sky = target.sky;
  return cur;
}
