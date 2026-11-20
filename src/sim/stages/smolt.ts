/**
 * Stage 3: the smolt run, a predator gauntlet (advisor: early marine and
 * outmigration predation is the key bottleneck; "think the opening of
 * Saving Private Ryan").
 * - Lake outlet: char ambush from below.
 * - River: diving birds from above; mergansers dive and chase underwater.
 * - River mouth: gull flocks and seals.
 * The player swims in a school of other smolts. Predators pick targets from
 * the whole school, so staying in the school dilutes the player's risk.
 */
import { currentAt, depthOf, swimStep } from '../swim';
import type { Entity, Vec3 } from '../types';
import { lakeGrowth } from './fry';
import { dist, distXZ, headingVec, lerp, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

const HALF_WIDTH = 8;
const COVER_Z = 6.2;

interface SmoltState {
  birdTimer: number;
  mergTimer: number;
  sealTimer: number;
  lost: number;
  schoolStart: number;
  /** Seconds left after a near miss during which predators pick school-mates over the player. */
  grace: number;
}

const st = (w: World) => w.stage as unknown as SmoltState;

export type SmoltSection = 'outlet' | 'river' | 'mouth';

export function smoltSection(w: World, x = w.body.pos.x): SmoltSection {
  if (x < w.p.get('smolt.outletEnd')) return 'outlet';
  if (x < w.p.get('smolt.mouthStart')) return 'river';
  return 'mouth';
}

/** Close school-mates around the player: the more, the safer. */
function schoolmatesNear(w: World, r = 6): Entity[] {
  return w.live('smolt').filter((s) => dist(s.pos, w.body.pos) < r);
}

/**
 * Choose who a predator goes after. With n school-mates nearby, the chance
 * it picks the player is 1 / (1 + shield * n).
 */
function pickTarget(w: World): Entity | null {
  const near = schoolmatesNear(w);
  // Just after a near miss the fish is lost among the others for a moment.
  if (st(w).grace > 0 && near.length) return w.rng.pick(near);
  const pPlayer = 1 / (1 + w.p.get('smolt.schoolShield') * near.length);
  if (!near.length || w.rng.chance(pPlayer)) return null;
  return w.rng.pick(near);
}

const targetPos = (w: World, t: Entity | null): Vec3 => (t ? t.pos : w.body.pos);
const targetVel = (w: World, t: Entity | null): Vec3 => (t ? t.vel : w.body.vel);

function takeSchoolmate(w: World, s: Entity): void {
  s.alive = false;
  st(w).lost += 1;
}

/**
 * A strike that reaches the player among school-mates takes only one fish:
 * with n others in reach, the player is the one with chance 1 / (1 + dilution * n).
 * Returns true if the player is caught; otherwise one of the others is taken.
 */
function strikeLands(w: World, others: Entity[]): boolean {
  const n = others.length;
  if (!n || w.rng.chance(1 / (1 + w.p.get('smolt.strikeDilution') * n))) return true;
  takeSchoolmate(w, w.rng.pick(others));
  nearMiss(w);
  return false;
}

/** A strike or lunge just missed the player: a moment's grace, and the lesson once. */
function nearMiss(w: World): void {
  st(w).grace = w.p.get('smolt.nearMissGrace');
  w.emitOnce('caption', 'smolt.nearMiss');
}

function stepSchool(w: World, dt: number): void {
  const b = w.body;
  const h = headingVec(b.yaw, 0);
  const side = v3(-h.z, 0, h.x);
  for (const f of w.live('smolt')) {
    const o = f.home ?? v3();
    // Formation: offsets behind and beside the player, plus a little wander.
    const goal = v3(
      b.pos.x + h.x * o.x + side.x * o.z + Math.sin(w.stageTime * 1.3 + f.id) * 0.4,
      Math.min(-0.4, b.pos.y * 0.7 + o.y),
      b.pos.z + h.z * o.x + side.z * o.z + Math.cos(w.stageTime * 1.1 + f.id) * 0.4,
    );
    // School-mates ride the current like the player does.
    const c = currentAt(w, f.pos);
    const d = sub(goal, f.pos);
    const want = scale(d, 2.2);
    const sp = Math.hypot(want.x, want.y, want.z);
    const max = 6;
    const swim = sp > max ? scale(want, max / sp) : want;
    f.vel = v3(swim.x + c.x * 0.9, swim.y, swim.z + c.z * 0.9);
    f.pos.x += f.vel.x * dt;
    f.pos.y += f.vel.y * dt;
    f.pos.z = Math.max(-HALF_WIDTH + 0.3, Math.min(HALF_WIDTH - 0.3, f.pos.z + f.vel.z * dt));
    f.pos.y = Math.max(w.arena.floor(f.pos.x, f.pos.z) + 0.3, f.pos.y);
    f.yaw = Math.atan2(f.vel.z, f.vel.x);
  }
}

function stepChar(w: World, c: Entity, dt: number): void {
  const p = w.p;
  c.timer -= dt;
  const fish = w.body.pos;
  if (c.state === 'lurk') {
    c.vel = v3();
    if (dist(c.pos, fish) < 11 && fish.x < c.pos.x + 4) {
      c.state = 'warn';
      c.timer = p.get('smolt.charWarning');
      w.emit('warning', 'char');
      w.emitOnce('caption', 'smolt.char');
    }
  } else if (c.state === 'warn') {
    if (c.timer <= 0) {
      c.state = 'chase';
      c.timer = p.get('smolt.charChase');
      const t = pickTarget(w);
      c.home = t ? t.pos : undefined;
      c.value = t ? t.id : 0;
    }
  } else if (c.state === 'chase') {
    const target = c.value ? w.entities.find((e) => e.id === c.value && e.alive) ?? null : null;
    // Its school-mate was taken by something else: the char gives up rather than switching to the player.
    if (c.value && !target) {
      c.state = 'done';
      return;
    }
    const tp = target ? target.pos : fish;
    c.vel = scale(norm(sub(tp, c.pos)), p.get('smolt.charSpeed'));
    if (target && dist(c.pos, target.pos) < 0.9) {
      takeSchoolmate(w, target);
      c.state = 'done';
    } else if (!target && dist(c.pos, fish) < 0.9) {
      w.die('char');
      return;
    }
    if (c.timer <= 0) c.state = 'done';
  } else {
    c.vel = v3(-1, -0.3, 0);
  }
  c.pos.x += c.vel.x * dt;
  c.pos.y = Math.max(w.arena.floor(c.pos.x, c.pos.z) + 0.4, Math.min(-0.5, c.pos.y + c.vel.y * dt));
  c.pos.z += c.vel.z * dt;
}

function stepBirds(w: World, dt: number, section: SmoltSection): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  s.birdTimer -= dt;
  if (section !== 'outlet' && s.birdTimer <= 0) {
    const flock = section === 'mouth' ? 2 : 1;
    for (let i = 0; i < flock; i++) {
      const t = pickTarget(w);
      const warn = p.get('smolt.birdWarning');
      const tp = targetPos(w, t);
      const tv = targetVel(w, t);
      const aim = v3(tp.x + tv.x * warn + (i ? w.rng.range(-3, 3) : 0), 0, tp.z + tv.z * warn * 0.5 + (i ? w.rng.range(-3, 3) : 0));
      w.spawn('birdShadow', aim, { radius: p.get('smolt.birdStrikeRadius'), state: 'warn', timer: warn });
    }
    w.emit('warning', 'bird');
    w.emitOnce('caption', section === 'mouth' ? 'smolt.gulls' : 'smolt.bird');
    s.birdTimer = p.get(section === 'mouth' ? 'smolt.gullInterval' : 'smolt.birdInterval') * w.rng.range(0.7, 1.3);
  }
  for (const b of w.live('birdShadow')) {
    b.timer -= dt;
    if (b.state === 'warn' && b.timer <= 0) {
      b.state = 'strike';
      b.timer = 0.5;
      const reach = p.get('smolt.birdReachDepth');
      for (const f of w.live('smolt')) {
        if (distXZ(b.pos, f.pos) < b.radius * 0.8 && -f.pos.y < reach + 0.6 && w.rng.chance(0.85)) takeSchoolmate(w, f);
      }
      const underCover = Math.abs(fish.z) > COVER_Z;
      const d = distXZ(b.pos, fish);
      if (d < b.radius && depthOf(w) < reach && !underCover) {
        // School-mates in the same strike zone and depth: the bird takes one fish.
        const others = w.live('smolt').filter((f) => distXZ(b.pos, f.pos) < b.radius && -f.pos.y < reach + 0.6);
        if (strikeLands(w, others)) {
          w.die('bird');
          return;
        }
      } else if (d < b.radius * p.get('smolt.nearMissRange')) nearMiss(w);
    } else if (b.state === 'strike' && b.timer <= 0) {
      b.alive = false;
    }
  }
}

