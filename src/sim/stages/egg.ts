/**
 * Stage 1: egg and alevin in the gravel.
 * Advisor: eggs can do little; alevin orient into the current (positive
 * rheotaxis) to stay upright and keep oxygen flowing, and swim toward the
 * light as they prepare to feed.
 * - Face into the current (turn) so a flow surge doesn't wash you out of the gravel.
 * - Lower in the gravel is more sheltered from surges.
 * - When the yolk is nearly used, swim up toward the light and out of the gravel.
 * - Once in each life a flood comes (advisor: scouring floods are the main
 *   killer of eggs). The water rises and clouds first; then the flow tears at
 *   the gravel for a few seconds. Facing upstream deep in the gravel rides it
 *   out. The brood-mates in the nest are washed out around the player, so the
 *   heavy loss of eggs and alevin is seen without being the player's fault.
 */
import { fillImprint, stepAlevinImprint } from '../imprint';
import type { StageDef } from './index';
import { v3, wrapAngle } from '../vec';
import type { Entity } from '../types';
import type { World } from '../world';

interface AlevinState {
  phase: 'egg' | 'alevin';
  /** Direction the water flows toward (radians, 0 = +x). */
  currentAngle: number;
  targetAngle: number;
  /** Seconds until the next flow change. */
  nextChange: number;
  /** Time left in the current warning (flow turning) and pulse (strong flow). */
  warnLeft: number;
  pulseLeft: number;
  /** 0 = deep in the gravel, 1 = at the top of the gravel. */
  height: number;
  exposure: number;
  drift: number;
  ready: boolean;
  /** The flood: 'none' before it, a long warning, the flood itself, then over. */
  flood: FloodPhase;
  /** Seconds left in the current flood phase (below zero once over). */
  floodLeft: number;
  /** Flood direction the flow settles on during the warning. */
  floodAngle: number;
  /** Brood-mates this flood takes, and how many it has taken so far. */
  floodTake: number;
  floodTaken: number;
  /** Seconds to the flood flow's next swing, and which side it swung to last. */
  gustLeft: number;
  gustSide: number;
  broodTotal: number;
  broodLost: number;
}

export type FloodPhase = 'none' | 'warning' | 'flood' | 'over';

const st = (w: World) => w.stage as unknown as AlevinState;

/** Daylight 0..1 from the stage clock; night is the last part of each cycle. */
export function daylight(w: World): number {
  const p = w.p;
  const period = p.get('alevin.dayLength');
  const night = p.get('alevin.nightFraction');
  const t = (w.stageTime % period) / period;
  const nightStart = 1 - night;
  const edge = 0.06;
  if (t < nightStart - edge) return 1;
  if (t < nightStart) return (nightStart - t) / edge;
  if (t > 1 - edge * 0.5) return (t - (1 - edge * 0.5)) / (edge * 0.5);
  return 0;
}

/** Wash out up to `chance` of the brood-mates left, the shallowest first in likelihood. */
function washBrood(w: World, s: AlevinState, chance: number): void {
  for (const b of w.live('brood')) {
    if (b.state !== 'hidden') continue;
    // Shallower alevin go first.
    if (w.rng.chance(chance * (1.5 - (b.value ?? 0.5)))) loseBrood(w, s, b);
  }
}

function loseBrood(w: World, s: AlevinState, b: Entity): void {
  const sp = 1.2 + w.rng.range(0, 0.8);
  b.state = 'washed';
  b.timer = 0;
  b.vel = v3(Math.cos(s.currentAngle) * sp, 0.6 + w.rng.range(0, 0.5), Math.sin(s.currentAngle) * sp);
  s.broodLost += 1;
}

/** Brood-mates face into the current like the player; washed-out ones tumble away downstream. */
function stepBrood(w: World, s: AlevinState, dt: number): void {
  const upstream = wrapAngle(s.currentAngle + Math.PI);
  for (const b of w.live('brood')) {
    if (b.state === 'hidden') {
      b.yaw = wrapAngle(b.yaw + wrapAngle(upstream - b.yaw) * Math.min(1, dt * 1.5));
      continue;
    }
    b.timer += dt;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.pos.z += b.vel.z * dt;
    b.vel.y *= Math.max(0, 1 - dt);
    b.yaw += dt * 7;
    if (Math.abs(b.pos.x) > 3.5 || Math.abs(b.pos.z) > 3.5 || b.pos.y > -0.1 || b.timer > 4) b.alive = false;
  }
}

