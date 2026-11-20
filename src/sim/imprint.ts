/**
 * Imprinting: young salmon are understood to learn the smell of their home
 * water, above all as they leave it as smolts, and to follow that smell home
 * years later. Here the fish learns home as it goes (progress.imprint, 0..1):
 * - alevin: facing into the flow in the home gravel (egg stage);
 * - fry: lingering in the plume of home water where it enters the lake;
 * - smolt: leaving calmly with the school (not bursting in a panic), and
 *   reaching the sea at all.
 * Each stage can add only up to its own share, so no single stage is a chore.
 * On the return, imprint and the inherited `homing` trait set how clear the
 * home scent is (scentClarity).
 *
 * Pure: no rendering or DOM. All chance goes through the world's Rng.
 */
import type { LifeProgress, TraitValues } from './types';
import type { Params } from './params';
import { v3 } from './vec';
import type { World } from './world';

/** Imprint of a fish whose save predates imprinting, or who started mid-life. */
export const defaultImprint = (p: Params): number => p.get('imprint.default');

/** The imprint recorded in a life's progress (old progress without one counts as average). */
export function imprintOf(p: Params, pr: Partial<LifeProgress>): number {
  return typeof pr.imprint === 'number' && Number.isFinite(pr.imprint) ? pr.imprint : defaultImprint(p);
}

type ImprintStage = 'egg' | 'fry' | 'smolt';

/** How much this stage has added so far (kept in the stage's scratch, so a fresh stage starts at 0). */
function gained(w: World): number {
  const g = w.stage.imprintGain;
  return typeof g === 'number' ? g : 0;
}

/**
 * Add imprint, up to the stage's share. Returns the amount actually added.
 * Emits the stage's "learning home" caption the first time anything is learned.
 */
export function learn(w: World, stage: ImprintStage, amount: number): number {
  if (amount <= 0) return 0;
  const cap = w.p.get(`imprint.${stage}Max`);
  const room = Math.max(0, cap - gained(w));
  const now = imprintOf(w.p, w.progress);
  const add = Math.min(room, amount, Math.max(0, 1 - now));
  if (add <= 0) return 0;
  w.stage.imprintGain = gained(w) + add;
  w.progress.imprint = now + add;
  w.emitOnce('caption', `imprint.${stage}`);
  return add;
}

const ORDER: ImprintStage[] = ['egg', 'fry', 'smolt'];

/**
 * Playtest jumps and skips: give a stage that was skipped a plausible imprint,
 * the average imprint's share up to the end of that stage.
 */
export function fillImprint(w: World, stage: ImprintStage): void {
  const p = w.p;
  const cap = (st: ImprintStage) => p.get(`imprint.${st}Max`) + (st === 'smolt' ? p.get('imprint.smoltFinish') : 0);
  const total = ORDER.reduce((a, st) => a + cap(st), 0);
  const upTo = ORDER.slice(0, ORDER.indexOf(stage) + 1).reduce((a, st) => a + cap(st), 0);
  w.progress.imprint = Math.max(imprintOf(p, w.progress), (defaultImprint(p) * upTo) / total);
}

// ---------- egg: the alevin faces into the home flow ----------

/** One step of the alevin stage: facing into the current, the alevin takes in its home water. */
export function stepAlevinImprint(w: World, facingFlow: boolean, dt: number): void {
  if (facingFlow) learn(w, 'egg', w.p.get('imprint.eggRate') * dt);
}

// ---------- fry: the plume of home water entering the lake ----------

/** Where home water enters the lake: a tongue of water from the shore out past the weed edge. */
export const FRY_PLUME = {
  /** The inlet on the shore. */
  start: v3(-29.5, -2.6, -16),
  /** Where the plume has mixed into the lake. */
  end: v3(-9, -3.2, -9),
  radius: 3.2,
} as const;

/** 0..1: how far along the plume a point is, and how far it is from the plume's centre line. */
function plumeCoords(x: number, y: number, z: number): { t: number; d: number } {
  const a = FRY_PLUME.start;
  const b = FRY_PLUME.end;
  const ab = v3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * ab.x + (y - a.y) * ab.y + (z - a.z) * ab.z) / len2));
  const px = a.x + ab.x * t - x;
  const py = a.y + ab.y * t - y;
  const pz = a.z + ab.z * t - z;
  return { t, d: Math.hypot(px, py * 1.6, pz) };
}

