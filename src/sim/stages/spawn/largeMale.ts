/**
 * Spawning grounds, large male role: stay beside the female and fight rivals,
 * then stay with her or leave for a second female.
 */
import type { Params } from '../../params';
import type { Entity, Intent, Vec3 } from '../../types';
import { dist, distXZ, norm, scale, sub, v3 } from '../../vec';
import type { World } from '../../world';
import { stepBears } from './bears';
import { largeMaleSneakLoss } from './jack';
import { endLife, result, seasonOver } from './result';
import { byId, clamp01, NEAR, rivalSize, sigmoid, st, stepRivals } from './shared';
import { crowdRel, rivalFromCrowd } from './crowd';

/**
 * Chance a large male wins a fight. Size dominates; ramming side-on and
 * meeting the rival before he reaches the female both help.
 */
export function fightWinChance(p: Params, playerSize: number, rivalSize: number, sideOn: number, early: number): number {
  return sigmoid(
    p.get('spawn.fightBase') +
      p.get('spawn.fightSizeWeight') * (playerSize - rivalSize) +
      p.get('spawn.fightAngleWeight') * (sideOn - 0.5) * 2 +
      p.get('spawn.fightTimingWeight') * (early - 0.5) * 2,
  );
}

/** Large male: ramming a rival starts a quick fight, settled mostly by size. */
export function maleFights(w: World, intent: Intent, dt: number, female: Entity | undefined): void {
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

/** An AI female digs her redd beside her; returns true once it is finished. */
export function aiFemaleDigs(w: World, female: Entity, digTime: number, dt: number): boolean {
  female.timer += dt;
  const redd = w.live('redd').find((r) => distXZ(r.pos, female.pos) < 1.5);
  if (redd) redd.value = clamp01(female.timer / digTime);
  return female.timer >= digTime;
}

export function addFemale(w: World, at: Vec3): Entity {
  const f = w.spawn('female', at, { radius: 0.6, state: 'dig' });
  w.spawn('redd', v3(at.x, -2.2, at.z), { radius: 1.2, value: 0, state: 'dug' });
  return f;
}

export function stepLargeMale(w: World, intent: Intent, dt: number, spent: boolean): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  const t = w.stageTime;
  const first = byId(w, s.mateId);
  const second = s.secondId ? byId(w, s.secondId) : undefined;
  const courting = s.phase === 'seeking' ? second : s.phase === 'first' ? first : undefined;

  if (first && dist(first.pos, fish) < NEAR && s.phase === 'first') s.near += dt;
  if (second && dist(second.pos, fish) < NEAR && s.phase === 'seeking') s.near2 += dt;

  // Rivals come for whichever female he is courting.
  s.rivalTimer -= dt;
  if (s.rivalTimer <= 0 && courting) {
    // An unpaired male out of the crowd; more of them, and more often, on crowded grounds.
    rivalFromCrowd(w, courting, 'M', rivalSize(w));
    w.emitOnce('caption', 'spawn.rivalMale');
    s.rivalTimer = (p.get('spawn.rivalInterval') * w.rng.range(0.8, 1.2)) / crowdRel(w);
  }
  maleFights(w, intent, dt, courting);
  stepRivals(w, dt, courting, () => {
    if (courting && dist(courting.pos, fish) > 3) {
      s.stolen = Math.min(p.get('spawn.stolenMax'), s.stolen + p.get('spawn.stolenPerTakeover'));
      w.emit('caption', 'spawn.maleLost');
    }
  });
  stepBears(w, dt, false, s.phase === 'seeking' ? p.get('spawn.seekBearRate') : 1);
  if (w.status !== 'playing') return;

  const shareFor = (presence: number) =>
    p.get('spawn.largeMaleShare') * (0.4 + 0.6 * clamp01(presence)) * (1 - s.stolen) * largeMaleSneakLoss(p, s.jackFraction);

  if (s.phase === 'first' && first) {
    if (aiFemaleDigs(w, first, p.get('spawn.aiDigTime'), dt)) {
      const presence = s.near / Math.max(1, t);
      if (presence < p.get('spawn.minPresence')) {
        w.die('noSpawn');
        return;
      }
      if (dist(first.pos, fish) < NEAR) {
        s.spawned = true;
        s.spawnedAt = t;
        s.firstShare = shareFor(presence);
        s.phase = 'decide';
        s.secondAt = t + p.get('spawn.secondFemaleDelay');
        first.state = 'guard';
        const redd = w.live('redd').find((r) => distXZ(r.pos, first.pos) < 1.5);
        if (redd) redd.state = 'buried';
        w.emit('spawned', 'spawn.maleSpawned');
      } else {
        s.wait += dt;
        w.emitOnce('caption', 'spawn.femaleReady');
        if (s.wait > p.get('spawn.femaleWaitTime')) {
          w.emit('caption', 'spawn.maleLost');
          w.die('noSpawn');
          return;
        }
      }
    }
  } else if (s.phase === 'decide') {
    if (t >= s.secondAt && !s.secondId) {
      // A second female arrives along the shallow edge, away from the first.
      const fx = first?.pos.x ?? 20;
      const x = fx >= 20 ? fx - p.get('spawn.secondFemaleGap') : fx + p.get('spawn.secondFemaleGap');
      const z = w.fish.habitat === 'beach' ? 3.5 : 4.6;
      s.secondId = addFemale(w, v3(Math.max(4, Math.min(36, x)), -1.7, z)).id;
      w.emit('caption', 'spawn.secondFemale');
    }
    if (s.secondId) {
      if (first && dist(first.pos, fish) < NEAR) s.stayed += dt;
      const sec = byId(w, s.secondId);
      // Leaving: he has swum over to the second female.
      if (first && sec && dist(sec.pos, fish) < p.get('spawn.leaveRadius') && dist(sec.pos, fish) < dist(first.pos, fish)) {
        s.phase = 'seeking';
        s.vigour = Math.max(0, s.vigour - p.get('spawn.seekVigourCost'));
        s.stolen = 0;
        s.wait = 0;
        s.rivalTimer = p.get('spawn.rivalInterval') * 0.5;
        w.emit('caption', 'spawn.maleLeaves');
      } else if (s.stayed >= p.get('spawn.stayTime')) {
        s.phase = 'done';
        w.emit('caption', 'spawn.maleStays');
        w.finishLife(result(w));
        return;
      }
    }
  } else if (s.phase === 'seeking' && second) {
    if (aiFemaleDigs(w, second, p.get('spawn.secondDigTime'), dt)) {
      if (dist(second.pos, fish) < NEAR) {
        const presence = s.near2 / Math.max(1, p.get('spawn.secondDigTime'));
        s.secondShare = shareFor(presence);
        s.phase = 'done';
        second.state = 'guard';
        const redd = w.live('redd').find((r) => distXZ(r.pos, second.pos) < 1.5);
        if (redd) redd.state = 'buried';
        w.emit('spawned', 'spawn.maleSpawnedAgain');
        s.spawnedAt = t;
      } else {
        s.wait += dt;
        if (s.wait > p.get('spawn.femaleWaitTime')) {
          s.phase = 'done';
          w.emit('caption', 'spawn.secondLost');
          s.spawnedAt = t;
        }
      }
    }
  }
  if (s.phase === 'done' && t >= s.spawnedAt + p.get('spawn.afterSpawnTime')) {
    w.finishLife(result(w));
    return;
  }
  if (seasonOver(w, spent)) endLife(w, 'spawn.spentMale');
}
