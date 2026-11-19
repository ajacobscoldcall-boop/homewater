/**
 * Stage 4: ocean years. Separate moments joined by time skips:
 * - baitball: feed on a herring ball.
 * - orca: another ball, and an orca makes a charging pass (advisor: whales).
 * - seal: feeding near the surface, a seal lunges (advisor: seals and sea lions).
 * - pinks: in a crowded year only, pink salmon compete for the same food.
 * - shark: a salmon shark strikes from below (advisor: yes to salmon sharks).
 * - reveal: the first autumn at sea; genes and growth decide maturation.
 * Sockeye stay within 20-40 m of the surface (advisor), so the arena is that band.
 */
import { adultSize, becomesJack, oceanYearsFor } from '../genetics';
import { swimStep } from '../swim';
import type { Entity } from '../types';
import { add, clamp, dist, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import { freshwaterScore } from './fry';
import type { StageDef } from './index';

export type OceanPhase = 'baitball' | 'orca' | 'seal' | 'pinks' | 'shark' | 'reveal' | 'skip';
type Moment = Exclude<OceanPhase, 'skip'>;

interface OceanState {
  phase: OceanPhase;
  /** The moments still to come, in order. */
  queue: Moment[];
  phaseTime: number;
  skipLeft: number;
  ballCenter: { x: number; y: number; z: number };
  /** Bait-ball drift is off for moments without one. */
  ballDrift: boolean;
  predatorSpawned: boolean;
  predatorDone: boolean;
  /** Seconds of calm left after a predator has gone; negative when not settling. */
  settleLeft: number;
  revealed: boolean;
}

const st = (w: World) => w.stage as unknown as OceanState;

const SKIP_CAPTION: Record<Moment, string> = {
  baitball: 'ocean.intro',
  orca: 'ocean.skipOrca',
  seal: 'ocean.skipSeal',
  pinks: 'ocean.crowded',
  shark: 'ocean.skipShark',
  reveal: 'ocean.autumn',
};

/** Moments are shorter after the first life. */
function dur(w: World, id: string): number {
  return w.p.get(id) * (w.firstLife ? 1 : w.p.get('ocean.laterLifeScale'));
}

/** Is this a crowded (pink salmon) year at sea? */
export const crowdedYear = (w: World): boolean => w.conditions.oceanCrowding > w.p.get('ocean.crowdedThreshold');

function spawnHerring(w: World, n: number): void {
  const c = st(w).ballCenter;
  for (let i = 0; i < n; i++) {
    w.spawn('herring', v3(c.x, c.y, c.z), { radius: 0.2, value: w.rng.range(0, Math.PI * 2), size: v3(w.rng.range(2.5, 6), w.rng.range(-2, 2), w.rng.range(0.6, 1.4)) });
  }
}

/** Decide maturation and adult size from genes and how well the fish fed. */
export function decideMaturation(w: World): void {
  const p = w.p;
  const pr = w.progress;
  const fresh = freshwaterScore(p, pr);
  const sea = Math.min(1, pr.oceanBites / p.get('ocean.fullBites'));
  pr.growthPerf = clamp(p.get('life.growthBase') + p.get('life.growthFreshWeight') * fresh + p.get('life.growthOceanWeight') * sea, 0, 1);
  pr.isJack = becomesJack(p, w.fish, pr.growthPerf);
  pr.oceanYears = oceanYearsFor(p, w.fish, pr.isJack);
  pr.adultSize = adultSize(p, w.fish, pr.oceanYears, pr.growthPerf, w.conditions);
}

// ---------- moments ----------

function clearMoment(w: World): void {
  for (const e of w.entities) e.alive = false;
  w.entities = [];
}

function setup(w: World, m: Moment): void {
  const s = st(w);
  const p = w.p;
  clearMoment(w);
  s.phase = m;
  s.phaseTime = 0;
  s.predatorSpawned = false;
  s.predatorDone = false;
  s.settleLeft = -1;
  s.revealed = false;
  s.ballDrift = true;
  const b = w.body;
  b.vel = v3();
  b.pitch = 0;
  b.energy = Math.max(b.energy, 0.8);
  switch (m) {
    case 'baitball':
      b.pos = v3(0, -12, -22);
      b.yaw = Math.PI / 2;
      s.ballCenter = v3(0, -12, 0);
      spawnHerring(w, p.get('ocean.ballSize'));
      break;
    case 'orca':
      b.pos = v3(0, -10, -18);
      b.yaw = Math.PI / 2;
      s.ballCenter = v3(0, -10, 0);
      spawnHerring(w, p.get('ocean.ballSize') * 0.6);
      break;
    case 'seal':
      // Near the surface, close to a small school of prey.
      b.pos = v3(-14, -3, 0);
      b.yaw = 0;
      s.ballCenter = v3(0, -3, 0);
      spawnHerring(w, p.get('ocean.ballSize') * 0.5);
      break;
    case 'pinks': {
      b.pos = v3(0, -10, -16);
      b.yaw = Math.PI / 2;
      s.ballCenter = v3(0, -10, 0);
      spawnHerring(w, p.get('ocean.ballSize') * 0.6);
      const n = p.get('ocean.pinkCount');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = w.rng.range(8, 16);
        w.spawn('pink', v3(Math.cos(a) * r, -10 + w.rng.range(-4, 4), Math.sin(a) * r), { radius: 0.4, yaw: a + Math.PI });
      }
      w.emit('caption', 'ocean.pinks');
      break;
    }
    case 'shark':
      b.pos = v3(0, -14, -14);
      b.yaw = Math.PI / 2;
      s.ballCenter = v3(0, -14, 0);
      spawnHerring(w, p.get('ocean.ballSize') * 0.4);
      break;
    case 'reveal':
      // Open water, alone. The weight is in the caption.
      b.pos = v3(0, -8, 0);
      b.yaw = Math.PI / 2;
      s.ballDrift = false;
      if (w.fish.sex === 'M' && !w.fish.lockedJack) w.emit('caption', 'ocean.autumnMale');
      break;
  }
}

