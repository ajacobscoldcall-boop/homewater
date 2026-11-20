/**
 * The guided first life ("Field guide" difficulty, first life only): a short
 * list of objectives per stage, shown one at a time, each advancing when the
 * player does the thing. Reads the world only through public helpers and
 * events; never changes the simulation.
 *
 * The step logic is pure (snapshot + event counts in, step index out) so it
 * can be tested without a browser. `Guide` wraps it with the on-screen prompt.
 */
import { alevinView } from '../sim/stages/egg';
import { fryGrowth, fryView, type FryPhase } from '../sim/stages/fry';
import { LIP_END } from '../sim/stages/falls';
import { returnLayout } from '../sim/stages/return';
import { smoltSection, type SmoltSection } from '../sim/stages/smolt';
import { spawnState, type SpawnRole } from '../sim/stages/spawn';
import type { SimEvent, StageId } from '../sim/types';
import { dist, wrapAngle } from '../sim/vec';
import type { World } from '../sim/world';
import { k, withKeys } from '../input/bindings';
import { controlsPicture } from './controlsPicture';
import { h } from './dom';

/** Step text with key placeholders ({key:burst}) filled with the player's keys. */
export function guideText(text: string): string {
  return withKeys(text);
}
import { triggersFor } from './journal';

/** What the guide can see of the world in one frame. Plain data, so tests can build it. */
export interface GuideSnapshot {
  fishId: string;
  stage: StageId;
  /** Spawning role, on the spawning grounds only. */
  role: SpawnRole | null;
  alevin: { hatched: boolean; aligned: boolean; turning: boolean; ready: boolean } | null;
  yolk: number;
  thrust: number;
  /** Metres below the surface. */
  depth: number;
  /** Position along the stage (x is downstream in the smolt run, upstream on the return). */
  x: number;
  fryGrowth: number;
  /** The fry stage's moment (the one coming up, during a time skip); null elsewhere. */
  fryPhase: Exclude<FryPhase, 'skip'> | 'done' | null;
  smoltSection: SmoltSection | null;
  /** School-mates within a few body lengths (smolt run). */
  schoolNear: number;
  /** x of the coastline on the return. */
  coast: number | null;
  spawn: { dig: number; spawned: boolean; hiding: boolean; nearFemale: boolean; burial: number } | null;
  /** Heading in radians, and whether a burst is on (for the onboarding steps). */
  yaw: number;
  burst: boolean;
}

/** What the player has done so far in this stage, gathered frame by frame (onboarding). */
export interface GuideObs {
  /** Radians turned each way. */
  left: number;
  right: number;
  /** Metres dived and risen. */
  down: number;
  up: number;
  /** Bursts started. */
  bursts: number;
  last: { yaw: number; depth: number; burst: boolean } | null;
}

/** Keys and pictures a step can show in the controls picture (src/ui/controlsPicture.ts). */
export type GuideKey = 'steer' | 'forward' | 'dive' | 'rise' | 'burst' | 'act' | 'mouse';

/** Event counts for the current stage, keyed like journal triggers, plus 'eat'. */
export type GuideCounts = Readonly<Record<string, number>>;

export interface GuideStep {
  text: string;
  /** The step is done when this holds (for `hold` seconds, if given). */
  done: (s: GuideSnapshot, c: GuideCounts, o: GuideObs) => boolean;
  hold?: number;
  /** Passed over without being done, because the moment has gone by. */
  skipIf?: (s: GuideSnapshot, c: GuideCounts) => boolean;
  /** A short progress readout, for example "3 / 5". */
  progress?: (s: GuideSnapshot, c: GuideCounts) => string;
  /** Caption IDs this step says already; they stay off screen while it is up (see guideCovers). */
  covers?: string[];
  /** Controls to show in the picture while this step is up. */
  keys?: GuideKey[];
}

const n = (c: GuideCounts, ...keys: string[]) => keys.reduce((sum, k) => sum + (c[k] ?? 0), 0);
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const never = () => false;
const EAT_GOAL = 5;
const SCHOOL_GOAL = 3;
const BIRD_DEPTH = 2.5;
/** Past any wrong river's dead end, so the fish is surely in the home river. */
const HOME_RIVER_PAST_COAST = 35;
/** Onboarding: radians to turn each way, and metres to dive and rise. */
const TURN_GOAL = 0.6;
const DEPTH_GOAL = 0.6;

