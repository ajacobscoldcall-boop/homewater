/**
 * Fellow migrants on the return: a loose school of other sockeye from the
 * home river, met at its mouth, moving upstream with the player. They keep
 * loose places around the player, share the current, hold in pools, jostle,
 * try the falls on their own (some fail), and split between the branches at
 * the fork. A bear's swipe that reaches the player among them takes only one
 * fish, and a bear may go for one of them instead, so their company shields
 * the player a little, like the smolt school.
 *
 * Pure simulation; drawn by the renderer as 'migrant' entities.
 */
import type { Entity, Vec3 } from '../types';
import { clamp, distXZ, v3 } from '../vec';
import type { World } from '../world';
import { arcAt, arcVel, FACE, LIP_END, makeLeap, pushOut, type Leap } from './falls';
import { lakeMigrant } from './returnLake';

interface MigrantSlot {
  dx: number;
  dz: number;
  dy: number;
  /** Branch past the fork: +1 or -1 from the centre line. */
  side: 1 | -1;
}

export interface MigrantState {
  spawned: boolean;
  total: number;
  /** Taken by bears. */
  lost: number;
  /** Leaps tried and made at the falls. */
  leaps: number;
  over: number;
  slots: Record<number, MigrantSlot>;
  arcs: Record<number, Leap>;
  /** The fish a bear is going for, by bear id. */
  prey: Record<number, number>;
}

interface Host {
  homeMouth: number;
  riverHalf: number;
  migrants?: MigrantState;
}

const host = (w: World) => w.stage as unknown as Host;

export const migrantState = (w: World): MigrantState | null => (w.stageId === 'return' ? (host(w).migrants ?? null) : null);

/** Meet the school at the mouth of the home river (once per fish). */
export function spawnMigrants(w: World): void {
  const h = host(w);
  if (h.migrants?.spawned) return;
  const n = Math.round(w.p.get('return.migrants'));
  const s: MigrantState = { spawned: true, total: n, lost: 0, leaps: 0, over: 0, slots: {}, arcs: {}, prey: {} };
  h.migrants = s;
  const fish = w.body.pos;
  for (let i = 0; i < n; i++) {
    const pos = v3(fish.x + w.rng.range(-8, 7), w.rng.range(-2.6, -1.2), h.homeMouth + w.rng.range(-5, 5));
    const m = w.spawn('migrant', pos, { radius: 0.45, state: 'swim', value: w.rng.range(0.85, 1.1), timer: w.rng.range(0.5, 3) });
    s.slots[m.id] = { dx: w.rng.range(-8, 5), dz: w.rng.range(-4.5, 4.5), dy: w.rng.range(-0.8, 0.8), side: w.rng.chance(0.5) ? 1 : -1 };
  }
  if (n > 0) w.emitOnce('caption', 'return.migrants');
}

/** Where a migrant wants to be: its place around the player, held below the falls until it is over. */
function slotTarget(w: World, m: Entity, slot: MigrantSlot, fork: number, coast: number): Vec3 {
  const h = host(w);
  const fish = w.body.pos;
  let tx = Math.max(coast + 3, fish.x + slot.dx);
  let tz = h.homeMouth + slot.dz;
  const below = m.pos.x < FACE;
  if (below && tx > FACE - 1.5) tx = FACE - 2 - (m.id % 4) * 0.6;
  if (!below && tx < LIP_END + 1.5) tx = LIP_END + 1.5;
  if (tx > fork - 2) tz = h.homeMouth + slot.side * clamp(Math.abs(slot.dz), 1.8, h.riverHalf - 1);
  const ty = clamp(w.arena.floor(tx, tz) + 1.2 + slot.dy, -3, -0.7);
  return v3(tx, ty, tz);
}

