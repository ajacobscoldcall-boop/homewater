// Feel pass: the third-person camera rig, input feel, and the new settings.
import { describe, expect, it } from 'vitest';
import { CAMERA } from '../../src/render/cameraConfig';
import { blockedAt, CameraRig, clearLength, type CameraProbe, type FishPose } from '../../src/render/cameraRig';
import { INPUT_FEEL, rampTurn, stickCurve } from '../../src/input/feel';
import { MOUSE_SENSITIVITIES, parseAccess } from '../../src/ui/accessibility';
import { WoundTracker } from '../../src/render/wounds';

const flat = (ground = 0, surfaceY = 5): CameraProbe => ({ surfaceY, ground: () => ground });
const fish = (over: Partial<FishPose> = {}): FishPose => ({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, scale: 1, ...over });

/** Run the rig for n frames at 60 fps. */
function run(rig: CameraRig, f: FishPose, probe: CameraProbe, n = 120, reduced = false): void {
  for (let i = 0; i < n; i++) rig.update(f, 1 / 60, probe, reduced);
}

describe('camera rig', () => {
  it('sits behind and above the fish, under the surface, looking ahead of it', () => {
    const rig = new CameraRig();
    run(rig, fish(), flat());
    expect(rig.pos.x).toBeLessThan(-1); // behind (the fish faces +x)
    expect(rig.pos.y).toBeGreaterThan(1);
    expect(rig.pos.y).toBeLessThanOrEqual(5 - CAMERA.surfaceMargin + 1e-9);
    expect(rig.look.x).toBeGreaterThan(0); // ahead of the fish
  });

  it('never goes above the surface, even with the fish at it', () => {
    const rig = new CameraRig();
    const f = fish({ pos: { x: 0, y: 4.9, z: 0 }, pitch: 0.8 });
    for (let i = 0; i < 200; i++) {
      rig.update(f, 1 / 60, flat(), false);
      expect(rig.pos.y).toBeLessThanOrEqual(5 - CAMERA.surfaceMargin + 1e-9);
    }
  });

  it('pulls in before a wall behind the fish instead of going through it', () => {
    const rig = new CameraRig();
    const probe: CameraProbe = { ...flat(), walls: [{ min: { x: -1.2, y: -10, z: -5 }, max: { x: -1.0, y: 10, z: 5 } }] };
    for (let i = 0; i < 200; i++) {
      rig.update(fish(), 1 / 60, probe, false);
      expect(blockedAt(rig.pos, probe, 0)).toBe(false);
      expect(rig.pos.x).toBeGreaterThan(-1.0);
    }
  });

  it('stays out of a bank rising behind the fish, and rises rather than burying itself', () => {
    // Ground climbs steeply behind the fish (x < 0), like a bank.
    const probe: CameraProbe = { surfaceY: 5, ground: (x) => (x < -0.5 ? Math.min(8, (-0.5 - x) * 4) : 0) };
    const rig = new CameraRig();
    for (let i = 0; i < 200; i++) {
      rig.update(fish(), 1 / 60, probe, false);
      expect(rig.pos.y).toBeGreaterThan(probe.ground(rig.pos.x, rig.pos.z));
    }
  });

  it('swings aside around a rock right behind the fish instead of pressing into its back', () => {
    const probe: CameraProbe = { ...flat(), walls: [{ min: { x: -1.0, y: -10, z: -0.35 }, max: { x: -0.7, y: 10, z: 0.35 } }] };
    const rig = new CameraRig();
    for (let i = 0; i < 240; i++) {
      rig.update(fish(), 1 / 60, probe, false);
      expect(blockedAt(rig.pos, probe, 0)).toBe(false);
    }
    expect(Math.hypot(rig.pos.x, rig.pos.y - 1, rig.pos.z)).toBeGreaterThan(1.2);
    expect(Math.abs(rig.pos.z)).toBeGreaterThan(0.3);
  });

  it('stays clear of solid scenery reported by the ray probe', () => {
    // A rock 1.2 units back along any boom.
    const probe: CameraProbe = { ...flat(), rayHit: (_f, _d, max) => (max > 1.2 ? 1.2 : Infinity) };
    const rig = new CameraRig();
    run(rig, fish(), probe);
    const d = Math.hypot(rig.pos.x - 0, rig.pos.y - 1, rig.pos.z - 0);
    expect(d).toBeLessThanOrEqual(1.2 - CAMERA.margin + 1e-6);
  });

  it('clearLength stops at the first blocked point', () => {
    const probe: CameraProbe = { surfaceY: 5, ground: (x) => (x < -2 ? 3 : 0) };
    const len = clearLength({ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, 4, probe, 0);
    expect(len).toBeGreaterThan(1.9);
    expect(len).toBeLessThanOrEqual(2);
  });

  it('lags a little on a turn, then settles behind the fish (high view)', () => {
    const rig = new CameraRig();
    rig.view = 'high';
    run(rig, fish(), flat());
    const turned = fish({ yaw: Math.PI / 2 }); // now facing +z
    rig.update(turned, 1 / 60, flat(), false);
    // One frame after the turn the camera is still mostly behind the old heading.
    expect(rig.pos.x).toBeLessThan(-1);
    run(rig, turned, flat(), 240);
    expect(rig.pos.z).toBeLessThan(-1);
    expect(Math.abs(rig.pos.x)).toBeLessThan(0.1);
  });

  it('follows turns faster with reduced motion', () => {
    const a = new CameraRig();
    const b = new CameraRig();
    run(a, fish(), flat());
    run(b, fish(), flat(), 120, true);
    const turned = fish({ yaw: Math.PI / 2 });
    run(a, turned, flat(), 10);
    run(b, turned, flat(), 10, true);
    expect(b.pos.z).toBeLessThan(a.pos.z); // further round towards behind the new heading
  });

  it('shakes on a near miss, but never with reduced motion', () => {
    const still = new CameraRig();
    run(still, fish(), flat());
    const before = { ...still.pos };
    still.shake(1);
    still.update(fish(), 1 / 60, flat(), true);
    expect(Math.hypot(still.pos.x - before.x, still.pos.y - before.y, still.pos.z - before.z)).toBeLessThan(1e-6);

    const shaky = new CameraRig();
    run(shaky, fish(), flat());
    const calm = { ...shaky.pos };
    shaky.shake(1);
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      shaky.update(fish(), 1 / 60, flat(), false);
      moved = Math.max(moved, Math.hypot(shaky.pos.x - calm.x, shaky.pos.y - calm.y, shaky.pos.z - calm.z));
    }
    expect(moved).toBeGreaterThan(0.01);
    run(shaky, fish(), flat(), 60);
    expect(shaky.shaking).toBe(false);
    expect(Math.hypot(shaky.pos.x - calm.x, shaky.pos.y - calm.y, shaky.pos.z - calm.z)).toBeLessThan(1e-6);
  });
});

