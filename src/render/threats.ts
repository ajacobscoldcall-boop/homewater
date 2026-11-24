/**
 * Which threats are live right now, read from sim state (render and UI only).
 *
 * One list feeds three things:
 * - the HUD's threat markers and edge arrows (App.updateThreats), or, in Documentary view, the edge shadow;
 * - the play camera's soft look toward a hot threat (cameraRig.ts `CameraAim.threat`);
 * - the fish's startle and, in Documentary view, the shadow under a predator (Renderer).
 *
 * The warning times are the sim's: this only reads which state each predator is in.
 */
import type { World } from '../sim/world';
import type { Entity } from '../sim/types';
import { dist } from '../sim/vec';
import { crowdOpening } from '../sim/stages/spawn';

/** Predator states that are an attack in progress. */
export const HOT = new Set(['chase', 'strike', 'lunge', 'charge', 'dive', 'hooked']);
/** Predator states worth a warning (an attack included). */
export const WARN = new Set(['warn', ...HOT]);
/** A swinging lure within this many units gets a marker. */
export const LURE_MARKER_RANGE = 9;
/** A sculpin probing this close to the fish is marked hot (egg stage units). */
const SCULPIN_NEAR = 0.6;

export interface ActiveThreat {
  /** Entity id, or -1 for a synthetic cue (the spawning "now"). */
  id: number;
  kind: string;
  /** Where the marker goes (for strikes from above: over the strike spot at the fish's depth). */
  marker: { x: number; y: number; z: number };
  /** Where the animal itself is (the camera looks toward this). */
  at: { x: number; y: number; z: number };
  label: string;
  hot: boolean;
  /** An opening for the player (green), not a threat. */
  opening?: boolean;
  /** A lure on the swing: a tell, not yet an attack. */
  tell?: boolean;
}

/** The labels on markers, by entity kind. */
export function labelFor(w: World, kind: string): string | undefined {
  const LABEL: Partial<Record<string, string>> = { lure: 'hooked', shark: 'shark', trout: w.stageId === 'fry' ? 'dolly varden' : 'char', birdShadow: 'bird', merganser: 'merganser', seal: 'seal', orca: 'orca', bear: 'bear', rival: 'rival', gull: 'gull', sculpin: 'sculpin' };
  return LABEL[kind];
}

/** Threats that are warning or attacking, the swinging lure near the fish, and the spawning "now". */
export function activeThreats(w: World): ActiveThreat[] {
  const out: ActiveThreat[] = [];
  const fish = w.body.pos;
  for (const e of w.entities) {
    if (!e.alive) continue;
    const label = labelFor(w, e.kind);
    if (!label) continue;
    const rivalActive = (e.kind === 'rival' && e.state === 'approach') || (e.kind === 'sculpin' && e.state !== 'leave');
    if (e.kind === 'lure' && e.state === 'swing' && dist(e.pos, fish) < LURE_MARKER_RANGE) {
      out.push({ id: e.id, kind: e.kind, marker: { ...e.pos }, at: { ...e.pos }, label: 'lure', hot: false, tell: true });
      continue;
    }
    if (!WARN.has(e.state) && !rivalActive) continue;
    if (e.kind === 'trout' && e.state === 'chase' && e.value) continue; // chasing a school-mate
    const target = e.kind === 'bear' && e.home ? e.home : e.pos;
    // Strikes from above (bears, birds) are marked over the spot they will hit, at the fish's depth, so the marker
    // sits in view near the fish rather than up at the surface (feel pass).
    const fromAbove = e.kind === 'bear' || e.kind === 'birdShadow' || e.kind === 'gull' || (e.kind === 'merganser' && e.state === 'warn');
    const y = fromAbove ? Math.min(fish.y, w.arena.surfaceY - 0.3) : target.y;
    // A sculpin is marked at the spot it is probing; it is an attack in progress while it probes within reach of the fish.
    const sculpinHot = e.kind === 'sculpin' && (e.state === 'strike' || (e.state === 'probe' && !!e.home && Math.hypot(e.home.x - fish.x, e.home.z - fish.z) < SCULPIN_NEAR));
    out.push({ id: e.id, kind: e.kind, marker: { x: target.x, y, z: target.z }, at: { ...e.pos }, label, hot: HOT.has(e.state) || sculpinHot });
  }
  // The jack's opening: beside a crowd pair whose males are fighting, else beside the player's own female.
  const crowdOpen = w.stageId === 'spawn' ? crowdOpening(w) : null;
  const female = w.live('female')[0];
  if (crowdOpen) out.push({ id: -1, kind: 'opening', marker: { ...crowdOpen.pos }, at: { ...crowdOpen.pos }, label: 'now', hot: true, opening: true });
  else if (female && w.stageId === 'spawn' && w.live('rival').some((r) => r.state === 'fight')) out.push({ id: -1, kind: 'opening', marker: { ...female.pos }, at: { ...female.pos }, label: 'now', hot: true, opening: true });
  return out;
}

/** The threat the camera should bring on screen: the nearest attack, else the nearest warning (no tells, openings or rivals). */
export function threatFocus(list: readonly ActiveThreat[], fish: { x: number; y: number; z: number }): { threat: ActiveThreat; weight: number } | null {
  let best: ActiveThreat | null = null;
  let bestScore = Infinity;
  for (const t of list) {
    if (t.tell || t.opening || t.kind === 'rival') continue;
    const d = Math.hypot(t.at.x - fish.x, t.at.y - fish.y, t.at.z - fish.z);
    const score = d * (t.hot ? 0.5 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best ? { threat: best, weight: best.hot ? 1 : 0.6 } : null;
}

/** Predators that swim (their shadow on the bed is a Documentary-view cue). */
export const SWIMMERS: ReadonlySet<string> = new Set(['trout', 'seal', 'orca', 'shark', 'merganser', 'sculpin']);

export type { Entity };
