/**
 * Spawning grounds: the state every role shares, small helpers, rival fish
 * and senescence. Split out of spawn.ts by concern; behaviour unchanged.
 */
import type { Entity, Vec3 } from '../../types';
import { dist, norm, scale, sub, v3 } from '../../vec';
import type { World } from '../../world';
import type { Params } from '../../params';
import type { BearPreyKind } from '../../bearFeeding';

export type SpawnRole = 'female' | 'largeMale' | 'jack';

/** Large male: with the first female, deciding after spawning, gone to a second female, or finished. */
export type MalePhase = 'first' | 'decide' | 'seeking' | 'done';

export const SPOT_Z = 6.6;
/** "Beside the female", in world units. */
export const NEAR = 4;

export interface SpawnState {
  role: SpawnRole;
  /** A male was at the redd last step (so his loss starts the replacement wait). */
  hadMale?: boolean;
  /** Jack role: burst still held from the last charge, and the wait before another charge. */
  chargeLatch?: boolean;
  chargeWait?: number;
  dig: number;
  quality: number;
  /** Rival females that dug into the redd before the eggs were laid. */
  steals: number;
  /** Rival females that dug over the redd after the eggs were laid (superimposition). */
  superimposed: number;
  spawned: boolean;
  spawnedAt: number;
  /** Female: seconds settled over the finished redd with a male beside her. */
  act: number;
  /** Female: 0..1, how well the eggs are covered. */
  burial: number;
  /** Female: whether the two males have contested her yet. */
  contested: boolean;
  maleTimer: number;
  rivalTimer: number;
  near: number;
  stolen: number;
  windowUntil: number;
  sneaks: number;
  share: number;
  /** Large male: seconds until the player can fight again after losing. */
  stunned: number;
  fightsWon: number;
  fightsLost: number;
  bearTimer: number;
  /** The bank the bear is on (+1 or -1), where it is walking to on patrol, and what it caught. */
  bearSide: number;
  bearGoalX: number;
  bearMeal: BearPreyKind | '';
  bearMealSize: number;
  bearShare: number;
  /** Fish darting away from a bear's strike: entity id -> direction and seconds left. */
  startle: Record<string, { x: number; z: number; t: number }>;
  /** Strength left. Energy cannot recover above it, and it only falls. */
  vigour: number;
  /** Share of jacks among the males on the grounds this year. */
  jackFraction: number;
  /** Large male. */
  phase: MalePhase;
  mateId: number;
  secondId: number;
  secondAt: number;
  firstShare: number;
  secondShare: number;
  stayed: number;
  near2: number;
  wait: number;
  /** Jack: hiding spots under the bank and who holds each (0 = the player, -1 = empty, else an entity id). */
  spots: Vec3[];
  owners: number[];
  contest: number;
  jacksBeat: number;
}

export const st = (w: World) => w.stage as unknown as SpawnState;

export const roleOf = (w: World): SpawnRole => (w.fish.sex === 'F' ? 'female' : w.progress.isJack ? 'jack' : 'largeMale');

export const reddOf = (w: World): Entity | undefined => w.live('redd')[0];
export const byId = (w: World, id: number): Entity | undefined => w.entities.find((e) => e.id === id && e.alive);
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Strength lost per second on the grounds; bursting costs extra. It never comes back. */
export function senescenceRate(p: Params, bursting: boolean): number {
  return p.get('spawn.senescenceRate') + (bursting ? p.get('spawn.senescenceBurstCost') : 0);
}

export function spawnRival(w: World, towards: Entity | undefined, size: number): void {
  const fromLeft = w.rng.chance(0.5);
  const pos = v3(fromLeft ? 1 : 39, -1.4, w.rng.range(-4, 3));
  w.spawn('rival', pos, { radius: 0.6, state: 'approach', value: size, home: towards ? { ...towards.pos } : v3(20, -1.5, 0) });
  w.emit('warning', 'rival');
}

export const rivalSize = (w: World): number => Math.max(0.5, w.p.get('spawn.rivalSizeMean') + w.rng.normal(0, w.p.get('spawn.rivalSizeSd')));

/** Rivals approach the target; a rival that sits there long enough takes over. */
export function stepRivals(w: World, dt: number, target: Entity | undefined, onTakeover: (r: Entity) => void): void {
  const p = w.p;
  const fish = w.body.pos;
  for (const r of w.live('rival')) {
    if (r.state === 'approach') {
      const goal = target?.pos ?? r.home ?? v3(20, -1.5, 0);
      if (dist(r.pos, goal) > 1.2) r.vel = scale(norm(sub(goal, r.pos)), 2.6);
      else {
        r.vel = v3();
        r.timer += dt;
        if (r.timer > p.get('spawn.rivalTakeoverTime')) {
          onTakeover(r);
          r.state = 'flee';
          r.timer = 4;
        }
      }
    } else if (r.state === 'flee') {
      r.timer -= dt;
      const away = norm(sub(r.pos, fish));
      r.vel = scale(v3(away.x, 0, away.z), 6);
      if (r.timer <= 0) r.alive = false;
    } else if (r.state === 'fight') {
      r.vel = v3(Math.sin(w.stageTime * 9) * 2, 0, Math.cos(w.stageTime * 7) * 2);
    }
    r.pos.x = Math.max(0.5, Math.min(39.5, r.pos.x + r.vel.x * dt));
    r.pos.z = Math.max(-7.5, Math.min(7.5, r.pos.z + r.vel.z * dt));
    if (r.vel.x || r.vel.z) r.yaw = Math.atan2(r.vel.z, r.vel.x);
  }
}

/** Senescence: strength drains and caps energy. Returns true when it has run out. */
export function stepSenescence(w: World, dt: number): boolean {
  const p = w.p;
  const s = st(w);
  s.vigour = Math.max(0, s.vigour - senescenceRate(p, w.body.burst) * dt);
  w.body.energy = Math.min(w.body.energy, s.vigour);
  if (s.vigour < p.get('spawn.senescenceWarnAt')) w.emitOnce('caption', 'spawn.senescence');
  return s.vigour <= p.get('spawn.senescenceEnd');
}
