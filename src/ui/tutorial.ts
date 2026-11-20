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
}

/** Event counts for the current stage, keyed like journal triggers, plus 'eat'. */
export type GuideCounts = Readonly<Record<string, number>>;

export interface GuideStep {
  text: string;
  /** The step is done when this holds (for `hold` seconds, if given). */
  done: (s: GuideSnapshot, c: GuideCounts) => boolean;
  hold?: number;
  /** Passed over without being done, because the moment has gone by. */
  skipIf?: (s: GuideSnapshot, c: GuideCounts) => boolean;
  /** A short progress readout, for example "3 / 5". */
  progress?: (s: GuideSnapshot, c: GuideCounts) => string;
}

const n = (c: GuideCounts, ...keys: string[]) => keys.reduce((sum, k) => sum + (c[k] ?? 0), 0);
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const never = () => false;
const EAT_GOAL = 5;
const SCHOOL_GOAL = 3;
const BIRD_DEPTH = 2.5;
/** Past any wrong river's dead end, so the fish is surely in the home river. */
const HOME_RIVER_PAST_COAST = 35;

export function guideSteps(stage: StageId, role: SpawnRole | null): GuideStep[] {
  switch (stage) {
    case 'egg':
      return [
        { text: 'Wait. An egg can do little but wait for the alevin to hatch.', done: (s) => !!s.alevin?.hatched },
        {
          text: 'The flow will swing round. Turn to face into the current {key:steer}, and hold it there.',
          done: (s, c) => n(c, 'warning.flow') > 0 && !!s.alevin?.aligned && !s.alevin.turning,
          hold: 0.5,
          skipIf: (s) => !!s.alevin?.ready,
        },
        {
          text: 'When the water rises and clouds, a flood is coming. Get right down in the gravel {key:dive} and keep turning to face upstream until it passes.',
          done: (_s, c) => n(c, 'egg.floodOver') > 0,
        },
        {
          text: 'Keep facing upstream each time the flow swings, and stay low in the gravel {key:dive}. Wait for the yolk to run low.',
          done: (s) => !!s.alevin?.ready,
          progress: (s) => `yolk ${pct(s.yolk)}`,
        },
        { text: 'The yolk is nearly gone. Swim up toward the light {hold:rise}.', done: never },
      ];
    case 'fry':
      return [
        { text: 'Steer {key:steer}; to use the mouse, click the game first. Swim forward {key:forward}.', done: (s) => s.thrust > 0.3, hold: 1 },
        { text: 'Swim through the glowing plankton to feed.', done: (_s, c) => n(c, 'eat') >= EAT_GOAL, progress: (_s, c) => `${Math.min(EAT_GOAL, n(c, 'eat'))} / ${EAT_GOAL} eaten` },
        {
          text: 'Dolly Varden hunt in open water. If rings warn of a chase, escape into the weeds at the shallow edge.',
          done: (_s, c) => n(c, 'fry.safeWeeds') > 0,
          skipIf: (s) => s.fryPhase === 'winter' || s.fryPhase === 'decide' || s.fryPhase === 'second',
        },
        {
          text: 'Feed at dusk, when the plankton rises. In winter, stop swimming {key:forward} to rest, and take only the food that drifts close.',
          done: (s) => s.fryPhase === 'decide' || s.fryPhase === 'second',
          progress: (s) => `grown ${pct(s.fryGrowth)}`,
        },
        {
          text: 'Spring. Follow the drifting current to the outlet to leave, or wait in the weeds to stay another year.',
          done: never,
          progress: (s) => `grown ${pct(s.fryGrowth)}`,
        },
      ];
    case 'smolt':
      return [
        {
          text: 'Stay with the school: keep a few other smolts close as you swim downstream {key:forward}.',
          done: (s) => s.schoolNear >= SCHOOL_GOAL && s.thrust > 0.2,
          hold: 1.5,
          skipIf: (s) => s.smoltSection !== 'outlet',
        },
        { text: 'Char wait at the lake outlet. When rings warn of a lunge, burst away {key:burst}.', done: (s) => s.smoltSection !== 'outlet' },
        {
          text: 'A shadow on the surface means a diving bird. Dive deep {key:dive}, or hide under the overhanging banks.',
          done: (s, c) => n(c, 'warning.bird') > 0 && s.depth >= BIRD_DEPTH,
          skipIf: (s) => s.smoltSection === 'mouth',
        },
        { text: 'The river mouth. When a seal lunges, swim across its path, not away from it. Then on to the sea.', done: never },
      ];
    case 'ocean':
      return [
        {
          text: 'Feed: swim through the swarm of food.',
          done: (_s, c) => n(c, 'eat') >= EAT_GOAL,
          skipIf: (_s, c) => n(c, 'warning.orca') > 0,
          progress: (_s, c) => `${Math.min(EAT_GOAL, n(c, 'eat'))} / ${EAT_GOAL} eaten`,
        },
        { text: 'Watch for an orca. When it charges, swim across its path, not away from it.', done: (_s, c) => n(c, 'ocean.orcaGone') > 0 },
        { text: 'A salmon shark next. The same trick: swim across its path.', done: (_s, c) => n(c, 'ocean.sharkGone') > 0 },
        { text: 'Keep feeding until it is time to turn for home.', done: never },
      ];
    case 'return': {
      const pastCoast = (s: GuideSnapshot, by = 0) => s.coast !== null && s.x > s.coast + by;
      return [
        {
          text: 'Follow the faint blue shimmer of the magnetic track toward the coast. If it fades, sweep side to side to find it.',
          done: (s) => s.coast !== null && s.x >= s.coast / 2,
          skipIf: (s) => pastCoast(s),
        },
        { text: 'Nets ahead. Find a gap in the net line and slip through.', done: (_s, c) => n(c, 'return.pastNets') > 0, skipIf: (s) => pastCoast(s) },
        {
          text: 'Find the river mouth that smells like home. If a river smells wrong, turn back.',
          done: (_s, c) => n(c, 'return.rightRiver') > 0,
          skipIf: (s) => pastCoast(s, HOME_RIVER_PAST_COAST),
        },
        {
          text: 'Rapids, then a falls. Rest behind boulders between dashes. Below the falls, build speed and burst and rise together {key:burst} {key:rise} to leap, from the standing wave under the low step.',
          done: (_s, c) => n(c, 'return.firstLeap') + n(c, 'return.chuteUp') > 0,
          skipIf: (s) => s.coast !== null && s.x > LIP_END + 1,
        },
        { text: 'Bears fish the shallow riffles and the lip of the falls. Stay among the other fish, wait in a pool, then cross deep and fast. At the fork, follow the scent.', done: never },
      ];
    }
    case 'spawn':
      if (role === 'female')
        return [
          { text: 'Look for gravel of medium cobble, then dig the redd over it {hold:act}.', done: (s) => (s.spawn?.dig ?? 0) > 0 },
          { text: 'Keep digging. Drive off rival females with a burst {key:burst}.', done: (s) => (s.spawn?.dig ?? 0) >= 1 || !!s.spawn?.spawned, progress: (s) => `redd ${pct(s.spawn?.dig ?? 0)}` },
          { text: 'Stay over the finished redd until a male joins you. If two males come, you spawn with the winner.', done: (s) => !!s.spawn?.spawned },
          { text: 'Cover the eggs: sweep gravel over them {hold:act} over the redd.', done: (s) => (s.spawn?.burial ?? 0) >= 1, progress: (s) => `covered ${pct(s.spawn?.burial ?? 0)}` },
          { text: 'Guard the redd against other females (burst {key:burst}) for as long as your strength lasts.', done: never },
        ];
      if (role === 'jack')
        return [
          { text: 'Settle into a hiding spot under the bank. The green ring is yours.', done: (s) => !!s.spawn?.hiding },
          { text: 'Wait for the big males to fight. When the screen flashes green, dart in beside the female {key:act}.', done: (_s, c) => n(c, 'spawn.jackSuccess') > 0 },
          { text: 'Back into cover. Another opening may come before the season ends.', done: never },
        ];
      return [
        { text: 'Swim to the female and stay beside her.', done: (s) => !!s.spawn?.nearFemale, hold: 1.5 },
        {
          text: 'When a rival comes, ram him side-on with a burst {key:burst} before he reaches her.',
          done: (_s, c) => n(c, 'spawn.fightWon', 'spawn.fightWonSide', 'spawn.chargeWorked') > 0,
          skipIf: (s) => !!s.spawn?.spawned,
        },
        { text: 'Stay with her until she spawns. Watch for bears: they go for big males first.', done: (s) => !!s.spawn?.spawned },
        { text: 'Another female may come. Go to her for a second chance, at a cost in strength and bear risk, or stay with this one.', done: never },
      ];
  }
}

