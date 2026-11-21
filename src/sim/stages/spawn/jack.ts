/**
 * Spawning grounds, jack role: hold a hiding spot under the bank and dart in
 * when the big males clash. Jack success is frequency-dependent.
 */
import type { Params } from '../../params';
import type { Intent } from '../../types';
import { dist, distXZ, norm, scale, sub, v3 } from '../../vec';
import type { World } from '../../world';
import { stepBears } from './bears';
import { endLife, seasonOver } from './result';
import { rivalSize, st, stepRivals } from './shared';
import { crowdOf, crowdOpening, crowdRel, rivalFromCrowd } from './crowd';

/**
 * Frequency-dependent jack success: how much one sneak is worth, relative to
 * a year when jacks are at the reference share of males. 1 at the reference,
 * above it when jacks are rare, below it when they are common.
 */
export function jackFrequencyFactor(p: Params, jackFraction: number): number {
  const k = p.get('spawn.jackFreqStrength');
  return (1 + k * p.get('spawn.jackFreqRef')) / (1 + k * Math.max(0, jackFraction));
}

/** Share of a female's eggs one successful sneak fertilizes. */
export function jackSneakShare(p: Params, jackFraction: number): number {
  return p.get('spawn.jackShareBase') * jackFrequencyFactor(p, jackFraction);
}

/** Other jacks on the grounds: more when jacks are common, so openings are contested more. */
export function rivalJackCount(p: Params, jackFraction: number): number {
  const n = Math.round((p.get('spawn.rivalJacks') * Math.max(0, jackFraction)) / p.get('spawn.jackFreqRef'));
  return Math.max(1, Math.min(p.get('spawn.rivalJacksMax'), n));
}

/** Fraction of a large male's share left after sneakers take theirs. */
export function largeMaleSneakLoss(p: Params, jackFraction: number): number {
  return 1 - p.get('spawn.sneakLossWeight') * jackFraction;
}

/** Jack role: hiding spots under the bank, contested by other jacks. */
export function stepCover(w: World, intent: Intent, dt: number): boolean {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  s.chargeWait = Math.max(0, (s.chargeWait ?? 0) - dt);
  const latch = s.chargeLatch;
  s.chargeLatch = intent.burst;
  // The player claims a free spot by settling into it.
  const mine = s.owners.indexOf(0);
  if (mine < 0) {
    const i = s.spots.findIndex((sp) => distXZ(sp, fish) < 1.3);
    if (i >= 0) {
      const owner = s.owners[i];
      // A spot whose jack is gone is free.
      if (owner !== undefined && owner > 0 && !w.entities.some((e) => e.id === owner && e.alive)) s.owners[i] = -1;
      if (s.owners[i] === -1) s.owners[i] = 0;
      else if ((intent.burst && !latch) || intent.actionPressed) {
        // Charge the jack out of its spot: one roll per fresh press, and a pause to recover after a failed charge.
        if ((s.chargeWait ?? 0) <= 0) {
          const holder = w.entities.find((e) => e.id === s.owners[i]);
          if (holder && w.rng.chance(p.get('spawn.jackSpotWin'))) {
            holder.state = 'seek';
            s.owners[i] = 0;
            w.emit('caption', 'spawn.jackSpotWon');
          } else s.chargeWait = p.get('spawn.jackSpotRetry');
        }
      } else if (!intent.burst) w.emitOnce('caption', 'spawn.jackSpotTaken');
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

export function stepJack(w: World, intent: Intent, dt: number, spent: boolean): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  const t = w.stageTime;
  const female = w.live('female')[0];
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
    rivalFromCrowd(w, female, 'M', rivalSize(w));
    // Crowded grounds mean more big males, more fights, more openings for jacks.
    s.rivalTimer = (p.get('spawn.jackFightInterval') * w.rng.range(0.8, 1.2)) / crowdRel(w);
  }
  for (const r of w.live('rival')) {
    if (r.state === 'approach' && female && dist(r.pos, female.pos) < 5) {
      r.state = 'fight';
      // The opening is at the player's own female now, not at a crowd pair.
      const c = crowdOf(w);
      if (c) c.openId = 0;
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
        if (j.state === 'hidden' && w.rng.chance(p.get('spawn.jackDartChance'))) {
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
  // The opening is beside the female the males fight over: the player's own, or a crowd pair's nearby.
  const target = crowdOpening(w) ?? female;
  if (t < s.windowUntil && target && intent.actionPressed && dist(fish, target.pos) < 2.4) {
    s.sneaks += 1;
    s.share = Math.min(p.get('spawn.jackShareMax'), s.share + jackSneakShare(p, s.jackFraction));
    s.windowUntil = t;
    w.emit('spawned', 'spawn.jackSuccess');
    if (s.jackFraction > p.get('spawn.jackFreqRef') * 1.2) w.emitOnce('caption', 'spawn.jackCommon');
    else if (s.jackFraction < p.get('spawn.jackFreqRef') * 0.8) w.emitOnce('caption', 'spawn.jackRare');
    if (!s.spawned) {
      s.spawned = true;
      s.spawnedAt = t;
    }
  }
  if (seasonOver(w, spent)) endLife(w, 'spawn.spentJack');
}
