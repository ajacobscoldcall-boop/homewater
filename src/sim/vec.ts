import type { Vec3 } from './types';

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distXZ = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
};
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const copy = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

/** Unit vector for a heading: yaw around +y (0 = +x), pitch up positive. */
export const headingVec = (yaw: number, pitch: number): Vec3 => ({
  x: Math.cos(pitch) * Math.cos(yaw),
  y: Math.sin(pitch),
  z: Math.cos(pitch) * Math.sin(yaw),
});

export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