export function guideSteps(stage: StageId, role: SpawnRole | null): GuideStep[] {
  switch (stage) {
    case 'egg':
      return [
        { text: 'Wait for the egg to hatch.', done: (s) => !!s.alevin?.hatched },
        {
          text: 'When the flow swings round, turn {key:steer} until you face upstream, and hold there.',
          done: (s, c) => n(c, 'warning.flow') > 0 && !!s.alevin?.aligned && !s.alevin.turning,
          hold: 0.5,
          skipIf: (s) => !!s.alevin?.ready,
          covers: ['egg.flow'],
          keys: ['steer'],
        },
        {
          text: 'Rising, cloudy water means a flood. Get right down in the gravel {key:dive} and keep turning upstream until it passes.',
          done: (_s, c) => n(c, 'egg.floodOver') > 0,
          covers: ['egg.floodComing', 'egg.flood'],
          keys: ['steer', 'dive'],
        },
        {
          text: 'Keep facing upstream and stay low {key:dive}. Wait for the yolk to run low.',
          done: (s) => !!s.alevin?.ready,
          progress: (s) => `yolk ${pct(s.yolk)}`,
          covers: ['egg.loosening'],
          keys: ['steer', 'dive'],
        },
        { text: 'Now swim up toward the light {hold:rise}.', done: never, covers: ['egg.ready'], keys: ['rise'] },
      ];
    case 'fry':
      // Onboarding: the first free swimming of a guided life teaches steering, depth and burst by doing.
      return [
        {
          text: 'Swim {key:forward} and steer {key:steer}: turn one way, then the other.',
          done: (s, _c, o) => s.thrust > 0.3 && o.left >= TURN_GOAL && o.right >= TURN_GOAL,
          covers: ['fry.controls'],
          keys: ['forward', 'steer', 'mouse'],
        },
        { text: 'Change depth: dive {key:dive}, then rise {key:rise}.', done: (_s, _c, o) => o.down >= DEPTH_GOAL && o.up >= DEPTH_GOAL, keys: ['dive', 'rise'] },
        { text: 'Now a burst {key:burst}: a quick dash that spends energy. Save it for escapes.', done: (_s, _c, o) => o.bursts > 0, keys: ['burst'] },
        {
          text: 'Swim through the glowing plankton to feed.',
          done: (_s, c) => n(c, 'eat') >= EAT_GOAL,
          progress: (_s, c) => `${Math.min(EAT_GOAL, n(c, 'eat'))} / ${EAT_GOAL} eaten`,
          covers: ['fry.controls'],
        },
        {
          text: 'Keep cover close. If rings spread through the water, dart into the weeds.',
          done: (_s, c) => n(c, 'fry.safeWeeds') > 0,
          skipIf: (s) => s.fryPhase === 'winter' || s.fryPhase === 'decide' || s.fryPhase === 'second',
          covers: ['fry.lesson', 'fry.trout'],
        },
        {
          text: 'Grow through the seasons.',
          done: (s) => s.fryPhase === 'decide' || s.fryPhase === 'second',
          progress: (s) => `grown ${pct(s.fryGrowth)}`,
        },
        { text: 'Spring: your choice. Leave the lake now, or spend another year growing.', done: never, progress: (s) => `grown ${pct(s.fryGrowth)}` },
      ];
    case 'smolt':
      return [
        {
          text: 'Keep a few other smolts close as you swim downstream {key:forward}.',
          done: (s) => s.schoolNear >= SCHOOL_GOAL && s.thrust > 0.2,
          hold: 1.5,
          skipIf: (s) => s.smoltSection !== 'outlet',
        },
        { text: 'Get past the lake outlet. If a char lunges, burst away {key:burst}.', done: (s) => s.smoltSection !== 'outlet', keys: ['burst'] },
        {
          text: 'Birds next. Watch above you, and dive deep {key:dive} when a shadow crosses.',
          done: (s, c) => n(c, 'warning.bird') > 0 && s.depth >= BIRD_DEPTH,
          skipIf: (s) => s.smoltSection === 'mouth',
          covers: ['smolt.bird'],
          keys: ['dive'],
        },
        { text: 'On to the sea. If a seal comes, swim across its path, not away.', done: never, covers: ['smolt.seal'] },
      ];
    case 'ocean':
      return [
        {
          text: 'Feed: swim through the swarm of food.',
          done: (_s, c) => n(c, 'eat') >= EAT_GOAL,
          skipIf: (_s, c) => n(c, 'warning.orca') > 0,
          progress: (_s, c) => `${Math.min(EAT_GOAL, n(c, 'eat'))} / ${EAT_GOAL} eaten`,
        },
        { text: 'Watch for an orca. When it charges, swim across its path, not away from it.', done: (_s, c) => n(c, 'ocean.orcaGone') > 0, covers: ['ocean.orca', 'ocean.shark'] },
        { text: 'A salmon shark next. The same trick: cut across its line.', done: (_s, c) => n(c, 'ocean.sharkGone') > 0, covers: ['ocean.shark'] },
        { text: 'Keep feeding until it is time to turn for home.', done: never },
      ];
    case 'return': {
      const pastCoast = (s: GuideSnapshot, by = 0) => s.coast !== null && s.x > s.coast + by;
      return [
        {
          text: 'Follow the faint blue shimmer of the magnetic track toward the coast. If it fades, sweep side to side to find it.',
          done: (s) => s.coast !== null && s.x >= s.coast / 2,
          skipIf: (s) => pastCoast(s),
          covers: ['return.track', 'return.lostTrack'],
        },
        { text: 'Nets ahead. Find a gap in the net line and slip through.', done: (_s, c) => n(c, 'return.pastNets') > 0, skipIf: (s) => pastCoast(s) },
        {
          text: 'At the coast, choose the river mouth with the scent of home. If one seems wrong, turn back.',
          done: (_s, c) => n(c, 'return.rightRiver') > 0,
          skipIf: (s) => pastCoast(s, HOME_RIVER_PAST_COAST),
          covers: ['return.pastNets', 'return.wrongRiver'],
        },
        {
          text: 'Get up through the rapids and over the falls.',
          done: (_s, c) => n(c, 'return.firstLeap') + n(c, 'return.chuteUp') > 0,
          skipIf: (s) => s.coast !== null && s.x > LIP_END + 1,
          keys: ['burst', 'rise'],
        },
        { text: 'On up to the fork, then follow the scent home.', done: never },
      ];
    }
    case 'spawn':
      if (role === 'female')
        return [
          { text: 'Find gravel of medium cobble, then dig {hold:act} over it.', done: (s) => (s.spawn?.dig ?? 0) > 0, covers: ['spawn.female', 'spawn.needGravel'], keys: ['act'] },
          { text: 'Keep digging until the redd is finished.', done: (s) => (s.spawn?.dig ?? 0) >= 1 || !!s.spawn?.spawned, progress: (s) => `redd ${pct(s.spawn?.dig ?? 0)}`, keys: ['act'] },
          { text: 'Wait over the finished redd for a male.', done: (s) => !!s.spawn?.spawned, covers: ['spawn.reddReady', 'spawn.waitMale'] },
          { text: 'Cover the eggs: sweep gravel over them {hold:act} over the redd.', done: (s) => (s.spawn?.burial ?? 0) >= 1, progress: (s) => `covered ${pct(s.spawn?.burial ?? 0)}`, covers: ['spawn.bury'], keys: ['act'] },
          { text: 'Now guard the eggs: drive other females away {key:burst}.', done: never, covers: ['spawn.buried'], keys: ['burst'] },
        ];
      if (role === 'jack')
        return [
          { text: 'Settle into the green ring by the bank. It is your hiding place.', done: (s) => !!s.spawn?.hiding, covers: ['spawn.jack', 'spawn.jackBeach'] },
          {
            text: 'Wait for the big males to fight. When the screen flashes green, dart in beside the female {key:act}.',
            done: (_s, c) => n(c, 'spawn.jackSuccess') > 0,
            covers: ['spawn.jackWindow'],
            keys: ['act'],
          },
          { text: 'Back into cover. Another opening may come before the season ends.', done: never },
        ];
      return [
        { text: 'Swim to the female and stay beside her.', done: (s) => !!s.spawn?.nearFemale, hold: 1.5, covers: ['spawn.largeMale'] },
        {
          text: 'When a rival comes, meet him side-on with a burst {key:burst}.',
          done: (_s, c) => n(c, 'spawn.fightWon', 'spawn.fightWonSide', 'spawn.chargeWorked') > 0,
          skipIf: (s) => !!s.spawn?.spawned,
          covers: ['spawn.rivalMale', 'spawn.largeMale'],
          keys: ['burst'],
        },
        { text: 'Stay with her until she spawns.', done: (s) => !!s.spawn?.spawned },
        {
          text: 'Another female may come. Go to her for a second chance, at a cost in strength and bear risk, or stay with this one.',
          done: never,
          covers: ['spawn.secondFemale'],
        },
      ];
  }
}