/** The flood: a long warning (rising, clouding water), then a few seconds of scouring flow. */
function stepFlood(w: World, s: AlevinState, dt: number): void {
  const p = w.p;
  s.floodLeft -= dt;
  if (s.flood === 'none') {
    // Wait for any surge already under way to pass, so the two never overlap.
    if (w.progress.yolk > p.get('alevin.floodYolk') || s.warnLeft > 0 || s.pulseLeft > 0) return;
    s.flood = 'warning';
    s.floodLeft = p.get('alevin.floodWarning');
    s.floodAngle = wrapAngle(s.currentAngle + w.rng.range(-1.2, 1.2));
    w.emit('warning', 'flood');
    w.emit('caption', 'egg.floodComing');
    return;
  }
  if (s.flood === 'warning') {
    // The flow swings round to the flood's direction over the first half of the warning, then holds.
    const settle = Math.max(0.05, s.floodLeft - p.get('alevin.floodWarning') * 0.5);
    const k = Math.min(1, dt / settle);
    s.currentAngle = wrapAngle(s.currentAngle + wrapAngle(s.floodAngle - s.currentAngle) * k);
    if (s.floodLeft <= 0) {
      s.flood = 'flood';
      s.floodLeft = p.get('alevin.floodDuration');
      s.currentAngle = s.floodAngle;
      s.targetAngle = s.floodAngle;
      s.gustLeft = p.get('alevin.floodWobblePeriod') * w.rng.range(0.3, 0.8);
      // How many of the brood this flood takes depends on the year's water.
      const live = w.live('brood').filter((b) => b.state === 'hidden').length;
      s.floodTake = Math.min(live, Math.round(live * Math.min(1, p.get('alevin.broodFloodLoss') * w.conditions.flow)));
      w.emit('caption', 'egg.flood');
    }
    return;
  }
  if (s.flood === 'flood') {
    const dur = p.get('alevin.floodDuration');
    const into = dur - s.floodLeft;
    // The flood's flow wavers. Now and then it swings suddenly to one side of its direction, then the other: watch the flecks.
    s.gustLeft -= dt;
    if (s.gustLeft <= 0) {
      s.gustSide = s.gustSide > 0 ? -1 : 1;
      s.targetAngle = wrapAngle(s.floodAngle + s.gustSide * p.get('alevin.floodWobble') * w.rng.range(0.4, 1));
      s.gustLeft = p.get('alevin.floodWobblePeriod') * w.rng.range(0.5, 1.5);
    }
    s.currentAngle = wrapAngle(s.currentAngle + wrapAngle(s.targetAngle - s.currentAngle) * Math.min(1, dt / 0.25));
    // Take brood-mates spread across the flood.
    const due = Math.ceil(s.floodTake * Math.min(1, into / (dur * 0.85)));
    while (s.floodTaken < due) {
      const left = w.live('brood').filter((b) => b.state === 'hidden');
      if (!left.length) break;
      // The shallowest are torn out first, with some chance in it.
      left.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
      const pick = left[Math.min(left.length - 1, Math.floor(w.rng.next() * Math.min(3, left.length)))];
      if (pick) loseBrood(w, s, pick);
      s.floodTaken += 1;
    }
    if (s.floodLeft <= 0) {
      s.flood = 'over';
      s.nextChange = p.get('alevin.currentInterval') * 0.8;
      w.emit('caption', 'egg.floodOver', { lost: s.broodLost, total: s.broodTotal });
    }
  }
}

