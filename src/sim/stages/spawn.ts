/**
 * Stage 6: spawning and death on the spawning grounds.
 * - Female: judge the gravel by cobble size, dig the redd (hold E), wait over
 *   the finished redd for a male (she spawns with whichever male wins the
 *   fights beside her), cover the eggs (hold E), then guard the redd against
 *   other females until her strength runs out.
 * - Large male: stay beside the female and fight rivals. Advisor: males ram at
 *   right angles with mouths open, fights are quick and mostly settled by size,
 *   and what skill decides is timing and positioning. After spawning he may
 *   leave for a second female, at a cost in strength and bear risk.
 * - Jack: claim a hiding spot under the bank (other jacks fight for them when
 *   cover is scarce); when the big males clash, dart in (E). A sneak is worth
 *   less the more jacks there are on the grounds.
 * - Bears work the shallows. Advisor: they take males first, then large
 *   females, and jacks last. A bear patrols the bank between strikes, stalks
 *   along it to its chosen fish, then gives the same warning as before. A fish
 *   it catches is eaten on the bank, only partly in a big run (see
 *   bearFeeding.ts), and the remains are left for scavengers.
 * - Senescence: strength drains on the grounds and does not come back. It is
 *   the stage's natural end.
 */
import { bearEatTime, bearPlentyRate, bearShareEaten, bearTargetWeight, type BearPreyKind } from '../bearFeeding';
import { yearJackFraction } from '../genetics';
import type { Params } from '../params';
import { speedOf, swimStep } from '../swim';
import type { Entity, Intent, SpawnResult, Vec3 } from '../types';
import { dist, distXZ, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

export type SpawnRole = 'female' | 'largeMale' | 'jack';

/** Large male: with the first female, deciding after spawning, gone to a second female, or finished. */
export type MalePhase = 'first' | 'decide' | 'seeking' | 'done';

const SPOT_Z = 6.6;
/** "Beside the female", in world units. */
const NEAR = 4;

interface SpawnState {
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

const st = (w: World) => w.stage as unknown as SpawnState;

export const roleOf = (w: World): SpawnRole => (w.fish.sex === 'F' ? 'female' : w.progress.isJack ? 'jack' : 'largeMale');

const reddOf = (w: World): Entity | undefined => w.live('redd')[0];
const byId = (w: World, id: number): Entity | undefined => w.entities.find((e) => e.id === id && e.alive);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

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

/** Bear preference by kind of fish: males, then large females, jacks last. */
export function bearWeight(p: Params, kind: 'male' | 'female' | 'jack'): number {
  return p.get(kind === 'male' ? 'spawn.bearPrefMale' : kind === 'female' ? 'spawn.bearPrefFemale' : 'spawn.bearPrefJack');
}

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

/**
 * How well a female's eggs survive in the gravel, relative to a perfect,
 * fully covered, undisturbed redd: gravel quality, then burial, then each
 * time another female dug over it.
 */
export function eggSurvival(p: Params, quality: number, burial: number, superimposed: number): number {
  const unburied = p.get('spawn.unburiedSurvival');
  return clamp01(quality) * (unburied + (1 - unburied) * clamp01(burial)) * Math.pow(1 - p.get('spawn.superimposeLoss'), superimposed);
}

/** Strength lost per second on the grounds; bursting costs extra. It never comes back. */
export function senescenceRate(p: Params, bursting: boolean): number {
  return p.get('spawn.senescenceRate') + (bursting ? p.get('spawn.senescenceBurstCost') : 0);
}

/** Seconds between rival females at the redd: more often in big runs and late in the season. */
export function rivalFemaleInterval(p: Params, runSize: number, seasonFraction: number): number {
  return p.get('spawn.rivalInterval') / Math.max(0.1, runSize) / (1 + p.get('spawn.lateRivalRamp') * clamp01(seasonFraction));
}

function meanEggs(w: World): number {
  return w.p.get('spawn.eggCountBase') * w.p.get('spawn.meanEggShare');
}

function result(w: World): SpawnResult {
  const p = w.p;
  const s = st(w);
  const base = p.get('spawn.eggCountBase');
  if (s.role === 'female') {
    const t = Math.max(-1, Math.min(1, w.fish.z.eggTradeoff / 2)) * p.get('spawn.eggTradeoffStrength');
    const eggs = Math.round(base * (1 - t));
    const survival = eggSurvival(p, s.quality, s.burial, s.superimposed);
    const young = eggs * (1 + t) * survival;
    const dug = s.superimposed + s.steals;
    return {
      eggs,
      young,
      relativeFitness: young / meanEggs(w),
      detail: `Redd quality ${(s.quality * 100).toFixed(0)}%, eggs covered ${(s.burial * 100).toFixed(0)}%, ${dug === 0 ? 'never dug into' : `dug into ${dug === 1 ? 'once' : `${dug} times`}`}`,
    };
  }
  const share = s.role === 'largeMale' ? s.firstShare + s.secondShare : s.share;
  const eggs = Math.round(meanEggs(w) * share);
  const detail =
    s.role === 'jack'
      ? `${s.sneaks} successful sneak${s.sneaks === 1 ? '' : 's'}${s.jacksBeat ? `, ${s.jacksBeat} lost to other jacks` : ''}; jacks ${(s.jackFraction * 100).toFixed(1)}% of males`
      : `Fights won ${s.fightsWon}, lost ${s.fightsLost}; spawned with ${s.secondShare > 0 ? 'two females' : 'one female'}`;
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
function femaleCharges(w: World, intent: Intent): void {
  for (const r of w.live('rival')) {
    if (r.state === 'approach' && dist(r.pos, w.body.pos) < w.p.get('spawn.chargeRadius') && (intent.burst || intent.actionPressed)) {
      r.state = 'flee';
      r.timer = 4;
      w.emitOnce('caption', 'spawn.chargeWorked');
    }
  }
}

/** Large male: ramming a rival starts a quick fight, settled mostly by size. */
function maleFights(w: World, intent: Intent, dt: number, female: Entity | undefined): void {
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

const BANK_Z = 8.6;
/** Beyond the bank top, where a bear crossing to the other bank is out of sight. */
const BEHIND_BANK_Z = 12;
const MAX_CARCASSES = 6;

/** The bear on the bank: there from the start, patrolling between strikes. */
function addBear(w: World): Entity {
  const s = st(w);
  s.bearSide = w.fish.habitat === 'beach' ? 1 : w.rng.chance(0.5) ? 1 : -1;
  s.bearGoalX = w.rng.range(4, 36);
  return w.spawn('bear', v3(w.rng.range(4, 36), 0.8, s.bearSide * BANK_Z), { radius: 1.2, state: 'patrol' });
}

/** Walk the bear toward (x, bank of `side`) at `speed`, crossing behind the bank top if it must change banks. */
function walkBear(w: World, bear: Entity, x: number, side: number, speed: number, dt: number): boolean {
  const s = st(w);
  let gx = x;
  let gz = side * BANK_Z;
  if (side !== s.bearSide) {
    // Up and over the bank, out of sight, then down the far side.
    gx = bear.pos.x;
    gz = s.bearSide * BEHIND_BANK_Z;
    if (Math.abs(bear.pos.z) >= BEHIND_BANK_Z - 0.05) {
      s.bearSide = side;
      bear.pos.z = side * BEHIND_BANK_Z;
      gz = side * BANK_Z;
    }
  }
  const dx = gx - bear.pos.x;
  const dz = gz - bear.pos.z;
  const d = Math.hypot(dx, dz);
  const step = Math.min(d, speed * dt);
  if (d > 1e-6) {
    bear.vel = v3((dx / d) * speed, 0, (dz / d) * speed);
    bear.pos.x += (dx / d) * step;
    bear.pos.z += (dz / d) * step;
  } else bear.vel = v3();
  return side === s.bearSide && Math.abs(x - bear.pos.x) < 0.05 && Math.abs(gz - bear.pos.z) < 0.05;
}

/** Choose a fish for the bear: by the advisor's preference weights, sharpened in a big run. `exposure` favours the player. */
function chooseBearTarget(w: World, playerHidden: boolean, exposure: number): { id: number } | null {
  const p = w.p;
  const s = st(w);
  const run = w.conditions.runSize;
  const role = s.role;
  const playerKind: BearPreyKind = role === 'largeMale' ? 'male' : role === 'female' ? 'female' : 'jack';
  const candidates: { id: number; weight: number }[] = [];
  if (!playerHidden) candidates.push({ id: 0, weight: bearTargetWeight(p, playerKind, w.body.scale, run) * exposure });
  for (const e of w.entities) {
    if (!e.alive) continue;
    const kind = preyKind(w, e);
    if (kind) candidates.push({ id: e.id, weight: bearTargetWeight(p, kind, e.value ?? 1, run) });
  }
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return null;
  let pick = w.rng.range(0, total);
  return candidates.find((c) => (pick -= c.weight) <= 0) ?? candidates[0] ?? null;
}

/** What kind of fish an entity is to a bear, or null if the bear can't take it. */
function preyKind(w: World, e: Entity): BearPreyKind | null {
  if (e.kind === 'guardMale' || (e.kind === 'rival' && st(w).role !== 'female')) return 'male';
  if (e.kind === 'rival') return 'female';
  if (e.kind === 'jackAI' && e.state !== 'hidden') return 'jack';
  return null;
}

/** Fish near a strike dart away from it for a moment. */
function startleNear(w: World, at: Vec3): void {
  const p = w.p;
  const s = st(w);
  const r = p.get('spawn.startleRadius');
  for (const e of w.entities) {
    if (!e.alive || (e.kind !== 'rival' && e.kind !== 'guardMale' && e.kind !== 'jackAI') || e.state === 'hidden') continue;
    const dx = e.pos.x - at.x;
    const dz = e.pos.z - at.z;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    // Straight away from the strike; a fish right under it goes toward mid-stream.
    const ux = d > 1e-3 ? dx / d : 0;
    const uz = d > 1e-3 ? dz / d : -Math.sign(at.z || 1);
    s.startle[String(e.id)] = { x: ux, z: uz, t: p.get('spawn.startleTime') };
  }
}

function stepStartle(w: World, dt: number): void {
  const s = st(w);
  const sp = w.p.get('spawn.startleSpeed');
  const total = w.p.get('spawn.startleTime');
  for (const key of Object.keys(s.startle)) {
    const st0 = s.startle[key]!;
    const e = byId(w, Number(key));
    st0.t -= dt;
    if (!e || st0.t <= 0) {
      delete s.startle[key];
      continue;
    }
    const k = st0.t / total;
    e.pos.x = Math.max(1, Math.min(39, e.pos.x + st0.x * sp * k * dt));
    e.pos.z = Math.max(-7.5, Math.min(7.5, e.pos.z + st0.z * sp * k * dt));
  }
}

/**
 * The bear: patrols the bank, stalks along it to a chosen fish, warns (a
 * shadow over the fish), strikes, and eats what it caught on the bank before
 * patrolling again. `exposure` > 1 makes strikes come sooner and favour the player.
 */
function stepBears(w: World, dt: number, playerHidden: boolean, exposure = 1): void {
  const p = w.p;
  const s = st(w);
  s.bearTimer -= dt;
  stepStartle(w, dt);
  const bear = w.live('bear')[0] ?? addBear(w);
  bear.timer -= dt;
  const run = w.conditions.runSize;
  switch (bear.state) {
    case 'patrol': {
      // A slow walk up and down the bank, looking into the water.
      if (walkBear(w, bear, s.bearGoalX, s.bearSide, p.get('spawn.bearPatrolSpeed'), dt)) s.bearGoalX = w.rng.range(4, 36);
      if (s.bearTimer <= 0) {
        s.bearTimer = (p.get('spawn.bearInterval') * w.rng.range(0.7, 1.3)) / Math.max(0.05, p.get(`spawn.bearRate.${w.fish.habitat}`) * exposure * bearPlentyRate(p, run));
        const chosen = chooseBearTarget(w, playerHidden, exposure);
        if (chosen) {
          // How long the walk to it takes is fixed now, so when the warning comes never depends on what the fish does meanwhile.
          const tp = chosen.id ? byId(w, chosen.id)?.pos ?? w.body.pos : w.body.pos;
          const side = w.fish.habitat === 'beach' || tp.z > 0 ? 1 : -1;
          const speed = p.get('spawn.bearStalkSpeed');
          const cross = side !== s.bearSide ? (2 * (BEHIND_BANK_Z - BANK_Z)) / speed : 0;
          const walk = Math.max(0, Math.abs(tp.x - bear.pos.x) - p.get('spawn.bearStalkReach')) / speed;
          bear.state = 'stalk';
          bear.value = chosen.id;
          bear.timer = Math.min(p.get('spawn.bearStalkMax'), cross + walk);
        }
      }
      break;
    }
    case 'stalk': {
      const target = bear.value ? byId(w, bear.value) : null;
      // Lost its fish (taken, or the player slipped under cover): back to the patrol until its next try.
      if ((bear.value && !target) || (!bear.value && playerHidden)) {
        bear.state = 'patrol';
        break;
      }
      const tp = target ? target.pos : w.body.pos;
      const side = w.fish.habitat === 'beach' || tp.z > 0 ? 1 : -1;
      walkBear(w, bear, tp.x, side, p.get('spawn.bearStalkSpeed'), dt);
      if (bear.timer <= 0) {
        // The same warning as ever: a shadow over the chosen fish, then the swipe.
        bear.state = 'warn';
        bear.timer = p.get('spawn.bearWarning');
        bear.home = v3(tp.x, 0, tp.z);
        if (side !== s.bearSide) {
          // Still crossing (the fish moved): it comes down the near bank.
          s.bearSide = side;
          bear.pos.z = side * BANK_Z;
        }
        w.emit('warning', 'bear');
        w.emitOnce('caption', 'spawn.bear');
      }
      break;
    }
    case 'warn': {
      // Edging along the bank to be level with the fish.
      const home = bear.home ?? bear.pos;
      walkBear(w, bear, home.x, s.bearSide, p.get('spawn.bearStalkSpeed') * 0.5, dt);
      if (bear.timer <= 0) {
        bear.state = 'strike';
        bear.timer = 0.6;
        bear.vel = v3();
        const at = bear.home ?? v3();
        const radius = p.get('spawn.bearRadius');
        // It takes one fish: the one it chose if that is still in reach, else the one nearest the strike.
        let caught: Entity | null = null;
        let best = Infinity;
        const playerIn = !playerHidden && distXZ(w.body.pos, at) < radius;
        if (playerIn) best = bear.value === 0 ? -1 : distXZ(w.body.pos, at);
        for (const e of w.entities) {
          if (!e.alive || !preyKind(w, e)) continue;
          const d = distXZ(e.pos, at);
          if (d >= radius) continue;
          const score = e.id === bear.value ? -1 : d;
          if (score < best) {
            best = score;
            caught = e;
          }
        }
        if (playerIn && !caught) {
          w.die('bear');
          return;
        }
        if (caught) {
          s.bearMeal = preyKind(w, caught) ?? 'male';
          s.bearMealSize = caught.value ?? 1;
          caught.alive = false;
          if (caught.kind === 'guardMale') w.emit('caption', 'spawn.bearTookGuard');
          // A jack taken while darting gives up its hiding spot.
          if (caught.kind === 'jackAI') for (let i = 0; i < s.owners.length; i++) if (s.owners[i] === caught.id) s.owners[i] = -1;
        } else s.bearMeal = '';
        startleNear(w, at);
      }
      break;
    }
    case 'strike':
      if (bear.timer <= 0) {
        if (s.bearMeal) {
          // Up the bank with its catch.
          s.bearShare = bearShareEaten(p, run);
          bear.state = 'eat';
          bear.timer = bearEatTime(p, s.bearShare);
          bear.pos.z = s.bearSide * p.get('spawn.bearEatBank');
        } else {
          bear.state = 'rest';
          bear.timer = p.get('spawn.bearRest');
        }
        bear.home = undefined;
      }
      break;
    case 'eat':
      bear.vel = v3();
      if (bear.timer <= 0) {
        // It leaves what it didn't eat at the water's edge, and goes back for more.
        w.spawn('carcass', v3(bear.pos.x, 0, s.bearSide * BANK_Z), { radius: s.bearMealSize, state: s.bearMeal, value: 1 - s.bearShare, yaw: w.rng.range(0, Math.PI * 2) });
        const old = w.live('carcass');
        if (old.length > MAX_CARCASSES) old[0]!.alive = false;
        if (s.bearShare < p.get('spawn.bearEatShare') - 0.05) w.emitOnce('caption', 'spawn.bearPartial');
        else w.emitOnce('caption', 'spawn.bearEats');
        if (w.live('carcass').length >= 2) w.emitOnce('caption', 'spawn.scavengers');
        s.bearMeal = '';
        bear.state = 'patrol';
        bear.pos.z = s.bearSide * BANK_Z;
      }
      break;
    default:
      // Resting after a miss.
      bear.vel = v3();
      if (bear.timer <= 0) bear.state = 'patrol';
  }
  bear.pos.y = 0.8;
}

/** Senescence: strength drains and caps energy. Returns true when it has run out. */
function stepSenescence(w: World, dt: number): boolean {
  const p = w.p;
  const s = st(w);
  s.vigour = Math.max(0, s.vigour - senescenceRate(p, w.body.burst) * dt);
  w.body.energy = Math.min(w.body.energy, s.vigour);
  if (s.vigour < p.get('spawn.senescenceWarnAt')) w.emitOnce('caption', 'spawn.senescence');
  return s.vigour <= p.get('spawn.senescenceEnd');
}

/** An AI female digs her redd beside her; returns true once it is finished. */
function aiFemaleDigs(w: World, female: Entity, digTime: number, dt: number): boolean {
  female.timer += dt;
  const redd = w.live('redd').find((r) => distXZ(r.pos, female.pos) < 1.5);
  if (redd) redd.value = clamp01(female.timer / digTime);
  return female.timer >= digTime;
}

function addFemale(w: World, at: Vec3): Entity {
  const f = w.spawn('female', at, { radius: 0.6, state: 'dig' });
  w.spawn('redd', v3(at.x, -2.2, at.z), { radius: 1.2, value: 0, state: 'dug' });
  return f;
}

/** Jack role: hiding spots under the bank, contested by other jacks. */
function stepCover(w: World, intent: Intent, dt: number): boolean {
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

export const spawnStage: StageDef = {
  id: 'spawn',
  arena: (w) => {
    const habitat = w.fish.habitat;
    if (habitat === 'river') {
      // Deeper, faster water over coarser gravel.
      return {
        kind: 'spawnRiver',
        min: v3(0, -6, -8),
        max: v3(40, 0, 8),
        surfaceY: 0,
        water: 'fresh',
        floor: (x, z) => -3.6 + 0.3 * Math.sin(x * 0.3) * Math.cos(z * 0.4) + 1.6 * Math.max(0, (Math.abs(z) - 5) / 3),
        current: () => v3(-2.0, 0, 0),
      };
    }
    if (habitat === 'beach') {
      // A lake shore: still water, shallow at the shore (z = +8), deepening offshore.
      return {
        kind: 'lakeBeach',
        min: v3(0, -6, -8),
        max: v3(40, 0, 8),
        surfaceY: 0,
        water: 'fresh',
        floor: (x, z) => -0.9 - 4.2 * ((8 - z) / 16) + 0.15 * Math.sin(x * 0.5),
        current: (pos) => v3(0, 0, 0.25 * Math.sin(pos.x * 0.2 + pos.z)),
      };
    }
    return {
      kind: 'spawnBed',
      min: v3(0, -4, -8),
      max: v3(40, 0, 8),
      surfaceY: 0,
      water: 'fresh',
      floor: (x, z) => -2.3 + 0.25 * Math.sin(x * 0.4) * Math.cos(z * 0.5) + 0.7 * Math.max(0, (Math.abs(z) - 5) / 3),
      current: () => v3(-0.8, 0, 0),
    };
  },
  init(w) {
    const p = w.p;
    const role = roleOf(w);
    const habitat = w.fish.habitat;
    const nSpots = p.get(`spawn.coverSpots.${habitat}`);
    const spots: Vec3[] = [];
    for (let i = 0; i < nSpots; i++) {
      const x = 16 + (14 * (i + 0.5)) / nSpots;
      spots.push(habitat === 'beach' ? v3(x, -1.4, 4.2) : v3(x, -1.5, SPOT_Z));
    }
    const s: SpawnState = {
      role,
      dig: 0,
      quality: 0,
      steals: 0,
      superimposed: 0,
      spawned: false,
      spawnedAt: -1,
      act: 0,
      burial: 0,
      contested: false,
      maleTimer: 0,
      rivalTimer: p.get('spawn.rivalInterval'),
      near: 0,
      stolen: 0,
      windowUntil: -1,
      sneaks: 0,
      share: 0,
      stunned: 0,
      fightsWon: 0,
      fightsLost: 0,
      bearTimer: (p.get('spawn.bearInterval') * 0.8) / Math.max(0.05, p.get(`spawn.bearRate.${habitat}`)),
      bearSide: 1,
      bearGoalX: 20,
      bearMeal: '',
      bearMealSize: 1,
      bearShare: 1,
      startle: {},
      vigour: 1,
      jackFraction: yearJackFraction(p, habitat, w.conditions),
      phase: 'first',
      mateId: 0,
      secondId: 0,
      secondAt: -1,
      firstShare: 0,
      secondShare: 0,
      stayed: 0,
      near2: 0,
      wait: 0,
      spots,
      owners: spots.map(() => -1),
      contest: 0,
      jacksBeat: 0,
    };
    w.stage = s as unknown as Record<string, unknown>;
    w.body.scale = w.progress.adultSize ?? 1;
    if (habitat === 'beach') {
      // Boulders are the only cover on an open beach.
      for (const sp of spots) w.spawn('cover', v3(sp.x, w.arena.floor(sp.x, sp.z) + 0.9, sp.z + 1.2), { radius: 1.2, size: v3(2.2, 1.6, 1.6) });
    } else {
      const len = habitat === 'river' ? 10 : 18;
      w.spawn('cover', v3(23, -0.4, 6.8), { radius: 2, size: v3(len, 0.8, 2.6) });
    }
    // Advisor: gravel quality is mostly cobble size. Too large is hard to dig;
    // too small and the eggs get less oxygen. Medium cobble is best.
    const ideal = 0.2;
    for (let i = 0; i < 6; i++) {
      const cobble = habitat === 'river' ? w.rng.range(0.12, 0.5) : w.rng.range(0.07, 0.42);
      const quality = Math.max(0.25, 1 - Math.abs(cobble - ideal) / 0.22);
      const pz = habitat === 'beach' ? w.rng.range(-1, 4) : w.rng.range(-4.5, 3.5);
      const px = w.rng.range(8, 34);
      w.spawn('gravelPatch', v3(px, w.arena.floor(px, pz), pz), { radius: 2.2, value: quality, size: v3(cobble, 0, 0) });
    }
    if (role === 'female') {
      w.body.pos = v3(4, -1.5, 0);
    } else if (role === 'largeMale') {
      w.body.pos = v3(5, -1.5, 0);
      const patch = w.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      const at = patch ? v3(patch.pos.x, -1.7, patch.pos.z) : v3(22, -1.7, 0);
      s.mateId = addFemale(w, at).id;
    } else {
      w.body.pos = v3(10, -1.4, habitat === 'beach' ? 4.5 : 6.4);
      w.spawn('female', v3(24, -1.7, -1), { radius: 0.6, state: 'dig' });
      w.spawn('guardMale', v3(26, -1.6, -1), { radius: 0.8, state: 'guard', value: 1 });
      s.rivalTimer = p.get('spawn.jackFightInterval') * 0.6;
      // Frequency dependence: more jacks on the grounds in a jack-rich year.
      const n = rivalJackCount(p, s.jackFraction);
      for (let i = 0; i < n; i++) w.spawn('jackAI', v3(30 + i * 1.6, -1.5, habitat === 'beach' ? 4 : 6), { radius: 0.4, state: 'seek' });
      if (n >= nSpots) w.emit('caption', 'spawn.jackScarce');
    }
    addBear(w);
    w.emit('caption', `spawn.habitat.${habitat}`);
    w.emit('caption', role === 'jack' && habitat === 'beach' ? 'spawn.jackBeach' : `spawn.${role}`);
  },
  step(w, intent, dt) {
    swimStep(w, intent, dt);
    // Keep the other fish just above the bottom, whatever the habitat's depth.
    for (const e of w.entities) {
      if (e.alive && (e.kind === 'rival' || e.kind === 'guardMale' || e.kind === 'jackAI' || e.kind === 'female')) e.pos.y = w.arena.floor(e.pos.x, e.pos.z) + 0.6;
    }
    const s = st(w);
    const spent = stepSenescence(w, dt);
    if (s.role === 'female') stepFemale(w, intent, dt, spent);
    else if (s.role === 'largeMale') stepLargeMale(w, intent, dt, spent);
    else stepJack(w, intent, dt, spent);
  },
  debugComplete(w) {
    const s = st(w);
    s.spawned = true;
    if (s.role === 'female') {
      s.dig = 1;
      s.quality = 0.8;
      s.burial = 1;
    } else if (s.role === 'jack') {
      s.sneaks = 1;
      s.share = 0.2;
    } else {
      s.firstShare = 0.6;
      s.near = w.stageTime;
    }
    w.finishLife(result(w));
  },
};

/** The season ends when strength runs out, or at the latest when the stage's time is up. */
function seasonOver(w: World, spent: boolean): boolean {
  return spent || w.stageTime >= w.p.get('spawn.duration');
}

function endLife(w: World, caption: string): void {
  const s = st(w);
  if (s.spawned) {
    w.emit('caption', caption);
    w.finishLife(result(w));
  } else w.die('noSpawn');
}

function stepFemale(w: World, intent: Intent, dt: number, spent: boolean): void {
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
      if (!redd) {
        redd = w.spawn('redd', v3(fish.x, -2.2, fish.z), { radius: 1.2, value: 0, state: 'dug' });
        s.quality = patch.value ?? 0.5;
        w.emitOnce('caption', 'spawn.digging');
        const cobble = patch.size?.x ?? 0.2;
        if (cobble > 0.3) w.emitOnce('caption', 'spawn.cobbleLarge');
        else if (cobble < 0.11) w.emitOnce('caption', 'spawn.cobbleSmall');
      }
      if (distXZ(redd.pos, fish) < 2.5) {
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
    if (males.length === 0 && s.maleTimer <= 0) {
      w.spawn('guardMale', v3(redd.pos.x > 20 ? 2 : 38, -1.6, redd.pos.z + 1), { radius: 0.8, state: 'court', value: rivalSize(w) });
      w.emitOnce('caption', 'spawn.maleArrives');
    }
    if (s.dig >= 1 && !s.contested && males.length === 1) {
      s.contested = true;
      w.spawn('guardMale', v3(redd.pos.x > 20 ? 38 : 2, -1.6, redd.pos.z - 1), { radius: 0.8, state: 'challenge', value: rivalSize(w) });
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
      spawnRival(w, redd, 0.7);
      w.emitOnce('caption', 'spawn.rivalFemale');
      s.rivalTimer = rivalFemaleInterval(p, w.conditions.runSize, t / p.get('spawn.duration')) * w.rng.range(0.8, 1.2);
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

function stepLargeMale(w: World, intent: Intent, dt: number, spent: boolean): void {
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
    spawnRival(w, courting, rivalSize(w));
    w.emitOnce('caption', 'spawn.rivalMale');
    s.rivalTimer = (p.get('spawn.rivalInterval') * w.rng.range(0.8, 1.2)) / w.conditions.runSize;
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

function stepJack(w: World, intent: Intent, dt: number, spent: boolean): void {
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
    spawnRival(w, female, rivalSize(w));
    // Big runs mean more big males, more fights, more openings for jacks.
    s.rivalTimer = (p.get('spawn.jackFightInterval') * w.rng.range(0.8, 1.2)) / w.conditions.runSize;
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
  if (t < s.windowUntil && female && intent.actionPressed && dist(fish, female.pos) < 2.4) {
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

export const spawnState = (w: World): Readonly<SpawnState> | null => (w.stageId === 'spawn' ? st(w) : null);