/**
 * Whether the guide already says what this caption says, so the caption stays
 * off screen (it still goes to the journal's "This life" page). A warning is
 * covered only by the step on screen; any other line also by a step still to
 * come in this stage, so the guide says it at the right moment instead.
 */
export function guideCovers(stage: StageId, role: SpawnRole | null, index: number, id: string, warning: boolean): boolean {
  const steps = guideSteps(stage, role);
  const upto = warning ? index + 1 : steps.length;
  return steps.slice(Math.max(0, index), upto).some((s) => s.covers?.includes(id));
}

export interface GuideState {
  /** Which fish, stage and role the state belongs to; a change starts the stage's steps afresh. */
  key: string;
  index: number;
  held: number;
  counts: Record<string, number>;
  obs: GuideObs;
}

export const guideKey = (s: Pick<GuideSnapshot, 'fishId' | 'stage' | 'role'>): string => `${s.fishId}:${s.stage}:${s.role ?? ''}`;

export function freshGuideState(key: string): GuideState {
  return { key, index: 0, held: 0, counts: {}, obs: { left: 0, right: 0, down: 0, up: 0, bursts: 0, last: null } };
}

/** Count events toward the steps. Returns a new state. */
export function countGuideEvents(state: GuideState, events: readonly SimEvent[]): GuideState {
  const counts = { ...state.counts };
  for (const ev of events) for (const k of ev.type === 'eat' ? ['eat'] : triggersFor(ev)) counts[k] = (counts[k] ?? 0) + 1;
  return { ...state, counts };
}

