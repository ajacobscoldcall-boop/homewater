/**
 * Threat markers: which threats get one, and where it sits on screen (an
 * arrow at the edge for ones off screen). Pure, given a projection.
 */
import type { World } from '../../sim/world';
import type { ThreatMarker } from '../../ui/hudView';
import { activeThreats } from '../../render/threats';
import { threatMarkers as vitalsThreatMarkers } from '../../ui/vitals';


/** A point projected to the screen: 0..1 across and down, and whether it is behind the camera. */
export interface ScreenPoint {
  x: number;
  y: number;
  behind: boolean;
}

export type Project = (x: number, y: number, z: number) => ScreenPoint;

/** Where a marker goes: on the point if it is on screen, else pinned to an ellipse near the edge, pointing at it. */
export function placeMarker(s: ScreenPoint): { x: number; y: number; off: boolean; angle: number } {
  let x = s.x;
  let y = s.y;
  if (s.behind) {
    x = 1 - x;
    y = 1 - y;
  }
  const off = s.behind || x < 0.04 || x > 0.96 || y < 0.06 || y > 0.94;
  const dx = x - 0.5;
  const dy = y - 0.5;
  if (off) {
    const k = 0.44 / Math.max(Math.abs(dx), Math.abs(dy), 1e-3);
    x = 0.5 + dx * k;
    y = 0.5 + dy * k;
  }
  return { x, y, off, angle: Math.atan2(dy, dx) };
}

/**
 * Markers on threats that are warning or attacking, a lure on the swing nearby, and a jack's opening.
 * Which threats count and where each is marked live in src/render/threats.ts (activeThreats); this keeps
 * the old (world, project) shape for tests and scripts.
 */
export function threatMarkers(w: World, project: Project): ThreatMarker[] {
  return vitalsThreatMarkers(activeThreats(w), project);
}
