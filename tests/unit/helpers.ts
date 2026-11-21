import paramFile from '../../src/data/params.json';
import { foundLineage } from '../../src/sim/lineage';
import { fallsView } from '../../src/sim/stages/falls';
import { lakeView, siteWater } from '../../src/sim/stages/returnLake';
import { Params, type Difficulty, type ParamFile } from '../../src/sim/params';
import { NO_INTENT, type Habitat, type Intent, type Sex } from '../../src/sim/types';
import { World } from '../../src/sim/world';

export const FILE = paramFile as ParamFile;
export const params = (d: Difficulty = 'fieldGuide') => new Params(FILE, d);

export function newWorld(opts: { seed?: number; sex?: Sex; preset?: 'quick' | 'jack'; difficulty?: Difficulty; startStage?: number; habitat?: Habitat } = {}) {
  const p = params(opts.difficulty);
  const lineage = foundLineage(p, {
    preset: opts.preset ?? 'quick',
    sex: opts.sex ?? 'F',
    name: 'Test',
    difficulty: opts.difficulty ?? 'fieldGuide',
    seed: opts.seed ?? 1234,
    ...(opts.habitat ? { habitat: opts.habitat } : {}),
  });
  const w = new World(p, {
    fish: lineage.current,
    conditions: { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 },
    difficulty: opts.difficulty ?? 'fieldGuide',
    siblings: 3,
    seed: opts.seed ?? 1234,
    startStage: 0,
  });
  if (opts.startStage) w.debugJumpTo(opts.startStage);
  return { p, w, lineage };
}

export const intent = (over: Partial<Intent> = {}): Intent => ({ ...NO_INTENT, ...over });

/** Run until status changes or the step budget runs out. */
export function run(w: World, steps: number, policy: (w: World, i: number) => Intent): void {
  for (let i = 0; i < steps && w.status === 'playing'; i++) w.step(policy(w, i));
}

/** Steer toward a point using the keyboard turn input. */
export function steerTo(w: World, tx: number, tz: number, over: Partial<Intent> = {}): Intent {
  const b = w.body;
  const want = Math.atan2(tz - b.pos.z, tx - b.pos.x);
  let d = want - b.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return intent({ forward: 1, turn: Math.max(-1, Math.min(1, d * 3)), ...over });
}

/** Steer toward a point in 3D: turn for the heading, the mouse for the pitch. */
export function steer3(w: World, tx: number, ty: number, tz: number, over: Partial<Intent> = {}): Intent {
  const b = w.body;
  const base = steerTo(w, tx, tz, over);
  const want = Math.max(-0.9, Math.min(0.9, Math.atan2(ty - b.pos.y, Math.max(1.5, Math.hypot(tx - b.pos.x, tz - b.pos.z)))));
  return { ...base, mouseY: -(want - b.pitch) / w.p.get('swim.mouseSensitivity') };
}

const pilotRun = new WeakMap<World, { running: boolean; leaps: number }>();

/**
 * Get past the rapids and falls (null outside them): dash up the rapids, wait
 * at the foot of the plunge pool until rested, then sprint under the low step
 * and leap from the standing wave. Up the side channel once it is open.
 */
export function fallsPilot(w: World): Intent | null {
  const v = fallsView(w);
  if (!v || v.passed) return null;
  const b = w.body;
  const x = b.pos.x;
  if (x < v.rapidsStart - 3 || x > v.lipEnd) return null;
  if (v.leapT !== null) return intent();
  if (v.sideOpen) {
    const cz = (v.chute[0] + v.chute[1]) / 2;
    return steer3(w, x + 6, -1.2, cz, { burst: b.energy > 0.4 });
  }
  if (x < v.poolStart) return steer3(w, x + 8, -1.6, v.notchZ, { burst: b.energy > 0.3 });
  const mem = pilotRun.get(w) ?? { running: false, leaps: 0 };
  pilotRun.set(w, mem);
  if (mem.leaps !== v.leaps || x < v.poolStart - 1 || x > v.face - 0.8) mem.running = false;
  mem.leaps = v.leaps;
  if (!mem.running) {
    const sx = v.poolStart + 0.8;
    if (Math.abs(x - sx) > 1 || Math.abs(b.pos.z - v.notchZ) > 0.8) return steer3(w, sx + 3, -1.0, v.notchZ, { forward: x > sx + 1 ? 0 : 0.7 });
    if (b.energy < 0.9) return steer3(w, x + 5, -1.0, v.notchZ, { forward: 0.35 });
    mem.running = true;
  }
  const rise = x > v.waveX - 0.4 && Math.abs(b.pos.z - v.notchZ) < 1.2;
  return steer3(w, v.face, -0.8, v.notchZ, { burst: true, rise });
}

/**
 * Cross the lake (null before it): out of the river's trough, then wait deep
 * off home until the colours have come on, then go in. Knows where home is
 * (a test pilot, not a player).
 */
export function lakePilot(w: World): Intent | null {
  const v = lakeView(w);
  if (!v) return null;
  const lay = v.layout;
  const b = w.body.pos;
  if (b.x < lay.start - 2) return null;
  const inlet = (lay.inletZ0 + lay.inletZ1) / 2;
  // Down into the cool water as soon as the trough is deep enough.
  if (b.x < lay.start + 22) return steer3(w, lay.start + 30, -5, inlet + (0 - inlet) * 0.3, { dive: b.x > lay.start + 6 && b.y > -4.5 });
  const q = lay.sites[lay.home]!;
  const water = siteWater(q);
  if (v.ripe < 1) {
    const hx = q.kind === 'inflow' ? water.x - 16 : water.x;
    const hz = q.kind === 'inflow' ? water.z : water.z - q.side * 12;
    const d = Math.hypot(hx - b.x, hz - b.z);
    return steer3(w, hx, -6.5, hz, { forward: d > 3 ? 1 : 0.15, dive: b.y > -6 });
  }
  if (q.kind === 'inflow') return steer3(w, b.x < lay.end - 3 ? lay.end + 8 : lay.end + 10, -1.4, q.z);
  return steer3(w, q.x, -0.9, q.z + q.side * 3);
}
