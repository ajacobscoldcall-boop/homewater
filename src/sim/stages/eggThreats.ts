/**
 * The egg stage's threats besides the flood (Track 2.5): water moving through
 * the gravel, a low-oxygen pocket, fine silt and a sculpin probing the gravel.
 * Pure rules over the egg stage's scratch; egg.ts hooks them in (init, step,
 * the view). Parameters are `alevin.*`; the biology behind each one and what is
 * a game device are in docs/ADVISOR_NOTES.md ("Open questions from the egg
 * threats stream").
 *
 * - Flow: water seeps through the gravel everywhere until something stops it.
 *   `gravelFlow` gives how freely it moves at a point (0..1); the renderer moves
 *   the flecks by it, so the player can see where the water still moves.
 * - Oxygen: the water around the alevin holds oxygen while it moves; where it
 *   stops, the oxygen falls over a few seconds (`alevin.o2LossTime`). Below
 *   `alevin.o2Low` the alevin weakens (`w.body.energy`, unused otherwise in this
 *   stage, so the heartbeat and the weak vignette follow it); moving water
 *   restores it. At zero it is smothered (death cause `silt`).
 * - The low-oxygen pocket: the water around the alevin stops moving. Crawl
 *   (forward) out to where the flecks still move.
 * - Silt: after the flood, fine sediment clouds the water, then settles and
 *   clogs the gravel. Water still moves in the gaps beside the large stones,
 *   each at its own height (deep under some, higher beside others).
 * - The sculpin: a bottom fish that noses into the gravel at one spot after
 *   another. Movement draws it and an alevin high in the gravel is easy to
 *   find; one that keeps still, deep and close against a large stone is not.
 *
 * Events come one at a time from a queue planned when the stage starts: all of
 * them in a first life; in later lives the flood and one other.
 */
import { Rng } from '../rng';
import type { Entity } from '../types';
import { clamp, distXZ, v3, wrapAngle } from '../vec';
import type { World } from '../world';

export type EggThreat = 'pocket' | 'sculpin' | 'flood' | 'silt';

/** A large stone in the redd: water keeps moving in the gap beside it at height `gap` (0 deep .. 1 top of the gravel). */
export interface Stone {
  x: number;
  z: number;
  r: number;
  gap: number;
}

export type PocketPhase = 'none' | 'forming' | 'still' | 'clearing' | 'over';
export type SiltPhase = 'none' | 'warning' | 'settling' | 'settled' | 'clearing' | 'over';

export interface EggThreatState {
  stones: Stone[];
  /** Events still to come; the head is the next one (or the one under way). */
  queue: EggThreat[];
  active: EggThreat | null;
  pocket: { phase: PocketPhase; left: number; x: number; z: number; level: number };
  silt: { phase: SiltPhase; left: number; level: number };
  sculpin: { notice: number; probes: number; warned: boolean; near: boolean; fed: boolean };
  /** Oxygen in the water around the alevin, 0..1. */
  o2: number;
  /** How much the alevin has been moving lately, 0..1 (the sculpin senses it). */
  activity: number;
  /** The alevin has been weak from low oxygen (for the recovery caption). */
  weakened: boolean;
}

/** Where the alevin can be: a disk around the nest, outside the large stones. */
const FISH_R = 0.06;

/** Height in the gravel (0 deep .. 1 top) of a point in the egg arena. */
export function gravelHeight(y: number): number {
  return clamp((y + 1.55) / 0.5, 0, 1);
}