/** Move the school. `fork` and `coast` are the return's layout. */
export function stepMigrants(w: World, dt: number, fork: number, coast: number): void {
  const s = migrantState(w);
  if (!s) return;
  const p = w.p;
  const fish = w.body.pos;
  const speed = p.get('return.migrantSpeed');
  const jostle = p.get('return.migrantJostle');
  const school = w.live('migrant');
  for (const m of school) {
    const arc = s.arcs[m.id];
    if (arc) {
      arc.t = Math.min(1, arc.t + dt / arc.dur);
      arcAt(arc, arc.t, m.pos);
      arcVel(arc, arc.t, m.vel);
      if (arc.t >= 1) {
        delete s.arcs[m.id];
        m.state = 'swim';
        m.vel = arc.success ? v3(1.5, 0, 0) : v3(-3.5, -1, 0);
        m.timer = w.rng.range(p.get('return.migrantLeapPause') * 0.6, p.get('return.migrantLeapPause') * 1.6);
        if (arc.success) s.over += 1;
      }
      continue;
    }
    const slot = s.slots[m.id];
    if (!slot) continue;
    // Into the lake: each heads for a stream or beach of its own (returnLake.ts).
    if (lakeMigrant(w, m, dt)) continue;
    // Left far behind: it is no longer with the player.
    if (fish.x - m.pos.x > 45) {
      m.alive = false;
      continue;
    }
    const t = slotTarget(w, m, slot, fork, coast);
    const dx = t.x - m.pos.x;
    const dy = t.y - m.pos.y;
    const dz = t.z - m.pos.z;
    const d = Math.hypot(dx, dy, dz);
    // Faster to catch up, slower against strong water.
    const cur = w.arena.current(m.pos).x * w.conditions.flow;
    const cap = speed * (d > 14 ? 1.5 : 1) * (m.value ?? 1);
    const want = Math.min(cap, d * 1.2);
    const k = d > 1e-6 ? want / d : 0;
    const desired = v3(dx * k, dy * k, dz * k);
    // Holding against the current costs headway: upstream progress is cut by part of it.
    desired.x = Math.min(desired.x, cap + 0.45 * cur);
    const a = Math.min(1, 2.5 * dt);
    m.vel.x += (desired.x - m.vel.x) * a;
    m.vel.y += (desired.y - m.vel.y) * a;
    m.vel.z += (desired.z - m.vel.z) * a;
    // Jostling: keep a little room from each other and the player; the player feels a nudge.
    for (const o of school) {
      if (o === m || s.arcs[o.id]) continue;
      const ox = m.pos.x - o.pos.x;
      const oz = m.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 0.9 && od > 1e-6) {
        m.vel.x += (ox / od) * jostle * dt;
        m.vel.z += (oz / od) * jostle * dt;
      }
    }
    const px = m.pos.x - fish.x;
    const pz = m.pos.z - fish.z;
    const pd = Math.hypot(px, pz);
    if (pd < 1 && pd > 1e-6 && Math.abs(m.pos.y - fish.y) < 0.8) {
      m.vel.x += (px / pd) * jostle * 1.5 * dt;
      m.vel.z += (pz / pd) * jostle * 1.5 * dt;
      w.body.vel.x -= (px / pd) * jostle * 0.5 * dt;
      w.body.vel.z -= (pz / pd) * jostle * 0.5 * dt;
    }
    m.pos.x += m.vel.x * dt;
    m.pos.y += m.vel.y * dt;
    m.pos.z += m.vel.z * dt;
    keepInRiver(w, m, fork);
    pushOut(w, m.pos, m.vel, 0.3 * (m.value ?? 1));
    const sp = Math.hypot(m.vel.x, m.vel.z);
    const yaw = sp > 0.6 ? Math.atan2(m.vel.z, m.vel.x) : 0;
    m.yaw += Math.atan2(Math.sin(yaw - m.yaw), Math.cos(yaw - m.yaw)) * Math.min(1, 4 * dt);

    // At the falls: wait a moment in the pool, then try.
    if (m.pos.x < FACE && m.pos.x > FACE - 3.5 && t.x < FACE) {
      m.timer -= dt;
      if (m.timer <= 0) {
        const ok = w.rng.chance(p.get('return.migrantLeapChance'));
        s.leaps += 1;
        m.state = 'leap';
        s.arcs[m.id] = makeLeap(w, v3(m.pos.x, -0.35, m.pos.z), m.vel.z, ok, w.rng.range(0.3, 0.9));
      }
    }
  }
  // Bears whose prey is gone forget it.
  for (const [bear, id] of Object.entries(s.prey)) if (!school.some((m) => m.alive && m.id === id)) delete s.prey[Number(bear)];
}