export const eggStage: StageDef = {
  id: 'egg',
  arena: () => ({
    kind: 'gravel',
    min: v3(-3, -2, -3),
    max: v3(3, 0, 3),
    surfaceY: 0,
    water: 'fresh',
    floor: () => -1.6,
    current: () => v3(0.3, 0, 0),
  }),
  init(w) {
    const p = w.p;
    w.body.pos = v3(0, -1.5, 0);
    w.body.scale = 0.35;
    const angle = w.rng.range(-Math.PI, Math.PI);
    // Start facing into the current.
    w.body.yaw = wrapAngle(angle + Math.PI);
    w.progress.yolk = 1;
    const s: AlevinState = {
      phase: 'egg',
      currentAngle: angle,
      targetAngle: angle,
      nextChange: p.get('alevin.eggPhase') + p.get('alevin.currentInterval') * 0.6,
      warnLeft: 0,
      pulseLeft: 0,
      height: 0,
      exposure: 0,
      drift: 0,
      ready: false,
      flood: 'none',
      floodLeft: 0,
      floodAngle: angle,
      floodTake: 0,
      floodTaken: 0,
      gustLeft: 0,
      gustSide: 1,
      broodTotal: 0,
      broodLost: 0,
    };
    w.stage = s as unknown as Record<string, unknown>;
    // The rest of the nest: a handful of the clutch, drawn around the player's egg.
    const n = p.get('alevin.broodCount');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + w.rng.range(-0.15, 0.15);
      const r = w.rng.range(0.45, 0.85);
      // value: how deep in the gravel it lies (1 = deepest, best sheltered).
      w.spawn('eggs', v3(Math.cos(a) * r, -1.52, Math.sin(a) * r), { radius: 0.12, value: w.rng.next() });
    }
    s.broodTotal = n;
  },
  step(w, intent, dt) {
    const p = w.p;
    const s = st(w);
    const t = w.stageTime;

    if (s.phase === 'egg') {
      if (t >= p.get('alevin.eggPhase')) {
        s.phase = 'alevin';
        w.emit('caption', 'egg.hatch');
        // The brood hatches with the player: each egg becomes an alevin in the gravel.
        for (const e of w.live('eggs')) {
          e.alive = false;
          const b = w.spawn('brood', v3(e.pos.x, e.pos.y, e.pos.z), { radius: 0.1, value: e.value ?? 0.5, state: 'hidden' });
          b.yaw = w.body.yaw + w.rng.range(-0.4, 0.4);
        }
      }
      return;
    }

    // Turning and rising cost a little yolk.
    const turn = intent.turn * p.get('swim.turnRate') * 0.8 * dt + intent.mouseX * p.get('swim.mouseSensitivity');
    w.body.yaw = wrapAngle(w.body.yaw + turn);
    const rise = (intent.rise ? 1 : 0) - (intent.dive ? 1 : 0);
    s.height = Math.min(1, Math.max(0, s.height + rise * p.get('alevin.riseRate') * dt));
    w.body.pos.y = -1.55 + 0.5 * s.height;
    const activity = Math.min(1, Math.abs(intent.turn) + Math.abs(intent.mouseX) * 0.05 + Math.abs(rise));
    w.progress.yolk -= (p.get('alevin.yolkRate') * w.conditions.temperature + p.get('alevin.activityYolk') * activity) * dt;

    stepFlood(w, s, dt);
    stepBrood(w, s, dt);
    const flooding = s.flood === 'warning' || s.flood === 'flood';

    // The flow: every so often it swings to a new direction, with a warning, then pulses hard.
    s.nextChange -= dt;
    if (!flooding && s.nextChange <= 0 && s.warnLeft <= 0 && s.pulseLeft <= 0) {
      const swing = w.rng.range(0.9, 2.4) * (w.rng.chance(0.5) ? 1 : -1);
      s.targetAngle = wrapAngle(s.currentAngle + swing);
      s.warnLeft = p.get('alevin.pulseWarning');
      w.emit('warning', 'flow');
      w.emitOnce('caption', 'egg.flow');
    }
    if (s.warnLeft > 0) {
      s.warnLeft -= dt;
      const k = Math.min(1, dt / Math.max(0.05, s.warnLeft + dt));
      s.currentAngle = wrapAngle(s.currentAngle + wrapAngle(s.targetAngle - s.currentAngle) * k);
      if (s.warnLeft <= 0) {
        s.currentAngle = s.targetAngle;
        s.pulseLeft = p.get('alevin.pulseDuration');
      }
    } else if (s.pulseLeft > 0) {
      s.pulseLeft -= dt;
      if (s.pulseLeft <= 0) {
        s.nextChange = p.get('alevin.currentInterval') * w.rng.range(0.7, 1.3);
        // A surge now and then loosens a shallow brood-mate.
        washBrood(w, s, p.get('alevin.broodPulseLoss'));
      }
    }

    // Washout: facing away from the current during a pulse loosens the alevin.
    const upstream = wrapAngle(s.currentAngle + Math.PI);
    const misalign = Math.abs(wrapAngle(w.body.yaw - upstream));
    // The flood is harder to hold against: a smaller error is enough to be worked loose.
    const tol = p.get(s.flood === 'flood' ? 'alevin.floodTolerance' : 'alevin.alignTolerance');
    const surge = s.flood === 'flood' ? p.get('alevin.floodStrength') : s.pulseLeft > 0 ? 1 : 0.15;
    const strength = surge * w.conditions.flow;
    const loose = Math.max(0, misalign - tol) / (Math.PI - tol);
    stepAlevinImprint(w, misalign <= tol, dt);
    const shelter = 0.5 + 0.5 * s.height;
    let rate = loose > 0 && strength > 0.5 ? p.get('alevin.driftRate') * strength * loose * shelter : 0;
    // In the flood the top of the gravel itself is scoured: only deep down is safe, however well you face.
    if (s.flood === 'flood') {
      const safe = p.get('alevin.floodSafeHeight');
      rate += p.get('alevin.floodScour') * w.conditions.flow * Math.max(0, s.height - safe) / Math.max(0.05, 1 - safe);
    }
    if (rate > 0) s.drift += rate * dt;
    else s.drift = Math.max(0, s.drift - p.get('alevin.driftRecovery') * dt);
    if (s.drift > 0.5) w.emitOnce('caption', 'egg.loosening');
    if (s.drift >= 1) {
      w.die('scour');
      return;
    }

    // Rising before the yolk is used up leaves the alevin exposed to surges for longer.
    if (!s.ready && s.height > 0.6) w.emitOnce('caption', 'egg.tooEarly');

    // Not while a flood is coming or under way: the guide would be sending the fish up into it.
    if (!s.ready && !flooding && w.progress.yolk <= p.get('alevin.readyYolk')) {
      s.ready = true;
      w.emit('caption', 'egg.ready');
    }
    if (s.ready && s.height >= 0.95) {
      w.progress.yolk = Math.max(0, w.progress.yolk);
      w.emit('caption', 'egg.emerge');
      w.completeStage();
      return;
    }
    if (w.progress.yolk < -0.25) w.die('yolk');
  },
  debugComplete(w) {
    w.progress.yolk = 0.1;
    fillImprint(w, 'egg');
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.yolk = 0.1;
    fillImprint(w, 'egg');
  },
};