/** Begin a time skip: the scene fades and clears, then the next moment is set up. */
function skipToNext(w: World): void {
  const s = st(w);
  const next = s.queue.shift();
  if (!next) return;
  clearMoment(w);
  s.phase = 'skip';
  s.phaseTime = 0;
  s.skipLeft = w.p.get('ocean.skipSeconds');
  s.queue.unshift(next);
  w.body.vel = v3();
  w.emit('caption', SKIP_CAPTION[next]);
}

function stepHerring(w: World): void {
  const s = st(w);
  const p = w.p;
  const fish = w.body.pos;
  const t = w.stageTime;
  if (s.ballDrift) {
    // The bait ball drifts slowly around its starting point.
    const base = s.phase === 'seal' ? -3 : s.ballCenter.y;
    s.ballCenter.x = Math.sin(t * 0.15) * 8;
    s.ballCenter.z = Math.cos(t * 0.11) * 8;
    s.ballCenter.y = base;
  }
  const pinks = w.live('pink');
  for (const h of w.live('herring')) {
    const sz = h.size ?? v3(4, 0, 1);
    const a = (h.value ?? 0) + t * sz.z;
    h.pos = v3(s.ballCenter.x + Math.cos(a) * sz.x, s.ballCenter.y + sz.y + Math.sin(a * 1.7) * 0.6, s.ballCenter.z + Math.sin(a) * sz.x);
    h.yaw = -a;
    if (dist(h.pos, fish) < 1.1) {
      h.alive = false;
      w.progress.oceanBites += 1;
      w.emit('eat');
      continue;
    }
    for (const pk of pinks) {
      if (dist(h.pos, pk.pos) < 0.9) {
        h.alive = false;
        break;
      }
    }
  }
  const left = w.live('herring').length;
  if (s.phase === 'pinks') {
    if (left < p.get('ocean.pinkRefillBelow')) spawnHerring(w, 6);
  } else if (s.phase !== 'reveal' && left < p.get('ocean.ballRefillBelow')) spawnHerring(w, 10);
}

