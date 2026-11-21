/**
 * Spawning grounds: the bear on the bank. It patrols, stalks along the bank
 * to a chosen fish, warns, strikes, and eats its catch up the bank, leaving
 * the remains for scavengers (see bearFeeding.ts).
 */
import { bearEatTime, bearPlentyRate, bearShareEaten, bearTargetWeight, type BearPreyKind } from '../../bearFeeding';
import type { Params } from '../../params';
import type { Entity, Vec3 } from '../../types';
import { distXZ, v3 } from '../../vec';
import type { World } from '../../world';
import { byId, st } from './shared';
import { crowdInBearView, crowdRel, crowdRole, releaseCrowdFish } from './crowd';

/** Bear preference by kind of fish: males, then large females, jacks last. */
export function bearWeight(p: Params, kind: 'male' | 'female' | 'jack'): number {
  return p.get(kind === 'male' ? 'spawn.bearPrefMale' : kind === 'female' ? 'spawn.bearPrefFemale' : 'spawn.bearPrefJack');
}

export const BANK_Z = 8.6;
/** Beyond the bank top, where a bear crossing to the other bank is out of sight. */
export const BEHIND_BANK_Z = 12;
export const MAX_CARCASSES = 6;

/** The bear on the bank: there from the start, patrolling between strikes. */
export function addBear(w: World): Entity {
  const s = st(w);
  s.bearSide = w.fish.habitat === 'beach' ? 1 : w.rng.chance(0.5) ? 1 : -1;
  s.bearGoalX = w.rng.range(4, 36);
  return w.spawn('bear', v3(w.rng.range(4, 36), 0.8, s.bearSide * BANK_Z), { radius: 1.2, state: 'patrol' });
}

/** Walk the bear toward (x, bank of `side`) at `speed`, crossing behind the bank top if it must change banks. */
export function walkBear(w: World, bear: Entity, x: number, side: number, speed: number, dt: number): boolean {
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
export function chooseBearTarget(w: World, playerHidden: boolean, exposure: number): { id: number } | null {
  const p = w.p;
  const s = st(w);
  const run = crowdRel(w);
  const role = s.role;
  const playerKind: BearPreyKind = role === 'largeMale' ? 'male' : role === 'female' ? 'female' : 'jack';
  const candidates: { id: number; weight: number }[] = [];
  if (!playerHidden) candidates.push({ id: 0, weight: bearTargetWeight(p, playerKind, w.body.scale, run) * exposure });
  const bear = w.live('bear')[0];
  for (const e of w.entities) {
    if (!e.alive) continue;
    const kind = preyKind(w, e);
    if (!kind) continue;
    // The crowd shields the player: the bear also considers the crowd fish near it on its side of the stream.
    if (crowdRole(e.kind)) {
      if (bear && crowdInBearView(w, e, bear, s.bearSide)) candidates.push({ id: e.id, weight: bearTargetWeight(p, kind, e.value ?? 1, run) * p.get('spawn.crowd.bearAttention') });
    } else candidates.push({ id: e.id, weight: bearTargetWeight(p, kind, e.value ?? 1, run) });
  }
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return null;
  let pick = w.rng.range(0, total);
  return candidates.find((c) => (pick -= c.weight) <= 0) ?? candidates[0] ?? null;
}

/** What kind of fish an entity is to a bear, or null if the bear can't take it. */
export function preyKind(w: World, e: Entity): BearPreyKind | null {
  const crowd = crowdRole(e.kind);
  if (crowd) return crowd === 'F' ? 'female' : crowd === 'M' ? 'male' : 'jack';
  if (e.kind === 'guardMale' || (e.kind === 'rival' && st(w).role !== 'female')) return 'male';
  if (e.kind === 'rival') return 'female';
  if (e.kind === 'jackAI' && e.state !== 'hidden') return 'jack';
  return null;
}

/** Fish near a strike dart away from it for a moment. */
export function startleNear(w: World, at: Vec3): void {
  const p = w.p;
  const s = st(w);
  const r = p.get('spawn.startleRadius');
  for (const e of w.entities) {
    if (!e.alive || (e.kind !== 'rival' && e.kind !== 'guardMale' && e.kind !== 'jackAI' && !crowdRole(e.kind)) || e.state === 'hidden') continue;
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

export function stepStartle(w: World, dt: number): void {
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
export function stepBears(w: World, dt: number, playerHidden: boolean, exposure = 1): void {
  const p = w.p;
  const s = st(w);
  s.bearTimer -= dt;
  stepStartle(w, dt);
  const bear = w.live('bear')[0] ?? addBear(w);
  bear.timer -= dt;
  // Crowded grounds draw the bear back more often (and it is choosier, and eats less of each fish).
  const run = crowdRel(w);
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
        // A fish it was after that vanished (taken, gone off to the player's redd, dead): it soon picks another.
        if (bear.value && !target) s.bearTimer = Math.min(s.bearTimer, p.get('spawn.bearRetarget'));
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
          if (crowdRole(caught.kind)) releaseCrowdFish(w, caught);
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