/** The large stones, laid out from a copy of the world's random state (no numbers are drawn from the world's stream). */
export function layStones(w: World): Stone[] {
  const p = w.p;
  const r = new Rng((w.rng.state ^ 0x9e3779b9) >>> 0);
  const n = Math.round(p.get('alevin.stoneCount'));
  const out: Stone[] = [];
  const inner = p.get('alevin.stoneInner');
  const outer = p.get('alevin.crawlRadius') - 0.1;
  const start = r.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const a = start + (i / n) * Math.PI * 2 + r.range(-0.35, 0.35);
      const d = r.range(inner, outer);
      // Alternate stones keep their gap open low in the gravel and higher up, so both are always somewhere.
      const gap = i % 2 === 0 ? p.get('alevin.gapLow') : p.get('alevin.gapHigh');
      const s: Stone = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: r.range(p.get('alevin.stoneMinR'), p.get('alevin.stoneMaxR')), gap: gap + r.range(-0.08, 0.08) };
      if (out.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < o.r + s.r + p.get('alevin.stoneSpacing'))) continue;
      out.push(s);
      break;
    }
  }
  return out;
}

/** The events this life's egg stage will bring, in order. */
export function planThreats(w: World): EggThreat[] {
  if (w.firstLife) return ['pocket', 'sculpin', 'flood', 'silt'];
  const r = new Rng((w.rng.state ^ 0x85ebca6b) >>> 0);
  const extra = (['pocket', 'sculpin', 'silt'] as const)[r.int(0, 3)] ?? 'pocket';
  return extra === 'silt' ? ['flood', 'silt'] : [extra, 'flood'];
}

export function newThreatState(w: World): EggThreatState {
  return {
    stones: layStones(w),
    queue: planThreats(w),
    active: null,
    pocket: { phase: 'none', left: 0, x: 0, z: 0, level: 0 },
    silt: { phase: 'none', left: 0, level: 0 },
    sculpin: { notice: 0, probes: 0, warned: false, near: false, fed: false },
    o2: 1,
    activity: 0,
    weakened: false,
  };
}

/** Yolk left when each event may begin. */
function triggerYolk(w: World, k: EggThreat): number {
  const id = k === 'pocket' ? 'alevin.pocketYolk' : k === 'sculpin' ? 'alevin.sculpinYolk' : k === 'flood' ? 'alevin.floodYolk' : 'alevin.siltYolk';
  return w.p.get(id);
}

/** Whether event `k` may begin now: it is next, its time has come, and nothing else (a surge included) is under way. */
export function canStart(w: World, t: EggThreatState, k: EggThreat, surging: boolean): boolean {
  return t.active === null && t.queue[0] === k && !surging && w.progress.yolk <= triggerYolk(w, k);
}

export function begin(t: EggThreatState, k: EggThreat): void {
  t.active = k;
}

export function finish(t: EggThreatState, k: EggThreat): void {
  if (t.active !== k) return;
  t.active = null;
  if (t.queue[0] === k) t.queue.shift();
}

/** In later lives the pocket, the silt and the sculpin's search are shorter. */
function laterScale(w: World): number {
  return w.firstLife ? 1 : w.p.get('alevin.threatLaterScale');
}

/** 0..1 how open the gap beside a large stone is at a point (1 right beside it at its gap height). */
function channel(w: World, t: EggThreatState, x: number, z: number, h: number): number {
  const p = w.p;
  const gw = p.get('alevin.gapWidth');
  const gh = p.get('alevin.gapHeight');
  let best = 0;
  for (const s of t.stones) {
    const d = Math.hypot(x - s.x, z - s.z) - s.r;
    const across = clamp(1 - d / gw, 0, 1);
    if (across <= 0) continue;
    const up = Math.exp(-(((h - s.gap) / gh) ** 2));
    best = Math.max(best, across * up);
  }
  return best;
}

/** 0..1 how close against a large stone the alevin lies (the sculpin can't get its head in there). */
export function stoneCover(t: EggThreatState, x: number, z: number, reach: number): number {
  // Full cover within the first third of the reach, fading to none at its end.
  let best = 0;
  for (const s of t.stones) best = Math.max(best, clamp(1 - (Math.hypot(x - s.x, z - s.z) - s.r - reach / 3) / ((reach * 2) / 3), 0, 1));
  return best;
}

