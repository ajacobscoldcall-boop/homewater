/**
 * Stage 6: spawning and death on the creek gravel.
 * - Female: judge the gravel by cobble size, dig the redd (hold E), drive off rival females.
 * - Large male: stay beside the female and fight rivals. Advisor: males ram at
 *   right angles with mouths open, fights are quick and mostly settled by size,
 *   and what skill decides is timing and positioning.
 * - Jack: claim a hiding spot under the bank (other jacks fight for them when
 *   cover is scarce); when the big males clash, dart in (E).
 * - Bears work the shallows. Advisor: they take males first, then large
 *   females, and jacks last.
 */
import { yearJackFraction } from '../genetics';
import { speedOf, swimStep } from '../swim';
import type { Entity, SpawnResult, Vec3 } from '../types';
import { dist, distXZ, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

export type SpawnRole = 'female' | 'largeMale' | 'jack';

const SPOT_Z = 6.6;

interface SpawnState {
  role: SpawnRole;
  dig: number;
  quality: number;
  steals: number;
  spawned: boolean;
  spawnedAt: number;
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
  /** Jack: hiding spots under the bank and who holds each (0 = the player, -1 = empty, else an entity id). */
  spots: Vec3[];
  owners: number[];
  contest: number;
  jacksBeat: number;
}

const st = (w: World) => w.stage as unknown as SpawnState;

export const roleOf = (w: World): SpawnRole => (w.fish.sex === 'F' ? 'female' : w.progress.isJack ? 'jack' : 'largeMale');

const femaleOf = (w: World): Entity | undefined => w.live('female')[0];
const reddOf = (w: World): Entity | undefined => w.live('redd')[0];
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Chance a large male wins a fight. Size dominates; ramming side-on and
 * meeting the rival before he reaches the female both help.
 */
export function fightWinChance(p: World['p'], playerSize: number, rivalSize: number, sideOn: number, early: number): number {
  return sigmoid(
    p.get('spawn.fightBase') +
      p.get('spawn.fightSizeWeight') * (playerSize - rivalSize) +
      p.get('spawn.fightAngleWeight') * (sideOn - 0.5) * 2 +
      p.get('spawn.fightTimingWeight') * (early - 0.5) * 2,
  );
}

/** Bear preference by kind of fish: males, then large females, jacks last. */
export function bearWeight(p: World['p'], kind: 'male' | 'female' | 'jack'): number {
  return p.get(kind === 'male' ? 'spawn.bearPrefMale' : kind === 'female' ? 'spawn.bearPrefFemale' : 'spawn.bearPrefJack');
}

function meanEggs(w: World): number {
  return w.p.get('spawn.eggCountBase') * 0.75;
}

function result(w: World): SpawnResult {
  const p = w.p;
  const s = st(w);
  const base = p.get('spawn.eggCountBase');
  if (s.role === 'female') {
    const t = Math.max(-1, Math.min(1, w.fish.z.eggTradeoff / 2)) * p.get('spawn.eggTradeoffStrength');
    const eggs = Math.round(base * (1 - t) * s.quality);
    const young = (eggs * (1 + t)) / (1 + 0.3 * s.steals);
    return {
      eggs,
      young,
      relativeFitness: young / meanEggs(w),
      detail: `Redd quality ${(s.quality * 100).toFixed(0)}%, ${s.steals} disturbance${s.steals === 1 ? '' : 's'}`,
    };
  }
  const eggs = Math.round(meanEggs(w) * s.share);
  const detail =
    s.role === 'jack'
      ? `${s.sneaks} successful sneak${s.sneaks === 1 ? '' : 's'}${s.jacksBeat ? `, ${s.jacksBeat} lost to other jacks` : ''}`
      : `Fights won ${s.fightsWon}, lost ${s.fightsLost}; beside the female ${((s.near / Math.max(1, w.stageTime)) * 100).toFixed(0)}% of the time`;
  return { eggs, young: eggs, relativeFitness: eggs / meanEggs(w), detail };
}

function spawnRival(w: World, towards: Entity | undefined, size: number): void {
  const fromLeft = w.rng.chance(0.5);
  const pos = v3(fromLeft ? 1 : 39, -1.4, w.rng.range(-4, 3));
  w.spawn('rival', pos, { radius: 0.6, state: 'approach', value: size, home: towards ? { ...towards.pos } : v3(20, -1.5, 0) });
  w.emit('warning', 'rival');
}

const rivalSize = (w: World): number => Math.max(0.5, w.p.get('spawn.rivalSizeMean') + w.rng.normal(0, w.p.get('spawn.rivalSizeSd')));

/** Rivals approach the target; a rival that sits there long enough takes over. */
function stepRivals(w: World, dt: number, target: Entity | undefined, onTakeover: (r: Entity) => void): void {
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

/** Female role: charging drives a rival female off. */
function femaleCharges(w: World, intent: { burst: boolean; actionPressed: boolean }): void {
  for (const r of w.live('rival')) {
    if (r.state === 'approach' && dist(r.pos, w.body.pos) < w.p.get('spawn.chargeRadius') && (intent.burst || intent.actionPressed)) {
      r.state = 'flee';
      r.timer = 4;
      w.emitOnce('caption', 'spawn.chargeWorked');
    }
  }
}

/** Large male: ramming a rival starts a quick fight, settled mostly by size. */
function maleFights(w: World, intent: { burst: boolean; actionPressed: boolean }, dt: number, female: Entity | undefined): void {
  const p = w.p;
  const s = st(w);
  s.stunned = Math.max(0, s.stunned - dt);
  if (s.stunned > 0 || !(intent.burst || intent.actionPressed)) return;
  const fish = w.body.pos;
  for (const r of w.live('rival')) {
    if (r.state !== 'approach' || dist(r.pos, fish) > p.get('spawn.chargeRadius')) continue;
    // Side-on: the player's line of attack is across the rival's heading.
    const heading = norm(v3(r.vel.x, 0, r.vel.z));
    const attack = norm(v3(r.pos.x - fish.x, 0, r.pos.z - fish.z));
    const sideOn = heading.x || heading.z ? 1 - Math.abs(heading.x * attack.x + heading.z * attack.z) : 0.5;
    const early = female ? Math.min(1, Math.max(0, (dist(r.pos, female.pos) - 2) / 6)) : 0.5;
    const chance = fightWinChance(p, w.progress.adultSize ?? 1, r.value ?? 1, sideOn, early);
    if (w.rng.chance(chance)) {
      s.fightsWon += 1;
      r.state = 'flee';
      r.timer = 4;
      w.emit('caption', sideOn > 0.6 ? 'spawn.fightWonSide' : 'spawn.fightWon');
    } else {
      s.fightsLost += 1;
      s.stunned = p.get('spawn.fightStun');
      w.body.vel = scale(norm(sub(fish, r.pos)), 7);
      w.emit('caption', 'spawn.fightLost');
    }
    return;
  }
}

/** Bears: a warning shadow over a chosen fish, then a swipe. */
function stepBears(w: World, dt: number, playerHidden: boolean): void {
  const p = w.p;
  const s = st(w);
  s.bearTimer -= dt;
  const role = s.role;
  if (s.bearTimer <= 0 && w.live('bear').length === 0) {
    s.bearTimer = p.get('spawn.bearInterval') * w.rng.range(0.7, 1.3);
    const playerKind = role === 'largeMale' ? 'male' : role === 'female' ? 'female' : 'jack';
    const candidates: { pos: Vec3; weight: number; entity: Entity | null }[] = [];
    if (!playerHidden) candidates.push({ pos: w.body.pos, weight: bearWeight(p, playerKind), entity: null });
    for (const e of w.entities) {
      if (!e.alive) continue;
      if ((e.kind === 'rival' && role !== 'female') || e.kind === 'guardMale') candidates.push({ pos: e.pos, weight: bearWeight(p, 'male'), entity: e });
      else if (e.kind === 'rival') candidates.push({ pos: e.pos, weight: bearWeight(p, 'female'), entity: e });
      else if (e.kind === 'jackAI' && e.state !== 'hidden') candidates.push({ pos: e.pos, weight: bearWeight(p, 'jack'), entity: e });
    }
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    if (total <= 0) return;
    let pick = w.rng.range(0, total);
    const chosen = candidates.find((c) => (pick -= c.weight) <= 0) ?? candidates[0];
    if (!chosen) return;
    const side = chosen.pos.z > 0 ? 1 : -1;
    const warn = p.get('spawn.bearWarning');
    w.spawn('bear', v3(chosen.pos.x, 0.8, side * 8.6), { radius: 1.2, state: 'warn', timer: warn, home: v3(chosen.pos.x, 0, chosen.pos.z), value: chosen.entity?.id ?? 0 });
    w.emit('warning', 'bear');
    w.emitOnce('caption', 'spawn.bear');
  }
  for (const bear of w.live('bear')) {
    bear.timer -= dt;
    if (bear.state === 'warn' && bear.timer <= 0) {
      bear.state = 'strike';
      bear.timer = 0.6;
      const at = bear.home ?? v3();
      const radius = p.get('spawn.bearRadius');
      for (const e of w.entities) {
        if (e.alive && (e.kind === 'rival' || e.kind === 'guardMale' || e.kind === 'jackAI') && distXZ(e.pos, at) < radius && e.state !== 'hidden') {
          e.alive = false;
          if (e.kind === 'guardMale') w.emit('caption', 'spawn.bearTookGuard');
        }
      }
      if (!playerHidden && distXZ(w.body.pos, at) < radius) {
        w.die('bear');
        return;
      }
    } else if (bear.state === 'strike' && bear.timer <= 0) {
      bear.alive = false;
    }
  }
}

/** Jack role: hiding spots under the bank, contested by other jacks. */
function stepCover(w: World, intent: { burst: boolean; actionPressed: boolean }, dt: number): boolean {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  // The player claims a free spot by settling into it.
  const mine = s.owners.indexOf(0);
  if (mine < 0) {
    const i = s.spots.findIndex((sp) => distXZ(sp, fish) < 1.3);
    if (i >= 0) {
      if (s.owners[i] === -1) s.owners[i] = 0;
      else if (intent.burst || intent.actionPressed) {
        // Charge the jack out of its spot.
        const holder = w.entities.find((e) => e.id === s.owners[i]);
        if (holder && w.rng.chance(p.get('spawn.jackSpotWin'))) {
          holder.state = 'seek';
          s.owners[i] = 0;
          w.emit('caption', 'spawn.jackSpotWon');
        }
      } else w.emitOnce('caption', 'spawn.jackSpotTaken');
    }
  } else {
    const spot = s.spots[mine];
    if (spot && distXZ(spot, fish) > 1.8) s.owners[mine] = -1;
  }
  // AI jacks look for a spot; with too few spots, they contest the player's.
  for (const j of w.live('jackAI')) {
    const held = s.owners.indexOf(j.id);
    if (held >= 0) {
      const spot = s.spots[held];
      if (spot && j.state !== 'dart') {
        j.state = 'hidden';
        j.vel = scale(sub(spot, j.pos), 2);
      }
    } else if (j.state !== 'dart') {
      j.state = 'seek';
      const free = s.owners.indexOf(-1);
      const goalIdx = free >= 0 ? free : s.owners.indexOf(0);
      const goal = goalIdx >= 0 ? s.spots[goalIdx] : undefined;
      if (goal) {
        j.vel = scale(norm(sub(goal, j.pos)), 2.4);
        if (distXZ(goal, j.pos) < 1.2) {
          if (free >= 0) s.owners[free] = j.id;
          else {
            s.contest += dt;
            if (s.contest > p.get('spawn.jackContestTime')) {
              s.owners[goalIdx] = j.id;
              s.contest = 0;
              w.body.vel = v3(0, 0, -5);
              w.emit('caption', 'spawn.jackEvicted');
            }
          }
        }
      }
    }
    j.pos.x += j.vel.x * dt;
    j.pos.z = Math.max(-7.5, Math.min(7.8, j.pos.z + j.vel.z * dt));
    if (j.vel.x || j.vel.z) j.yaw = Math.atan2(j.vel.z, j.vel.x);
  }
  return s.owners.includes(0);
}

export const spawnStage: StageDef = {
  id: 'spawn',
  arena: () => ({
    kind: 'spawnBed',
    min: v3(0, -4, -8),
    max: v3(40, 0, 8),
    surfaceY: 0,
    water: 'fresh',
    floor: (x, z) => -2.3 + 0.25 * Math.sin(x * 0.4) * Math.cos(z * 0.5) + 0.7 * Math.max(0, (Math.abs(z) - 5) / 3),
    current: () => v3(-0.8, 0, 0),
  }),
  init(w) {
    const p = w.p;
    const role = roleOf(w);
    const nSpots = p.get('spawn.coverSpots');
    const spots: Vec3[] = [];
    for (let i = 0; i < nSpots; i++) spots.push(v3(16 + (14 * (i + 0.5)) / nSpots, -1.5, SPOT_Z));
    const s: SpawnState = {
      role,
      dig: 0,
      quality: 0,
      steals: 0,
      spawned: false,
      spawnedAt: -1,
      rivalTimer: p.get('spawn.rivalInterval'),
      near: 0,
      stolen: 0,
      windowUntil: -1,
      sneaks: 0,
      share: 0,
      stunned: 0,
      fightsWon: 0,
      fightsLost: 0,
      bearTimer: p.get('spawn.bearInterval') * 0.8,
      spots,
      owners: spots.map(() => -1),
      contest: 0,
      jacksBeat: 0,
    };
    w.stage = s as unknown as Record<string, unknown>;
    w.body.scale = w.progress.adultSize ?? 1;
    w.spawn('cover', v3(23, -0.4, 6.8), { radius: 2, size: v3(18, 0.8, 2.6) });
    // Advisor: gravel quality is mostly cobble size. Too large is hard to dig;
    // too small and the eggs get less oxygen. Medium cobble is best.
    const ideal = 0.2;
    for (let i = 0; i < 6; i++) {
      const cobble = w.rng.range(0.07, 0.42);
      const quality = Math.max(0.25, 1 - Math.abs(cobble - ideal) / 0.22);
      w.spawn('gravelPatch', v3(w.rng.range(8, 34), -2.2, w.rng.range(-4.5, 3.5)), { radius: 2.2, value: quality, size: v3(cobble, 0, 0) });
    }
    if (role === 'female') {
      w.body.pos = v3(4, -1.5, 0);
    } else if (role === 'largeMale') {
      w.body.pos = v3(5, -1.5, 0);
      const patch = w.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      const at = patch ? v3(patch.pos.x, -1.7, patch.pos.z) : v3(22, -1.7, 0);
      w.spawn('female', at, { radius: 0.6, state: 'dig' });
    } else {
      w.body.pos = v3(10, -1.4, 6.4);
      w.spawn('female', v3(24, -1.7, -1), { radius: 0.6, state: 'dig' });
      w.spawn('guardMale', v3(26, -1.6, -1), { radius: 0.8, state: 'guard', value: 1 });
      s.rivalTimer = p.get('spawn.jackFightInterval') * 0.6;
      const n = p.get('spawn.rivalJacks');
      for (let i = 0; i < n; i++) w.spawn('jackAI', v3(32 + i * 3, -1.5, 6), { radius: 0.4, state: 'seek' });
      if (n >= nSpots) w.emit('caption', 'spawn.jackScarce');
    }
    w.emit('caption', `spawn.${role}`);
  },
  step(w, intent, dt) {
    swimStep(w, intent, dt);
    const p = w.p;
    const s = st(w);
    const fish = w.body.pos;
    const t = w.stageTime;
    const duration = p.get('spawn.duration');

    if (s.role === 'female') {
      if (intent.action && speedOf(w) < 2.2 && !s.spawned) {
        const patch = w.live('gravelPatch').find((g) => distXZ(g.pos, fish) < g.radius);
        if (patch) {
          let redd = reddOf(w);
          if (!redd) {
            redd = w.spawn('redd', v3(fish.x, -2.2, fish.z), { radius: 1.2, value: 0 });
            s.quality = patch.value ?? 0.5;
            w.emitOnce('caption', 'spawn.digging');
            const cobble = patch.size?.x ?? 0.2;
            if (cobble > 0.3) w.emitOnce('caption', 'spawn.cobbleLarge');
            else if (cobble < 0.11) w.emitOnce('caption', 'spawn.cobbleSmall');
          }
          if (distXZ(redd.pos, fish) < 2.5) {
            s.dig = Math.min(1, s.dig + dt / p.get('spawn.digTime'));
            redd.value = s.dig;
          }
        } else {
          w.emitOnce('caption', 'spawn.needGravel');
        }
      }
      if (!s.spawned && s.dig >= 1) {
        s.spawned = true;
        s.spawnedAt = t;
        const redd = reddOf(w);
        if (redd) w.spawn('guardMale', v3(redd.pos.x + 1.5, -1.6, redd.pos.z + 0.5), { radius: 0.8, state: 'guard', value: 1 });
        w.emit('spawned', 'spawn.femaleSpawned');
      }
      const redd = reddOf(w);
      if (redd) {
        s.rivalTimer -= dt;
        if (s.rivalTimer <= 0) {
          spawnRival(w, redd, 0.7);
          w.emitOnce('caption', 'spawn.rivalFemale');
          s.rivalTimer = p.get('spawn.rivalInterval') * w.rng.range(0.8, 1.2);
        }
      }
      femaleCharges(w, intent);
      stepRivals(w, dt, redd, () => {
        s.steals += 1;
        if (!s.spawned) s.quality *= 0.75;
        w.emit('caption', 'spawn.reddDisturbed');
      });
      stepBears(w, dt, false);
      if (w.status !== 'playing') return;
      if (t >= duration) {
        if (s.spawned) w.finishLife(result(w));
        else w.die('noSpawn');
      }
      return;
    }

    const female = femaleOf(w);
    if (s.role === 'largeMale') {
      if (female && dist(female.pos, fish) < 4) s.near += dt;
      s.rivalTimer -= dt;
      if (s.rivalTimer <= 0 && !s.spawned) {
        spawnRival(w, female, rivalSize(w));
        w.emitOnce('caption', 'spawn.rivalMale');
        s.rivalTimer = p.get('spawn.rivalInterval') * w.rng.range(0.8, 1.2);
      }
      maleFights(w, intent, dt, female);
      stepRivals(w, dt, female, () => {
        if (female && dist(female.pos, fish) > 3) {
          s.stolen = Math.min(0.6, s.stolen + 0.15);
          w.emit('caption', 'spawn.maleLost');
        }
      });
      stepBears(w, dt, false);
      if (w.status !== 'playing') return;
      const spawnTime = duration * 0.6;
      if (!s.spawned && t >= spawnTime) {
        const presence = s.near / Math.max(1, t);
        if (presence < 0.3) {
          w.die('noSpawn');
          return;
        }
        s.spawned = true;
        s.spawnedAt = t;
        const jf = yearJackFraction(p, w.fish.habitat, w.conditions);
        s.share = p.get('spawn.largeMaleShare') * (0.4 + 0.6 * presence) * (1 - s.stolen) * (1 - 0.5 * jf);
        w.emit('spawned', 'spawn.maleSpawned');
      }
      if (s.spawned && t >= s.spawnedAt + 4) w.finishLife(result(w));
      return;
    }

    // Jack.
    const hidden = stepCover(w, intent, dt);
    const guard = w.live('guardMale')[0];
    const windowOpen = t < s.windowUntil;
    if (guard && female) {
      if (guard.state === 'guard') {
        const a = t * 0.9;
        const goal = v3(female.pos.x + Math.cos(a) * 2.5, -1.6, female.pos.z + Math.sin(a) * 2.5);
        guard.vel = scale(norm(sub(goal, guard.pos)), 3);
        if (!windowOpen && !hidden && dist(fish, female.pos) < 6) {
          guard.state = 'chase';
          guard.timer = 2.5;
        }
      } else if (guard.state === 'chase') {
        guard.timer -= dt;
        guard.vel = scale(norm(sub(fish, guard.pos)), 6.5);
        if (dist(guard.pos, fish) < 1.4) {
          const away = norm(v3(fish.x - guard.pos.x, 0, 1.5));
          w.body.vel = scale(away, 8);
          w.emitOnce('caption', 'spawn.jackChased');
          guard.state = 'guard';
        }
        if (guard.timer <= 0 || hidden || windowOpen) guard.state = 'guard';
      } else if (guard.state === 'fight') {
        guard.vel = v3(Math.cos(t * 8) * 2, 0, Math.sin(t * 6) * 2);
        if (!windowOpen) guard.state = 'guard';
      }
      guard.pos.x += guard.vel.x * dt;
      guard.pos.z += guard.vel.z * dt;
      if (guard.vel.x || guard.vel.z) guard.yaw = Math.atan2(guard.vel.z, guard.vel.x);
    }

    // Rival big males arrive and fight the guard: that is the jacks' opening.
    s.rivalTimer -= dt;
    if (s.rivalTimer <= 0 && female) {
      spawnRival(w, female, rivalSize(w));
      s.rivalTimer = p.get('spawn.jackFightInterval') * w.rng.range(0.8, 1.2);
    }
    for (const r of w.live('rival')) {
      if (r.state === 'approach' && female && dist(r.pos, female.pos) < 5) {
        r.state = 'fight';
        if (guard) {
          guard.state = 'fight';
          guard.pos = v3(female.pos.x + 3.5, -1.6, female.pos.z - 2);
        }
        r.pos = v3(female.pos.x + 4.5, -1.6, female.pos.z - 2.6);
        s.windowUntil = t + p.get('spawn.jackWindow');
        w.emit('warning', 'opening');
        w.emitOnce('caption', 'spawn.jackWindow');
        // Other jacks dart in too.
        for (const j of w.live('jackAI')) {
          if (j.state === 'hidden' && w.rng.chance(0.6)) {
            j.state = 'dart';
            j.timer = 0;
          }
        }
      }
      if (r.state === 'fight' && t >= s.windowUntil) {
        r.state = 'flee';
        r.timer = 4;
      }
    }
    // A darting AI jack that reaches the female first takes the opening.
    for (const j of w.live('jackAI')) {
      if (j.state !== 'dart' || !female) continue;
      j.vel = scale(norm(sub(female.pos, j.pos)), p.get('spawn.jackAISpeed'));
      if (t < s.windowUntil && dist(j.pos, female.pos) < 1.2) {
        s.windowUntil = t;
        s.jacksBeat += 1;
        w.emit('caption', 'spawn.jackBeaten');
      }
      if (t >= s.windowUntil) j.state = 'seek';
    }
    stepRivals(w, dt, female, () => undefined);
    stepBears(w, dt, hidden);
    if (w.status !== 'playing') return;
    if (t < s.windowUntil && female && intent.actionPressed && dist(fish, female.pos) < 2.4) {
      s.sneaks += 1;
      const jf = yearJackFraction(p, w.fish.habitat, w.conditions);
      s.share = Math.min(0.6, s.share + p.get('spawn.jackShareBase') / (1 + 3 * jf));
      s.windowUntil = t;
      w.emit('spawned', 'spawn.jackSuccess');
      if (!s.spawned) {
        s.spawned = true;
        s.spawnedAt = t;
      }
    }
    if (t >= duration) {
      if (s.sneaks > 0) w.finishLife(result(w));
      else w.die('noSpawn');
    }
  },
  debugComplete(w) {
    const s = st(w);
    s.spawned = true;
    if (s.role === 'female') {
      s.dig = 1;
      s.quality = 0.8;
    } else if (s.role === 'jack') {
      s.sneaks = 1;
      s.share = 0.2;
    } else {
      s.share = 0.6;
      s.near = w.stageTime;
    }
    w.finishLife(result(w));
  },
};

export const spawnState = (w: World): Readonly<SpawnState> | null => (w.stageId === 'spawn' ? st(w) : null);
