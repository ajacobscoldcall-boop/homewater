/**
 * Photo mode's free camera: it orbits a point near the fish and can be flown
 * a little way from it, within limits (photoConfig.ts).
 *
 * Pure maths on plain {x, y, z} objects (no three.js, no DOM) so the rules are
 * unit tested: the orbit point stays within reach of the fish and in the
 * water; the camera stays under the surface (the look breaks above it) and
 * above the ground, banks and bed, and a hill or bank between the orbit
 * point and the camera pulls the camera in front of it, like a spring arm.
 * The ground comes from the scenery builders (src/render/env), the same
 * height the bear stands on.
 */
import { PHOTO, type PhotoLimits } from './photoConfig';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** What the camera may not pass: the water's surface and the ground. */
export interface PhotoBounds {
  /** The fish when photo mode began: the orbit point stays within limits.maxTarget of it. */
  fish: P3;
  surfaceY: number;
  ground(x: number, z: number): number;
  limits: PhotoLimits;
}

/** One frame of photo-camera input, already scaled by time where it should be. */
export interface PhotoMove {
  /** Orbit around the point (rad): yaw to the right, pitch up. */
  yaw: number;
  pitch: number;
  /** Zoom on a log scale: positive moves closer. */
  zoom: number;
  /** Fly the orbit point (m) in the view's frame: right, up, forward (horizontal). */
  right: number;
  up: number;
  forward: number;
}

export const NO_MOVE: PhotoMove = { yaw: 0, pitch: 0, zoom: 0, right: 0, up: 0, forward: 0 };

export interface PhotoView {
  /** Where the camera is, after the bounds. */
  position: P3;
  /** What it looks at (the orbit point). */
  target: P3;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class PhotoCamera {
  /** The point the camera orbits and looks at. */
  target: P3 = { x: 0, y: 0, z: 0 };
  /** Orbit angles (rad): the camera sits at target + dist·(cos p sin y, sin p, cos p cos y). */
  yaw = 0;
  pitch = 0.3;
  /** Wanted distance; the bounds may bring the camera closer for a frame without changing it. */
  dist = 2;

  /** Start from where the play camera is, looking at the fish. */
  begin(camera: P3, b: PhotoBounds): void {
    this.target = { ...b.fish };
    const dx = camera.x - b.fish.x;
    const dy = camera.y - b.fish.y;
    const dz = camera.z - b.fish.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) {
      this.yaw = 0;
      this.pitch = 0.3;
    } else {
      this.yaw = Math.atan2(dx, dz);
      this.pitch = Math.asin(clamp(dy / d, -1, 1));
    }
    this.dist = clamp(d, b.limits.minDist, b.limits.maxDist);
    this.pitch = clamp(this.pitch, -PHOTO.maxPitch, PHOTO.maxPitch);
  }

  /** Apply one frame of input, then keep the orbit point within the bounds. */
  move(m: PhotoMove, b: PhotoBounds): void {
    const old = { ...this.target };
    // Orbit stops where the ground or the surface would close in on the camera (it never swings through the gravel).
    const wasClear = this.armClear(this.yaw, this.pitch, b);
    const yaw = this.yaw + m.yaw;
    const pitch = clamp(this.pitch + m.pitch, -PHOTO.maxPitch, PHOTO.maxPitch);
    if (!wasClear || this.armClear(yaw, pitch, b)) {
      this.yaw = yaw;
      this.pitch = pitch;
    } else if (this.armClear(yaw, this.pitch, b)) {
      this.yaw = yaw;
    }
    this.dist = clamp(this.dist * Math.exp(-m.zoom), b.limits.minDist, b.limits.maxDist);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // Forward is from the camera towards the point, flattened; right is forward × up.
    this.target.x += -sy * m.forward + cy * m.right;
    this.target.z += -cy * m.forward - sy * m.right;
    this.target.y += m.up;
    let next = clampTarget(this.target, b);
    // Never fly the point into a bank: where the ground rises out of the water, it stays where it was.
    if (b.ground(next.x, next.z) + b.limits.groundMargin > b.surfaceY - b.limits.surfaceMargin) next = clampTarget({ x: old.x, y: next.y, z: old.z }, b);
    this.target = next;
  }