/** Advance through every step that is done (or has gone by). Returns a new state. */
export function advanceGuide(state: GuideState, snap: GuideSnapshot, dt: number): GuideState {
  const key = guideKey(snap);
  let st: GuideState = state.key === key ? { ...state } : freshGuideState(key);
  st.obs = observe(st.obs, snap);
  const steps = guideSteps(snap.stage, snap.role);
  while (st.index < steps.length - 1) {
    const step = steps[st.index] as GuideStep;
    if (step.skipIf?.(snap, st.counts)) {
      st = { ...st, index: st.index + 1, held: 0 };
      continue;
    }
    if (!step.done(snap, st.counts, st.obs)) {
      st.held = 0;
      break;
    }
    const held = st.held + dt;
    if (held + 1e-9 < (step.hold ?? 0)) {
      st.held = held;
      break;
    }
    st = { ...st, index: st.index + 1, held: 0 };
  }
  return st;
}

/** Add this frame's turning, depth change and bursts to what the player has done. */
export function observe(o: GuideObs, snap: GuideSnapshot): GuideObs {
  const next = { ...o, last: { yaw: snap.yaw, depth: snap.depth, burst: snap.burst } };
  const l = o.last;
  if (!l) return next;
  const turn = wrapAngle(snap.yaw - l.yaw);
  if (turn > 0) next.left += turn;
  else next.right -= turn;
  const dz = snap.depth - l.depth;
  if (dz > 0) next.down += dz;
  else next.up -= dz;
  if (snap.burst && !l.burst) next.bursts += 1;
  return next;
}

export interface GuidePrompt {
  text: string;
  keys: GuideKey[];
  progress: string | null;
  step: number;
  total: number;
}

export function guidePrompt(state: GuideState, snap: GuideSnapshot): GuidePrompt | null {
  const steps = guideSteps(snap.stage, snap.role);
  const step = steps[state.index];
  if (!step) return null;
  return { text: guideText(step.text), keys: step.keys ?? [], progress: step.progress?.(snap, state.counts) ?? null, step: state.index + 1, total: steps.length };
}

