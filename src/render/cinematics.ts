/**
 * Cinematic camera moments: short framed shots at key points of a life
 * (hatching, the first look at the lake, the smolt run at night, the sea, the
 * maturation reveal, the river that smells of home, the spawning act).
 *
 * Render only: reads the world and moves the camera, never the sim. Which
 * events start a shot, once-per-fish and threat suppression are in
 * cinematicTriggers.ts (pure, unit tested); timing and framing in
 * cinematicsConfig.ts.
 *
 * Input during a shot: the simulation keeps running and the controls keep
 * working (a shot is short, and none plays while a threat is hot, so there
 * is nothing to pause for). A fresh key press or a click ends the shot with a
 * short blend back; a hot threat cuts straight back to the play camera.
 */
import * as THREE from 'three';
import { headingVec } from '../sim/vec';
import type { World } from '../sim/world';
import { access } from '../ui/accessibility';
import { CinematicDirector, threatHot, type MomentId, type ShotFrame } from './cinematicTriggers';
import { CINEMATICS } from './cinematicsConfig';

const SEEN_KEY = 'homewater.cinematics.seen';

function loadSeen(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function saveSeen(keys: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
  } catch {
    // Storage is optional.
  }
}

const v = () => new THREE.Vector3();
const fishV = v();
const ahead = v();
const side = v();
const tmp = v();
const tmp2 = v();
const UP = new THREE.Vector3(0, 1, 0);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);

export class Cinematics {
  readonly director = new CinematicDirector(loadSeen());
  /** Set by App each frame: the game is being played (not paused, not on a card). */
  running = true;
  private shot: ShotFrame | null = null;
  private bars: HTMLElement | null = null;
  private pos = v();
  private look = v();
  private worldRef: World | null = null;

  constructor() {
    this.director.onSeen = saveSeen;
    if (typeof window !== 'undefined') {
      const skip = () => this.director.skip(access().reducedMotion);
      window.addEventListener('keydown', (e) => !e.repeat && skip(), true);
      window.addEventListener('pointerdown', skip, true);
    }
  }

  /** The shot playing now, if any (tests and the debug panel). */
  get active(): MomentId | null {
    return this.director.current;
  }

  /** Sim events, as App receives them. */
  onEvents(events: readonly { type: string; key?: string }[], w: World | null): void {
    if (!w || !events.length) return;
    this.director.onEvents(events as never, { stageId: w.stageId, marker: w.checkpoint?.marker ?? 0, fishId: w.fish.id, stageKey: stageKey(w), enabled: access().cinematics });
  }

  /**
   * Blend the play camera (pos, look, already worked out) towards the shot.
   * Returns true while a shot is on screen, so the player's fish is drawn even in first person.
   */
  apply(w: World, frameDt: number, pos: THREE.Vector3, look: THREE.Vector3): boolean {
    if (this.worldRef !== w) {
      // A new life: whatever was queued belonged to the last one.
      this.worldRef = w;
      this.director.cancel();
    }
    const o = access();
    this.shot = this.director.update(frameDt, {
      fishId: w.fish.id,
      stageKey: stageKey(w),
      enabled: o.cinematics,
      playing: this.running && w.status === 'playing',
      threat: threatHot(w.entities) || w.status === 'dead',
      reducedMotion: o.reducedMotion,
    });
    const s = this.shot;
    this.letterbox(s ? s.weight : 0);
    if (!s || s.weight <= 0) return false;
    this.frame(w, s.moment, s.u);
    pos.lerp(this.pos, s.weight);
    look.lerp(this.look, s.weight);
    return true;
  }