/** How freely water moves through the gravel at a point (0 still .. 1 seeping freely). Render reads this for the flecks. */
export function gravelFlow(w: World, t: EggThreatState, x: number, z: number, h: number): number {
  let f = 1;
  if (t.silt.level > 0) {
    const clog = 1 - t.silt.level * (1 - w.p.get('alevin.siltResidual'));
    f = Math.max(clog, Math.min(1, channel(w, t, x, z, h) * 1.15));
  }
  if (t.pocket.level > 0) {
    const r = w.p.get('alevin.pocketRadius');
    const d = Math.hypot(x - t.pocket.x, z - t.pocket.z);
    const inside = clamp((r - d) / (r * 0.3), 0, 1);
    f *= 1 - t.pocket.level * inside;
  }
  return f;
}

/** Oxygen the water at a point can hold for the alevin (0..1), from how freely it moves. */
export function oxygenFor(w: World, flow: number): number {
  return clamp(flow / w.p.get('alevin.o2FlowFull'), 0, 1);
}

/**
 * Crawling: forward moves the alevin along its heading through the gaps, slower when weak; it can't pass through
 * the large stones or leave the nest's hollow. Returns how hard it moved (0..1).
 */
export function crawl(w: World, t: EggThreatState, forward: number, dt: number): number {
  const p = w.p;
  const f = clamp(forward, 0, 1);
  if (f <= 0) return 0;
  const b = w.body;
  const v = p.get('alevin.crawlSpeed') * f * (0.4 + 0.6 * clamp(b.energy, 0, 1));
  let x = b.pos.x + Math.cos(b.yaw) * v * dt;
  let z = b.pos.z + Math.sin(b.yaw) * v * dt;
  for (const s of t.stones) {
    const dx = x - s.x;
    const dz = z - s.z;
    const d = Math.hypot(dx, dz);
    const min = s.r + FISH_R;
    if (d < min && d > 1e-6) {
      x = s.x + (dx / d) * min;
      z = s.z + (dz / d) * min;
    }
  }
  const rr = Math.hypot(x, z);
  const max = p.get('alevin.crawlRadius');
  if (rr > max) {
    x *= max / rr;
    z *= max / rr;
  }
  b.pos.x = x;
  b.pos.z = z;
  return f;
}

/** Smoothed movement: crawling, rising and diving count fully, turning less. */
export function stepActivity(w: World, t: EggThreatState, now: number, dt: number): void {
  const k = Math.min(1, dt / w.p.get('alevin.activityTime'));
  t.activity += (clamp(now, 0, 1) - t.activity) * k;
}

/** The oxygen in the water around the alevin, and what it does to the alevin's strength. */
export function stepOxygen(w: World, t: EggThreatState, dt: number): void {
  const p = w.p;
  const b = w.body;
  const target = oxygenFor(w, gravelFlow(w, t, b.pos.x, b.pos.z, gravelHeight(b.pos.y)));
  // Still water loses its oxygen over a few seconds; moving water brings it back quickly.
  const tau = target < t.o2 ? p.get('alevin.o2LossTime') : p.get('alevin.o2GainTime');
  t.o2 += (target - t.o2) * Math.min(1, dt / tau);
  const low = p.get('alevin.o2Low');
  if (t.o2 < low) {
    b.energy -= p.get('alevin.o2Drain') * ((low - t.o2) / low) * dt;
    if (b.energy < 0.85 && !t.weakened) {
      t.weakened = true;
      w.emitOnce('caption', 'egg.gasping');
    }
  } else {
    b.energy = Math.min(1, b.energy + p.get('alevin.o2Recover') * dt);
    if (t.weakened && b.energy >= 0.99) {
      t.weakened = false;
      w.emitOnce('caption', 'egg.breathing');
    }
  }
  if (b.energy <= 0) {
    b.energy = 0;
    w.die('silt');
  }
}

// ------------------------------------------------------------------ the pocket

