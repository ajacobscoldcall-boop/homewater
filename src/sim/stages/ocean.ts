/**
 * Stage 4: the years at sea, as a journey (Track 2.6; route and food rules in oceanRoute.ts).
 * One season after another, joined by time skips shown on the ocean map:
 * - out along the coast in the first summer, over the shelf edge in the first autumn,
 *   then the maturation reveal (genes and growth decide maturation, as before);
 * - for each year at sea a loop of spring, summer, autumn and winter offshore, and the
 *   turn for home in the last spring.
 * Each season has two food patches, one near the surface and one deep, and one
 * encounter: a seal (feeding near the surface; advisor: seals and sea lions), an orca
 * (advisor: whales), a salmon shark from below (advisor: yes to salmon sharks), or, in a
 * crowded year, pink salmon competing for the same food. The predator hunts where the
 * food is thickest, so feeding rich costs risk. Food entities keep the kind 'herring'
 * for save and test stability; they are drawn as a krill swarm with a few small fish and
 * squid (src/render/krill.ts), since sockeye at sea eat mainly zooplankton.
 * Season, ocean warmth and crowding set how much food there is, which sets growth (the
 * ocean bites before the reveal feed decideMaturation on the same scale as before; later
 * feeding nudges adult size), and the fish is drawn larger season by season.
 * Sockeye stay within 20-40 m of the surface (advisor), so the arena is that band.
 */
