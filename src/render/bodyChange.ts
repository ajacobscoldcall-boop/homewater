/**
 * The player's body through the return and on the grounds: thinning as fat
 * drains, and (in fresh water) colours deepening and, on males, the hump and
 * hooked jaw growing step by step up the river. Pure (no three.js objects), so
 * the renderer and the gallery share it and unit tests can check it.
 */
import { BODY_CHANGE } from './bodyConfig';
import type { FishLook, FishShape } from './fishMesh';

export type BodyRole = 'largeMale' | 'female' | 'jack';

export interface BodyState {
  role: BodyRole;
  /** Expressed body-depth trait (standardized). */
  bodyDepth: number;
  /** 0..1 fat reserves. */
  fat: number;
  /** Where the fish is: at sea on the return, in the home river (with how far up, 0..1), or on the grounds. */
  place: 'sea' | 'river' | 'grounds';
  upstream?: number;
}

const cfgOf = (role: BodyRole) => (role === 'female' ? BODY_CHANGE.female : role === 'jack' ? BODY_CHANGE.jack : BODY_CHANGE.male);
const quant = (v: number, step: number) => Math.round(v / step) * step;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The spawning look a role grows into. */
export const dressTarget = (role: BodyRole): FishLook => (role === 'female' ? 'spawnFemale' : role === 'jack' ? 'spawnJack' : 'spawnMale');

/** Thinner as fat drains (fat 1 = as it left the sea). */
export const fatDepth = (fat: number): number => 1 - BODY_CHANGE.fatThin * (1 - Math.max(0, Math.min(1, fat)));

/** 0..1 along the river, eased and stepped, so the mesh is rebuilt only a few times on the way up. */
export function riverStage(upstream: number): number {
  const u = Math.max(0, Math.min(1, upstream));
  return quant(Math.pow(u, BODY_CHANGE.curve), 1 / BODY_CHANGE.steps);
}

export function bodyLook(b: BodyState): { look: FishLook; shape: FishShape } {
  const base = 1 + 0.12 * b.bodyDepth;
  const thin = fatDepth(b.fat);
  const c = cfgOf(b.role);
  if (b.place === 'sea') return { look: 'returnSilver', shape: { depth: quant(base * thin, BODY_CHANGE.depthStep), hump: 0, kype: 0, yolk: 0 } };
  if (b.place === 'grounds') {
    // Full spawning dress (unchanged shapes), still as thin as the journey left the fish.
    const full: Record<BodyRole, FishShape> = {
      female: { depth: base * 1.05, hump: 0.15, kype: 0, yolk: 0 },
      jack: { depth: base, hump: 0.3, kype: 0.4, yolk: 0 },
      largeMale: { depth: base * 1.15, hump: 1, kype: 1, yolk: 0 },
    };
    const s = full[b.role];
    return { look: dressTarget(b.role), shape: { ...s, depth: quant(s.depth * thin, BODY_CHANGE.depthStep) } };
  }
  const k = riverStage(b.upstream ?? 0);
  return {
    look: 'returnBlush',
    shape: {
      depth: quant(base * (1 + c.depthGain * k) * thin, BODY_CHANGE.depthStep),
      hump: Number(lerp(c.hump[0], c.hump[1], k).toFixed(2)),
      kype: Number(lerp(c.kype[0], c.kype[1], k).toFixed(2)),
      yolk: 0,
      dress: Number((c.dressTop * k).toFixed(3)),
      dressTo: dressTarget(b.role),
    },
  };
}