function stepMergansers(w: World, dt: number, section: SmoltSection): void {
  const p = w.p;
  const s = st(w);
  s.mergTimer -= dt;
  if (section === 'river' && s.mergTimer <= 0) {
    const ahead = v3(w.body.pos.x + 20, 0, Math.max(-6, Math.min(6, w.body.pos.z + w.rng.range(-3, 3))));
    w.spawn('merganser', ahead, { radius: 0.6, state: 'warn', timer: p.get('smolt.mergWarning') });
    w.emit('warning', 'merganser');
    w.emitOnce('caption', 'smolt.merganser');
    s.mergTimer = p.get('smolt.mergInterval') * w.rng.range(0.7, 1.3);
  }
  for (const m of w.live('merganser')) {
    m.timer -= dt;
    if (m.state === 'warn') {
      m.vel = v3(w.p.get('smolt.current') * 0.6, 0, 0);
      if (m.timer <= 0) {
        // A short dive before the chase gives the fish a moment to react.
        m.state = 'dive';
        m.timer = 0.6;
        const t = pickTarget(w);
        m.value = t ? t.id : 0;
      }
    } else if (m.state === 'dive') {
      m.vel = v3(0, -4, 0);
      if (m.timer <= 0) {
        m.state = 'chase';
        m.timer = p.get('smolt.mergChase');
      }
    } else if (m.state === 'chase') {
      const target = m.value ? w.entities.find((e) => e.id === m.value && e.alive) ?? null : null;
      if (m.value && !target) {
        // Its school-mate was taken by something else: the merganser surfaces.
        m.state = 'surface';
        m.timer = 1.5;
        continue;
      }
      const tp = target ? target.pos : w.body.pos;
      m.vel = scale(norm(sub(tp, m.pos)), p.get('smolt.mergSpeed'));
      if (target && dist(m.pos, target.pos) < 0.8) {
        takeSchoolmate(w, target);
        m.state = 'surface';
        m.timer = 1.5;
      } else if (!target && dist(m.pos, w.body.pos) < 0.8) {
        w.die('merganser');
        return;
      } else if (m.timer <= 0) {
        m.state = 'surface';
        m.timer = 1.5;
      }
    } else {
      m.vel = v3(1, 3, 0);
      if (m.timer <= 0) m.alive = false;
    }
    m.pos.x += m.vel.x * dt;
    m.pos.y = Math.min(0, Math.max(w.arena.floor(m.pos.x, m.pos.z) + 0.3, m.pos.y + m.vel.y * dt));
    m.pos.z += m.vel.z * dt;
  }
}