export function stepPocket(w: World, t: EggThreatState, dt: number, surging: boolean): void {
  const p = w.p;
  const k = t.pocket;
  if (k.phase === 'none') {
    if (!canStart(w, t, 'pocket', surging)) return;
    begin(t, 'pocket');
    // The water around the alevin, wherever it lies now, stops moving.
    k.phase = 'forming';
    k.left = p.get('alevin.pocketWarning');
    k.x = w.body.pos.x;
    k.z = w.body.pos.z;
    w.emit('warning', 'pocket');
    w.emit('caption', 'egg.pocket');
    return;
  }
  if (k.phase === 'over') return;
  k.left -= dt;
  if (k.phase === 'forming') {
    k.level = clamp(1 - k.left / p.get('alevin.pocketWarning'), 0, 1);
    if (k.left <= 0) {
      k.phase = 'still';
      k.level = 1;
      k.left = p.get('alevin.pocketDuration') * laterScale(w);
    }
  } else if (k.phase === 'still') {
    if (k.left <= 0) {
      k.phase = 'clearing';
      k.left = p.get('alevin.pocketClear');
    }
  } else if (k.phase === 'clearing') {
    k.level = clamp(k.left / p.get('alevin.pocketClear'), 0, 1);
    if (k.left <= 0) {
      k.phase = 'over';
      k.level = 0;
      finish(t, 'pocket');
    }
  }
}

// ------------------------------------------------------------------ silt

export function stepSilt(w: World, t: EggThreatState, dt: number, surging: boolean, smother: (b: Entity) => void): void {
  const p = w.p;
  const s = t.silt;
  if (s.phase === 'none') {
    if (!canStart(w, t, 'silt', surging)) return;
    begin(t, 'silt');
    s.phase = 'warning';
    s.left = p.get('alevin.siltWarning');
    w.emit('warning', 'silt');
    w.emit('caption', 'egg.siltComing');
    return;
  }
  if (s.phase === 'over') return;
  s.left -= dt;
  if (s.phase === 'warning') {
    if (s.left <= 0) {
      s.phase = 'settling';
      s.left = p.get('alevin.siltSettle');
      w.emit('caption', 'egg.silt');
    }
  } else if (s.phase === 'settling') {
    s.level = clamp(1 - s.left / p.get('alevin.siltSettle'), 0, 1);
    if (s.left <= 0) {
      s.phase = 'settled';
      s.level = 1;
      s.left = p.get('alevin.siltDuration') * laterScale(w);
    }
  } else if (s.phase === 'settled') {
    // Brood-mates where the water has stopped are smothered, a few at a time.
    const chance = p.get('alevin.siltBroodLoss') * dt;
    for (const b of w.live('brood')) {
      if (b.state !== 'hidden') continue;
      if (gravelFlow(w, t, b.pos.x, b.pos.z, 1 - (b.value ?? 0.5)) >= p.get('alevin.o2FlowFull') * p.get('alevin.o2Low')) continue;
      if (w.rng.chance(chance)) smother(b);
    }
    if (s.left <= 0) {
      s.phase = 'clearing';
      s.left = p.get('alevin.siltClear');
    }
  } else if (s.phase === 'clearing') {
    s.level = clamp(s.left / p.get('alevin.siltClear'), 0, 1);
    if (s.left <= 0) {
      s.phase = 'over';
      s.level = 0;
      finish(t, 'silt');
      const left = w.live('brood').filter((b) => b.state === 'hidden').length;
      w.emit('caption', 'egg.siltOver', { left, total: Math.round(p.get('alevin.broodCount')) });
    }
  }
}

/** 0..1 how much fine silt hangs in the water (render: cloud and falling specks): rising through the warning, thinning as it settles in. */
export function siltCloud(w: World, t: EggThreatState): number {
  const p = w.p;
  const s = t.silt;
  if (s.phase === 'warning') return 0.7 * clamp(1 - s.left / p.get('alevin.siltWarning'), 0, 1);
  if (s.phase === 'settling') return 0.7 + 0.3 * s.level;
  if (s.phase === 'settled') return 0.75;
  if (s.phase === 'clearing') return 0.75 * s.level;
  return 0;
}