/** Read what the guide needs from the world, through public helpers only. */
export function guideSnapshot(w: World): GuideSnapshot {
  const a = alevinView(w);
  const sp = spawnState(w);
  const body = w.body;
  let alevin: GuideSnapshot['alevin'] = null;
  if (a) {
    const upstream = wrapAngle(a.currentAngle + Math.PI);
    const aligned = Math.abs(wrapAngle(body.yaw - upstream)) < w.p.get('alevin.alignTolerance');
    alevin = { hatched: a.phase === 'alevin', aligned, turning: a.warning, ready: a.ready };
  }
  const female = sp ? w.live('female')[0] : undefined;
  const near = 4; // the same "beside her" distance the spawning stage uses
  return {
    fishId: w.fish.id,
    stage: w.stageId,
    role: sp?.role ?? null,
    alevin,
    yolk: w.progress.yolk,
    thrust: body.thrust,
    depth: w.arena.surfaceY - body.pos.y,
    x: body.pos.x,
    fryGrowth: fryGrowth(w),
    fryPhase: ((v) => (v ? (v.phase === 'skip' ? v.next : v.phase) : null))(fryView(w)),
    smoltSection: w.stageId === 'smolt' ? smoltSection(w) : null,
    schoolNear: w.stageId === 'smolt' ? w.live('smolt').filter((s) => dist(s.pos, body.pos) < 6).length : 0,
    coast: returnLayout(w)?.coast ?? null,
    yaw: body.yaw,
    burst: body.burst,
    spawn: sp ? { dig: sp.dig, spawned: sp.spawned, hiding: sp.owners.includes(0), nearFemale: !!female && dist(female.pos, body.pos) < near, burial: sp.burial } : null,
  };
}

// ---------- On screen ----------

const SKIP_KEY = 'homewater.guideSkipped';

function readSkipped(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

/** The on-screen guide. App feeds it events and frames; it decides what to show. */
export class Guide {
  private state: GuideState = freshGuideState('');
  private el: HTMLElement | null = null;
  private skippedFor: string | null = readSkipped();
  private shownIndex = -1;

  /** `lifeKey` names this life (lineage and generation), so a skip lasts for the life. */
  isSkipped(lifeKey: string): boolean {
    return this.skippedFor === lifeKey;
  }

  skip(lifeKey: string): void {
    this.skippedFor = lifeKey;
    try {
      localStorage.setItem(SKIP_KEY, lifeKey);
    } catch {
      // Without storage the skip lasts until the page reloads.
    }
    this.hide();
  }

  private stage: StageId | null = null;
  private role: SpawnRole | null = null;

  events(w: World, events: readonly SimEvent[]): void {
    this.stage = w.stageId;
    this.role = spawnState(w)?.role ?? null;
    const key = guideKey({ fishId: w.fish.id, stage: w.stageId, role: this.role });
    if (this.state.key !== key) this.state = freshGuideState(key);
    this.state = countGuideEvents(this.state, events);
  }

  /** True if the step on screen (or, for a non-warning, one still to come) already says what this caption says. */
  covers(id: string, warning: boolean): boolean {
    return !!this.stage && guideCovers(this.stage, this.role, this.state.index, id, warning);
  }

  /** Call every frame. `active` is false outside a guided life, or when not playing. */
  frame(w: World, dt: number, active: boolean, onSkip: () => void): void {
    if (!active) {
      this.hide();
      return;
    }
    const snap = guideSnapshot(w);
    this.state = advanceGuide(this.state, snap, dt);
    const prompt = guidePrompt(this.state, snap);
    if (!prompt) {
      this.hide();
      return;
    }
    this.render(prompt, onSkip);
  }

  private render(p: GuidePrompt, onSkip: () => void): void {
    if (!this.el) {
      const hud = document.getElementById('hud');
      if (!hud) return;
      this.el = h('div', { id: 'guide', role: 'status' });
      hud.append(this.el);
    }
    const el = this.el;
    el.hidden = false;
    const sig = `${this.state.key}:${p.step}:${p.text}:${p.progress ?? ''}:${p.keys.join(',')}`;
    if (el.dataset.sig === sig) return;
    const advanced = this.shownIndex !== p.step;
    this.shownIndex = p.step;
    el.dataset.sig = sig;
    el.dataset.step = String(p.step);
    const parts: Node[] = [
      h('div', { class: 'guide-head' }, h('span', { class: 'label' }, `Field guide · step ${p.step} of ${p.total}`), h('button', { class: 'guide-skip', id: 'btn-skip-guide', onclick: onSkip }, `Skip guidance (${k('guide')})`)),
      h('p', {}, p.text),
    ];
    if (p.progress) parts.push(h('p', { class: 'guide-progress' }, p.progress));
    if (p.keys.length) parts.push(controlsPicture(p.keys));
    el.replaceChildren(...parts);
    if (advanced) {
      el.classList.remove('advance');
      void el.offsetWidth;
      el.classList.add('advance');
    }
  }

  hide(): void {
    if (this.el) this.el.hidden = true;
  }
}