/** Pink salmon: each heads for the nearest herring, crowding the player out. */
function stepPinks(w: World, dt: number): void {
  const herring = w.live('herring');
  const sp = w.p.get('ocean.pinkSpeed');
  for (const pk of w.live('pink')) {
    let best: Entity | null = null;
    let bd = Infinity;
    for (const h of herring) {
      const d = dist(h.pos, pk.pos);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    const goal = best ? best.pos : st(w).ballCenter;
    const dir = norm(add(sub(goal, pk.pos), v3(Math.sin(w.stageTime + pk.id) * 0.8, 0, Math.cos(w.stageTime * 1.3 + pk.id) * 0.8)));
    pk.vel = scale(dir, sp * (0.85 + 0.3 * ((pk.id * 37) % 10) / 10));
    pk.pos = add(pk.pos, scale(pk.vel, dt));
    pk.pos.y = clamp(pk.pos.y, -29, -1);
    pk.yaw = Math.atan2(pk.vel.z, pk.vel.x);
  }
}

/** Orca and salmon shark: a warning approach, then one straight charging pass. */
function spawnCharger(w: World, kind: 'orca' | 'shark'): void {
  const p = w.p;
  const fish = w.body.pos;
  const ang = w.rng.range(0, Math.PI * 2);
  if (kind === 'orca') {
    const start = add(fish, v3(Math.cos(ang) * 55, w.rng.range(-4, 4), Math.sin(ang) * 55));
    start.y = Math.min(-4, Math.max(-28, start.y));
    w.spawn('orca', start, { radius: 3, state: 'warn', timer: p.get('ocean.orcaWarning') });
    w.emit('warning', 'orca');
    w.emitOnce('caption', 'ocean.orca');
  } else {
    // From below and to the side.
    const start = add(fish, v3(Math.cos(ang) * 30, -10, Math.sin(ang) * 30));
    start.y = Math.max(-28, start.y);
    w.spawn('shark', start, { radius: 1.5, state: 'warn', timer: p.get('ocean.sharkWarning') });
    w.emit('warning', 'shark');
    w.emitOnce('caption', 'ocean.shark');
  }
}

function stepCharger(w: World, o: Entity, dt: number): void {
  const p = w.p;
  const s = st(w);
  const fish = w.body.pos;
  const orca = o.kind === 'orca';
  o.timer -= dt;
  if (o.state === 'warn') {
    const dir = norm(sub(fish, o.pos));
    o.vel = scale(dir, p.get(orca ? 'ocean.orcaStalkSpeed' : 'ocean.sharkStalkSpeed'));
    if (o.timer <= 0) {
      o.state = 'charge';
      o.vel = scale(norm(sub(fish, o.pos)), p.get(orca ? 'ocean.orcaSpeed' : 'ocean.sharkSpeed'));
      o.timer = p.get('ocean.chargeTime');
    }
  } else if (o.state === 'charge') {
    if (dist(o.pos, fish) < p.get(orca ? 'ocean.orcaCatchRadius' : 'ocean.sharkCatchRadius')) {
      if (orca) w.die('orca');
      else w.die('shark');
      return;
    }
    if (o.timer <= 0 || dist(o.pos, fish) > p.get('ocean.escapeDistance') * 3) {
      o.alive = false;
      s.predatorDone = true;
      if (orca) w.emit('caption', 'ocean.orcaGone');
      else w.emit('caption', 'ocean.sharkGone');
    }
  }
  o.yaw = Math.atan2(o.vel.z, o.vel.x);
  o.pos = add(o.pos, scale(o.vel, dt));
  o.pos.y = Math.min(-1.5, Math.max(-29, o.pos.y));
}

/** A seal near the surface: bubbles and a dark shape, then a lunge aimed ahead of the fish. */
function spawnSeal(w: World): void {
  const fish = w.body.pos;
  const ang = w.rng.range(0, Math.PI * 2);
  const r = w.p.get('ocean.sealDistance');
  const start = v3(fish.x + Math.cos(ang) * r, Math.max(-12, fish.y - 5), fish.z + Math.sin(ang) * r);
  w.spawn('seal', start, { radius: 1.2, state: 'warn', timer: w.p.get('ocean.sealWarning') });
  w.emit('warning', 'seal');
  w.emitOnce('caption', 'ocean.seal');
}

function stepSeal(w: World, seal: Entity, dt: number): void {
  const p = w.p;
  const fish = w.body;
  seal.timer -= dt;
  if (seal.state === 'warn') {
    // Drifts in slowly, keeping its distance.
    seal.vel = scale(norm(sub(fish.pos, seal.pos)), 1);
    if (seal.timer <= 0) {
      seal.state = 'lunge';
      seal.timer = p.get('ocean.sealLunge');
      const sp = p.get('ocean.sealSpeed');
      const lead = dist(fish.pos, seal.pos) / sp;
      const aim = v3(fish.pos.x + fish.vel.x * lead, fish.pos.y + fish.vel.y * lead, fish.pos.z + fish.vel.z * lead);
      seal.vel = scale(norm(sub(aim, seal.pos)), sp);
    }
  } else if (seal.state === 'lunge') {
    if (dist(seal.pos, fish.pos) < p.get('ocean.sealCatchRadius')) {
      w.die('seal');
      return;
    }
    if (seal.timer <= 0) {
      seal.alive = false;
      st(w).predatorDone = true;
      w.emit('caption', 'ocean.sealGone');
    }
  }
  seal.pos = add(seal.pos, scale(seal.vel, dt));
  seal.pos.y = Math.min(-0.6, Math.max(-29, seal.pos.y));
  seal.yaw = Math.atan2(seal.vel.z, seal.vel.x);
}

/** The maturation reveal, then the extra-years-at-sea survival roll. */
function reveal(w: World): void {
  const p = w.p;
  decideMaturation(w);
  const pr = w.progress;
  const key = w.fish.sex === 'F' ? 'ocean.revealFemale' : pr.isJack ? 'ocean.revealJack' : 'ocean.revealLarge';
  w.emit('reveal', key, { years: pr.oceanYears ?? 2 });
  // Each extra year at sea is survived only with some chance; jacks skip it.
  const extra = (pr.oceanYears ?? 1) - 1;
  if (extra > 0) {
    w.emitOnce('caption', 'ocean.yearsAtSea');
    const survive = Math.pow(Math.min(1, p.get('life.lateOceanSurvival')), extra);
    if (!w.rng.chance(survive)) w.die('sea');
  }
}

export interface OceanView {
  phase: OceanPhase;
  /** The moment being played, or coming up after a skip. */
  moment: Moment | null;
  /** Light level 0..1 for the renderer. */
  light: number;
  /** 0..1: how far into darkness a time skip has faded the scene (0 outside skips). */
  fade: number;
  crowded: boolean;
}

export function oceanView(w: World): OceanView | null {
  if (w.stageId !== 'ocean') return null;
  const s = st(w);
  if (!s.phase) return null;
  const p = w.p;
  const lightOf = (m: Moment | undefined): number => (m === 'shark' ? p.get('ocean.deepLight') : m === 'reveal' ? p.get('ocean.autumnLight') : 1);
  let light: number;
  let fade = 0;
  let moment: Moment | null;
  if (s.phase === 'skip') {
    moment = s.queue[0] ?? null;
    const t = 1 - s.skipLeft / p.get('ocean.skipSeconds');
    fade = 1 - Math.abs(1 - 2 * t);
    light = 0.08 + 0.92 * Math.abs(1 - 2 * t) * (t < 0.5 ? 1 : lightOf(moment ?? undefined));
  } else {
    moment = s.phase;
    light = lightOf(s.phase);
  }
  return { phase: s.phase, moment, light, fade, crowded: crowdedYear(w) };
}

export const oceanStage: StageDef = {
  id: 'ocean',
  arena: () => ({
    kind: 'ocean',
    // Advisor: sockeye stay within 20-40 m of the surface. The arena is that band.
    min: v3(-70, -30, -70),
    max: v3(70, 0, 70),
    surfaceY: 0,
    water: 'salt',
    floor: () => -30,
    current: () => v3(0.2, 0, 0.1),
  }),
  init(w) {
    w.body.scale = 0.85;
    const queue: Moment[] = ['orca', 'seal'];
    if (crowdedYear(w)) queue.push('pinks');
    queue.push('shark', 'reveal');
    const s: OceanState = {
      phase: 'baitball',
      queue,
      phaseTime: 0,
      skipLeft: 0,
      ballCenter: v3(0, -12, 0),
      ballDrift: true,
      predatorSpawned: false,
      predatorDone: false,
      settleLeft: -1,
      revealed: false,
    };
    w.stage = s as unknown as Record<string, unknown>;
    setup(w, 'baitball');
  },
  step(w, intent, dt) {
    const p = w.p;
    const s = st(w);
    s.phaseTime += dt;
    if (s.phase === 'skip') {
      s.skipLeft -= dt;
      w.body.vel = v3();
      if (s.skipLeft <= 0) {
        const next = s.queue.shift();
        if (next) setup(w, next);
      }
      return;
    }
    swimStep(w, intent, dt);
    stepHerring(w);
    if (s.phase === 'pinks') stepPinks(w, dt);

    // Predators for this moment.
    const lead = p.get('ocean.predatorLead');
    if (!s.predatorSpawned && s.phaseTime >= lead) {
      if (s.phase === 'orca') spawnCharger(w, 'orca');
      else if (s.phase === 'shark') spawnCharger(w, 'shark');
      else if (s.phase === 'seal') spawnSeal(w);
      s.predatorSpawned = true;
    }
    for (const o of [...w.live('orca'), ...w.live('shark')]) {
      stepCharger(w, o, dt);
      if (w.status !== 'playing') return;
    }
    for (const seal of w.live('seal')) {
      stepSeal(w, seal, dt);
      if (w.status !== 'playing') return;
    }

    const settle = p.get('ocean.settleSeconds');
    switch (s.phase) {
      case 'baitball':
        if (s.phaseTime >= dur(w, 'ocean.feedDuration')) skipToNext(w);
        break;
      case 'orca':
      case 'seal':
      case 'shark':
        // A moment to breathe once it has gone (or vanished, for playtest tools).
        if ((s.predatorDone || (s.predatorSpawned && w.live(s.phase).length === 0)) && s.settleLeft < 0) s.settleLeft = settle;
        if (s.settleLeft >= 0) {
          s.settleLeft -= dt;
          if (s.settleLeft <= 0) skipToNext(w);
        }
        break;
      case 'pinks':
        if (s.phaseTime >= dur(w, 'ocean.pinkDuration')) {
          w.emit('caption', 'ocean.pinksGone');
          skipToNext(w);
        }
        break;
      case 'reveal':
        if (!s.revealed && s.phaseTime >= p.get('ocean.revealDelay')) {
          s.revealed = true;
          reveal(w);
          if (w.status !== 'playing') return;
        } else if (s.revealed && s.phaseTime >= p.get('ocean.revealDelay') + p.get('ocean.revealHold')) {
          w.completeStage();
        }
        break;
    }
  },
  debugComplete(w) {
    w.progress.oceanBites = Math.max(w.progress.oceanBites, 16);
    decideMaturation(w);
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.oceanBites = 16;
    decideMaturation(w);
  },
};
