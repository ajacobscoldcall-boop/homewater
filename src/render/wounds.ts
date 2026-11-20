/**
 * Wounds and senescence, derived for drawing. Pure TypeScript (no three.js,
 * no DOM): it reads the world and its events, never writes them.
 *
 * Wounds are not saved. They come from what the renderer sees happen: a
 * predator striking close without catching the fish, a fight on the grounds,
 * a hook torn loose, a squeeze through a gillnet (the sim's 'graze' event).
 * They belong to one fish: a sibling starts unmarked, and a reload starts clean.
 */
import { spawnState } from '../sim/stages/spawn';
import type { Entity, SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { GORE } from './goreConfig';

export type WoundKind = 'claw' | 'scrape' | 'net' | 'bite' | 'hook';
export const WOUND_KINDS: readonly WoundKind[] = ['claw', 'scrape', 'net', 'bite', 'hook'];

/**
 * A wound in the fish's own coordinates (about 1 unit long, snout at +0.5,
 * tail at -0.4, back towards +y; z is the side).
 */
export interface Wound {
  kind: WoundKind;
  x: number;
  y: number;
  /** +1 or -1 for one flank, 0 for marks that wrap round the body (nets, a bird's beak on the back). */
  side: number;
  /** Direction of the marks, radians in the x-y plane. */
  angle: number;
  /** Length or radius, in body units. */
  size: number;
  /** 0..1 how strongly it shows. */
  strength: number;
  /** 1 = raw and new, 0 = healed to a scar. */
  fresh: number;
}

/** A small deterministic hash to 0..1, so the same events give the same marks. */
export function hash01(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.floor(v * 1000) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100000) / 100000;
}

const strHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Where a wound of each kind lands on the body, from two random numbers and a side. */
export function placeWound(kind: WoundKind, a: number, b: number, side: number, strength: number): Wound {
  const lerp = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;
  switch (kind) {
    case 'claw':
      // Raking marks down and back across the upper flank.
      return { kind, x: lerp(-0.12, 0.18, a), y: lerp(0.0, 0.035, b), side, angle: lerp(-1.05, -0.6, b), size: lerp(0.13, 0.19, a), strength, fresh: 1 };
    case 'scrape':
      return { kind, x: lerp(-0.25, 0.22, a), y: lerp(-0.03, 0.05, b), side, angle: lerp(-0.4, 0.4, b), size: lerp(0.05, 0.085, a), strength, fresh: 1 };
    case 'net':
      // Gillnets catch behind the head, at the gill covers.
      return { kind, x: lerp(0.24, 0.29, a), y: 0, side: 0, angle: 0, size: lerp(0.008, 0.012, b), strength, fresh: 1 };
    case 'bite':
      return { kind, x: lerp(-0.18, 0.12, a), y: lerp(-0.02, 0.03, b), side, angle: lerp(-0.5, 0.5, b), size: lerp(0.05, 0.075, a), strength, fresh: 1 };
    case 'hook':
      // The corner of the mouth.
      return { kind, x: lerp(0.38, 0.4, a), y: lerp(-0.035, -0.02, b), side, angle: lerp(-0.3, 0.3, b), size: lerp(0.016, 0.022, a), strength, fresh: 1 };
  }
}

/** What each predator's hot state is, and its wound. */
const PREDATORS: Partial<Record<Entity['kind'], { hot: string; wound: WoundKind; scale: number }>> = {
  trout: { hot: 'chase', wound: 'scrape', scale: 0.7 },
  merganser: { hot: 'chase', wound: 'scrape', scale: 0.8 },
  seal: { hot: 'lunge', wound: 'bite', scale: 1 },
  // Orca teeth leave parallel rakes.
  orca: { hot: 'charge', wound: 'claw', scale: 1 },
  shark: { hot: 'charge', wound: 'bite', scale: 1 },
};

