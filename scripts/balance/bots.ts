/**
 * Bot players for the balance simulator.
 *
 * Bots only read what a player can see (positions of on-screen things, the
 * drifting flecks, track shimmer, scent, warnings) and answer with an Intent,
 * the same input the keyboard and mouse produce. They never write sim state.
 * Every human imperfection comes from the Skill profile and the bot's own
 * Rng, which is separate from World.rng so bots never perturb the sim's dice.
 *
 * Built on the simple bots in tests/unit (steerTo, goodAlevin, navigator and
 * the spawn bots), with reaction time, steering wobble, missed threats,
 * attention lapses and per-stage habits added.
 */
import { Rng } from '../../src/sim/rng';
import { alevinView } from '../../src/sim/stages/egg';
import { fallsView } from '../../src/sim/stages/falls';
import { returnLayout } from '../../src/sim/stages/return';
import { spawnState } from '../../src/sim/stages/spawn';
import { NO_INTENT, type Entity, type Intent, type Vec3 } from '../../src/sim/types';
import { clamp, dist, distXZ, norm, wrapAngle } from '../../src/sim/vec';
import type { World } from '../../src/sim/world';
import type { Skill } from './skills';

/** River mouths along the coast in the return stage. Visible geography (mirrors src/sim/stages/return.ts). */
const MOUTHS = [-26, 0, 26];
/** How far scent and other cues can be seen, in world units. */
const SCENT_SIGHT = 15;
/** Scent specks fainter than this (entity value) are too faint to make out. */
const SCENT_FAINT = 0.15;

const intent = (over: Partial<Intent> = {}): Intent => ({ ...NO_INTENT, ...over });

/** A predator for the escape planner: where it is, how fast it homes, and when it starts. */
interface Threat {
  pos: Vec3;
  speed: number;
  delay: number;
}

/** Closest distance between a point and a moving thing's straight path ahead (XZ and 3D). */
function closestApproach(from: Vec3, vel: Vec3, to: Vec3, horizon: number): { d: number; t: number } {
  const rx = to.x - from.x;
  const ry = to.y - from.y;
  const rz = to.z - from.z;
  const vv = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
  const t = vv > 1e-9 ? clamp((rx * vel.x + ry * vel.y + rz * vel.z) / vv, 0, horizon) : 0;
  return { d: Math.hypot(rx - vel.x * t, ry - vel.y * t, rz - vel.z * t), t };
}

export class Bot {
  readonly rng: Rng;
  /** stageTime at which each threat (entity id + state) was first seen. */
  private firstSeen = new Map<string, number>();
  private ignored = new Map<number, boolean>();
  private noise = 0;
  private lapseLeft = 0;
  private last: Intent = intent();
  /** Per-attempt memory for the current stage. */
  private m: Record<string, unknown> = {};
  /** Delayed perception of the alevin's current direction. */
  private currentHistory: { t: number; a: number }[] = [];