function keepInRiver(w: World, m: Entity, fork: number): void {
  const h = host(w);
  const half = h.riverHalf - 0.6;
  let zc = clamp(m.pos.z - h.homeMouth, -half, half);
  // Past the fork, each keeps to its own branch, clear of the divider.
  if (m.pos.x > fork - 0.5) {
    const side = Math.sign(zc) || 1;
    zc = side * Math.max(1.6, Math.abs(zc));
  }
  m.pos.z = h.homeMouth + zc;
  m.pos.y = clamp(m.pos.y, w.arena.floor(m.pos.x, m.pos.z) + 0.35, w.arena.surfaceY - 0.35);
}

/** School-mates near a point, in the same branch, shallow enough for a bear. */
function migrantsNear(w: World, at: Vec3, radius: number, maxDepth: number, branch: number, fork: number): Entity[] {
  const h = host(w);
  return w
    .live('migrant')
    .filter((m) => distXZ(m.pos, at) < radius && w.arena.surfaceY - m.pos.y < maxDepth && (branch === 0 || m.pos.x <= fork || Math.sign(m.pos.z - h.homeMouth) === branch));
}

/**
 * A bear sizing up its swipe: with n school-mates around the spot it was
 * going to aim at, it goes for the player with chance 1 / (1 + shield * n),
 * otherwise for one of them. Returns where to aim.
 */
export function bearAim(w: World, bear: Entity, aim: Vec3, reach: number, branch: number, fork: number): Vec3 {
  const s = migrantState(w);
  if (!s) return aim;
  const p = w.p;
  const near = migrantsNear(w, aim, p.get('return.migrantShieldRadius'), reach + 0.5, branch, fork);
  if (!near.length || w.rng.chance(1 / (1 + p.get('return.migrantShield') * near.length))) {
    delete s.prey[bear.id];
    return aim;
  }
  const m = w.rng.pick(near);
  s.prey[bear.id] = m.id;
  const warn = p.get('return.bearWarning');
  const hm = host(w).homeMouth;
  const half = host(w).riverHalf;
  return v3(m.pos.x + m.vel.x * warn, 0, clamp(m.pos.z + m.vel.z * warn * 0.5, hm - half + 0.5, hm + half - 0.5));
}

/**
 * The swipe lands. `playerInReach` is the bear's own test of the player.
 * Among school-mates also in reach, the player is the one taken with chance
 * 1 / (1 + dilution * n); otherwise one of them is. Returns true if the
 * player is caught.
 */
export function bearStrike(w: World, bear: Entity, target: Vec3, radius: number, reach: number, playerInReach: boolean, branch: number, fork: number): boolean {
  const s = migrantState(w);
  if (!s) return playerInReach;
  const others = migrantsNear(w, target, radius, reach, branch, fork);
  const preyId = s.prey[bear.id];
  delete s.prey[bear.id];
  if (playerInReach) {
    if (!others.length || w.rng.chance(1 / (1 + w.p.get('return.migrantDilution') * others.length))) return true;
  } else if (!others.length) return false;
  const prey = others.find((m) => m.id === preyId) ?? w.rng.pick(others);
  takeMigrant(w, prey);
  return false;
}

function takeMigrant(w: World, m: Entity): void {
  const s = migrantState(w);
  if (!s) return;
  m.alive = false;
  delete s.arcs[m.id];
  s.lost += 1;
  w.emitOnce('caption', 'return.migrantTaken');
}

export interface MigrantView {
  total: number;
  lost: number;
  leaps: number;
  over: number;
  /** Migrants in the air over the falls, by entity id, with how far through the leap. */
  leaping: Record<number, number>;
}

export function migrantView(w: World): MigrantView | null {
  const s = migrantState(w);
  if (!s) return null;
  const leaping: Record<number, number> = {};
  for (const [id, a] of Object.entries(s.arcs)) leaping[Number(id)] = a.t;
  return { total: s.total, lost: s.lost, leaps: s.leaps, over: s.over, leaping };
}
