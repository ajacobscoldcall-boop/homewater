/**
 * Spawning grounds, female role: judge the gravel, dig the redd, wait over it
 * for the male that wins, cover the eggs and guard the redd.
 */
import type { Params } from '../../params';
import { speedOf } from '../../swim';
import type { Intent } from '../../types';
import { dist, distXZ, norm, scale, sub, v3 } from '../../vec';
import type { World } from '../../world';
import { stepBears } from './bears';
import { fightWinChance } from './largeMale';
import { endLife, seasonOver } from './result';
import { clamp01, reddOf, rivalSize, st, stepRivals } from './shared';
import { crowdReddNear, crowdRel, maleFromCrowd, patchContest, rivalFromCrowd } from './crowd';

/**
 * How well a female's eggs survive in the gravel, relative to a perfect,
 * fully covered, undisturbed redd: gravel quality, then burial, then each
 * time another female dug over it.
 */
export function eggSurvival(p: Params, quality: number, burial: number, superimposed: number, eaten = 0): number {
  const unburied = p.get('spawn.unburiedSurvival');
  return clamp01(quality) * (unburied + (1 - unburied) * clamp01(burial)) * Math.pow(1 - p.get('spawn.superimposeLoss'), superimposed) * (1 - clamp01(eaten));
}

/**
 * Seconds between rival females at the redd: more often on crowded grounds
 * (`crowding`, the crowd's density), late in the season, and on good gravel
 * (`contest`, from patchContest).
 */
export function rivalFemaleInterval(p: Params, crowding: number, seasonFraction: number, contest = 1): number {
  return p.get('spawn.rivalInterval') / Math.max(0.1, crowding) / (1 + p.get('spawn.lateRivalRamp') * clamp01(seasonFraction)) / Math.max(0.1, contest);
}

/** Female role: charging drives a rival female off. */
export function femaleCharges(w: World, intent: Intent): void {
  for (const r of w.live('rival')) {
    if (r.state === 'approach' && dist(r.pos, w.body.pos) < w.p.get('spawn.chargeRadius') && (intent.burst || intent.actionPressed)) {
      r.state = 'flee';
      r.timer = 4;
      w.emitOnce('caption', 'spawn.chargeWorked');
    }
  }
}