export interface GuideState {
  /** Which fish, stage and role the state belongs to; a change starts the stage's steps afresh. */
  key: string;
  index: number;
  held: number;
  counts: Record<string, number>;
}

export const guideKey = (s: Pick<GuideSnapshot, 'fishId' | 'stage' | 'role'>): string => `${s.fishId}:${s.stage}:${s.role ?? ''}`;

export function freshGuideState(key: string): GuideState {
  return { key, index: 0, held: 0, counts: {} };
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
  const steps = guideSteps(snap.stage, snap.role);
  while (st.index < steps.length - 1) {
    const step = steps[st.index] as GuideStep;
    if (step.skipIf?.(snap, st.counts)) {
      st = { ...st, index: st.index + 1, held: 0 };
      continue;
    }
    if (!step.done(snap, st.counts)) {
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

export interface GuidePrompt {
  text: string;
  progress: string | null;
  step: number;
  total: number;
}

export function guidePrompt(state: GuideState, snap: GuideSnapshot): GuidePrompt | null {
  const steps = guideSteps(snap.stage, snap.role);
  const step = steps[state.index];
  if (!step) return null;
  return { text: guideText(step.text), progress: step.progress?.(snap, state.counts) ?? null, step: state.index + 1, total: steps.length };
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

  events(w: World, events: readonly SimEvent[]): void {
    const key = guideKey({ fishId: w.fish.id, stage: w.stageId, role: spawnState(w)?.role ?? null });
    if (this.state.key !== key) this.state = freshGuideState(key);
    this.state = countGuideEvents(this.state, events);
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
    const sig = `${this.state.key}:${p.step}:${p.text}:${p.progress ?? ''}`;
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