export interface AlevinView {
  phase: 'egg' | 'alevin';
  light: number;
  currentAngle: number;
  warning: boolean;
  pulse: boolean;
  height: number;
  exposure: number;
  drift: number;
  ready: boolean;
  flood: FloodPhase;
  /** 0..1 how high and muddy the water is: rises through the warning, full in the flood, then clears. */
  floodLevel: number;
  broodLost: number;
  broodTotal: number;
}

/** 0..1 flood water level for the view (render and audio only). */
function floodLevel(w: World, s: AlevinState): number {
  const p = w.p;
  if (s.flood === 'warning') return 0.25 + 0.5 * (1 - s.floodLeft / Math.max(0.1, p.get('alevin.floodWarning')));
  if (s.flood === 'flood') return 1;
  if (s.flood === 'over') return Math.max(0, 1 + s.floodLeft / 4);
  return 0;
}

export function alevinView(w: World): AlevinView | null {
  if (w.stageId !== 'egg') return null;
  const s = st(w);
  return {
    phase: s.phase,
    light: daylight(w),
    currentAngle: s.currentAngle,
    warning: s.warnLeft > 0,
    pulse: s.pulseLeft > 0,
    height: s.height,
    exposure: s.exposure,
    drift: s.drift,
    ready: s.ready,
    flood: s.flood,
    floodLevel: floodLevel(w, s),
    broodLost: s.broodLost,
    broodTotal: s.broodTotal,
  };
}