export function stepFemale(w: World, intent: Intent, dt: number, spent: boolean): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  const t = w.stageTime;
  const still = speedOf(w) < 2.2;
  let redd = reddOf(w);

  // Dig: hold E over gravel.
  if (intent.action && still && s.dig < 1) {
    const patch = w.live('gravelPatch').find((g) => distXZ(g.pos, fish) < g.radius);
    if (patch) {
      // Another female's redd is already here: on crowded gravel the space goes first.
      if (!redd && crowdReddNear(w, fish, p.get('spawn.crowd.reddSpacing'))) {
        w.emitOnce('caption', 'spawn.crowdReddTaken');
      } else if (!redd) {
        redd = w.spawn('redd', v3(fish.x, -2.2, fish.z), { radius: 1.2, value: 0, state: 'dug' });
        s.quality = patch.value ?? 0.5;
        w.emitOnce('caption', 'spawn.digging');
        if (patchContest(p, s.quality) > 1.15 && crowdRel(w) > 0.8) w.emitOnce('caption', 'spawn.patchContested');
        const cobble = patch.size?.x ?? 0.2;
        if (cobble > 0.3) w.emitOnce('caption', 'spawn.cobbleLarge');
        else if (cobble < 0.11) w.emitOnce('caption', 'spawn.cobbleSmall');
      }
      if (redd && distXZ(redd.pos, fish) < 2.5) {
        s.dig = Math.min(1, s.dig + dt / p.get('spawn.digTime'));
        redd.value = s.dig;
        if (s.dig >= 1) w.emit('caption', 'spawn.reddReady');
      }
    } else if (!redd) {
      w.emitOnce('caption', 'spawn.needGravel');
    }
  }

  // Males gather once the redd is under way; she spawns with the one that wins.
  const males = w.live('guardMale');
  if (redd && s.dig >= p.get('spawn.maleArriveDig') && !s.spawned) {
    s.maleTimer -= dt;
    // Her male was lost (to a bear): the next one takes a while to arrive.
    if (males.length === 0 && s.hadMale) s.maleTimer = p.get('spawn.maleReplaceTime');
    s.hadMale = males.length > 0;
    // The males come out of the crowd when one is free (else from along the bed).
    if (males.length === 0 && s.maleTimer <= 0) {
      const m = maleFromCrowd(w, redd.pos);
      w.spawn('guardMale', m ? v3(m.pos.x, -1.6, m.pos.z) : v3(redd.pos.x > 20 ? 2 : 38, -1.6, redd.pos.z + 1), { radius: 0.8, state: 'court', value: m?.size ?? rivalSize(w) });
      w.emitOnce('caption', 'spawn.maleArrives');
    }
    if (s.dig >= 1 && !s.contested && males.length === 1) {
      s.contested = true;
      const m = maleFromCrowd(w, redd.pos);
      w.spawn('guardMale', m ? v3(m.pos.x, -1.6, m.pos.z) : v3(redd.pos.x > 20 ? 38 : 2, -1.6, redd.pos.z - 1), { radius: 0.8, state: 'challenge', value: m?.size ?? rivalSize(w) });
    }
  }
  for (const m of w.live('guardMale')) {
    const home = redd ? v3(redd.pos.x + 1.4, -1.6, redd.pos.z + 0.6) : m.pos;
    if (m.state === 'court') {
      m.vel = dist(m.pos, home) > 0.4 ? scale(norm(sub(home, m.pos)), 3.2) : v3();
    } else if (m.state === 'challenge') {
      const holder = w.live('guardMale').find((o) => o.state === 'court');
      if (!holder) m.state = 'court';
      else if (dist(m.pos, holder.pos) > 1.6) m.vel = scale(norm(sub(holder.pos, m.pos)), 3.4);
      else {
        // Two males fight beside her redd; she spawns with whichever wins.
        m.state = 'fight';
        holder.state = 'fight';
        m.timer = holder.timer = p.get('spawn.maleFightTime');
        w.emit('caption', 'spawn.femaleChoice');
      }
    } else if (m.state === 'fight') {
      m.vel = v3(Math.sin(t * 9 + m.id) * 2, 0, Math.cos(t * 7 + m.id) * 2);
      m.timer -= dt;
      const other = w.live('guardMale').find((o) => o !== m && o.state === 'fight');
      if (!other) m.state = 'court';
      else if (m.timer <= 0 && m.id < other.id) {
        const mWins = w.rng.chance(fightWinChance(p, m.value ?? 1, other.value ?? 1, 0.5, 0.5));
        const [winner, loser] = mWins ? [m, other] : [other, m];
        winner.state = 'court';
        loser.state = 'flee';
        loser.timer = 4;
      }
    } else if (m.state === 'flee' || m.state === 'leave') {
      m.timer -= dt;
      m.vel = v3(m.state === 'leave' ? 3 : 6, 0, 0);
      if (m.timer <= 0) m.alive = false;
    }
    m.pos.x = Math.max(0.5, Math.min(39.5, m.pos.x + m.vel.x * dt));
    m.pos.z = Math.max(-7.5, Math.min(7.5, m.pos.z + m.vel.z * dt));
    if (m.vel.x || m.vel.z) m.yaw = Math.atan2(m.vel.z, m.vel.x);
  }
  if (redd && s.dig >= 1 && !s.spawned && w.live('guardMale').length === 0 && s.maleTimer <= 0) s.maleTimer = p.get('spawn.maleReplaceTime');

  // The spawning act: settled over the finished redd with a male beside her.
  if (redd && !s.spawned) {
    // While males are still contesting her, she waits for the winner.
    const contesting = w.live('guardMale').some((m) => m.state === 'challenge' || m.state === 'fight');
    const mate = contesting ? undefined : w.live('guardMale').find((m) => m.state === 'court' && distXZ(m.pos, redd!.pos) < p.get('spawn.mateRadius'));
    const over = distXZ(redd.pos, fish) < 1.5 && still;
    if (s.dig >= 1 && over && mate) s.act += dt;
    else s.act = Math.max(0, s.act - dt);
    if (s.dig >= 1 && w.live('guardMale').length === 0) w.emitOnce('caption', 'spawn.waitMale');
    if (s.act >= p.get('spawn.spawnActTime')) {
      s.spawned = true;
      s.spawnedAt = t;
      w.emit('spawned', 'spawn.femaleSpawned');
      // Her mate soon leaves to look for other females.
      if (mate) {
        mate.state = 'leave';
        mate.timer = 8;
      }
    }
  }

  // Cover the eggs: hold E over the redd to sweep gravel over them.
  if (s.spawned && redd && s.burial < 1) {
    w.emitOnce('caption', 'spawn.bury');
    if (intent.action && still && distXZ(redd.pos, fish) < 2.5) {
      s.burial = Math.min(1, s.burial + dt / p.get('spawn.buryTime'));
      if (s.burial >= 1) {
        redd.state = 'buried';
        w.emit('caption', 'spawn.buried');
      }
    }
  }

  // Rival females want the same gravel, more of them late in the season.
  if (redd) {
    s.rivalTimer -= dt;
    if (s.rivalTimer <= 0) {
      // A female from the crowd still looking for a site; good gravel draws them more often.
      rivalFromCrowd(w, redd, 'F', 0.7);
      w.emitOnce('caption', 'spawn.rivalFemale');
      s.rivalTimer = rivalFemaleInterval(p, crowdRel(w), t / p.get('spawn.duration'), patchContest(p, s.quality)) * w.rng.range(0.8, 1.2);
    }
  }
  femaleCharges(w, intent);
  stepRivals(w, dt, redd, () => {
    if (!s.spawned) {
      s.steals += 1;
      s.quality *= 1 - p.get('spawn.disturbQualityLoss');
      w.emit('caption', 'spawn.reddDisturbed');
    } else {
      s.superimposed += 1;
      w.emit('caption', 'spawn.superimposed');
    }
  });
  stepBears(w, dt, false);
  if (w.status !== 'playing') return;
  if (seasonOver(w, spent)) endLife(w, 'spawn.spentFemale');
}
