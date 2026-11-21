/**
 * The estuary at the end of the smolt run: where the river meets the sea.
 *
 * River water is lighter than sea water, so in the estuary it slides out over
 * a wedge of salt water below. Here that is a simple picture (params
 * `estuary.*`, placeholders): along the stage, salinity rises seaward; across
 * the depth, a fresher layer sits on top of saltier water, with a mixed band
 * between them (the halocline) that rises toward the surface seaward. Salinity
 * is a fraction of sea water (0 fresh, 1 full sea water).
 *
 * The fish's readiness for salt water (0..1) finishes developing here. It rises
 * slowly through the whole run (the last of silvering) and faster wherever the
 * water is brackish or salt. Water saltier than readiness allows
 * (`estuary.readyTolerance`) costs energy and weakens the burst for as long as
 * the gap lasts. So holding at the brackish edge to finish adjusting costs time
 * among gulls and seals, and rushing into full salt water costs energy for a
 * while. Both are game devices (docs/ADVISOR_NOTES.md, the estuary stream).
 *
 * Pure: no rendering or DOM, no randomness. State lives in the smolt stage's
 * scratch (`salt` field), so nothing is saved.
 */
import type { Params } from '../params';
import type { World } from '../world';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Where the estuary sits along the smolt run (x in world units). */
export function estuarySpan(p: Params): { mouth: number; start: number; end: number } {
  return { mouth: p.get('smolt.mouthStart'), start: p.get('smolt.estuaryStart'), end: p.get('smolt.length') };
}

/** How far into the estuary x is (0 at its start, 1 at the sea end), unclamped below 0. */
export function estuaryFraction(p: Params, x: number): number {
  const s = estuarySpan(p);
  return (x - s.start) / Math.max(1, s.end - s.start);
}

/** Depth (below the surface, positive) of the middle of the halocline at x. */
export function haloclineDepth(p: Params, x: number): number {
  const u = clamp01(estuaryFraction(p, x) / p.get('estuary.mixedAt'));
  return lerp(p.get('estuary.haloclineStart'), p.get('estuary.haloclineEnd'), u);
}

/** Salinity at the surface and at the bottom at x (fractions of sea water). */
export function salinityLayers(p: Params, x: number): { top: number; bottom: number } {
  const span = estuarySpan(p);
  const mixed = p.get('estuary.mixedAt');
  const u = estuaryFraction(p, x);
  // Upstream of the estuary the salt wedge thins out along the bottom of the river mouth.
  if (u < 0) return { top: 0, bottom: p.get('estuary.bottomSaltStart') * smooth(span.mouth, span.start, x) };
  return {
    top: lerp(p.get('estuary.surfaceSaltStart'), p.get('estuary.surfaceSaltEnd'), smooth(0, mixed, u)),
    bottom: lerp(p.get('estuary.bottomSaltStart'), 1, smooth(0, mixed * 0.6, u)),
  };
}

/** Salinity at x and depth (positive, below the surface). */
export function salinityAt(p: Params, x: number, depth: number): number {
  const { top, bottom } = salinityLayers(p, x);
  const hc = haloclineDepth(p, x);
  const th = p.get('estuary.haloclineThickness');
  return top + (bottom - top) * smooth(hc - th, hc + th, depth);
}

export interface SaltState {
  /** Readiness for salt water, 0..1. */
  ready: number;
  /** Salinity where the fish is. */
  salinity: number;
  /** How far the water is beyond what the fish is ready for (0 when within tolerance). */
  over: number;
  /** Seconds spent in brackish or salt water. */
  brackishTime: number;
  /** The ready caption has been shown. */
  readyShown: boolean;
}

export const newSalt = (ready: number): SaltState => ({ ready, salinity: 0, over: 0, brackishTime: 0, readyShown: false });

/** What salt water beyond the fish's readiness does to swimming this step. */
export function saltEffects(p: Params, over: number): { regenScale: number; burstScale: number; drain: number } {
  if (over <= 0) return { regenScale: 1, burstScale: 1, drain: 0 };
  return {
    regenScale: Math.max(p.get('estuary.saltRegenFloor'), 1 - p.get('estuary.saltRegenLoss') * over),
    burstScale: Math.max(0.2, 1 - p.get('estuary.saltBurstLoss') * over),
    drain: p.get('estuary.saltDrain') * over,
  };
}

/** The gap between the water's salinity and what the fish is ready for. */
export function saltOver(p: Params, salinity: number, ready: number): number {
  return Math.max(0, salinity - ready - p.get('estuary.readyTolerance'));
}

/**
 * Before the swim step: salinity where the fish is and what it costs. Returns
 * the swim options for this step (regen and burst scales).
 */
export function saltBefore(w: World, s: SaltState): { regenScale: number; burstScale: number } {
  const p = w.p;
  s.salinity = salinityAt(p, w.body.pos.x, Math.max(0, w.arena.surfaceY - w.body.pos.y));
  s.over = saltOver(p, s.salinity, s.ready);
  const e = saltEffects(p, s.over);
  return { regenScale: e.regenScale, burstScale: e.burstScale };
}

/** After the swim step: readiness grows, salt beyond it drains energy, captions. */
export function saltAfter(w: World, s: SaltState, dt: number): void {
  const p = w.p;
  const salty = s.salinity >= p.get('estuary.brackishMin');
  const rate = p.get('estuary.readyRunRate') + (salty ? p.get('estuary.readyBrackishRate') : 0);
  s.ready = Math.min(1, s.ready + rate * dt);
  if (salty) s.brackishTime += dt;
  const drain = saltEffects(p, s.over).drain;
  if (drain > 0) w.body.energy = Math.max(0, w.body.energy - drain * dt);
  if (s.over > p.get('estuary.stressShown')) w.emitOnce('caption', 'estuary.saltStress');
  if (estuaryFraction(p, w.body.pos.x) >= 0) {
    w.emitOnce('caption', 'estuary.enter');
    if (salty && s.over <= 0 && s.ready < p.get('estuary.readyDone')) w.emitOnce('caption', 'estuary.edge');
  }
  if (!s.readyShown && s.ready >= p.get('estuary.readyDone') && estuaryFraction(p, w.body.pos.x) > -0.2) {
    s.readyShown = true;
    w.emit('caption', 'estuary.ready');
  }
}

/** Readiness a sibling has when it resumes at the estuary checkpoint. */
export const checkpointReady = (p: Params): number => p.get('estuary.checkpointReady');
