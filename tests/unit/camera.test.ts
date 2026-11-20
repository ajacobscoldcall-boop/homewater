// Camera framing, Documentary view and the always-visible HUD (render and UI only; the sim is untouched).
import { describe, expect, it } from 'vitest';
import { CAMERA } from '../../src/render/cameraConfig';
import { CameraRig, type CameraProbe, type FishPose } from '../../src/render/cameraRig';
import { threatFocus, type ActiveThreat } from '../../src/render/threats';
import { parseAccess } from '../../src/ui/accessibility';
import { FatWatch, fatLevel } from '../../src/ui/vitals';
import { VITALS } from '../../src/ui/hudConfig';

const flat = (ground = 0, surfaceY = 8): CameraProbe => ({ surfaceY, ground: () => ground });
const fish = (over: Partial<FishPose> = {}): FishPose => ({ pos: { x: 0, y: 3, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, scale: 1, ...over });
const run = (rig: CameraRig, f: FishPose, probe: CameraProbe, n = 180, reduced = false, aim = {}) => {
  for (let i = 0; i < n; i++) rig.update(f, 1 / 60, probe, reduced, aim);
};
/** Angle (rad) of the camera above the fish, seen from the fish. */
const elevation = (rig: CameraRig, f: FishPose) => Math.atan2(rig.pos.y - f.pos.y, Math.hypot(rig.pos.x - f.pos.x, rig.pos.z - f.pos.z));
/** Angle (rad) of the camera off the fish's tail axis, in the horizontal plane. */
const offTail = (rig: CameraRig, f: FishPose) => Math.abs(Math.atan2(-(rig.pos.z - f.pos.z), -(rig.pos.x - f.pos.x)) - 0);

describe('camera views', () => {
  it('chase (default) sits low near the fish’s depth, behind and off to one side', () => {
    const rig = new CameraRig();
    expect(rig.view).toBe('chase');
    const f = fish();
    run(rig, f, flat());
    expect(rig.pos.x).toBeLessThan(-1); // behind (the fish faces +x)
    expect(elevation(rig, f)).toBeLessThan(0.3); // low: under ~17° above the fish
    expect(offTail(rig, f)).toBeGreaterThan(0.35); // three-quarter, so the side of the body shows
    expect(Math.abs(rig.look.y - f.pos.y)).toBeLessThan(0.5); // gaze near the fish's depth, so the surface stays in frame
    expect(rig.pos.y - f.pos.y).toBeLessThan(0.6);
  });

  it('high looks down on the fish from well above', () => {
    const rig = new CameraRig();
    rig.view = 'high';
    const f = fish();
    run(rig, f, flat());
    expect(elevation(rig, f)).toBeGreaterThan(0.6);
    expect(Math.abs(rig.pos.z)).toBeLessThan(1e-6); // straight behind
    expect(rig.look.y).toBeLessThan(f.pos.y);
  });

  it('starts on the side with more open water', () => {
    // A wall close on the -z side of the fish: the chase camera should start on the +z side.
    const probe: CameraProbe = { ...flat(), walls: [{ min: { x: -6, y: -10, z: -0.9 }, max: { x: 2, y: 20, z: -0.6 } }] };
    const rig = new CameraRig();
    run(rig, fish(), probe);
    expect(rig.pos.z).toBeGreaterThan(0);
  });

  it('swings round to side-on for a framed moment, and back after', () => {
    const rig = new CameraRig();
    const f = fish();
    run(rig, f, flat());
    const before = offTail(rig, f);
    run(rig, f, flat(), 240, false, { side: 1 });
    expect(rig.sideOnShare).toBeGreaterThan(0.95);
    expect(offTail(rig, f)).toBeGreaterThan(CAMERA.frame.angle - 0.15);
    expect(elevation(rig, f)).toBeLessThan(0.15);
    run(rig, f, flat(), 360);
    expect(Math.abs(offTail(rig, f) - before)).toBeLessThan(0.05);
  });

  it('a framed moment swings round to the side with more room, smoothly', () => {
    const rig = new CameraRig();
    const f = fish();
    run(rig, f, flat());
    const sign = Math.sign(rig.pos.z);
    // A bank close on the side the camera is on.
    const wallZ = sign * 1.2;
    const probe: CameraProbe = { ...flat(), walls: [{ min: { x: -8, y: -10, z: Math.min(wallZ, wallZ + sign * 5) }, max: { x: 8, y: 20, z: Math.max(wallZ, wallZ + sign * 5) } }] };
    let last = { ...rig.pos };
    let maxStep = 0;
    for (let i = 0; i < 300; i++) {
      rig.update(f, 1 / 60, probe, false, { side: 1 });
      maxStep = Math.max(maxStep, Math.hypot(rig.pos.x - last.x, rig.pos.y - last.y, rig.pos.z - last.z));
      last = { ...rig.pos };
    }
    expect(Math.sign(rig.pos.z)).toBe(-sign);
    expect(maxStep).toBeLessThan(0.25); // no jump
  });

  it('side-on framing centres between the fish and a rival', () => {
    const rig = new CameraRig();
    const f = fish();
    run(rig, f, flat(), 300, false, { side: 1, centre: { x: 0, y: 3, z: 3 }, spread: 2 });
    expect(rig.look.z).toBeGreaterThan(2);
  });

  it('the high view keeps its framing even when a moment asks for side-on', () => {
    const rig = new CameraRig();
    rig.view = 'high';
    run(rig, fish(), flat(), 240, false, { side: 1 });
    expect(rig.sideOnShare).toBe(0);
  });

  it('turns softly toward a hot threat behind the fish', () => {
    const rig = new CameraRig();
    const f = fish();
    run(rig, f, flat());
    const calmLook = { ...rig.look };
    const threat = { x: -2, y: 3, z: 8 }; // behind and to the right (+z)
    run(rig, f, flat(), 240, false, { threat, threatWeight: 1 });
    expect(Math.abs(rig.threatSwing)).toBeGreaterThan(0.3);
    expect(Math.abs(rig.threatSwing)).toBeLessThanOrEqual(CAMERA.threat.maxSwing + 1e-9);
    expect(rig.look.z).toBeGreaterThan(calmLook.z + 0.5);
    // The camera has swung to the far side of the fish from the threat, so it looks across toward it.
    expect(rig.pos.z).toBeLessThan(0);
  });

  it('never turns toward a threat with reduced motion', () => {
    const rig = new CameraRig();
    const f = fish();
    run(rig, f, flat(), 180, true);
    const calm = { ...rig.pos };
    run(rig, f, flat(), 240, true, { threat: { x: -2, y: 3, z: 8 }, threatWeight: 1 });
    expect(rig.threatSwing).toBe(0);
    expect(Math.hypot(rig.pos.x - calm.x, rig.pos.y - calm.y, rig.pos.z - calm.z)).toBeLessThan(1e-6);
  });

  it('stays under the surface in the chase view with the fish just under it', () => {
    const rig = new CameraRig();
    const f = fish({ pos: { x: 0, y: 7.8, z: 0 } });
    for (let i = 0; i < 200; i++) {
      rig.update(f, 1 / 60, flat(), false, { side: i > 100 ? 1 : 0 });
      expect(rig.pos.y).toBeLessThanOrEqual(8 - CAMERA.surfaceMargin + 1e-9);
    }
  });
});

describe('threat focus', () => {
  const t = (over: Partial<ActiveThreat>): ActiveThreat => ({ id: 1, kind: 'seal', marker: { x: 0, y: 0, z: 0 }, at: { x: 0, y: 0, z: 0 }, label: 'seal', hot: false, ...over });
  it('picks an attack over a nearer warning, and ignores tells, openings and rivals', () => {
    const near = t({ id: 1, at: { x: 3, y: 0, z: 0 } });
    const hot = t({ id: 2, at: { x: 5, y: 0, z: 0 }, hot: true });
    expect(threatFocus([near, hot], { x: 0, y: 0, z: 0 })?.threat.id).toBe(2);
    expect(threatFocus([t({ tell: true }), t({ opening: true, id: -1 }), t({ kind: 'rival' })], { x: 0, y: 0, z: 0 })).toBeNull();
    expect(threatFocus([near], { x: 0, y: 0, z: 0 })?.weight).toBeLessThan(1);
  });
});

describe('settings', () => {
  it('Documentary view is off and the chase camera is the default; bad values fall back', () => {
    expect(parseAccess({}).documentaryView).toBe(false);
    expect(parseAccess({}).cameraView).toBe('chase');
    expect(parseAccess({ documentaryView: true, cameraView: 'high' })).toMatchObject({ documentaryView: true, cameraView: 'high' });
    expect(parseAccess({ documentaryView: 'yes', cameraView: 'sideways' })).toMatchObject({ documentaryView: false, cameraView: 'chase' });
  });
});

describe('fat warning', () => {
  it('warns from the rate of burn before the level itself is low', () => {
    const watch = new FatWatch();
    let fat = 0.8;
    let left = Infinity;
    // Burning 1% a second: 80 s left at the start.
    for (let i = 0; i < 60 * 10; i++) {
      fat -= 0.01 / 60;
      left = watch.update(fat, 1 / 60);
    }
    expect(fat).toBeGreaterThan(VITALS.fat.low);
    expect(left).toBeLessThan(VITALS.burn.warnSeconds);
    expect(fatLevel(fat, left)).toBe('low');
  });

  it('stays calm while resting (no burn) and goes critical when nearly empty', () => {
    const watch = new FatWatch();
    let left = Infinity;
    for (let i = 0; i < 600; i++) left = watch.update(0.6, 1 / 60);
    expect(left).toBe(Infinity);
    expect(fatLevel(0.6, left)).toBe('ok');
    expect(fatLevel(0.1, Infinity)).toBe('critical');
    expect(fatLevel(0.5, VITALS.burn.criticalSeconds - 1)).toBe('critical');
  });

  it('needs a few seconds of watching before the rate counts', () => {
    const watch = new FatWatch();
    const left = watch.update(0.7, 1 / 60) && watch.update(0.6, 1 / 60);
    expect(left).toBe(Infinity);
  });
});