function catchRadius(w: World, e: Entity): number {
  const p = w.p;
  switch (e.kind) {
    case 'trout':
      return w.stageId === 'fry' ? p.get('fry.catchRadius') : GORE.near.charCatch;
    case 'merganser':
      return GORE.near.merganserCatch;
    case 'seal':
      return p.get(w.stageId === 'smolt' ? 'smolt.sealCatchRadius' : 'ocean.sealCatchRadius');
    case 'orca':
      return p.get('ocean.orcaCatchRadius');
    case 'shark':
      return p.get('ocean.sharkCatchRadius');
    default:
      return 1;
  }
}

const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const distXZ = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export class WoundTracker {
  wounds: Wound[] = [];
  private fishId = '';
  private world: World | null = null;
  private stageIndex = -1;
  private lastTime = 0;
  private states = new Map<number, string>();
  private marked = new Set<number>();
  private count = 0;
  /** Feel pass: counts marks made in play (near misses, fights, hooks, nets) so the camera and sound can react. */
  hits = 0;
  /** Strength (0..1) of the latest mark. */
  lastHit = 0;

  /** Follow the current fish: a new fish (a sibling, the next life) starts unmarked; a time skip heals. */
  private sync(w: World): void {
    if (w !== this.world || w.fish.id !== this.fishId) {
      this.world = w;
      this.fishId = w.fish.id;
      this.wounds = [];
      this.count = 0;
      this.stageIndex = w.stageIndex;
      this.lastTime = w.time;
      this.states.clear();
      this.marked.clear();
      return;
    }
    if (w.stageIndex !== this.stageIndex) {
      // Months or years pass between stages: raw wounds become scars, and young fish outgrow theirs.
      const juvenile = w.stageIndex <= 3;
      const k = juvenile ? GORE.wounds.juvenileScar : GORE.wounds.stageScar;
      for (const wd of this.wounds) {
        wd.fresh = 0;
        wd.strength *= k;
      }
      this.wounds = this.wounds.filter((wd) => wd.strength >= GORE.wounds.minStrength);
      this.stageIndex = w.stageIndex;
      this.lastTime = w.time;
      this.states.clear();
      this.marked.clear();
    }
  }

  /** Add a wound of a kind to the current fish. Public for playtest tools. */
  add(kind: WoundKind, strength = 1): Wound {
    const n = this.count++;
    const seed = strHash(this.fishId);
    const a = hash01(seed, n, 1);
    const b = hash01(seed, n, 2);
    const side = hash01(seed, n, 3) < 0.5 ? -1 : 1;
    const wd = placeWound(kind, a, b, side, clamp01(strength));
    this.wounds.push(wd);
    this.hits++;
    this.lastHit = clamp01(strength);
    if (this.wounds.length > GORE.wounds.max) {
      // Drop the faintest, oldest mark.
      let worst = 0;
      for (let i = 1; i < this.wounds.length; i++) {
        const s = this.wounds[i]!;
        const t = this.wounds[worst]!;
        if (s.strength * (0.5 + s.fresh) < t.strength * (0.5 + t.fresh)) worst = i;
      }
      this.wounds.splice(worst, 1);
    }
    return wd;
  }

  /** Marks that come from sim events: fights, a hook torn loose, a squeeze through a net. */
  onEvents(events: readonly SimEvent[], w: World): void {
    this.sync(w);
    for (const ev of events) {
      if (ev.type === 'graze' && ev.key === 'net') this.add('net', 0.9);
      else if (ev.type === 'caption' && ev.key === 'return.unhooked') this.add('hook', 1);
      else if (ev.type === 'caption' && ev.key === 'spawn.fightLost') this.add('bite', 1);
      else if (ev.type === 'caption' && (ev.key === 'spawn.fightWon' || ev.key === 'spawn.fightWonSide')) this.add('bite', 0.55);
    }
  }

  /** Once per frame: heal, and look for near misses. */
  update(w: World): void {
    this.sync(w);
    const dt = Math.max(0, w.time - this.lastTime);
    this.lastTime = w.time;
    for (const wd of this.wounds) wd.fresh = Math.max(0, wd.fresh - dt / GORE.wounds.healSeconds);
    const playing = w.status === 'playing';
    const fish = w.body.pos;
    const near = GORE.near;
    for (const e of w.entities) {
      if (!e.alive) continue;
      const prev = this.states.get(e.id);
      this.states.set(e.id, e.state);
      // A strike that killed is a death, not a wound.
      if (!playing || this.marked.has(e.id)) continue;
      const struck = e.state === 'strike' && prev !== undefined && prev !== 'strike';
      if (e.kind === 'bear' && struck) {
        const at = e.home ?? e.pos;
        const radius = w.p.get(w.stageId === 'spawn' ? 'spawn.bearRadius' : 'return.bearStrikeRadius');
        const d = distXZ(at, fish);
        if (d < radius * near.bearFactor) {
          this.marked.add(e.id);
          this.add('claw', 1 - 0.5 * clamp01(d / (radius * near.bearFactor)));
        }
      } else if (e.kind === 'birdShadow' && struck) {
        const d = distXZ(e.pos, fish);
        const reach = w.stageId === 'smolt' ? w.p.get('smolt.birdReachDepth') + near.birdDepthSlack : 0;
        if (d < e.radius * near.birdFactor && w.arena.surfaceY - fish.y < reach) {
          this.marked.add(e.id);
          const wd = this.add('scrape', 0.8);
          wd.side = 0;
          wd.y = 0.06;
        }
      } else {
        const pred = PREDATORS[e.kind];
        if (!pred || e.state !== pred.hot) continue;
        const r = catchRadius(w, e) * near.factor;
        const d = dist3(e.pos, fish);
        if (d < r) {
          this.marked.add(e.id);
          this.add(pred.wound, pred.scale * (1 - 0.5 * clamp01(d / r)));
        }
      }
    }
  }
}