function stepSeals(w: World, dt: number, section: SmoltSection): void {
  const p = w.p;
  const s = st(w);
  s.sealTimer -= dt;
  if (section === 'mouth' && s.sealTimer <= 0 && w.live('seal').length === 0) {
    const side = w.rng.chance(0.5) ? 1 : -1;
    const start = v3(w.body.pos.x + w.rng.range(6, 14), -5.5, side * (HALF_WIDTH - 1));
    w.spawn('seal', start, { radius: 1.2, state: 'warn', timer: p.get('smolt.sealWarning') });
    w.emit('warning', 'seal');
    w.emitOnce('caption', 'smolt.seal');
    s.sealTimer = p.get('smolt.sealInterval') * w.rng.range(0.7, 1.3);
  }
  for (const seal of w.live('seal')) {
    seal.timer -= dt;
    if (seal.state === 'warn') {
      seal.vel = v3(w.p.get('smolt.current'), 0, 0);
      if (seal.timer <= 0) {
        seal.state = 'lunge';
        seal.timer = 2;
        const t = pickTarget(w);
        const tp = targetPos(w, t);
        const tv = targetVel(w, t);
        // Lead the target: aim where it will be.
        const lead = dist(tp, seal.pos) / p.get('smolt.sealSpeed');
        const aim = v3(tp.x + tv.x * lead, tp.y + tv.y * lead, tp.z + tv.z * lead);
        seal.vel = scale(norm(sub(aim, seal.pos)), p.get('smolt.sealSpeed'));
      }
    } else if (seal.state === 'lunge') {
      const catchR = p.get('smolt.sealCatchRadius');
      const d = dist(seal.pos, w.body.pos);
      if (d < catchR) {
        // Others right beside the player: the seal may take one of them instead.
        const others = w.live('smolt').filter((f) => dist(f.pos, w.body.pos) < p.get('smolt.strikeCrowdRadius'));
        if (strikeLands(w, others)) {
          w.die('seal');
          return;
        }
        // It has its fish and turns away.
        seal.state = 'away';
        seal.timer = 1.2;
        seal.vel = v3(seal.vel.x * 0.3, -2, seal.vel.z * 0.3);
      } else {
        for (const f of w.live('smolt')) if (dist(seal.pos, f.pos) < 1.4) takeSchoolmate(w, f);
        if (d < catchR * p.get('smolt.nearMissRange')) seal.value = 1;
        if (seal.timer <= 0) {
          // The lunge passed close by without a catch.
          if (seal.value === 1) nearMiss(w);
          seal.alive = false;
        }
      }
    } else if (seal.state === 'away' && seal.timer <= 0) {
      seal.alive = false;
    }
    seal.pos.x += seal.vel.x * dt;
    seal.pos.y = Math.min(-0.5, Math.max(w.arena.floor(seal.pos.x, seal.pos.z) + 0.6, seal.pos.y + seal.vel.y * dt));
    seal.pos.z = Math.max(-HALF_WIDTH + 0.5, Math.min(HALF_WIDTH - 0.5, seal.pos.z + seal.vel.z * dt));
    seal.yaw = Math.atan2(seal.vel.z, seal.vel.x);
  }
}

