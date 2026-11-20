import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, ACTIONS } from '../../src/input/bindings';
import { PAD, readPad, type PadSnapshot } from '../../src/input/gamepad';
import { captureSize, clampTarget, inWater, NO_MOVE, PhotoCamera, photoFileName, type PhotoBounds } from '../../src/render/photoCamera';
import { PHOTO, PHOTO_LIMITS } from '../../src/render/photoConfig';
import { letterboxBar } from '../../src/render/photoPass';
import { parsePhotoOptions } from '../../src/ui/photoMode';

/** Flat bed at y = -10 with a bank rising out of the water for x > 5; surface at 0. */
const bounds = (over: Partial<PhotoBounds> = {}): PhotoBounds => ({
  fish: { x: 0, y: -5, z: 0 },
  surfaceY: 0,
  ground: (x) => (x > 5 ? 2 : -10),
  limits: PHOTO_LIMITS.open,
  ...over,
});

const ok = (c: PhotoCamera, b: PhotoBounds) => {
  const v = c.view(b);
  expect(v.position.y).toBeLessThanOrEqual(b.surfaceY - b.limits.surfaceMargin + 1e-9);
  const d = Math.hypot(v.position.x - b.fish.x, v.position.y - b.fish.y, v.position.z - b.fish.z);
  expect(d).toBeLessThanOrEqual(b.limits.maxTarget + b.limits.maxDist + 1e-6);
  return v;
};

describe('photo camera', () => {
  it('starts where the play camera is, looking at the fish', () => {
    const b = bounds();
    const c = new PhotoCamera();
    c.begin({ x: 0, y: -4, z: 2 }, b);
    const v = c.view(b);
    expect(v.position.x).toBeCloseTo(0);
    expect(v.position.y).toBeCloseTo(-4);
    expect(v.position.z).toBeCloseTo(2);
    expect(v.target).toEqual(b.fish);
  });

  it('never leaves the water, however far it orbits up', () => {
    const b = bounds();
    const c = new PhotoCamera();
    c.begin({ x: 0, y: -4, z: 2 }, b);
    for (let i = 0; i < 200; i++) c.move({ ...NO_MOVE, pitch: 0.05, zoom: -0.05, up: 0.2 }, b);
    expect(c.pitch).toBeLessThanOrEqual(PHOTO.maxPitch);
    ok(c, b);
  });

  it('never goes under the bed, and orbit stops at it', () => {
    const b = bounds({ fish: { x: 0, y: -9.5, z: 0 } });
    const c = new PhotoCamera();
    c.begin({ x: 0, y: -9, z: 2 }, b);
    for (let i = 0; i < 200; i++) c.move({ ...NO_MOVE, pitch: -0.05, up: -0.2 }, b);
    const v = ok(c, b);
    expect(v.position.y).toBeGreaterThanOrEqual(-10 + b.limits.groundMargin - 1e-9);
    expect(c.target.y).toBeGreaterThanOrEqual(-10 + b.limits.groundMargin - 1e-9);
  });

  it('keeps the orbit point within reach of the fish and out of banks', () => {
    const b = bounds();
    const c = new PhotoCamera();
    c.begin({ x: 0, y: -4, z: 2 }, b);
    for (let i = 0; i < 300; i++) c.move({ ...NO_MOVE, forward: 0.3, right: 0.3 }, b);
    const t = c.target;
    expect(Math.hypot(t.x, t.y + 5, t.z)).toBeLessThanOrEqual(PHOTO_LIMITS.open.maxTarget + 1e-9);
    expect(t.x).toBeLessThanOrEqual(5);
    expect(inWater(t, b)).toBe(true);
    ok(c, b);
  });

  it('pulls the camera in front of a bank between it and the fish', () => {
    const b = bounds({ fish: { x: 4, y: -5, z: 0 } });
    const c = new PhotoCamera();
    c.begin({ x: 10, y: -5, z: 0 }, b); // the wanted spot is inside the bank
    const v = c.view(b);
    expect(v.position.x).toBeLessThanOrEqual(5.0001);
    expect(inWater(v.position, b)).toBe(true);
  });

  it('zoom stays within its limits', () => {
    const b = bounds();
    const c = new PhotoCamera();
    c.begin({ x: 0, y: -4, z: 2 }, b);
    c.move({ ...NO_MOVE, zoom: 50 }, b);
    expect(c.dist).toBe(b.limits.minDist);
    c.move({ ...NO_MOVE, zoom: -50 }, b);
    expect(c.dist).toBe(b.limits.maxDist);
  });

  it('clampTarget lets the point sit as low as the fish in the gravel', () => {
    const b = bounds({ fish: { x: 0, y: -10.5, z: 0 }, limits: PHOTO_LIMITS.redd });
    expect(clampTarget({ x: 0, y: -12, z: 0 }, b).y).toBeCloseTo(-10.5);
  });
});

describe('photo capture', () => {
  it('names files homewater-<stage>-<date>.png', () => {
    expect(photoFileName('ocean', new Date(2026, 10, 20, 9, 5, 7))).toBe('homewater-ocean-2026-11-20-090507.png');
    expect(photoFileName('', new Date(2026, 0, 2, 0, 0, 0))).toBe('homewater-photo-2026-01-02-000000.png');
  });

  it('keeps the size within the preset, the device and the pixel budget', () => {
    expect(captureSize(1280, 720, 2, 2, 16384, 1e9)).toMatchObject({ width: 2560, height: 1440 });
    expect(captureSize(1280, 720, 2, 1, 16384, 1e9)).toMatchObject({ width: 1280, height: 720 });
    expect(captureSize(1280, 720, 2, 2, 2048, 1e9).width).toBeLessThanOrEqual(2048);
    const big = captureSize(3840, 2160, 2, 2, 16384, 3840 * 2400);
    expect(big.width * big.height).toBeLessThanOrEqual(3840 * 2400);
  });

  it('letterbox bars only when the picture is narrower than 2.39:1', () => {
    expect(letterboxBar(1280, 720)).toBeGreaterThan(0.1);
    expect(letterboxBar(2400, 1000)).toBe(0);
  });

  it('reads stored options safely', () => {
    expect(parsePhotoOptions(null).look).toBe('natural');
    const o = parsePhotoOptions({ look: 'mono', fov: 500, focus: false, scale: 3, mark: 'yes' });
    expect(o).toMatchObject({ look: 'mono', fov: PHOTO.fovMax, focus: false, scale: 2, mark: true });
    expect(parsePhotoOptions({ look: 'sepia' }).look).toBe('natural');
  });
});

describe('photo key and button', () => {
  it('P by default, on a key nothing else uses', () => {
    expect(DEFAULT_BINDINGS.photo).toEqual(['KeyP']);
    for (const a of ACTIONS) if (a !== 'photo') expect(DEFAULT_BINDINGS[a]).not.toContain('KeyP');
  });
  it('right stick press on a gamepad', () => {
    const snap: PadSnapshot = { buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === PAD.r3, value: i === PAD.r3 ? 1 : 0 })), axes: [0, 0, 0, 0] };
    expect([...readPad(snap).held]).toEqual(['photo']);
  });
});
