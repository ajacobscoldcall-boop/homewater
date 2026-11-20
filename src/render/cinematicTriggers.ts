/**
 * Cinematic moments: which sim events start a shot, when a shot is held back,
 * and the shot's timeline. Pure TypeScript (no three.js, no DOM), unit tested
 * in tests/unit/cinematics.test.ts. cinematics.ts does the camera work.
 *
 * Rules:
 * - Each moment plays at most once per fish (keyed by fish id and moment).
 * - Never while a threat is hot (an attack, a chase, a hooked lure, a fight
 *   beside the female): a moment that arrives then waits up to
 *   `pendingWindow` seconds for the threat to clear, then is dropped. A shot
 *   that is playing when a threat turns hot cuts straight back.
 * - The simulation keeps running and the controls keep working during a shot;
 *   a fresh key press or a click ends it early with a short blend back.
 * - Reduced motion: the camera cuts in and out and holds still (no moves).
 */
import type { Entity, SimEvent, StageId } from '../sim/types';
import { CINEMATICS, type MomentId } from './cinematicsConfig';

export type { MomentId } from './cinematicsConfig';

/** Entity states that put a hot threat marker on screen (matches App's threat markers). */
export const HOT_STATES: ReadonlySet<string> = new Set(['chase', 'strike', 'lunge', 'charge', 'dive', 'hooked']);
/** Kinds that can threaten the player. */
const THREAT_KINDS: ReadonlySet<string> = new Set(['lure', 'shark', 'trout', 'birdShadow', 'merganser', 'seal', 'orca', 'bear', 'rival']);

/** What the trigger logic needs to know about the world when an event arrives. */
export interface EventContext {
  stageId: StageId;
  /** Checkpoint marker the stage was started from (0 = the stage's real start). */
  marker: number;
}

/** The moment a sim event starts, if any. */
export function momentFor(ev: SimEvent, ctx: EventContext): MomentId | null {
  if (ev.type === 'spawned') return 'spawning';
  if (ev.type === 'reveal') return ctx.stageId === 'ocean' ? 'maturation' : null;
  if (ev.type !== 'caption' || !ev.key) return null;
  switch (ev.key) {
    case 'egg.hatch':
      return 'hatch';
    // The lake's opening caption; resuming at a later lake checkpoint (winter, second summer) isn't a first look.
    case 'fry.intro':
      return ctx.marker === 0 ? 'lakeFirstLook' : null;
    case 'smolt.intro':
      return 'smoltNight';
    case 'ocean.intro':
      return ctx.marker === 0 ? 'sea' : null;
    case 'return.rightRiver':
      return 'homeRiver';
    default:
      return null;
  }
}

/** True when a threat marker would be hot: something is attacking, chasing, hooked or fighting. */
export function threatHot(entities: readonly Pick<Entity, 'kind' | 'state' | 'alive' | 'value'>[]): boolean {
  for (const e of entities) {
    if (!e.alive || !THREAT_KINDS.has(e.kind)) continue;
    if (e.kind === 'trout' && e.state === 'chase' && e.value) continue; // chasing a school-mate, not the player
    if (HOT_STATES.has(e.state)) return true;
    if (e.kind === 'rival' && e.state === 'fight') return true;
  }
  return false;
}

/** Eased 0..1 blend for time t in a shot: smoothstep in, hold, smoothstep out. */
export function shotWeight(t: number, duration: number, easeIn: number, easeOut: number): number {
  if (t <= 0 || t >= duration) return 0;
  const ss = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  };
  const a = easeIn > 0 ? ss(t / easeIn) : 1;
  const b = easeOut > 0 ? ss((duration - t) / easeOut) : 1;
  return Math.min(a, b);
}

/** Per-frame facts from the renderer and App. */
export interface FrameContext {
  /** The player's fish (moments are once per fish). */
  fishId: string;
  /** World and stage the shot belongs to; a change ends it. */
  stageKey: string;
  /** Cinematic moments setting. */
  enabled: boolean;
  /** The game is being played (not paused, not on a card, the fish alive). */
  playing: boolean;
  threat: boolean;
  reducedMotion: boolean;
}

/** What the camera should do this frame. */
export interface ShotFrame {
  moment: MomentId;
  /** 0..1 how much of the shot camera to use. */
  weight: number;
  /** 0..1 progress through the move (fixed in reduced motion). */
  u: number;
}

interface Active {
  moment: MomentId;
  stageKey: string;
  t: number;
  duration: number;
  easeIn: number;
  easeOut: number;
}

