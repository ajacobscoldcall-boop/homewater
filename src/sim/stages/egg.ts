/**
 * Stage 1: egg and alevin in the gravel.
 * Advisor: eggs can do little; alevin orient into the current (positive
 * rheotaxis) to stay upright and keep oxygen flowing, and swim toward the
 * light as they prepare to feed.
 * - Face into the current (turn) so a flow surge doesn't wash you out of the gravel.
 * - Lower in the gravel is more sheltered from surges.
 * - When the yolk is nearly used, swim up toward the light and out of the gravel.
 */
import type { StageDef } from './index';
import { v3, wrapAngle } from '../vec';
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
}

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
    };
    w.stage = s as unknown as Record<string, unknown>;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      w.spawn('eggs', v3(Math.cos(a) * 0.5 + w.rng.range(-0.1, 0.1), -1.5, Math.sin(a) * 0.5), { radius: 0.12 });
    }
  },
  step(w, intent, dt) {
    const p = w.p;
    const s = st(w);
    const t = w.stageTime;

    if (s.phase === 'egg') {
      if (t >= p.get('alevin.eggPhase')) {
        s.phase = 'alevin';
        w.emit('caption', 'egg.hatch');
        for (const e of w.live('eggs')) if (w.rng.chance(0.5)) e.alive = false;
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

    // The flow: every so often it swings to a new direction, with a warning, then pulses hard.
    s.nextChange -= dt;
    if (s.nextChange <= 0 && s.warnLeft <= 0 && s.pulseLeft <= 0) {
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
      if (s.pulseLeft <= 0) s.nextChange = p.get('alevin.currentInterval') * w.rng.range(0.7, 1.3);
    }

    // Washout: facing away from the current during a pulse loosens the alevin.
    const upstream = wrapAngle(s.currentAngle + Math.PI);
    const misalign = Math.abs(wrapAngle(w.body.yaw - upstream));
    const tol = p.get('alevin.alignTolerance');
    const strength = (s.pulseLeft > 0 ? 1 : 0.15) * w.conditions.flow;
    const loose = Math.max(0, misalign - tol) / (Math.PI - tol);
    const shelter = 0.5 + 0.5 * s.height;
    if (loose > 0 && strength > 0.5) s.drift += p.get('alevin.driftRate') * strength * loose * shelter * dt;
    else s.drift = Math.max(0, s.drift - p.get('alevin.driftRecovery') * dt);
    if (s.drift > 0.5) w.emitOnce('caption', 'egg.loosening');
    if (s.drift >= 1) {
      w.die('scour');
      return;
    }

    // Rising before the yolk is used up leaves the alevin exposed to surges for longer.
    if (!s.ready && s.height > 0.6) w.emitOnce('caption', 'egg.tooEarly');

    if (!s.ready && w.progress.yolk <= p.get('alevin.readyYolk')) {
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
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.yolk = 0.1;
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
  };
}