import { flockStep, flockTuning, type FlockGoal, type Threat } from '../flock';
import { adultSize, becomesJack, oceanYearsFor } from '../genetics';
import { curvedChase, personalityOf } from '../personality';
import { swimStep } from '../swim';
import type { Entity, Vec3 } from '../types';
import { add, clamp, dist, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import { freshwaterScore } from './fry';
import type { StageDef } from './index';
import { AFTER_REVEAL, firstYearPlan, fullPlan, huntsShallow, laterPlan, seasonCaption, seasonFood, shallowShare, sizeOnRoute, warmthFrom, type Encounter, type SeasonPlan, type Warmth } from './oceanRoute';

export type OceanPhase = 'season' | 'reveal' | 'skip';
/** The scene being played: a season's encounter, or the maturation reveal. */
type Moment = Encounter | 'reveal';

interface Patch {
  /** Where the patch drifts around. */
  base: Vec3;
  /** Its centre now (food entities keep a reference to it as their `home`). */
  center: Vec3;
  shallow: boolean;
  /** Food still to come in this patch this season. */
  budget: number;
  /** How many show at once. */
  shown: number;
}

interface OceanState {
  phase: OceanPhase;
  /** The route: seasons in order (the first year only, until the reveal decides the years at sea). */
  plan: SeasonPlan[];
  /** Index of the season being played (or coming up after a skip). */
  index: number;
  /** Ocean warmth for each year at sea (index 0 = year 1). */
  warmth: Warmth[];
  phaseTime: number;
  skipLeft: number;
  /** After the skip: play the reveal rather than the next season. */
  revealNext: boolean;
  patches: Patch[];
  /** Seconds the fish has spent where this season's predator hunts. */
  exposure: number;
  /** Rolled once a season: whether the predator comes for a fish that kept out of its way. */
  latePredator: boolean | null;
  predatorSpawned: boolean;
  predatorDone: boolean;
  /** Season time when the predator went (or vanished), else -1: a moment of calm follows. */
  goneAt: number;
  revealed: boolean;
  /** Food eaten this season, and after the reveal in all (adult size). */
  seasonBites: number;
  lateBites: number;
  lateExpected: number;
  /** 0..1 feeding so far against a typical fish (drawn size). */
  feed: number;
}

const st = (w: World) => w.stage as unknown as OceanState;

/** Seasons are shorter after the first life. */
function lifeScale(w: World): number {
  return w.firstLife ? 1 : w.p.get('ocean.laterLifeScale');
}

/** Is this a crowded (pink salmon) year at sea? */
export const crowdedYear = (w: World): boolean => w.conditions.oceanCrowding > w.p.get('ocean.crowdedThreshold');

function currentPlan(w: World): SeasonPlan | null {
  const s = st(w);
  return s.plan[s.index] ?? null;
}

function warmthOf(w: World, plan: SeasonPlan): Warmth {
  const s = st(w);
  return s.warmth[Math.min(s.warmth.length - 1, plan.year - 1)] ?? 'typical';
}

function spawnFood(w: World, patch: Patch, n: number): void {
  const k = Math.min(n, Math.floor(patch.budget));
  for (let i = 0; i < k; i++) {
    w.spawn('herring', v3(patch.center.x, patch.center.y, patch.center.z), { radius: 0.2, value: w.rng.range(0, Math.PI * 2), size: v3(w.rng.range(2.5, 6), w.rng.range(-2, 2), w.rng.range(0.6, 1.4)) }).home = patch.center;
  }
  patch.budget -= k;
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

/** Feeding after the reveal nudges adult size up or down from a typical year's (0 change when typical). */
export function lateSizeChange(p: { get(id: string): number }, bites: number, expected: number): number {
  if (expected <= 0) return 0;
  const score = Math.min(p.get('ocean.lateScoreCap'), bites / expected);
  return p.get('ocean.lateFeedingEffect') * (score - p.get('ocean.lateTypical'));
}

// ---------- seasons ----------

function clearScene(w: World): void {
  for (const e of w.entities) e.alive = false;
  w.entities = [];
}

/** Set up the scene for the current season (or the reveal). */
function setup(w: World, reveal = false): void {
  const s = st(w);
  const p = w.p;
  clearScene(w);
  s.phase = reveal ? 'reveal' : 'season';
  s.phaseTime = 0;
  s.predatorSpawned = false;
  s.predatorDone = false;
  s.goneAt = -1;
  s.exposure = 0;
  s.latePredator = null;
  s.revealed = false;
  s.seasonBites = 0;
  s.patches = [];
  const b = w.body;
  b.vel = v3();
  b.pitch = 0;
  b.energy = Math.max(b.energy, 0.8);
  b.scale = sizeOnRoute(p, s.plan, s.index, w.progress.adultSize, s.feed);
  if (reveal) {
    // Open water, alone. The weight is in the caption.
    b.pos = v3(0, -8, 0);
    b.yaw = Math.PI / 2;
    if (w.fish.sex === 'M' && !w.fish.lockedJack) w.emit('caption', 'ocean.autumnMale');
    return;
  }
  const plan = currentPlan(w);
  if (!plan) return;
  b.pos = v3(0, -12, -8);
  b.yaw = Math.PI / 2;
  const food = seasonFood(p, plan, warmthOf(w, plan), crowdedYear(w));
  const total = p.get('ocean.seasonFood') * food * (plan.encounter === 'home' ? p.get('ocean.homeFoodShare') : 1);
  const share = shallowShare(p, plan.season);
  const make = (shallow: boolean, x: number): Patch => {
    const part = shallow ? share : 1 - share;
    const base = v3(x, shallow ? p.get('ocean.shallowY') : p.get('ocean.deepY'), 4);
    return { base, center: { ...base }, shallow, budget: total * part, shown: Math.max(4, Math.round(p.get('ocean.patchShown') * part * Math.min(1.2, food))) };
  };
  const gap = p.get('ocean.patchGap') / 2;
  s.patches = [make(true, -gap), make(false, gap)];
  for (const pa of s.patches) spawnFood(w, pa, pa.shown);
  if (plan.encounter === 'pinks') {
    const n = p.get('ocean.pinkCount');
    const rich = richPatch(w);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = w.rng.range(8, 16);
      w.spawn('pink', v3(rich.center.x + Math.cos(a) * r, rich.center.y + w.rng.range(-4, 4), rich.center.z + Math.sin(a) * r), { radius: 0.4, yaw: a + Math.PI, timer: w.rng.range(0, p.get('ocean.pinkEatPause')) });
    }
    w.emit('caption', 'ocean.pinks');
  }
  if (plan.encounter === 'home') w.emit('caption', 'ocean.homePull');
  // Teach the choice once: the predator comes where the food is thickest.
  else if (plan.encounter !== 'pinks') w.emitOnce('caption', 'ocean.huntZone');
}

/** The patch with more food this season (where the predator hunts, and pinks gather). */
function richPatch(w: World): Patch {
  const s = st(w);
  const plan = currentPlan(w);
  const shallow = plan ? huntsShallow(w.p, plan) : true;
  return s.patches.find((pa) => pa.shallow === shallow) ?? s.patches[0]!;
}

/** Begin a time skip: the scene fades and clears, the map shows the next season. */
function skipTo(w: World, reveal: boolean): void {
  const s = st(w);
  clearScene(w);
  s.phase = 'skip';
  s.phaseTime = 0;
  s.revealNext = reveal;
  s.skipLeft = w.p.get('ocean.skipSeconds');
  w.body.vel = v3();
  if (reveal) {
    w.emit('caption', 'ocean.autumn');
    return;
  }
  const plan = currentPlan(w);
  if (!plan) return;
  w.emit('caption', seasonCaption(plan), { year: plan.year });
  const warmth = warmthOf(w, plan);
  if (plan.encounter !== 'home') {
    if (warmth === 'warm') w.emit('caption', 'ocean.warmYear');
    else if (warmth === 'cool' && plan.season !== 'winter') w.emit('caption', 'ocean.coolYear');
    if (crowdedYear(w) && plan.encounter === 'pinks') w.emit('caption', 'ocean.crowded');
  }
}

/** Finish the season being played and move on along the route. */
function endSeason(w: World): void {
  const s = st(w);
  const p = w.p;
  const plan = currentPlan(w);
  // How well the fish fed this season against a typical fish in a typical year (0.5), for its drawn size:
  // a warm or crowded year shows as a smaller fish.
  if (plan && plan.encounter !== 'home') {
    const typical = p.get('ocean.seasonFood') * p.get(`ocean.food.${plan.season}`) * p.get('ocean.typicalEaten');
    s.feed = 0.5 * s.feed + 0.5 * clamp((0.5 * s.seasonBites) / Math.max(1, typical), 0, 1);
  }
  if (plan?.encounter === 'home') {
    finishStage(w);
    return;
  }
  if (s.index === AFTER_REVEAL - 1 && !s.revealed && w.progress.isJack === null) {
    skipTo(w, true);
    return;
  }
  s.index++;
  if (s.index >= s.plan.length) {
    finishStage(w);
    return;
  }
  skipTo(w, false);
}

/** The turn for home: later feeding sets the last of the adult size; the return begins. */
function finishStage(w: World): void {
  const s = st(w);
  const pr = w.progress;
  if (pr.adultSize !== null) pr.adultSize = Math.max(0.3, pr.adultSize + lateSizeChange(w.p, s.lateBites, s.lateExpected));
  w.body.scale = pr.adultSize ?? w.body.scale;
  w.completeStage();
}

/** Start of a season after the skip: a new year at sea rolls its unseen risk first, then the checkpoint. */
function beginSeason(w: World): void {
  const s = st(w);
  const p = w.p;
  const plan = currentPlan(w);
  if (!plan) return;
  const prev = s.plan[s.index - 1];
  // Each extra year at sea is survived only with some chance (advisor: about half). Part of that risk is the
  // predators the player meets in the later seasons; the rest stays an unseen roll at the turn of each year.
  if (prev && plan.year > prev.year && plan.year >= 2 && plan.encounter !== 'home') {
    const survive = Math.pow(Math.min(1, p.get('life.lateOceanSurvival')), p.get('ocean.lateRollShare'));
    if (!w.rng.chance(survive)) {
      w.die('sea');
      return;
    }
  }
  if (plan.season === 'spring' && plan.encounter !== 'home') w.setCheckpoint(s.index);
  if (s.index === AFTER_REVEAL) w.setCheckpoint(s.index);
  if (s.index >= AFTER_REVEAL && plan.encounter !== 'home') s.lateExpected += p.get('ocean.seasonFood') * p.get(`ocean.food.${plan.season}`) * p.get('ocean.typicalEaten');
  setup(w);
}

/** Predators the food patch flees: an orca or shark on its charge, a seal on its lunge. */
function patchThreats(w: World): Threat[] {
  const out: Threat[] = [];
  for (const e of w.entities) {
    if (!e.alive) continue;
    if ((e.kind === 'orca' || e.kind === 'shark') && (e.state === 'charge' || e.state === 'warn')) out.push({ pos: e.pos, striking: e.state === 'charge' });
    else if (e.kind === 'seal' && (e.state === 'lunge' || e.state === 'warn')) out.push({ pos: e.pos, striking: e.state === 'lunge' });
  }
  return out;
}

function stepHerring(w: World, dt: number): void {
  const s = st(w);
  const fish = w.body.pos;
  const t = w.stageTime;
  const drift = v3(Math.cos(t * 0.15) * 0.9, 0, -Math.sin(t * 0.11) * 0.66);
  // Each patch drifts slowly around its place.
  s.patches.forEach((pa, i) => {
    const k = i === 0 ? 1 : -1;
    pa.center.x = pa.base.x + Math.sin(t * 0.15 + i) * 6 * k;
    pa.center.z = pa.base.z + Math.cos(t * 0.11 + i) * 6;
    pa.center.y = pa.base.y;
  });
  // Each member's place: its own orbit round its patch's centre.
  const place = (h: Entity): FlockGoal => {
    const c = h.home ?? s.patches[0]?.center ?? v3();
    const sz = h.size ?? v3(4, 0, 1);
    const a = (h.value ?? 0) + t * sz.z;
    return {
      pos: v3(c.x + Math.cos(a) * sz.x, c.y + sz.y + Math.sin(a * 1.7) * 0.6, c.z + Math.sin(a) * sz.x),
      vel: v3(drift.x - Math.sin(a) * sz.x * sz.z, Math.cos(a * 1.7) * 1.02 * sz.z, drift.z + Math.cos(a) * sz.x * sz.z),
    };
  };
  const all = w.live('herring');
  // Newly added food appears at its place in the patch.
  for (const h of all) {
    if (h.state !== 'idle') continue;
    const g = place(h);
    h.pos = g.pos;
    h.vel = g.vel ?? v3();
    h.state = 'school';
  }
  flockStep(all, place, patchThreats(w), flockTuning(w.p, 'flock.patch'), dt);
  const pinks = w.live('pink');
  const late = s.index >= AFTER_REVEAL;
  for (const h of all) {
    h.pos = add(h.pos, scale(h.vel, dt));
    h.pos.y = clamp(h.pos.y, -29.5, -0.5);
    h.yaw = Math.atan2(h.vel.z, h.vel.x);
    if (dist(h.pos, fish) < 1.1) {
      h.alive = false;
      // Before the reveal, bites feed maturation (decideMaturation); after it, the last of the adult size.
      // A later life's shorter season stands for the same months at sea, so each bite counts for more.
      const bite = 1 / lifeScale(w);
      if (late) s.lateBites += bite;
      else w.progress.oceanBites += bite;
      s.seasonBites += 1;
      w.emit('eat');
      continue;
    }
    for (const pk of pinks) {
      if (pk.timer <= 0 && dist(h.pos, pk.pos) < 0.9) {
        h.alive = false;
        pk.timer = w.p.get('ocean.pinkEatPause');
        break;
      }
    }
  }
  // Each patch is topped up while its season's food lasts.
  const live = w.live('herring');
  for (const pa of s.patches) {
    const n = live.filter((h) => h.home === pa.center).length;
    if (n < pa.shown * 0.6 && pa.budget >= 1) spawnFood(w, pa, Math.ceil(pa.shown * 0.4));
  }
}

/** Pink salmon: each heads for the nearest food, crowding the player out. */
function stepPinks(w: World, dt: number): void {
  const herring = w.live('herring');
  const sp = w.p.get('ocean.pinkSpeed');
  const home = richPatch(w).center;
  for (const pk of w.live('pink')) {
    pk.timer -= dt;
    let best: Entity | null = null;
    let bd = Infinity;
    for (const h of herring) {
      const d = dist(h.pos, pk.pos);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    const goal = best ? best.pos : home;
    const dir = norm(add(sub(goal, pk.pos), v3(Math.sin(w.stageTime + pk.id) * 0.8, 0, Math.cos(w.stageTime * 1.3 + pk.id) * 0.8)));
    pk.vel = scale(dir, sp * (0.85 + 0.3 * ((pk.id * 37) % 10) / 10));
    pk.pos = add(pk.pos, scale(pk.vel, dt));
    pk.pos.y = clamp(pk.pos.y, -29, -1);
    pk.yaw = Math.atan2(pk.vel.z, pk.vel.x);
  }
}

/** Is the fish where this season's predator hunts (near the patch with more food)? */
export function inHuntZone(w: World): boolean {
  const plan = currentPlan(w);
  if (!plan || st(w).phase !== 'season') return false;
  const p = w.p;
  const y = w.body.pos.y;
  if (plan.encounter === 'seal') return y > p.get('ocean.sealZoneY');
  if (plan.encounter === 'shark') return y < p.get('ocean.sharkZoneY');
  if (plan.encounter === 'orca') return dist(w.body.pos, richPatch(w).center) < p.get('ocean.orcaZoneR');
  return false;
}

/** After the reveal the fish is bigger and has seen it all before: a little more warning (`ocean.lateWarningScale`, a game device). */
function lateWarning(w: World): number {
  return st(w).index >= AFTER_REVEAL ? w.p.get('ocean.lateWarningScale') : 1;
}

/** Orca and salmon shark: a warning approach, then one straight charging pass. */
function spawnCharger(w: World, kind: 'orca' | 'shark'): void {
  const p = w.p;
  const fish = w.body.pos;
  const ang = w.rng.range(0, Math.PI * 2);
  if (kind === 'orca') {
    const start = add(fish, v3(Math.cos(ang) * 55, w.rng.range(-4, 4), Math.sin(ang) * 55));
    start.y = Math.min(-4, Math.max(-28, start.y));
    const o = w.spawn('orca', start, { radius: 3, state: 'warn', timer: p.get('ocean.orcaWarning') * lateWarning(w) });
    o.timer *= personalityOf(w, o).patience;
    w.emit('warning', 'orca');
    w.emitOnce('caption', 'ocean.orca');
  } else {
    // From below and to the side.
    const start = add(fish, v3(Math.cos(ang) * 30, -10, Math.sin(ang) * 30));
    start.y = Math.max(-28, start.y);
    w.spawn('shark', start, { radius: 1.5, state: 'warn', timer: p.get('ocean.sharkWarning') * lateWarning(w) });
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
  // Orcas have personalities: each circles in from its own side and charges at its own pace.
  const me = orca ? personalityOf(w, o) : { speed: 1, angle: 0 };
  if (o.state === 'warn') {
    const d = sub(fish, o.pos);
    const dir = orca ? curvedChase(d.x, d.y, d.z, me.angle * 2, p.get('behaviour.curveCloseAt') * 4) : norm(d);
    o.vel = scale(dir, p.get(orca ? 'ocean.orcaStalkSpeed' : 'ocean.sharkStalkSpeed'));
    if (o.timer <= 0) {
      o.state = 'charge';
      o.vel = scale(norm(sub(fish, o.pos)), p.get(orca ? 'ocean.orcaSpeed' : 'ocean.sharkSpeed') * me.speed);
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
  const seal = w.spawn('seal', start, { radius: 1.2, state: 'warn', timer: w.p.get('ocean.sealWarning') * lateWarning(w) });
  seal.timer *= personalityOf(w, seal).patience;
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
      // Some seals lunge harder, and some lead the fish more than others.
      const me = personalityOf(w, seal);
      const sp = p.get('ocean.sealSpeed') * me.speed;
      const lead = (dist(fish.pos, seal.pos) / sp) * (1 + me.angle);
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

/** The maturation reveal; the route after it follows the years at sea. */
function reveal(w: World): void {
  const s = st(w);
  decideMaturation(w);
  const pr = w.progress;
  const key = w.fish.sex === 'F' ? 'ocean.revealFemale' : pr.isJack ? 'ocean.revealJack' : 'ocean.revealLarge';
  w.emit('reveal', key, { years: pr.oceanYears ?? 2 });
  s.plan = [...firstYearPlan(crowdedYear(w)), ...laterPlan(pr.oceanYears ?? 2, crowdedYear(w))];
  // Each extra year at sea brings more growth, and more risk; jacks skip it.
  if ((pr.oceanYears ?? 1) > 1) w.emitOnce('caption', 'ocean.yearsAtSea');
}

export interface OceanView {
  phase: OceanPhase;
  /** The scene being played, or coming up after a skip. */
  moment: Moment | null;
  /** The season being played or coming up, and the route (for the ocean map). */
  season: SeasonPlan | null;
  plan: readonly SeasonPlan[];
  index: number;
  /** The years at sea once decided, else null (the map draws "2 or 3"). */
  years: number | null;
  warmth: Warmth;
  /** Food this season relative to a typical summer. */
  food: number;
  /** Light level 0..1 for the renderer. */
  light: number;
  /** 0..1: how far into darkness a time skip has faded the scene (0 outside skips). */
  fade: number;
  crowded: boolean;
  /** Where the food patches are (shallow first). */
  patches: { x: number; y: number; z: number; shallow: boolean; left: number }[];
  /** The fish is where this season's predator hunts. */
  exposed: boolean;
}

export function oceanView(w: World): OceanView | null {
  if (w.stageId !== 'ocean') return null;
  const s = st(w);
  if (!s.phase) return null;
  const p = w.p;
  const plan = currentPlan(w);
  const lightOf = (m: SeasonPlan | null, reveal: boolean): number =>
    reveal ? p.get('ocean.autumnLight') : !m ? 1 : m.season === 'winter' ? p.get('ocean.winterLight') : m.season === 'autumn' ? p.get('ocean.autumnLight') : m.encounter === 'shark' ? p.get('ocean.deepLight') : 1;
  const revealing = s.phase === 'reveal' || (s.phase === 'skip' && s.revealNext);
  let light: number;
  let fade = 0;
  if (s.phase === 'skip') {
    const t = 1 - s.skipLeft / p.get('ocean.skipSeconds');
    fade = 1 - Math.abs(1 - 2 * t);
    light = 0.08 + 0.92 * Math.abs(1 - 2 * t) * lightOf(plan, revealing);
  } else light = lightOf(plan, revealing);
  const warmth = plan ? warmthOf(w, plan) : 'typical';
  return {
    phase: s.phase,
    moment: revealing ? 'reveal' : (plan?.encounter ?? null),
    season: plan,
    plan: s.plan,
    index: s.index,
    years: w.progress.oceanYears,
    warmth,
    food: plan ? seasonFood(p, plan, warmth, crowdedYear(w)) : 1,
    light,
    fade,
    crowded: crowdedYear(w),
    patches: s.patches.map((pa) => ({ ...pa.center, shallow: pa.shallow, left: pa.budget })),
    exposed: inHuntZone(w),
  };
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
  init(w, marker) {
    const p = w.p;
    // Ocean warmth for each possible year at sea, rolled up front so every life draws the same number.
    const warmth = [0, 1, 2, 3].map(() => warmthFrom(p, w.rng.next()));
    const years = w.progress.oceanYears;
    // A sibling resuming after the reveal keeps the decided route and starts at its checkpoint's season.
    const resume = marker > 0 && years !== null;
    const s: OceanState = {
      phase: 'season',
      plan: resume ? fullPlan(years, crowdedYear(w)) : firstYearPlan(crowdedYear(w)),
      index: resume ? marker : 0,
      warmth,
      phaseTime: 0,
      skipLeft: 0,
      revealNext: false,
      patches: [],
      exposure: 0,
      latePredator: null,
      predatorSpawned: false,
      predatorDone: false,
      goneAt: -1,
      revealed: resume,
      seasonBites: 0,
      lateBites: 0,
      lateExpected: 0,
      feed: 0.5,
    };
    w.stage = s as unknown as Record<string, unknown>;
    if (resume) {
      // Feeding after the reveal starts over for a sibling; count from its season on.
      for (let i = AFTER_REVEAL; i < marker; i++) {
        const pl = s.plan[i];
        if (pl && pl.encounter !== 'home') {
          s.lateExpected += p.get('ocean.seasonFood') * p.get(`ocean.food.${pl.season}`) * p.get('ocean.typicalEaten');
          s.lateBites += p.get('ocean.seasonFood') * p.get(`ocean.food.${pl.season}`) * p.get('ocean.typicalEaten') * p.get('ocean.lateTypical');
        }
      }
      skipTo(w, false);
      s.skipLeft = 0.01;
      return;
    }
    setup(w);
    w.emit('caption', 'ocean.intro');
  },
  step(w, intent, dt) {
    const p = w.p;
    const s = st(w);
    s.phaseTime += dt;
    if (s.phase === 'skip') {
      s.skipLeft -= dt;
      w.body.vel = v3();
      if (s.skipLeft <= 0) {
        if (s.revealNext) setup(w, true);
        else beginSeason(w);
      }
      return;
    }
    // Small fish swim like a 0.6-size fish (`ocean.swimScaleFloor`), so the first year is not slower than before.
    const b = w.body;
    const bonus = (x: number) => 1 + p.get('swim.sizeSpeedBonus') * (x - 0.6);
    swimStep(w, intent, dt, { thrustScale: bonus(Math.max(b.scale, p.get('ocean.swimScaleFloor'))) / bonus(b.scale) });
    if (s.phase === 'reveal') {
      if (!s.revealed && s.phaseTime >= p.get('ocean.revealDelay')) {
        s.revealed = true;
        reveal(w);
      } else if (s.revealed && s.phaseTime >= p.get('ocean.revealDelay') + p.get('ocean.revealHold')) {
        s.index = AFTER_REVEAL;
        skipTo(w, false);
      }
      return;
    }
    const plan = currentPlan(w);
    if (!plan) return;
    stepHerring(w, dt);
    if (plan.encounter === 'pinks') stepPinks(w, dt);

    // The season's predator comes for a fish that lingers where it hunts; a fish that keeps out of its way
    // may still meet it late in the season (`ocean.unexposedChance`).
    const dur = p.get(plan.encounter === 'home' ? 'ocean.homeSeconds' : 'ocean.seasonDuration') * lifeScale(w);
    const hunter = plan.encounter === 'seal' || plan.encounter === 'orca' || plan.encounter === 'shark';
    if (hunter && !s.predatorSpawned) {
      if (inHuntZone(w)) s.exposure += dt;
      const lead = s.phaseTime >= p.get('ocean.predatorLead');
      let come = lead && s.exposure >= p.get('ocean.exposureNeeded');
      if (!come && s.phaseTime >= dur * p.get('ocean.latestShare')) {
        s.latePredator ??= w.rng.chance(p.get('ocean.unexposedChance'));
        come = s.latePredator;
      }
      if (come) {
        if (plan.encounter === 'seal') spawnSeal(w);
        else spawnCharger(w, plan.encounter === 'orca' ? 'orca' : 'shark');
        s.predatorSpawned = true;
      }
    }
    for (const o of [...w.live('orca'), ...w.live('shark')]) {
      stepCharger(w, o, dt);
      if (w.status !== 'playing') return;
    }
    for (const seal of w.live('seal')) {
      stepSeal(w, seal, dt);
      if (w.status !== 'playing') return;
    }

    // The season ends when its time is up and any predator has gone (or vanished, for playtest tools).
    const active = hunter && s.predatorSpawned && !s.predatorDone && w.live(plan.encounter as 'seal' | 'orca' | 'shark').length > 0;
    if (s.predatorSpawned && !active && s.goneAt < 0) s.goneAt = s.phaseTime;
    const calm = s.predatorSpawned ? s.goneAt >= 0 && s.phaseTime - s.goneAt >= p.get('ocean.settleSeconds') : true;
    if (s.phaseTime >= dur && !active && calm) {
      if (plan.encounter === 'pinks') w.emit('caption', 'ocean.pinksGone');
      endSeason(w);
    }
  },
  debugComplete(w) {
    // Half the full ocean feeding score, as before the journey (16 of the old 32).
    w.progress.oceanBites = Math.max(w.progress.oceanBites, w.p.get('ocean.fullBites') / 2);
    if (w.progress.isJack === null) decideMaturation(w);
    w.body.scale = w.progress.adultSize ?? w.body.scale;
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.oceanBites = w.p.get('ocean.fullBites') / 2;
    decideMaturation(w);
  },
};