describe('input feel', () => {
  it('a held steer key ramps to full turn, and lets go quickly', () => {
    let t = 0;
    const steps = Math.ceil(INPUT_FEEL.keyTurnRamp * 60);
    t = rampTurn(t, 1, 1 / 60);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    for (let i = 0; i < steps; i++) t = rampTurn(t, 1, 1 / 60);
    expect(t).toBe(1);
    for (let i = 0; i < Math.ceil(INPUT_FEEL.keyTurnRelease * 60); i++) t = rampTurn(t, 0, 1 / 60);
    expect(t).toBe(0);
  });

  it('the stick curve keeps the ends and softens the middle', () => {
    expect(stickCurve(1)).toBe(1);
    expect(stickCurve(-1)).toBe(-1);
    expect(stickCurve(0)).toBe(0);
    expect(Math.abs(stickCurve(0.5))).toBeLessThan(0.5);
    expect(stickCurve(-0.5)).toBeLessThan(0);
  });

  it('mouse sensitivity and invert are kept, and bad values fall back', () => {
    expect(parseAccess({}).mouseSensitivity).toBe(1);
    expect(parseAccess({}).invertY).toBe(false);
    expect(parseAccess({ mouseSensitivity: 2, invertY: true })).toMatchObject({ mouseSensitivity: 2, invertY: true });
    expect(parseAccess({ mouseSensitivity: 7 }).mouseSensitivity).toBe(1);
    expect(MOUSE_SENSITIVITIES).toContain(1);
  });
});

describe('hit feedback', () => {
  it('the wound tracker counts each mark, so the camera and sound can react once per hit', () => {
    const t = new WoundTracker();
    expect(t.hits).toBe(0);
    t.add('claw', 0.7);
    t.add('scrape', 2);
    expect(t.hits).toBe(2);
    expect(t.lastHit).toBe(1);
  });
});