interface Pending {
  moment: MomentId;
  fishId: string;
  stageKey: string;
  age: number;
}

const seenKey = (fishId: string, m: MomentId) => `${fishId}:${m}`;

/** The shot timeline: queues moments from events, starts, ends and skips shots. */
export class CinematicDirector {
  private seen: string[] = [];
  private seenSet = new Set<string>();
  private pending: Pending | null = null;
  private active: Active | null = null;
  /** Called when a fish-and-moment pair is used up, so it can be remembered across loads. */
  onSeen: (keys: string[]) => void = () => undefined;

  constructor(remembered: readonly string[] = []) {
    for (const k of remembered) this.remember(k, false);
  }

  get current(): MomentId | null {
    return this.active?.moment ?? null;
  }

  get queued(): MomentId | null {
    return this.pending?.moment ?? null;
  }

  hasSeen(fishId: string, m: MomentId): boolean {
    return this.seenSet.has(seenKey(fishId, m));
  }

  private remember(key: string, notify = true): void {
    if (this.seenSet.has(key)) return;
    this.seenSet.add(key);
    this.seen.push(key);
    while (this.seen.length > CINEMATICS.rememberMax) this.seenSet.delete(this.seen.shift()!);
    if (notify) this.onSeen([...this.seen]);
  }

  /** Feed sim events. Returns the moment queued, if any. */
  onEvents(events: readonly SimEvent[], ctx: EventContext & { fishId: string; stageKey: string; enabled: boolean }): MomentId | null {
    if (!ctx.enabled) return null;
    let queued: MomentId | null = null;
    for (const ev of events) {
      const m = momentFor(ev, ctx);
      if (!m || this.hasSeen(ctx.fishId, m) || this.active?.moment === m) continue;
      this.pending = { moment: m, fishId: ctx.fishId, stageKey: ctx.stageKey, age: 0 };
      queued = m;
    }
    return queued;
  }

  /** A fresh key press or click: end the shot with a short blend back. */
  skip(reducedMotion = false): boolean {
    const a = this.active;
    this.pending = null;
    if (!a) return false;
    if (reducedMotion) {
      this.active = null;
      return true;
    }
    const w = shotWeight(a.t, a.duration, a.easeIn, a.easeOut);
    // Continue from the point in a short ease-out that has the same weight, so the camera doesn't jump.
    const out = CINEMATICS.skipEaseOut;
    const x = 0.5 - Math.sin(Math.asin(1 - 2 * Math.min(1, Math.max(0, w))) / 3); // inverse smoothstep
    a.easeOut = out;
    a.duration = Math.min(a.duration, a.t + out * x);
    if (a.t >= a.duration) this.active = null;
    return true;
  }

  /** Drop everything (a new life, the setting turned off). */
  cancel(): void {
    this.active = null;
    this.pending = null;
  }

  /** Advance by real seconds dt; returns the shot to frame, or null for the play camera. */
  update(dt: number, ctx: FrameContext): ShotFrame | null {
    if (!ctx.enabled) {
      this.cancel();
      return null;
    }
    const a = this.active;
    if (a) {
      // A hot threat, a stage change or death cuts straight back to the play camera.
      if (ctx.threat || a.stageKey !== ctx.stageKey) {
        this.active = null;
      } else if (ctx.playing) {
        // Paused or on a card, the shot holds.
        a.t += dt;
        if (a.t >= a.duration) this.active = null;
      }
    }
    const p = this.pending;
    if (!this.active && p) {
      if (p.stageKey !== ctx.stageKey || p.fishId !== ctx.fishId || this.hasSeen(p.fishId, p.moment)) {
        this.pending = null;
      } else if (ctx.playing) {
        if (!ctx.threat) {
          const timing = CINEMATICS.shots[p.moment];
          this.active = { moment: p.moment, stageKey: p.stageKey, t: 0, ...timing };
          this.pending = null;
          this.remember(seenKey(p.fishId, p.moment));
        } else {
          p.age += dt;
          if (p.age > CINEMATICS.pendingWindow) this.pending = null;
        }
      }
    }
    const s = this.active;
    if (!s) return null;
    if (ctx.reducedMotion) {
      // Cut in, hold still, cut out.
      const on = s.t >= 0 && s.t < s.duration;
      return on ? { moment: s.moment, weight: 1, u: 0.5 } : null;
    }
    return { moment: s.moment, weight: shotWeight(s.t, s.duration, s.easeIn, s.easeOut), u: Math.min(1, s.t / s.duration) };
  }
}
