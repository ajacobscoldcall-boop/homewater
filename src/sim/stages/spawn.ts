/**
 * Stage 6: spawning and death on the spawning grounds.
 * - Female: judge the gravel by cobble size, dig the redd (hold E), wait over
 *   the finished redd for a male (she spawns with whichever male wins the
 *   fights beside her), cover the eggs (hold E), then guard the redd against
 *   other females until her strength runs out.
 * - Large male: stay beside the female and fight rivals. Advisor: males ram at
 *   right angles with mouths open, fights are quick and mostly settled by size,
 *   and what skill decides is timing and positioning. After spawning he may
 *   leave for a second female, at a cost in strength and bear risk.
 * - Jack: claim a hiding spot under the bank (other jacks fight for them when
 *   cover is scarce); when the big males clash, dart in (E). A sneak is worth
 *   less the more jacks there are on the grounds.
 * - Bears work the shallows. Advisor: they take males first, then large
 *   females, and jacks last. A bear patrols the bank between strikes, stalks
 *   along it to its chosen fish, then gives the same warning as before. A fish
 *   it catches is eaten on the bank, only partly in a big run (see
 *   bearFeeding.ts), and the remains are left for scavengers.
 * - Senescence: strength drains on the grounds and does not come back. It is
 *   the stage's natural end.
 */
import { yearJackFraction } from '../genetics';
import { swimStep } from '../swim';
import type { Params } from '../params';
import type { Vec3 } from '../types';
import type { World } from '../world';
import { v3 } from '../vec';
import type { StageDef } from './index';
import { addBear } from './spawn/bears';
import { stepFemale } from './spawn/female';
import { addFemale, stepLargeMale } from './spawn/largeMale';
import { rivalJackCount, stepJack } from './spawn/jack';
import { result } from './spawn/result';
import { initCrowd, stepCrowd } from './spawn/crowd';
import { addEggThieves, stepEggThieves } from './spawn/eggThieves';
import { arriveWithToll, stepPrespawn } from './heatToll';
import { roleOf, SPOT_Z, st, stepSenescence, type SpawnState } from './spawn/shared';

// The stage is split by concern under ./spawn/: shared state and rivals, bears, and one file per role.
export { roleOf, senescenceRate, type MalePhase, type SpawnRole } from './spawn/shared';
export { bearWeight } from './spawn/bears';
export { eggSurvival, rivalFemaleInterval } from './spawn/female';
export { fightWinChance } from './spawn/largeMale';
export { jackFrequencyFactor, jackSneakShare, largeMaleSneakLoss, rivalJackCount } from './spawn/jack';
export { crowdCount, crowdCounts, crowdDensity, crowdOpening, crowdRole, crowdVigour, patchContest, CROWD_FISH, type CrowdState } from './spawn/crowd';
export { gullReach } from './spawn/eggThieves';