  /** True when the camera, at its closest, would be in open water along this orbit direction. */
  private armClear(yaw: number, pitch: number, b: PhotoBounds): boolean {
    const r = Math.min(this.dist, b.limits.minDist * 1.5);
    const cp = Math.cos(pitch);
    const t = this.target;
    return inWater({ x: t.x + cp * Math.sin(yaw) * r, y: t.y + Math.sin(pitch) * r, z: t.z + cp * Math.cos(yaw) * r }, b);
  }

  /** Where the camera is this frame: the wanted orbit position, pulled in by the surface and the ground. */
  view(b: PhotoBounds): PhotoView {
    const t = this.target;
    const cp = Math.cos(this.pitch);
    const dir = { x: cp * Math.sin(this.yaw), y: Math.sin(this.pitch), z: cp * Math.cos(this.yaw) };
    // Spring arm: walk out from the orbit point and stop before the first step that leaves the water or meets the ground.
    const n = PHOTO.armSteps;
    let reach = this.dist;
    for (let i = 1; i <= n; i++) {
      const s = (this.dist * i) / n;
      const p = { x: t.x + dir.x * s, y: t.y + dir.y * s, z: t.z + dir.z * s };
      if (!inWater(p, b)) {
        reach = (this.dist * (i - 1)) / n;
        break;
      }
    }
    reach = Math.max(reach, Math.min(this.dist, b.limits.minDist));
    const position = { x: t.x + dir.x * reach, y: t.y + dir.y * reach, z: t.z + dir.z * reach };
    // The last word: whatever the arm found, the camera itself is under the surface and above the ground.
    position.y = clampY(position, b);
    return { position, target: { ...t } };
  }
}

/** True when a point is under the surface and above the ground, with the margins. */
export function inWater(p: P3, b: PhotoBounds): boolean {
  return p.y <= b.surfaceY - b.limits.surfaceMargin && p.y >= b.ground(p.x, p.z) + b.limits.groundMargin;
}

function clampY(p: P3, b: PhotoBounds): number {
  const lo = b.ground(p.x, p.z) + b.limits.groundMargin;
  const hi = b.surfaceY - b.limits.surfaceMargin;
  // Where the ground is above the surface (a bank), the surface wins: never out of the water.
  return Math.min(hi, Math.max(lo, p.y));
}

/** Keep the orbit point within reach of the fish, under the surface and above the ground. */
export function clampTarget(t: P3, b: PhotoBounds): P3 {
  const f = b.fish;
  let dx = t.x - f.x;
  let dy = t.y - f.y;
  let dz = t.z - f.z;
  const d = Math.hypot(dx, dy, dz);
  const max = b.limits.maxTarget;
  if (d > max) {
    const k = max / d;
    dx *= k;
    dy *= k;
    dz *= k;
  }
  const p = { x: f.x + dx, y: f.y + dy, z: f.z + dz };
  // In the redd the fish lies in the gravel: the point may go as low as the fish, never lower than both.
  const lo = Math.min(b.ground(p.x, p.z) + b.limits.groundMargin, f.y);
  const hi = b.surfaceY - b.limits.surfaceMargin;
  p.y = Math.min(hi, Math.max(lo, p.y));
  return p;
}

/** File name for a captured photo: homewater-<stage>-<yyyy-mm-dd-hhmmss>.png (local time). */
export function photoFileName(stage: string, d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const time = `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  const safe = stage.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'photo';
  return `homewater-${safe}-${date}-${time}.png`;
}

/**
 * Capture size: the window's size times the chosen scale, kept within what
 * the quality preset allows, the device's largest texture and a pixel budget.
 */
export function captureSize(cssW: number, cssH: number, wanted: number, presetMax: number, maxTexture: number, maxPixels: number): { width: number; height: number; scale: number } {
  let scale = Math.max(0.25, Math.min(wanted, presetMax));
  scale = Math.min(scale, maxTexture / Math.max(1, cssW), maxTexture / Math.max(1, cssH));
  const pixels = cssW * cssH * scale * scale;
  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
  return { width: Math.max(1, Math.floor(cssW * scale)), height: Math.max(1, Math.floor(cssH * scale)), scale };
}