  /** Work out the shot's camera position and target for progress u (0..1). */
  private frame(w: World, m: MomentId, u: number): void {
    const b = w.body;
    fishV.set(b.pos.x, b.pos.y, b.pos.z);
    const h = headingVec(b.yaw, 0);
    ahead.set(h.x, 0, h.z).normalize();
    side.crossVectors(ahead, UP).normalize();
    const s = b.scale;
    const e = smooth(u);
    const F = CINEMATICS.framing;
    const P = this.pos;
    const L = this.look;
    switch (m) {
      case 'hatch': {
        const f = F.hatch;
        const d = lerp(f.dollyFrom, f.dollyTo, e);
        P.copy(fishV).addScaledVector(side, f.side * d).addScaledVector(ahead, f.ahead * d);
        P.y = b.pos.y + f.up;
        L.copy(fishV);
        break;
      }
      case 'lakeFirstLook': {
        const f = F.lakeFirstLook;
        P.copy(fishV)
          .addScaledVector(ahead, -lerp(f.behindFrom, f.behindTo, e))
          .addScaledVector(side, f.sideTo * e);
        P.y = b.pos.y + lerp(f.upFrom, f.upTo, e);
        L.copy(fishV).addScaledVector(ahead, f.lookAhead * e + 0.5);
        L.y = b.pos.y + lerp(f.lookUpFrom, f.lookUpTo, e);
        break;
      }
      case 'smoltNight': {
        const f = F.smoltNight;
        // The school's centre near the player, so the shot holds the group, not one fish.
        tmp.copy(fishV);
        let n = 1;
        for (const e2 of w.entities) {
          if (!e2.alive || e2.kind !== 'smolt') continue;
          if (Math.hypot(e2.pos.x - b.pos.x, e2.pos.z - b.pos.z) > f.schoolRadius) continue;
          tmp.x += e2.pos.x;
          tmp.y += e2.pos.y;
          tmp.z += e2.pos.z;
          n++;
        }
        tmp.divideScalar(n);
        P.copy(tmp).addScaledVector(side, f.side).addScaledVector(ahead, lerp(f.trackFrom, f.trackTo, u));
        P.y = tmp.y + f.up;
        L.copy(tmp).addScaledVector(ahead, lerp(f.trackFrom, f.trackTo, u) * 0.6);
        break;
      }
      case 'sea': {
        const f = F.sea;
        const d = lerp(f.dollyFrom, f.dollyTo, e) * (0.6 + 0.4 * s);
        P.copy(fishV).addScaledVector(ahead, f.ahead * d).addScaledVector(side, f.side * d);
        P.y = b.pos.y - f.below * d;
        L.copy(fishV);
        L.y += 0.3 * s;
        break;
      }
      case 'maturation': {
        const f = F.maturation;
        const a = lerp(f.angleFrom, f.angleTo, e);
        const r = f.radius + f.radiusPerScale * s;
        P.copy(fishV)
          .addScaledVector(ahead, Math.cos(a) * r)
          .addScaledVector(side, Math.sin(a) * r);
        P.y = b.pos.y + f.up;
        L.copy(fishV);
        break;
      }
      case 'homeRiver': {
        const f = F.homeRiver;
        P.copy(fishV).addScaledVector(ahead, -lerp(f.behindFrom, f.behindTo, e));
        P.y = b.pos.y + lerp(f.upFrom, f.upTo, e);
        L.copy(fishV).addScaledVector(ahead, f.lookAhead * e + 1);
        L.y = b.pos.y + f.lookUp;
        break;
      }
      case 'spawning': {
        const f = F.spawning;
        // The pair: the player and the nearest mate (a male beside a female, a female for a male or jack).
        const mateKind = w.fish.sex === 'F' ? 'guardMale' : 'female';
        let mate: THREE.Vector3 | null = null;
        let best = Infinity;
        for (const e2 of w.entities) {
          if (!e2.alive || e2.kind !== mateKind) continue;
          const d = Math.hypot(e2.pos.x - b.pos.x, e2.pos.z - b.pos.z);
          if (d < best) {
            best = d;
            mate = tmp2.set(e2.pos.x, e2.pos.y, e2.pos.z);
          }
        }
        tmp.copy(fishV);
        if (mate && best < 6) tmp.add(mate).multiplyScalar(0.5);
        // Side-on to the pair's shared heading.
        const d = (f.distance + f.distancePerScale * s) * lerp(f.dollyFrom, f.dollyTo, e);
        P.copy(tmp).addScaledVector(side, d);
        P.y = tmp.y + f.up;
        L.copy(tmp);
        break;
      }
    }
    // Stay in the water, above the bottom, out of banks and walls and inside the arena:
    // where the planned spot is blocked, pull the camera in along the line to the fish.
    const a = w.arena;
    const floorClear = w.stageId === 'egg' ? CINEMATICS.gravelFloorClear : CINEMATICS.floorClear;
    const c = CINEMATICS.wallClear;
    const blocked = (x: number, y: number, z: number) =>
      x < a.min.x || x > a.max.x || z < a.min.z || z > a.max.z ||
      y < a.floor(x, z) + floorClear ||
      y > a.surfaceY - CINEMATICS.surfaceClear ||
      (a.walls ?? []).some((bx) => x > bx.min.x - c && x < bx.max.x + c && y > bx.min.y && y < bx.max.y && z > bx.min.z - c && z < bx.max.z + c);
    if (blocked(P.x, P.y, P.z)) {
      let lo = 0; // fraction of the way from the fish to P that is clear
      let hi = 1;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        tmp.lerpVectors(fishV, P, mid);
        if (blocked(tmp.x, tmp.y, tmp.z)) hi = mid;
        else lo = mid;
      }
      P.lerpVectors(fishV, P, lo);
    }
    P.y = Math.min(a.surfaceY - CINEMATICS.surfaceClear, Math.max(a.floor(P.x, P.z) + floorClear, P.y));
  }

  /** Letterbox bars, drawn under the HUD. Instant in reduced motion (the weight is 0 or 1 then). */
  private letterbox(weight: number): void {
    if (typeof document === 'undefined' || CINEMATICS.letterbox <= 0) return;
    if (!this.bars) {
      if (weight <= 0) return;
      const app = document.getElementById('app');
      if (!app) return;
      const bars = document.createElement('div');
      bars.id = 'cinema-bars';
      bars.setAttribute('aria-hidden', 'true');
      const pct = `${(CINEMATICS.letterbox * 100).toFixed(1)}%`;
      bars.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      for (const edge of ['top', 'bottom']) {
        const bar = document.createElement('div');
        bar.style.cssText = `position:absolute;left:0;right:0;${edge}:0;height:${pct};background:#000;`;
        bars.append(bar);
      }
      app.insertBefore(bars, document.getElementById('hud'));
      this.bars = bars;
    }
    this.bars.style.opacity = weight.toFixed(3);
    this.bars.dataset.moment = this.shot?.moment ?? '';
  }
}

function stageKey(w: World): string {
  return `${w.fish.id}:${w.stageIndex}`;
}