/** The top of the gravel, where the sculpin lies between probes. */
export const SCULPIN_TOP = -1.0;

// ------------------------------------------------------------------ the sculpin

const TOP_Y = SCULPIN_TOP;
/** How far out it comes in from and leaves to. */
const EDGE = 2.6;

/** How easy the alevin is for a probing sculpin to find: movement, height in the gravel and lying in the open, much less close against a large stone. */
export function sculpinExposure(w: World, t: EggThreatState): number {
  const p = w.p;
  const h = gravelHeight(w.body.pos.y);
  const safe = p.get('alevin.sculpinSafeHeight');
  // Even a still alevin deep in the open gravel can be found; close against a large stone it is out of reach.
  const raw = p.get('alevin.sculpinMoveWeight') * t.activity + p.get('alevin.sculpinHeightWeight') * Math.max(0, h - safe) / (1 - safe) + p.get('alevin.sculpinOpenWeight');
  const cover = stoneCover(t, w.body.pos.x, w.body.pos.z, p.get('alevin.sculpinCoverReach'));
  return raw * (1 - p.get('alevin.sculpinCover') * cover);
}

/** Where the sculpin probes next: at the alevin if it is moving, else somewhere near it among the brood. */
function nextSpot(w: World, t: EggThreatState, first: boolean): { x: number; z: number } {
  const p = w.p;
  const fish = w.body.pos;
  const drawn = t.activity > p.get('alevin.sculpinDrawn');
  const spread = first ? p.get('alevin.sculpinFirstSpread') : drawn ? 0.15 : p.get('alevin.sculpinSpread');
  const a = w.rng.range(-Math.PI, Math.PI);
  const d = w.rng.range(0, spread);
  return { x: fish.x + Math.cos(a) * d, z: fish.z + Math.sin(a) * d };
}