  constructor(
    readonly skill: Skill,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  /** Call whenever a stage (re)starts: new stage, or a sibling at a checkpoint. */
  begin(): void {
    this.firstSeen.clear();
    this.ignored.clear();
    this.m = {};
    this.currentHistory = [];
    this.lapseLeft = 0;
    this.last = intent();
  }

  act(w: World): Intent {
    const s = this.skill;
    const dt = w.dt;
    // Slow heading wander (Ornstein-Uhlenbeck, 1.5 s time constant).
    const tau = 1.5;
    this.noise += (-this.noise / tau) * dt + s.steerNoise * Math.sqrt((2 * dt) / tau) * this.rng.normal();
    if (this.lapseLeft > 0) {
      this.lapseLeft -= dt;
      // During a lapse the player keeps doing what they were doing, minus one-shot presses.
      return { ...this.last, actionPressed: false, risePressed: false, mouseX: 0, mouseY: 0 };
    }
    if (s.lapseRate > 0 && this.rng.chance(s.lapseRate * dt)) this.lapseLeft = s.lapseDur;
    let out: Intent;
    switch (w.stageId) {
      case 'egg':
        out = this.egg(w);
        break;
      case 'fry':
        out = this.fry(w);
        break;
      case 'smolt':
        out = this.smolt(w);
        break;
      case 'ocean':
        out = this.ocean(w);
        break;
      case 'return':
        out = this.returnStage(w);
        break;
      default:
        out = this.spawn(w);
    }
    this.last = out;
    return out;
  }

  // ---------------------------------------------------------------- helpers

  /** True once the threat has been visible for the reaction time, unless this player never notices it. */
  private notice(w: World, e: Entity, tag = e.state): boolean {
    let ign = this.ignored.get(e.id);
    if (ign === undefined) {
      ign = this.rng.chance(this.skill.missChance);
      this.ignored.set(e.id, ign);
    }
    if (ign) return false;
    const key = `${e.id}:${tag}`;
    const t0 = this.firstSeen.get(key);
    if (t0 === undefined) {
      this.firstSeen.set(key, w.stageTime);
      return this.skill.reaction <= 0;
    }
    return w.stageTime - t0 >= this.skill.reaction;
  }

  /** Bursting is allowed above the player's reserve; in an emergency a careful player spends it all. */
  private canBurst(w: World, emergency = false): boolean {
    const reserve = emergency && this.skill.burstReserve > 0 ? 0 : this.skill.burstReserve;
    return w.body.energy > reserve + 0.09;
  }

  /** Turn toward a heading, with the player's wobble, by keyboard or mouse. */
  private turnTo(w: World, yaw: number): Partial<Intent> {
    const d = wrapAngle(yaw + this.noise - w.body.yaw);
    if (this.skill.mouse) {
      const max = this.skill.maxTurnRate * w.dt;
      const step = clamp(d * 0.25, -max, max);
      return { mouseX: step / w.p.get('swim.mouseSensitivity'), turn: 0 };
    }
    return { turn: clamp(d * 3, -1, 1) };
  }

  private steer(w: World, tx: number, tz: number, over: Partial<Intent> = {}): Intent {
    const b = w.body;
    return intent({ forward: 1, ...this.turnTo(w, Math.atan2(tz - b.pos.z, tx - b.pos.x)), ...over });
  }

  /** Steer in 3D: heading in the horizontal plane, Space / C for depth. */
  private steer3(w: World, t: Vec3, over: Partial<Intent> = {}): Intent {
    const b = w.body;
    // Never aim below the bottom or above the surface: pitching into the gravel wastes thrust.
    const near = Math.hypot(t.x - b.pos.x, t.z - b.pos.z) < 3;
    const floorAt = near ? w.arena.floor(t.x, t.z) : Math.max(w.arena.floor(b.pos.x, b.pos.z), w.arena.floor(t.x, t.z));
    const lo = floorAt + 0.3 * b.scale + 0.25;
    const ty = clamp(t.y, lo, w.arena.surfaceY - 0.3 * b.scale - 0.1);
    const dy = ty - b.pos.y;
    // Pitch toward the target depth (mouse look), damped by the vertical speed;
    // Space / C add vertical thrust when far off.
    const want = clamp(0.45 * dy - 0.35 * b.vel.y, -0.9, 0.9);
    const mouseY = (0.3 * (b.pitch - want)) / w.p.get('swim.mouseSensitivity');
    return this.steer(w, t.x, t.z, { mouseY, rise: dy > 1.5, dive: dy < -1.5, ...over });
  }

  /**
   * Heading (yaw) that keeps a chasing predator furthest away after a short
   * burst, given the river current and banks; turning costs a little.
   */
  private escapeHeading(w: World, threats: Threat[], halfWidth: number): number {
    const b = w.body;
    const burstSpeed = (w.p.get('swim.thrust') * w.p.get('swim.burstMultiplier')) / w.p.get('swim.drag');
    const c = w.arena.current(b.pos);
    const flow = w.conditions.flow;
    let best = b.yaw;
    let bestScore = -Infinity;
    const dt = 0.1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      // Simulate a short pursuit: predators home on the fish; the fish turns along an arc and bursts.
      let h = b.yaw;
      let fx = b.pos.x;
      let fz = b.pos.z;
      const ps = threats.map((t) => ({ x: t.pos.x, z: t.pos.z }));
      let minD = Infinity;
      for (let t = 0; t < 2; t += dt) {
        const diff = wrapAngle(a - h);
        h += clamp(diff, -this.skill.maxTurnRate * dt, this.skill.maxTurnRate * dt);
        fx += (Math.cos(h) * burstSpeed + c.x * flow) * dt;
        fz = clamp(fz + Math.sin(h) * burstSpeed * dt, -halfWidth, halfWidth);
        threats.forEach((th, i) => {
          const p = ps[i];
          if (!p) return;
          const d = Math.hypot(fx - p.x, fz - p.z);
          minD = Math.min(minD, d);
          if (t < th.delay) return;
          const step = Math.min(d, th.speed * dt);
          p.x += ((fx - p.x) / (d || 1)) * step;
          p.z += ((fz - p.z) / (d || 1)) * step;
        });
      }
      if (minD > bestScore) {
        bestScore = minD;
        best = a;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- egg

  private egg(w: World): Intent {
    const v = alevinView(w);
    if (!v || v.phase === 'egg') return intent();
    const m = this.m as { early?: boolean; readySeen?: number; warned?: boolean; missed?: boolean; frozen?: number; pulseSeen?: number; floodSeen?: number; floodMissed?: boolean };
    if (m.early === undefined) m.early = this.rng.chance(this.skill.earlyRiseChance);
    // The flood: rising, clouding water and a caption. A player who notices it digs in until it passes;
    // one who misses it carries on as before until the flood itself hits (after their reaction time).
    const flooding = v.flood === 'warning' || v.flood === 'flood';
    if (flooding && m.floodSeen === undefined) {
      m.floodSeen = w.stageTime;
      m.floodMissed = this.rng.chance(this.skill.missChance);
    }
    const floodNoticed = flooding && m.floodSeen !== undefined && (m.floodMissed ? v.flood === 'flood' : w.stageTime - m.floodSeen >= this.skill.reaction);
    // The flecks show the current; the player sees a change after their reaction time.
    const now = w.stageTime;
    this.currentHistory.push({ t: now, a: v.currentAngle });
    while (this.currentHistory.length > 1 && (this.currentHistory[1]?.t ?? Infinity) <= now - this.skill.reaction) this.currentHistory.shift();
    let seen = this.currentHistory[0]?.a ?? v.currentAngle;
    // A player who misses the swing of the flecks only reacts once the surge hits.
    if (v.warning && !m.warned) {
      m.warned = true;
      m.missed = this.rng.chance(this.skill.missChance);
      m.frozen = seen;
      m.pulseSeen = undefined;
    }
    if (!v.warning && !v.pulse) m.warned = false;
    if (m.missed && m.warned) {
      if (v.pulse) m.pulseSeen ??= now;
      if (m.pulseSeen === undefined || now - m.pulseSeen < this.skill.reaction) seen = m.frozen ?? seen;
    }
    const upstream = seen + Math.PI;
    const d = wrapAngle(upstream + this.noise - w.body.yaw);
    let turn: Partial<Intent> = {};
    if (Math.abs(d) > this.skill.alevinDeadband) {
      turn = this.skill.mouse
        ? { mouseX: clamp(d * 0.25, -this.skill.maxTurnRate * w.dt, this.skill.maxTurnRate * w.dt) / w.p.get('swim.mouseSensitivity') }
        : { turn: clamp(d * 3, -1, 1) };
    }
    if (v.ready && m.readySeen === undefined) m.readySeen = now;
    const ready = m.readySeen !== undefined && now - m.readySeen >= this.skill.reaction;
    const rise = !floodNoticed && (ready || (m.early && w.progress.yolk < 0.45));
    // Stay low until it is time to go (diving costs a little yolk, so only when needed).
    const dive = !rise && v.height > 0.05;
    return intent({ ...turn, rise, dive });
  }

  // ---------------------------------------------------------------- fry

  private fry(w: World): Intent {
    const s = this.skill;
    const fish = w.body.pos;
    const m = this.m as { target?: number; retargetAt?: number; flees?: number; fleeing?: boolean };
    let threat: Entity | null = null;
    let td = Infinity;
    for (const t of w.live('trout')) {
      if (t.state !== 'warn' && t.state !== 'chase') continue;
      const d = dist(t.pos, fish);
      if (d < td && this.notice(w, t, 'hunt')) {
        threat = t;
        td = d;
      }
    }
    if (threat && !m.fleeing) m.flees = (m.flees ?? 0) + 1;
    m.fleeing = !!threat;
    if (threat) {
      // Flee to the weeds if the trout is not between us and them; otherwise straight away.
      const toWeeds = threat.pos.x > fish.x - 2 || fish.x < -12;
      const burst = threat.state === 'chase' && td < s.fryBurstDist && this.canBurst(w);
      if (toWeeds) return this.steer3(w, { x: -26, y: -4, z: clamp(fish.z, -25, 25) }, { burst });
      const away = norm({ x: fish.x - threat.pos.x, y: 0, z: fish.z - threat.pos.z });
      return this.steer3(w, { x: fish.x + away.x * 10, y: -4, z: fish.z + away.z * 10 }, { burst });
    }
    // Safe in the weeds with a trout close by: wait for it to swim off.
    if (fish.x < -19.5 && w.live('trout').some((t) => dist(t.pos, fish) < 11)) {
      return this.steer3(w, { x: -25, y: -4, z: clamp(fish.z, -25, 25) }, { forward: fish.x > -23 ? 0.6 : 0, hold: true });
    }
    // Feeding: pick a target and keep it for a while.
    let target = m.target ? w.entities.find((e) => e.id === m.target && e.alive) : undefined;
    if (!target || (m.retargetAt ?? 0) <= w.stageTime) {
      const patrols = w.live('trout');
      let best: Entity | undefined;
      let bestScore = Infinity;
      for (const e of w.live('plankton')) {
        // Some poor patches spill into the weed shelf, below its floor: out of reach.
        if (e.pos.y < w.arena.floor(e.pos.x, e.pos.z) + 0.1) continue;
        let score = dist(e.pos, fish) - (e.value === 1 ? s.fryRichBonus : 0);
        // After being chased a few times, anyone learns to feed away from the trout.
        const risk = s.fryRisk + 6 * (m.flees ?? 0);
        if (risk > 0) for (const t of patrols) score += risk * Math.max(0, 1 - dist(t.home ?? t.pos, e.pos) / 16);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      target = best;
      m.target = best?.id;
      m.retargetAt = w.stageTime + 0.6;
    }
    if (!target) return intent({ forward: 0.5 });
    // Ease off when the food is close but off to the side, so the fish does not circle it.
    const off = Math.abs(wrapAngle(Math.atan2(target.pos.z - fish.z, target.pos.x - fish.x) - w.body.yaw));
    const dxz = distXZ(target.pos, fish);
    const slow = (dxz < 4 && off > 0.5) || (dxz < 1.2 && Math.abs(target.pos.y - fish.y) > 0.8);
    return this.steer3(w, target.pos, slow ? { forward: 0.15 } : {});
  }

  // ---------------------------------------------------------------- smolt

  private smolt(w: World): Intent {
    const s = this.skill;
    const fish = w.body.pos;
    const b = w.body;
    const depth = -fish.y;
    // Steering is a sum of pulls: downstream, back toward the middle, and away from each threat.
    let ax = 1;
    let az = -fish.z * 0.08;
    let ty = s.smoltDepth;
    let burst = false;
    let hold = false;

    // Birds: a shadow on the surface where the bird will strike. Go deep and sideways.
    for (const sh of w.live('birdShadow')) {
      if (sh.state !== 'warn' || !this.notice(w, sh)) continue;
      const atStrike = { x: fish.x + b.vel.x * sh.timer, y: 0, z: fish.z + b.vel.z * sh.timer };
      if (distXZ(sh.pos, atStrike) < sh.radius + s.margin && depth < w.p.get('smolt.birdReachDepth') + 0.6) {
        ty = -4.2;
        az += atStrike.z >= sh.pos.z ? 0.8 : -0.8;
      }
    }
    // A merganser's splash ahead: get to the far side and turn back before it dives.
    for (const mg of w.live('merganser')) {
      if ((mg.state !== 'warn' && mg.state !== 'dive') || !this.notice(w, mg, 'splash')) continue;
      const dx = mg.pos.x - fish.x;
      if (dx < -3 || dx > 26) continue;
      const dz = fish.z - mg.pos.z;
      const roomPlus = 6.5 - fish.z;
      const roomMinus = fish.z + 6.5;
      const side = Math.abs(dz) > 0.5 ? Math.sign(dz) : roomPlus > roomMinus ? 1 : -1;
      const want = side > 0 ? roomPlus : roomMinus;
      if (Math.abs(fish.z) < 5 || Math.sign(fish.z) !== side) az += side * (want > 1 ? 2.5 : -2.5) * Math.max(0, 1 - Math.abs(dz) / 8);
      // Turn back upstream: the gap grows while it dives, and the fish is already facing away when it chases.
      if (dx < 22) ax = -1.5;
    }
    // Seals show as a dark shape before the lunge. A skilled player sprints past before it goes.
    for (const seal of w.live('seal')) {
      if (seal.state !== 'warn' || !this.notice(w, seal, 'shape')) continue;
      if (s.sealSprint) burst = this.canBurst(w);
    }
    // Seal lunges are straight: get across the path.
    for (const seal of w.live('seal')) {
      if (seal.state !== 'lunge' || !this.notice(w, seal)) continue;
      const ca = closestApproach(seal.pos, seal.vel, fish, 1.5);
      if (ca.d > w.p.get('smolt.sealCatchRadius') + s.margin) continue;
      const v = norm({ x: seal.vel.x, y: 0, z: seal.vel.z });
      const rel = { x: fish.x - seal.pos.x, z: fish.z - seal.pos.z };
      const side = Math.sign(-v.z * rel.x + v.x * rel.z) || 1;
      if (s.sealDodge === 'across') {
        // As the caption says: swim across its path.
        ax = -v.z * side * 3;
        az = v.x * side * 3;
        burst = this.canBurst(w, true);
        hold = false;
      } else if (-v.z * side > 0) {
        // Change speed along the river so the lunge passes ahead or behind.
        ax = 3;
        az = 0;
        burst = this.canBurst(w, true);
        hold = false;
      } else {
        ax = 0;
        az = 0;
        hold = true;
        burst = false;
      }
    }
    // Char and mergansers chasing this fish: burst along the best escape line,
    // keeping clear of any merganser about to dive.
    const chasers: Threat[] = [];
    for (const e of [...w.live('trout'), ...w.live('merganser')]) {
      if (e.state !== 'chase' || (e.value ?? 0) !== 0 || !this.notice(w, e) || dist(e.pos, fish) > 12) continue;
      chasers.push({ pos: e.pos, speed: w.p.get(e.kind === 'trout' ? 'smolt.charSpeed' : 'smolt.mergSpeed'), delay: 0 });
    }
    if (chasers.length) {
      for (const mg of w.live('merganser')) {
        if ((mg.state === 'warn' || mg.state === 'dive') && this.notice(w, mg, 'splash')) {
          chasers.push({ pos: mg.pos, speed: w.p.get('smolt.mergSpeed'), delay: mg.timer + (mg.state === 'warn' ? 0.6 : 0) });
        }
      }
      const dir = this.escapeHeading(w, chasers, 7);
      ax = Math.cos(dir);
      az = Math.sin(dir);
      const below = chasers.some((c) => c.delay === 0 && c.pos.y < fish.y);
      ty = below ? Math.min(-2.7, fish.y + 1) : -4;
      // Burst only while it would close in soon: energy spent early is missing later.
      const urgent = chasers.some((c) => {
        if (c.delay > 0) return false;
        const d = dist(c.pos, fish);
        const toward = norm({ x: fish.x - c.pos.x, y: fish.y - c.pos.y, z: fish.z - c.pos.z });
        const closing = c.speed - (b.vel.x * toward.x + b.vel.y * toward.y + b.vel.z * toward.z);
        return d < 4 || (closing > 0 && d / closing < 1.4);
      });
      burst = urgent && this.canBurst(w, true);
      hold = false;
    }
    const n = Math.hypot(ax, az) || 1;
    const tx = fish.x + (ax / n) * 10;
    const tz = clamp(fish.z + (az / n) * 10, -7, 7);
    return this.steer3(w, { x: tx, y: ty, z: tz }, { burst, hold: hold && !burst });
  }

  // ---------------------------------------------------------------- ocean

  private ocean(w: World): Intent {
    const s = this.skill;
    const fish = w.body.pos;
    const m = this.m as { panic?: Record<number, boolean> };
    m.panic ??= {};
    for (const o of [...w.live('orca'), ...w.live('shark')]) {
      if (o.state !== 'charge' || !this.notice(w, o)) continue;
      const catchR = o.kind === 'orca' ? w.p.get('ocean.orcaCatchRadius') : 1.6;
      const ca = closestApproach(o.pos, o.vel, fish, 6);
      if (ca.d > catchR + s.margin + 1) continue;
      m.panic[o.id] ??= this.rng.chance(s.panicChance);
      const burst = this.canBurst(w);
      if (m.panic[o.id]) {
        // Flee straight away from it: the commonest mistake.
        const away = norm({ x: fish.x - o.pos.x, y: 0, z: fish.z - o.pos.z });
        return this.steer3(w, { x: fish.x + away.x * 20, y: fish.y, z: fish.z + away.z * 20 }, { burst });
      }
      const v = norm({ x: o.vel.x, y: 0, z: o.vel.z });
      const rel = { x: fish.x - o.pos.x, z: fish.z - o.pos.z };
      const side = Math.sign(-v.z * rel.x + v.x * rel.z) || 1;
      const ty = fish.y + (o.pos.y > fish.y ? -4 : 4);
      return this.steer3(w, { x: fish.x - v.z * side * 20, y: clamp(ty, -27, -3), z: fish.z + v.x * side * 20 }, { burst });
    }
    // A seal lunges at where the fish is going: as the caption says, turn hard across its path as it comes.
    for (const seal of w.live('seal')) {
      if (seal.state !== 'lunge' || !this.notice(w, seal)) continue;
      const ca = closestApproach(seal.pos, seal.vel, fish, 2);
      if (ca.d > w.p.get('ocean.sealCatchRadius') + s.margin + 1) continue;
      const v = norm({ x: seal.vel.x, y: 0, z: seal.vel.z });
      const rel = { x: fish.x - seal.pos.x, z: fish.z - seal.pos.z };
      const side = Math.sign(-v.z * rel.x + v.x * rel.z) || 1;
      const ty = fish.y + (seal.pos.y > fish.y ? -3 : 3);
      return this.steer3(w, { x: fish.x - v.z * side * 20, y: clamp(ty, -27, -1), z: fish.z + v.x * side * 20 }, { burst: this.canBurst(w, true) });
    }
    // Feed: chase the nearest herring.
    let best: Entity | undefined;
    let bd = Infinity;
    for (const h of w.live('herring')) {
      const d = dist(h.pos, fish);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    if (!best) return intent({ forward: 0.6 });
    return this.steer3(w, best.pos);
  }

  // ---------------------------------------------------------------- return

  private returnStage(w: World): Intent {
    const s = this.skill;
    const L = returnLayout(w);
    if (!L) return intent();
    const fish = w.body.pos;
    const b = w.body;
    type Mem = {
      trackZ?: number;
      trackSeenAt?: number;
      sweep?: number;
      mouth?: number;
      tried?: number[];
      backout?: boolean;
      noScentSince?: number;
      stuckX?: number;
      stuckAt?: number;
      forkSide?: number;
      forkTried?: boolean;
      forkBack?: boolean;
      ignoreNet?: Record<number, boolean>;
      evading?: number;
    };
    const m = this.m as Mem;
    m.tried ??= [];
    m.ignoreNet ??= {};
    const now = w.stageTime;
    const L0 = w.p.get('return.length');

    // Bears: after a swipe the bear rests; that is the moment to dash past it.
    const fv = fallsView(w);
    const belowFalls = !!fv && !fv.passed && fish.x < fv.face;
    for (const bear of w.live('bear')) {
      if ((bear.state !== 'strike' && bear.state !== 'rest') || fish.x > bear.pos.x + 5 || fish.x < bear.pos.x - 16) continue;
      // There is no dashing past the bear at the falls' lip: the falls must be leapt (falls() below).
      if (belowFalls && fv && bear.pos.x > fv.face - 1) continue;
      if (m.backout || m.forkBack || !this.notice(w, bear, 'resting')) continue;
      m.evading = undefined;
      // Cross the shallows along the far bank (or up the chosen branch), where the current is slower.
      const cz = m.mouth ?? fish.z;
      const farSide = bear.pos.z > cz ? -1 : 1;
      const tz = fish.x > L.fork - 12 && m.forkSide ? cz + m.forkSide * 4 : cz + farSide * 5;
      return this.steer3(w, { x: fish.x + 10, y: s.riverDepth, z: tz }, { burst: this.canBurst(w, true) });
    }
    // Bears: the swipe lands where the shadow fell. Get clear of it.
    // Deep in the plunge pool the bear at the lip can't reach: no need to dodge. Just above the lip there is no dropping back.
    const deepInPool = !!fv && fish.x > fv.poolStart && fish.x < fv.face && w.arena.surfaceY - fish.y > w.p.get('return.bearReachDepth') + 0.6;
    const aboveLip = !!fv && fish.x > fv.face && fish.x < fv.lipEnd + 3;
    for (const bear of w.live('bear')) {
      if (bear.state !== 'warn' || !bear.home || !this.notice(w, bear)) continue;
      if (deepInPool) continue;
      const radius = w.p.get('return.bearStrikeRadius') * (0.75 + 0.35 * (w.progress.adultSize ?? 1));
      const atStrike = { x: fish.x + b.vel.x * bear.timer, y: 0, z: fish.z + b.vel.z * bear.timer };
      const evading = m.evading === bear.id;
      if (!evading && Math.min(distXZ(atStrike, bear.home), distXZ(fish, bear.home)) > radius + s.margin) continue;
      m.evading = bear.id;
      if (distXZ(fish, bear.home) > radius + s.margin + 2.5) return this.steer3(w, { x: fish.x, y: s.riverDepth, z: fish.z }, { forward: 0, hold: true });
      // Pick the way out (drop back, push through, or cross) that ends furthest from the swipe.
      const cz = m.mouth ?? 0;
      const cur = Math.abs(w.arena.current(fish).x);
      const cruise = w.p.get('swim.thrust') / w.p.get('swim.drag');
      const canPush = this.canBurst(w, true) && w.body.energy > 0.35;
      const options = [
        { dx: -1, dz: 0, v: aboveLip ? 0 : cruise + cur },
        { dx: 1, dz: 0, v: m.backout || m.forkBack ? 0 : canPush ? cruise * w.p.get('swim.burstMultiplier') - cur : Math.max(0, cruise - cur), burst: canPush },
        { dx: 0.3, dz: 1, v: cruise },
        { dx: 0.3, dz: -1, v: cruise },
      ];
      let pick = options[0];
      let far = -Infinity;
      for (const o of options) {
        const n = Math.hypot(o.dx, o.dz);
        const ex = fish.x + (o.dx / n) * o.v * Math.max(0, bear.timer - 0.2);
        const ez = clamp(fish.z + (o.dz / n) * o.v * Math.max(0, bear.timer - 0.2), cz - 6.5, cz + 6.5);
        const d = Math.hypot(ex - bear.home.x, ez - bear.home.z);
        if (d > far) {
          far = d;
          pick = o;
        }
      }
      if (!pick) continue;
      const need = radius + s.margin - far;
      const burst = (pick.burst ?? false) || (need > 0 && this.canBurst(w, true));
      return this.steer3(w, { x: fish.x + pick.dx * 10, y: s.riverDepth, z: clamp(fish.z + pick.dz * 10, cz - 6, cz + 6) }, { burst });
    }

    // Rapids and falls: dash between boulders, rest, then run at the falls and leap.
    // The falls are only on the home river: above them there is no backing out to try another mouth.
    if (fv && fish.x > fv.face && m.backout) m.backout = false;
    // Waiting in the plunge pool is not being lost: don't let it look like a dead end.
    if (fv && !m.backout && fish.x > fv.rapidsStart - 3 && fish.x < fv.lipEnd + 4) {
      m.stuckX = fish.x;
      m.stuckAt = now;
      m.noScentSince = undefined;
    }
    const falls = m.backout || m.forkBack ? null : this.falls(w);
    if (falls) return falls;

    // Specks too faint to make out (a wrong river's fading smell, an unclear home scent) are not seen as scent.
    const scents = w.live('scent').filter((sc) => dist(sc.pos, fish) < SCENT_SIGHT && (sc.value ?? 1) > SCENT_FAINT);

    // Open water: follow the magnetic track's shimmer; sweep when it fades.
    if (fish.x < L.coast - 12) {
      const marks = w.live('track').filter((t) => t.pos.x > fish.x);
      if (marks.length) {
        let zs = 0;
        let ws = 0;
        for (const t of marks) {
          const wt = 1 / (1 + Math.abs(t.pos.x - fish.x - 8));
          zs += t.pos.z * wt;
          ws += wt;
        }
        m.trackZ = zs / ws;
        m.trackSeenAt = now;
        m.sweep = 0;
      }
      let tz = m.trackZ ?? fish.z;
      if (now - (m.trackSeenAt ?? 0) > 0.8) {
        // Lost: sweep side to side around the last known line, widening.
        m.sweep = (m.sweep ?? 0) + w.dt;
        tz = (m.trackZ ?? fish.z) + Math.sin(m.sweep * 0.9) * Math.min(20, 4 + m.sweep * 2);
      }
      // Nets: thread a visible gap.
      const gaps = w.live('netGap').filter((g) => g.pos.x > fish.x - 0.5 && g.pos.x - fish.x < 30);
      if (gaps.length) {
        const lineX = Math.min(...gaps.map((g) => g.pos.x));
        const key = Math.round(lineX);
        m.ignoreNet[key] ??= this.rng.chance(s.missChance * 0.5);
        if (!m.ignoreNet[key]) {
          const line = gaps.filter((g) => Math.abs(g.pos.x - lineX) < 0.5);
          const ref = s.name === 'skilled' ? (fish.z + tz) / 2 : fish.z;
          const gap = line.sort((a, c) => Math.abs(a.pos.z - ref) - Math.abs(c.pos.z - ref))[0];
          if (gap) {
            // Line up square to the gap before crossing the net.
            const ahead = gap.pos.x - fish.x;
            const crossZ = b.vel.x > 0.5 ? fish.z + (b.vel.z / b.vel.x) * ahead : fish.z;
            if (Math.abs(crossZ - gap.pos.z) < 1.0 && Math.abs(fish.z - gap.pos.z) < 2.5) return this.steer(w, gap.pos.x + 3, gap.pos.z);
            if (ahead < 2.5) return this.steer(w, fish.x - 3, gap.pos.z);
            return this.steer(w, Math.max(fish.x + 2, gap.pos.x - 5), gap.pos.z);
          }
        }
      }
      return this.steer(w, fish.x + 10, tz);
    }

    // Choosing a mouth: by the scent drifting out of it, else where the track was heading.
    if (m.mouth === undefined || (m.backout && fish.x < L.coast - 3)) {
      if (m.backout && m.mouth !== undefined) m.tried.push(m.mouth);
      m.backout = false;
      const untried = MOUTHS.filter((z) => !m.tried?.includes(z));
      // Stronger-looking specks count for more, as they would to a player.
      const wsum = scents.reduce((a, sc) => a + (sc.value ?? 1) ** 2, 0);
      const cue = scents.length ? scents.reduce((a, sc) => a + sc.pos.z * (sc.value ?? 1) ** 2, 0) / wsum : (m.trackZ ?? fish.z);
      m.mouth = (untried.length ? untried : MOUTHS).sort((a, c) => Math.abs(a - cue) - Math.abs(c - cue))[0] ?? 0;
      m.noScentSince = undefined;
      m.stuckAt = undefined;
    }
    const mouth = m.mouth;

    if (m.backout) return this.steer(w, L.coast - 8, mouth);

    if (fish.x < L.coast + 2) return this.steer(w, L.coast + 8, mouth);

    // In a river. Is it home? No scent for a while, or a dead end, means back out.
    if (scents.length) m.noScentSince = undefined;
    else m.noScentSince ??= now;
    if (m.stuckX === undefined || fish.x > m.stuckX + 0.5) {
      m.stuckX = fish.x;
      m.stuckAt = now;
    }
    const stuck = now - (m.stuckAt ?? now) > 2.5;
    const beforeFork = fish.x < L.fork - 2;
    // Above the falls this is surely the home river (the falls are only there).
    if (beforeFork && !(fv && fish.x > fv.face) && (stuck || now - (m.noScentSince ?? now) > 3)) {
      m.backout = true;
      return this.steer(w, L.coast - 8, mouth);
    }

    // The fork: take the branch the scent comes down; back out of a dead end.
    let side = m.forkSide ?? 0;
    if (fish.x > L.fork - 22 && m.forkSide === undefined) {
      // Smell which branch the scent comes down; commit once there is a cue, or at the fork itself.
      const up = w.live('scent').filter((sc) => sc.pos.x > L.fork + 1 && dist(sc.pos, fish) < SCENT_SIGHT + 10);
      const cue = up.length >= 3 ? Math.sign(up.reduce((a, sc) => a + sc.pos.z - mouth, 0)) : 0;
      if (cue || fish.x > L.fork - 4) {
        side = cue || (this.rng.chance(0.5) ? 1 : -1);
        if (this.rng.chance(s.forkMistake)) side = -side;
        m.forkSide = side;
      }
    }
    if (!beforeFork && fish.x > L.fork + 4 && (stuck || now - (m.noScentSince ?? now) > 3) && !m.forkBack) {
      m.forkBack = true;
      m.forkSide = -side;
      side = -side;
    }
    if (m.forkBack) {
      if (fish.x > L.fork - 3 && Math.sign(fish.z - mouth) !== side) return this.steer(w, L.fork - 6, mouth + side * 2);
      m.forkBack = false;
      m.stuckAt = now;
      m.noScentSince = undefined;
    }
    const lane = s.bankSwim ? 4.5 : 2.5;
    const tz = fish.x > L.fork - 12 ? mouth + side * 4 : mouth + (side || 1) * (s.bankSwim ? lane : 0);
    // Bursting covers ground for less fat per metre than cruising (the base drain is per second),
    // but a careful player keeps enough energy to dash past a bear.
    const bearAhead = w.live('bear').some((br) => br.pos.x > fish.x - 4 && br.pos.x - fish.x < 22);
    const burst = s.riverBurst && w.body.energy > (s.burstReserve > 0 && bearAhead ? 0.95 : 0.6);
    return this.steer3(w, { x: Math.min(L0, fish.x + 10), y: s.riverDepth, z: tz }, { burst });
  }

  /**
   * The rapids and falls (null elsewhere): burst up the rapids aiming for the
   * slack water behind the next boulder, rest at the foot of the plunge pool,
   * then sprint and leap where this player judges the spot to be. Up the side
   * channel once it opens.
   */
  private falls(w: World): Intent | null {
    const v = fallsView(w);
    const s = this.skill;
    if (!v || v.passed) return null;
    const b = w.body;
    const x = b.pos.x;
    if (x < v.rapidsStart - 3 || x > v.lipEnd) return null;
    if (v.leapT !== null) return intent();
    type FallsMem = { run?: boolean; leaps?: number; aimZ?: number; leapX?: number; poolSince?: number };
    const m = ((this.m.falls as FallsMem | undefined) ?? (this.m.falls = {})) as FallsMem;
    const noRise = { rise: false };
    if (v.sideOpen) {
      const cz = (v.chute[0] + v.chute[1]) / 2;
      return this.steer3(w, { x: x + 6, y: -1.2, z: cz }, { burst: this.canBurst(w), ...noRise });
    }
    if (x < v.poolStart) {
      // The next boulder upstream with water behind it.
      const rock = v.rocks.filter((r) => r.x - r.r > x + 0.3).sort((a, c) => a.x - c.x)[0];
      const tz = rock ? rock.z : v.notchZ;
      const tx = rock ? rock.x - rock.r - 0.6 : x + 8;
      const resting = rock && Math.abs(b.pos.z - tz) < rock.r * 0.8 && tx - x < 1.2;
      if (resting && b.energy < 0.6) return this.steer3(w, { x: x + 3, y: -1.4, z: tz }, { forward: 0.3, ...noRise });
      return this.steer3(w, { x: Math.max(tx, x + 3), y: -1.4, z: tz }, { burst: this.canBurst(w), ...noRise });
    }
    if (m.leaps !== v.leaps || m.aimZ === undefined) {
      // A fresh try: where this player thinks the best spot is.
      m.leaps = v.leaps;
      m.run = false;
      m.aimZ = v.notchZ + this.rng.normal() * s.fallsAim;
      m.leapX = v.waveX + this.rng.normal() * s.leapTiming;
    }
    if (x < v.poolStart - 1 || x > v.face - 0.6) m.run = false;
    const aimZ = clamp(m.aimZ, returnLayout(w)!.homeMouth - 6, returnLayout(w)!.homeMouth + 6);
    if (!m.run) {
      const sx = v.poolStart + 0.8;
      m.poolSince ??= w.stageTime;
      // A careful player waits for the bear at the lip to swipe and rest before running at the falls,
      // but not for ever; once it rests, a rough line and some energy will do.
      const lipBear = w.live('bear').find((br) => br.pos.x > v.face - 1 && br.pos.x < v.lipEnd + 3);
      const resting = !!lipBear && (lipBear.state === 'rest' || lipBear.state === 'strike');
      const impatient = w.stageTime - m.poolSince > 12;
      const bearReady = !lipBear || this.skill.burstReserve === 0 || resting || impatient;
      const tol = resting ? 2 : 1;
      const need = resting || impatient ? Math.min(s.fallsRest, 0.6) : s.fallsRest;
      // Wait deep in the plunge pool, out of the bear's reach (careless players wait near the top).
      const waitY = s.riverDepth;
      if (Math.abs(x - sx) > tol || Math.abs(b.pos.z - aimZ) > 0.9 * tol) return this.steer3(w, { x: sx + 3, y: waitY, z: aimZ }, { forward: x > sx + 1 ? 0 : 0.7, ...noRise });
      if (b.energy < need || !bearReady) return this.steer3(w, { x: x + 5, y: waitY, z: aimZ }, { forward: 0.35, ...noRise });
      m.run = true;
      m.poolSince = undefined;
    }
    // From deep in the pool, climb toward the surface first (rising without bursting starts no leap).
    if (w.arena.surfaceY - b.pos.y > w.p.get('return.leapDepth') - 0.3 && x < (m.leapX ?? v.waveX) - 0.4) {
      return this.steer3(w, { x: x + 2, y: -0.5, z: aimZ }, { forward: 0.5, rise: true, dive: false });
    }
    const rise = x > (m.leapX ?? v.waveX) - 0.4;
    return this.steer3(w, { x: v.face, y: -0.5, z: aimZ }, { burst: true, rise, dive: false });
  }

  // ---------------------------------------------------------------- spawn

  private spawn(w: World): Intent {
    const s = this.skill;
    const st = spawnState(w);
    const fish = w.body.pos;
    const m = this.m as { judged?: Record<number, number> };

    // Bears: a shadow over a chosen fish, then a swipe at that spot.
    for (const bear of w.live('bear')) {
      if (bear.state !== 'warn' || !bear.home || !this.notice(w, bear)) continue;
      if (distXZ(bear.home, fish) > w.p.get('spawn.bearRadius') + s.margin) continue;
      const away = norm({ x: fish.x - bear.home.x || 0.5, y: 0, z: fish.z - bear.home.z });
      return this.steer(w, fish.x + away.x * 6, clamp(fish.z + away.z * 6 + (fish.z > 0 ? -2 : 2), -6, 6), { burst: this.canBurst(w) });
    }
    if (!st) return intent();

    if (st.role === 'female') {
      // Judge the gravel by cobble size, with some error.
      m.judged ??= {};
      let best: Entity | undefined;
      let bv = -Infinity;
      for (const g of w.live('gravelPatch')) {
        m.judged[g.id] ??= (g.value ?? 0) + this.rng.normal(0, s.judgeNoise);
        const v = m.judged[g.id] ?? 0;
        if (v > bv) {
          bv = v;
          best = g;
        }
      }
      const redd = w.live('redd')[0];
      const site = redd ?? best;
      for (const r of w.live('rival')) {
        if (r.state !== 'approach' || !this.notice(w, r)) continue;
        if (!st.spawned && !s.defendEarly) continue;
        if (site && dist(r.pos, site.pos) > 7) continue;
        const d = dist(r.pos, fish);
        return this.steer(w, r.pos.x, r.pos.z, { burst: d < w.p.get('spawn.chargeRadius') && this.canBurst(w) });
      }
      if (!site || st.spawned) return site ? this.steer(w, site.pos.x, site.pos.z, { forward: distXZ(site.pos, fish) > 1.5 ? 1 : 0, hold: true }) : intent();
      const d = distXZ(site.pos, fish);
      return d > 1.2 ? this.steer(w, site.pos.x, site.pos.z) : intent({ action: true, hold: true });
    }

    const female = w.live('female')[0];
    if (!female) return intent();
    if (st.role === 'largeMale') {
      const rival = w.live('rival').find((r) => r.state === 'approach' && this.notice(w, r));
      if (rival) {
        const close = dist(rival.pos, fish) < w.p.get('spawn.chargeRadius');
        if (s.sideOn) {
          // Meet him side-on, between him and the female.
          const tx = (rival.pos.x + female.pos.x) / 2;
          const tz = (rival.pos.z + female.pos.z) / 2 + 1.5;
          return this.steer(w, close ? rival.pos.x : tx, close ? rival.pos.z : tz, { burst: close });
        }
        return this.steer(w, rival.pos.x, rival.pos.z, { burst: close });
      }
      const d = distXZ(female.pos, fish);
      return d > 2.5 ? this.steer(w, female.pos.x - 1.5, female.pos.z) : intent({ hold: true });
    }

    // Jack: claim a spot (charging out a holder), dart in during the opening.
    const open = st.windowUntil > w.stageTime;
    if (open) {
      const m2 = this.m as { openSeen?: number; openAt?: number };
      if (m2.openAt !== st.windowUntil) {
        m2.openAt = st.windowUntil;
        m2.openSeen = w.stageTime;
      }
      if (w.stageTime - (m2.openSeen ?? 0) >= s.reaction) {
        const d = distXZ(female.pos, fish);
        return this.steer(w, female.pos.x, female.pos.z, { burst: this.canBurst(w), actionPressed: d < 2.2 });
      }
    }
    const spots = st.spots;
    const mine = st.owners.indexOf(0);
    const target = spots[mine >= 0 ? mine : 0];
    if (!target) return intent();
    const d = distXZ(target, fish);
    return d > 0.8 ? this.steer(w, target.x, target.z, { burst: mine < 0 && d < 1.3 }) : intent({ hold: true, burst: mine < 0 });
  }
}
