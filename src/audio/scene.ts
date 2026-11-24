/**
 * What the sound needs to know about the world, read once per control tick
 * through the simulation's public views. The engine works from this
 * snapshot, so the offline renderer (scripts/audio-render.mjs) can drive it
 * with made-up scenes and no simulation at all.
 */
import { depthOf } from '../sim/swim';
import { alevinView } from '../sim/stages/egg';
import { fallsView, RAPIDS_START, POOL_START } from '../sim/stages/falls';
import { fryView } from '../sim/stages/fry';
import { isRiffle, returnLayout } from '../sim/stages/return';
import { lakeView } from '../sim/stages/returnLake';
import { smoltSection, smoltView } from '../sim/stages/smolt';
import type { EntityKind } from '../sim/types';
import type { World } from '../sim/world';
import { dangerLevel, fallsNear, PREDATORS, type Place } from './mood';

export interface HeardPredator {
  id: number;
  kind: EntityKind;
  state: string;
  /** Distance across the water from the fish, world units. */
  dist: number;
}

export interface AudioScene {
  /** Changes when the fish or stage changes (strike watching restarts). */
  key: string;
  place: Place;
  /** Target danger, 0..1. */
  danger: number;
  energy: number;
  /** Fat on the return (1 elsewhere). */
  fat: number;
  speed: number;
  thrust: number;
  burst: boolean;
  /** The fish swims (false for the egg stage's alevin). */
  swims: boolean;
  /** In the air at the falls. */
  leaping: boolean;
  predators: HeardPredator[];
}

export function emptyScene(): AudioScene {
  return { key: '', place: { stage: 'egg' }, danger: 0, energy: 1, fat: 1, speed: 0, thrust: 0, burst: false, swims: false, leaping: false, predators: [] };
}

const CROWD: ReadonlySet<EntityKind> = new Set<EntityKind>(['crowdFemale', 'crowdMale', 'crowdJack']);

/** Fill `out` from the world. */
export function readScene(w: World, out: AudioScene): AudioScene {
  const stage = w.stageId;
  const b = w.body;
  out.key = `${w.stageIndex}:${w.fish.id}`;
  const place: Place = { stage, depth: depthOf(w) };
  const falls = stage === 'return' ? fallsView(w) : null;
  if (stage === 'return') {
    const lay = returnLayout(w);
    const x = b.pos.x;
    const inRiver = !!lay && x > lay.coast;
    place.inRiver = inRiver;
    place.riffle = inRiver && isRiffle(x);
    const lake = lakeView(w);
    place.lake = !!lake?.inside;
    if (falls && inRiver && !place.lake) {
      const dx = x - falls.face;
      const dz = b.pos.z - falls.notchZ;
      place.falls = fallsNear(Math.sqrt(dx * dx + dz * dz));
      place.rapids = x >= RAPIDS_START && x < POOL_START && Math.abs(dz) < (lay?.riverHalf ?? 0) * 1.5;
    }
  } else if (stage === 'smolt') {
    const sec = smoltSection(w);
    place.mouth = sec === 'mouth';
    const v = smoltView(w);
    if (v && v.estuary >= 0) place.estuary = v.estuary;
  } else if (stage === 'egg') {
    place.flood = alevinView(w)?.floodLevel ?? 0;
  } else if (stage === 'fry') {
    place.light = fryView(w)?.light ?? 1;
  } else if (stage === 'spawn') {
    let n = 0;
    for (const e of w.entities) if (e.alive && CROWD.has(e.kind)) n++;
    place.crowd = n;
  }
  out.place = place;
  out.danger = dangerLevel(w.entities);
  out.energy = b.energy;
  out.fat = stage === 'return' ? w.progress.fat : 1;
  const v = b.vel;
  out.speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  out.thrust = b.thrust;
  out.burst = b.burst;
  out.swims = stage !== 'egg';
  out.leaping = falls?.leapT != null;
  let i = 0;
  for (const e of w.entities) {
    if (!e.alive || !PREDATORS.has(e.kind)) continue;
    const dx = e.pos.x - b.pos.x;
    const dz = e.pos.z - b.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const p = out.predators[i];
    if (p) {
      p.id = e.id;
      p.kind = e.kind;
      p.state = e.state;
      p.dist = dist;
    } else out.predators.push({ id: e.id, kind: e.kind, state: e.state, dist });
    i++;
  }
  out.predators.length = i;
  return out;
}
