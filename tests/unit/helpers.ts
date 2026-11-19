import paramFile from '../../src/data/params.json';
import { foundLineage } from '../../src/sim/lineage';
import { Params, type Difficulty, type ParamFile } from '../../src/sim/params';
import { NO_INTENT, type Intent, type Sex } from '../../src/sim/types';
import { World } from '../../src/sim/world';

export const FILE = paramFile as ParamFile;
export const params = (d: Difficulty = 'fieldGuide') => new Params(FILE, d);

export function newWorld(opts: { seed?: number; sex?: Sex; preset?: 'quick' | 'jack'; difficulty?: Difficulty; startStage?: number } = {}) {
  const p = params(opts.difficulty);
  const lineage = foundLineage(p, {
    preset: opts.preset ?? 'quick',
    sex: opts.sex ?? 'F',
    name: 'Test',
    difficulty: opts.difficulty ?? 'fieldGuide',
    seed: opts.seed ?? 1234,
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