export function stepSculpin(w: World, t: EggThreatState, dt: number, surging: boolean, eat: (b: Entity) => void): void {
  const p = w.p;
  const c = t.sculpin;
  let e = w.live('sculpin')[0];
  if (!e) {
    if (!canStart(w, t, 'sculpin', surging)) return;
    begin(t, 'sculpin');
    // It comes in over the gravel from upstream or the side, nosing for food.
    const a = w.rng.range(-Math.PI, Math.PI);
    e = w.spawn('sculpin', v3(Math.cos(a) * EDGE, TOP_Y, Math.sin(a) * EDGE), { radius: 0.3, state: 'warn' });
    const spot = nextSpot(w, t, true);
    e.home = v3(spot.x, TOP_Y, spot.z);
    e.timer = p.get('alevin.sculpinWarning');
    e.yaw = Math.atan2(spot.z - e.pos.z, spot.x - e.pos.x);
    c.notice = 0;
    c.probes = Math.max(1, Math.round(p.get('alevin.sculpinProbes') * laterScale(w)));
    c.warned = false;
    c.near = false;
    c.fed = false;
    w.emit('warning', 'sculpin');
    w.emit('caption', 'egg.sculpin');
    return;
  }
  const fish = w.body.pos;
  const home = e.home ?? v3(0, TOP_Y, 0);
  e.timer -= dt;
  const moveTo = (x: number, z: number, y: number, speed: number): boolean => {
    const dx = x - e.pos.x;
    const dz = z - e.pos.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d > 1e-4) e.yaw = wrapAngle(e.yaw + wrapAngle(Math.atan2(dz, dx) - e.yaw) * Math.min(1, dt * 6));
    if (d <= step) {
      e.pos.x = x;
      e.pos.z = z;
    } else {
      e.pos.x += (dx / d) * step;
      e.pos.z += (dz / d) * step;
    }
    e.pos.y += (y - e.pos.y) * Math.min(1, dt * 5);
    e.vel = v3((dx / Math.max(d, 1e-4)) * speed, 0, (dz / Math.max(d, 1e-4)) * speed);
    return d <= step + 0.02;
  };
  const speed = p.get('alevin.sculpinSpeed');
  switch (e.state) {
    case 'warn': {
      // The approach: it glides in to its first spot over the warning time.
      const d = distXZ(e.pos, home);
      moveTo(home.x, home.z, TOP_Y, Math.max(speed * 0.3, d / Math.max(0.2, e.timer)));
      if (e.timer <= 0) startProbe(w, t, e, eat);
      break;
    }
    case 'move': {
      if (moveTo(home.x, home.z, TOP_Y, speed)) startProbe(w, t, e, eat);
      break;
    }
    case 'probe': {
      e.vel = v3();
      // Head down into the gaps.
      const depth = -1.55 + 0.5 * p.get('alevin.sculpinProbeDepth');
      e.pos.y += (depth - e.pos.y) * Math.min(1, dt * 4);
      const inReach = Math.hypot(fish.x - home.x, fish.z - home.z) < p.get('alevin.sculpinReach');
      if (inReach) c.notice += p.get('alevin.sculpinNotice') * sculpinExposure(w, t) * dt;
      else c.notice = Math.max(0, c.notice - p.get('alevin.sculpinForget') * dt);
      c.near = inReach;
      if (inReach && c.notice > 0.45 && !c.warned) {
        c.warned = true;
        w.emit('caption', 'egg.sculpinNear');
      }
      if (c.notice >= 1) {
        e.state = 'strike';
        e.timer = p.get('alevin.sculpinStrike');
        e.home = v3(fish.x, fish.y, fish.z);
        break;
      }
      if (e.timer <= 0) {
        c.probes -= 1;
        c.near = false;
        if (c.probes <= 0) {
          e.state = 'leave';
          const a = Math.atan2(e.pos.z, e.pos.x) + w.rng.range(-0.8, 0.8);
          e.home = v3(Math.cos(a) * EDGE * 1.2, TOP_Y, Math.sin(a) * EDGE * 1.2);
          w.emit('caption', 'egg.sculpinGone');
        } else {
          const spot = nextSpot(w, t, false);
          e.home = v3(spot.x, TOP_Y, spot.z);
          e.state = 'move';
        }
      }
      break;
    }
    case 'strike': {
      // It has found the alevin: a snap into the gap.
      moveTo(fish.x, fish.z, fish.y, speed * 3);
      if (e.timer <= 0) {
        w.die('sculpin');
        e.state = 'leave';
      }
      break;
    }
    case 'leave': {
      c.near = false;
      if (moveTo(home.x, home.z, TOP_Y, speed * 1.2) || Math.hypot(e.pos.x, e.pos.z) > EDGE * 1.15) {
        e.alive = false;
        finish(t, 'sculpin');
      }
      break;
    }
  }
}

function startProbe(w: World, t: EggThreatState, e: Entity, eat: (b: Entity) => void): void {
  const p = w.p;
  e.state = 'probe';
  e.timer = p.get('alevin.sculpinProbeTime');
  const home = e.home ?? e.pos;
  // A brood-mate lying shallow in reach may be found and taken (one in a visit: the rest are the flood's).
  if (t.sculpin.fed) return;
  for (const b of w.live('brood')) {
    if (b.state !== 'hidden') continue;
    if (Math.hypot(b.pos.x - home.x, b.pos.z - home.z) > p.get('alevin.sculpinReach')) continue;
    if (w.rng.chance(p.get('alevin.sculpinBroodTake') * (1 - 0.6 * (b.value ?? 0.5)))) {
      eat(b);
      t.sculpin.fed = true;
      break;
    }
  }
}

/** No surges while one of these events is under way, so each is its own moment (the flood has its own flow). */
export function quietFlow(t: EggThreatState): boolean {
  return t.active !== null && t.active !== 'flood';
}