/** Is a point inside the home-water plume? (The plume widens a little as it mixes.) */
export function inFryPlume(x: number, y: number, z: number): boolean {
  const { t, d } = plumeCoords(x, y, z);
  return d < FRY_PLUME.radius * (0.8 + 0.4 * t);
}

/**
 * One step of a fry feeding moment: keep the plume's drifting specks going
 * and let the fish learn while it is inside. Specks are 'scent' entities in
 * state 'plume' (value = how strong they look).
 */
export function stepFryImprint(w: World, dt: number): void {
  const p = w.p;
  const s = w.stage as { plumeTimer?: number };
  s.plumeTimer = (s.plumeTimer ?? 0) - dt;
  if (s.plumeTimer <= 0) {
    s.plumeTimer = p.get('imprint.plumeSpawn');
    const a = FRY_PLUME.start;
    w.spawn('scent', v3(a.x + w.rng.range(0, 1.5), a.y + w.rng.range(-0.8, 0.8), a.z + w.rng.range(-1.2, 1.2)), {
      radius: 0.1,
      state: 'plume',
      timer: 9,
      value: 0.9,
    });
  }
  const a = FRY_PLUME.start;
  const b = FRY_PLUME.end;
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const speed = p.get('imprint.plumeDrift');
  for (const e of w.entities) {
    if (!e.alive || e.kind !== 'scent' || e.state !== 'plume') continue;
    // Drift down the plume, spreading and fading as it mixes into the lake.
    e.pos.x += ((b.x - a.x) / len) * speed * dt;
    e.pos.y += ((b.y - a.y) / len) * speed * dt + Math.sin(w.stageTime * 0.9 + e.id) * 0.1 * dt;
    e.pos.z += ((b.z - a.z) / len) * speed * dt + Math.sin(w.stageTime * 0.6 + e.id * 1.7) * 0.35 * dt;
    const { t } = plumeCoords(e.pos.x, e.pos.y, e.pos.z);
    e.value = 0.9 * (1 - 0.75 * t);
    if (t >= 1) e.alive = false;
  }
  const f = w.body.pos;
  if (inFryPlume(f.x, f.y, f.z)) learn(w, 'fry', p.get('imprint.fryRate') * dt);
  else if (w.firstLife && w.stageTime > 3) w.emitOnce('caption', 'imprint.fryHint');
}


// ---------- smolt: leaving calmly with the school ----------

/** One step of the smolt run: swimming with school-mates, not bursting, the smolt takes in the river. */
export function stepSmoltImprint(w: World, schoolmates: number, bursting: boolean, dt: number): void {
  if (bursting || schoolmates < w.p.get('imprint.smoltSchool')) return;
  learn(w, 'smolt', w.p.get('imprint.smoltRate') * dt);
}

/** Reaching the sea: the whole way out is part of the memory. */
export function finishSmoltImprint(w: World): void {
  // The finishing share is outside the calm-swimming cap.
  const now = imprintOf(w.p, w.progress);
  w.progress.imprint = Math.min(1, now + w.p.get('imprint.smoltFinish'));
}

// ---------- the return ----------

/**
 * 0..1: how clear the home scent is on the return, from imprint and the
 * inherited homing trait. An average imprint (imprint.default) with an
 * average homing trait gives the same clarity as before imprinting existed.
 */
export function scentClarity(p: Params, imprint: number, z: Pick<TraitValues, 'homing'>): number {
  const c = p.get('imprint.clarityBase') + p.get('imprint.clarityHoming') * z.homing + p.get('imprint.clarityImprint') * (imprint - p.get('imprint.default'));
  return Math.max(p.get('imprint.clarityMin'), Math.min(1, c));
}

/** The world's current scent clarity. */
export const worldClarity = (w: World): number => scentClarity(w.p, imprintOf(w.p, w.progress), w.fish.z);

/** Imprint level words for the HUD and captions. */
export function imprintLevel(p: Params, imprint: number): 'strong' | 'fair' | 'weak' {
  if (imprint >= p.get('imprint.strongAt')) return 'strong';
  if (imprint < p.get('imprint.weakBelow')) return 'weak';
  return 'fair';
}