/**
 * How worn the fish looks, 0..1: nothing until the spawning grounds, then
 * rising with time there, and faster once it has spawned. Advisor: fish stay
 * fit while migrating, then turn sluggish and ragged after weeks on the grounds.
 */
export function senescence(w: World): number {
  const s = spawnState(w);
  if (!s) return 0;
  const c = GORE.wear;
  // Wear follows the strength the sim drains on the grounds (it ends the stage), not the clock.
  const t = clamp01((1 - s.vigour) / Math.max(0.01, 1 - w.p.get('spawn.senescenceEnd')));
  let wear = c.arrive + (c.byEnd - c.arrive) * t;
  if (s.spawned && s.spawnedAt >= 0) wear += c.afterSpawn * clamp01((w.stageTime - s.spawnedAt) / c.afterSpawnSeconds);
  return clamp01(wear);
}

/**
 * Another fish on the grounds, fixed by its entity id: how its wear compares
 * with the player's (a factor around 1), and its old marks.
 */
export function otherFishLook(id: number, kind: Entity['kind']): { wearFactor: number; wounds: Wound[] } {
  const wearFactor = 1 + GORE.wear.othersSpread * (2 * hash01(id, 7) - 1);
  const male = kind === 'rival' || kind === 'guardMale';
  const n = Math.floor(hash01(id, 11) * (male ? 3 : 2));
  const wounds: Wound[] = [];
  for (let i = 0; i < n; i++) {
    const r = hash01(id, i, 13);
    const kindOf: WoundKind = male ? (r < 0.5 ? 'bite' : r < 0.8 ? 'scrape' : 'claw') : r < 0.6 ? 'scrape' : 'bite';
    const wd = placeWound(kindOf, hash01(id, i, 17), hash01(id, i, 19), hash01(id, i, 23) < 0.5 ? -1 : 1, 0.5 + 0.5 * hash01(id, i, 29));
    wd.fresh = 0.3 * hash01(id, i, 31);
    wounds.push(wd);
  }
  return { wearFactor, wounds };
}