export const spawnStage: StageDef = {
  id: 'spawn',
  arena: (w) => {
    const habitat = w.fish.habitat;
    if (habitat === 'river') {
      // Deeper, faster water over coarser gravel.
      return {
        kind: 'spawnRiver',
        min: v3(0, -6, -8),
        max: v3(40, 0, 8),
        surfaceY: 0,
        water: 'fresh',
        floor: (x, z) => -3.6 + 0.3 * Math.sin(x * 0.3) * Math.cos(z * 0.4) + 1.6 * Math.max(0, (Math.abs(z) - 5) / 3),
        current: () => v3(-2.0, 0, 0),
      };
    }
    if (habitat === 'beach') {
      // A lake shore: still water, shallow at the shore (z = +8), deepening offshore.
      return {
        kind: 'lakeBeach',
        min: v3(0, -6, -8),
        max: v3(40, 0, 8),
        surfaceY: 0,
        water: 'fresh',
        floor: (x, z) => -0.9 - 4.2 * ((8 - z) / 16) + 0.15 * Math.sin(x * 0.5),
        current: (pos) => v3(0, 0, 0.25 * Math.sin(pos.x * 0.2 + pos.z)),
      };
    }
    return {
      kind: 'spawnBed',
      min: v3(0, -4, -8),
      max: v3(40, 0, 8),
      surfaceY: 0,
      water: 'fresh',
      floor: (x, z) => -2.3 + 0.25 * Math.sin(x * 0.4) * Math.cos(z * 0.5) + 0.7 * Math.max(0, (Math.abs(z) - 5) / 3),
      current: () => v3(-0.8, 0, 0),
    };
  },
  init(w) {
    const p = w.p;
    const role = roleOf(w);
    const habitat = w.fish.habitat;
    const nSpots = p.get(`spawn.coverSpots.${habitat}`);
    const spots: Vec3[] = [];
    for (let i = 0; i < nSpots; i++) {
      const x = 16 + (14 * (i + 0.5)) / nSpots;
      spots.push(habitat === 'beach' ? v3(x, -1.4, 4.2) : v3(x, -1.5, SPOT_Z));
    }
    const s: SpawnState = {
      role,
      dig: 0,
      quality: 0,
      steals: 0,
      superimposed: 0,
      spawned: false,
      spawnedAt: -1,
      act: 0,
      burial: 0,
      contested: false,
      maleTimer: 0,
      rivalTimer: p.get('spawn.rivalInterval'),
      near: 0,
      stolen: 0,
      windowUntil: -1,
      sneaks: 0,
      share: 0,
      stunned: 0,
      fightsWon: 0,
      fightsLost: 0,
      bearTimer: (p.get('spawn.bearInterval') * 0.8) / Math.max(0.05, p.get(`spawn.bearRate.${habitat}`)),
      bearSide: 1,
      bearGoalX: 20,
      bearMeal: '',
      bearMealSize: 1,
      bearShare: 1,
      startle: {},
      vigour: 1,
      jackFraction: yearJackFraction(p, habitat, w.conditions),
      phase: 'first',
      mateId: 0,
      secondId: 0,
      secondAt: -1,
      firstShare: 0,
      secondShare: 0,
      stayed: 0,
      near2: 0,
      wait: 0,
      spots,
      owners: spots.map(() => -1),
      contest: 0,
      jacksBeat: 0,
      eggsTaken: 0,
      exposedFor: 0,
    };
    w.stage = s as unknown as Record<string, unknown>;
    w.body.scale = w.progress.adultSize ?? 1;
    if (habitat === 'beach') {
      // Boulders are the only cover on an open beach.
      for (const sp of spots) w.spawn('cover', v3(sp.x, w.arena.floor(sp.x, sp.z) + 0.9, sp.z + 1.2), { radius: 1.2, size: v3(2.2, 1.6, 1.6) });
    } else {
      const len = habitat === 'river' ? 10 : 18;
      w.spawn('cover', v3(23, -0.4, 6.8), { radius: 2, size: v3(len, 0.8, 2.6) });
    }
    // Advisor: gravel quality is mostly cobble size. Too large is hard to dig;
    // too small and the eggs get less oxygen. Medium cobble is best.
    const ideal = 0.2;
    for (let i = 0; i < 6; i++) {
      const cobble = habitat === 'river' ? w.rng.range(0.12, 0.5) : w.rng.range(0.07, 0.42);
      const quality = Math.max(0.25, 1 - Math.abs(cobble - ideal) / 0.22);
      const pz = habitat === 'beach' ? w.rng.range(-1, 4) : w.rng.range(-4.5, 3.5);
      const px = w.rng.range(8, 34);
      w.spawn('gravelPatch', v3(px, w.arena.floor(px, pz), pz), { radius: 2.2, value: quality, size: v3(cobble, 0, 0) });
    }
    if (role === 'female') {
      w.body.pos = v3(4, -1.5, 0);
    } else if (role === 'largeMale') {
      w.body.pos = v3(5, -1.5, 0);
      const patch = w.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      const at = patch ? v3(patch.pos.x, -1.7, patch.pos.z) : v3(22, -1.7, 0);
      s.mateId = addFemale(w, at).id;
    } else {
      w.body.pos = v3(10, -1.4, habitat === 'beach' ? 4.5 : 6.4);
      w.spawn('female', v3(24, -1.7, -1), { radius: 0.6, state: 'dig' });
      w.spawn('guardMale', v3(26, -1.6, -1), { radius: 0.8, state: 'guard', value: 1 });
      s.rivalTimer = p.get('spawn.jackFightInterval') * 0.6;
      // Frequency dependence: more jacks on the grounds in a jack-rich year.
      const n = rivalJackCount(p, s.jackFraction);
      for (let i = 0; i < n; i++) w.spawn('jackAI', v3(30 + i * 1.6, -1.5, habitat === 'beach' ? 4 : 6), { radius: 0.4, state: 'seek' });
      if (n >= nSpots) w.emit('caption', 'spawn.jackScarce');
    }
    addBear(w);
    addEggThieves(w);
    // The other spawners, kept clear of the player's start, the fish of the player's own story and the hiding spots.
    const crowd = initCrowd(w, [w.body.pos, ...w.entities.filter((e) => e.alive && (e.kind === 'female' || e.kind === 'guardMale')).map((e) => e.pos), ...spots]);
    w.emit('caption', `spawn.habitat.${habitat}`);
    const crowdLine = crowdCaption(p, crowd.rel);
    if (crowdLine) w.emit('caption', crowdLine);
    // A warm year's toll, carried up the river, and crowding in warm water: less strength, faster ageing, a chance of dying before spawning (heatToll.ts).
    arriveWithToll(w, crowd.rel);
    w.emit('caption', role === 'jack' && habitat === 'beach' ? 'spawn.jackBeach' : `spawn.${role}`);
  },
  step(w, intent, dt) {
    swimStep(w, intent, dt);
    // Keep the other fish just above the bottom, whatever the habitat's depth.
    for (const e of w.entities) {
      if (e.alive && (e.kind === 'rival' || e.kind === 'guardMale' || e.kind === 'jackAI' || e.kind === 'female')) e.pos.y = w.arena.floor(e.pos.x, e.pos.z) + 0.6;
    }
    const s = st(w);
    const spent = stepSenescence(w, dt);
    if (stepPrespawn(w, dt, s.spawned)) return;
    if (s.role === 'female') stepFemale(w, intent, dt, spent);
    else if (s.role === 'largeMale') stepLargeMale(w, intent, dt, spent);
    else stepJack(w, intent, dt, spent);
    if (w.status !== 'playing') return;
    stepEggThieves(w, intent, dt);
    stepCrowd(w, dt);
  },
  debugComplete(w) {
    const s = st(w);
    s.spawned = true;
    if (s.role === 'female') {
      s.dig = 1;
      s.quality = 0.8;
      s.burial = 1;
    } else if (s.role === 'jack') {
      s.sneaks = 1;
      s.share = 0.2;
    } else {
      s.firstShare = 0.6;
      s.near = w.stageTime;
    }
    w.finishLife(result(w));
  },
};

/** The grounds' opening line when the year is out of the ordinary: crowded or thin ('' in a typical year). */
export function crowdCaption(p: Params, rel: number): string {
  return rel > p.get('spawn.crowd.bigAbove') ? 'spawn.crowdBig' : rel < p.get('spawn.crowd.smallBelow') ? 'spawn.crowdSmall' : '';
}

export const spawnState = (w: World): Readonly<SpawnState> | null => (w.stageId === 'spawn' ? st(w) : null);