export const smoltStage: StageDef = {
  id: 'smolt',
  arena: (w) => {
    const L = w.p.get('smolt.length');
    const main = w.p.get('smolt.current');
    const edge = w.p.get('smolt.edgeCurrent');
    const mouth = w.p.get('smolt.mouthStart');
    return {
      kind: 'river',
      min: v3(0, -8, -HALF_WIDTH),
      max: v3(L, 0, HALF_WIDTH),
      surfaceY: 0,
      water: 'fresh',
      // Deeper toward the river mouth, where seals hunt.
      floor: (x, z) => -1.4 - (5.2 + Math.max(0, (x - mouth) / 40)) * (1 - (z / HALF_WIDTH) ** 2),
      current: (pos) => v3(lerp(edge, main, 1 - (pos.z / HALF_WIDTH) ** 2), 0, 0),
    };
  },
  init(w) {
    const p = w.p;
    w.body.pos = v3(6, -3, 0);
    // A fish that grew more in the lake (or stayed a second year) leaves it visibly bigger.
    w.body.scale = p.get('smolt.baseScale') + p.get('smolt.scalePerLakeGrowth') * Math.min(lakeGrowth(p, w.progress), p.get('fry.fullLakeGrowth'));
    const n = p.get('smolt.schoolSize');
    const s: SmoltState = { birdTimer: p.get('smolt.birdInterval') * 0.5, mergTimer: p.get('smolt.mergInterval') * 0.4, sealTimer: 1, lost: 0, schoolStart: n, grace: 0 };
    w.stage = s as unknown as Record<string, unknown>;
    for (let i = 0; i < n; i++) {
      const home = v3(w.rng.range(-5, 3), w.rng.range(-1.2, 1.2), w.rng.range(-3.5, 3.5));
      w.spawn('smolt', v3(6 + home.x, -3 + home.y, home.z), { radius: 0.2, home });
    }
    const L = p.get('smolt.length');
    for (let x = 10; x < L; x += w.rng.range(8, 16)) {
      const side = w.rng.chance(0.5) ? 1 : -1;
      w.spawn('cover', v3(x, -0.3, side * (HALF_WIDTH - 0.9)), { radius: 1.8, size: v3(w.rng.range(4, 8), 0.6, 1.8) });
    }
    const outletEnd = p.get('smolt.outletEnd');
    const chars = p.get('smolt.charCount');
    for (let i = 0; i < chars; i++) {
      const x = 18 + ((outletEnd - 24) * (i + 0.5)) / chars;
      w.spawn('trout', v3(x, w.arena.floor(x, 0) + 0.6, w.rng.range(-4, 4)), { radius: 0.8, state: 'lurk' });
    }
  },
  step(w, intent, dt) {
    swimStep(w, intent, dt);
    const section = smoltSection(w);
    const ss = st(w);
    ss.grace = Math.max(0, ss.grace - dt);
    stepSchool(w, dt);
    for (const c of w.live('trout')) {
      stepChar(w, c, dt);
      if (w.status !== 'playing') return;
    }
    stepBirds(w, dt, section);
    if (w.status !== 'playing') return;
    stepMergansers(w, dt, section);
    if (w.status !== 'playing') return;
    stepSeals(w, dt, section);
    if (w.status !== 'playing') return;
    if (section === 'mouth') w.emitOnce('caption', 'smolt.mouth');
    if (schoolmatesNear(w).length < 3 && w.live('smolt').length > 6) w.emitOnce('caption', 'smolt.alone');

    if (w.body.pos.x >= w.arena.max.x - 5) {
      const s = st(w);
      w.emit('caption', 'smolt.salt', { lost: s.lost, total: s.schoolStart });
      w.completeStage();
    }
  },
  debugComplete(w) {
    w.completeStage();
  },
};

export const smoltLosses = (w: World): { lost: number; total: number } | null =>
  w.stageId === 'smolt' ? { lost: st(w).lost, total: st(w).schoolStart } : null;
