/**
 * Determinism guard for performance work: each stage runs a fixed number of steps
 * with a fixed seed and a scripted intent, and a hash of the whole world state
 * (body, entities, stage scratch, progress, events, rng) must match the value
 * recorded before any optimisation. If a change alters a hash, it changed the
 * simulation: either fix it, or (for an intended gameplay change) re-record with
 * `HW_PRINT_HASHES=1 npx vitest run tests/unit/determinism.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { Intent, Sex } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { intent, newWorld } from './helpers';

/** A busy but repeatable player: swims, turns, bursts, rises, dives and acts. */
function scripted(i: number): Intent {
  const phase = Math.floor(i / 90) % 6;
  return intent({
    forward: phase === 5 ? 0 : 0.6 + 0.4 * Math.sin(i * 0.013),
    turn: Math.sin(i * 0.021) * (phase === 2 ? 1 : 0.5),
    mouseX: phase === 3 ? Math.cos(i * 0.05) * 4 : 0,
    mouseY: phase === 4 ? Math.sin(i * 0.03) * 3 : 0,
    hold: phase === 5,
    burst: i % 240 < 20,
    rise: phase === 1 && i % 60 < 30,
    dive: phase === 4 && i % 50 < 20,
    action: i % 300 > 200,
    actionPressed: i % 300 === 201 || i % 157 === 0,
    risePressed: i % 120 === 0,
  });
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function snapshot(w: World): string {
  const replacer = (_k: string, v: unknown) => {
    if (v instanceof Set) return { set: [...v] };
    if (v instanceof Map) return { map: [...v.entries()] };
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    return v;
  };
  return JSON.stringify(
    {
      rng: w.rng.state,
      time: w.time,
      stageTime: w.stageTime,
      stage: w.stageId,
      status: w.status,
      death: w.deathCause,
      body: w.body,
      progress: w.progress,
      fish: w.fish,
      entities: w.entities,
      scratch: w.stage,
      events: w.events,
      spawnResult: w.spawnResult,
      checkpoint: w.checkpoint,
    },
    replacer,
  );
}

interface Case {
  name: string;
  stage: number;
  sex: Sex;
  preset?: 'quick' | 'jack';
  difficulty?: 'fieldGuide' | 'wild';
  seed: number;
}

const CASES: Case[] = [
  { name: 'egg', stage: 0, sex: 'F', seed: 11 },
  { name: 'fry', stage: 1, sex: 'F', seed: 12 },
  { name: 'smolt', stage: 2, sex: 'M', seed: 13 },
  { name: 'ocean', stage: 3, sex: 'F', seed: 14 },
  { name: 'return', stage: 4, sex: 'M', seed: 15 },
  { name: 'spawn female', stage: 5, sex: 'F', seed: 16 },
  { name: 'spawn male', stage: 5, sex: 'M', seed: 17 },
  { name: 'spawn jack', stage: 5, sex: 'M', preset: 'jack', seed: 18 },
  { name: 'spawn wild', stage: 5, sex: 'M', difficulty: 'wild', seed: 19 },
];

const STEPS = 2400;
const CHUNKS = 4;

/** Recorded from the code before the performance work (one hash per quarter of the run). */
const EXPECTED: Record<string, string[]> = {
  // Re-recorded for imprinting (src/sim/imprint.ts, saves schema 4). LifeProgress gained `imprint`, which is part of every
  // snapshot, so every hash moved. Checked when re-recording: with `imprint` (and the stage's `imprintGain` scratch) left out
  // of the snapshot, ocean and all four spawn cases hashed exactly as before, so their simulations are unchanged. Egg and
  // smolt changed only by the imprint they learn and its captions; fry adds the home-water plume (new entities and dice);
  // the return's home scent now depends on imprint and wrong rivers carry their own smell (more dice).
  // Earlier: the egg-stage flood and brood-mates, the smolt run's strike dilution and near-miss grace, return bears fishing
  // only the home branch past the fork, and a jack's charge for a hiding spot rolling once per press.
  // Re-recorded for the egg threats (Track 2.5, eggThreats.ts): the alevin crawls (forward), a low-oxygen pocket, a sculpin
  // and silt join the flood in a queue of events, the yolk lasts longer, and oxygen wears down body.energy. The large stones
  // and the event plan come from a copy of the rng state, so the egg init draws no more numbers and adds no entities:
  // every other case hashed exactly as before.
  egg: ['2efda30e', 'f283f131', 'bd3c9d02', '2a720f35'],
  fry: ['a22d3271', '4b2ec372', '14cb01b4', '0f20e1b1'], // updated: fry day cycle and birds (lake days with light, plankton, warm water and char sight; mergansers from above). Only fry moved: no other case plays the lake.
  // Re-recorded for the estuary (src/sim/stages/estuary.ts): the run is longer, bank cover stops at the estuary (fewer cover
  // dice at init), the stage scratch gained `salt` (readiness and salinity) and the arena's current and floor change seaward.
  // Only the smolt case starts in this stage; every other case hashed exactly as before.
  smolt: ['94ad2640', '44be812d', '3f64edcc', '70942aab'],
  ocean: ['ae858e85', 'f876a0b9', 'e5aee7e6', '89d1e35f'], // updated: the ocean as a journey (Track 2.6): seasons with two food patches and a food budget, hunters that come where the food is, warmth rolled per year, the fish's growing size
  // Re-recorded for the lake crossing (returnLake.ts): the return's init now lays out the lake and its bears (more dice), the
  // arena reaches past the river's end and the stage ends across the lake. Only the return moved; every other hash is as before.
  // Re-recorded for the falls rework (falls.ts): the practice ledge in the rapids changes the floor and pushes the fish
  // out of it, the leap starts on one input (burst) with a remembered run-up, wider tolerances, half-price misses, faster
  // rest in the plunge pool, and the lip bear's Field guide grace. Only the return moved; every other hash is as before.
  return: ['5e7b3967', 'a14326d8', 'b964fddc', '96dccc7d'], // updated: falls rework and ocean journey (the jump fills progress.oceanBites on the recalibrated scale)
  'spawn female': ['eb90e44e', 'e3db8fde', '9030a1c4', '4b40c274'], // updated: falls rework and ocean journey (the jump fills progress.oceanBites on the recalibrated scale)
  'spawn male': ['7d6e7a12', '9d50c36c', 'd4aebb22', '2c2fb1ac'], // updated: falls rework and ocean journey (the jump fills progress.oceanBites on the recalibrated scale)
  'spawn jack': ['c52271dc', '62459c01', '6dbc689e', '1993a869'], // updated: falls rework and ocean journey (the jump fills progress.oceanBites on the recalibrated scale)
  'spawn wild': ['67b0a278', 'ee64474c', '9b23d7b4', '9bf0f1eb'], // updated: falls rework and ocean journey (the jump fills progress.oceanBites on the recalibrated scale)
};

describe('simulation determinism', () => {
  for (const c of CASES) {
    it(`${c.name}: ${STEPS} scripted steps hash the same`, () => {
      const { w } = newWorld({ seed: c.seed, sex: c.sex, preset: c.preset, difficulty: c.difficulty, startStage: c.stage });
      const hashes: string[] = [];
      let i = 0;
      for (let k = 0; k < CHUNKS; k++) {
        for (let j = 0; j < STEPS / CHUNKS; j++, i++) {
          if (w.status === 'dead' && w.canContinueWithSibling()) w.continueWithSibling(`Sib${i}`);
          if (w.status === 'playing') w.step(scripted(i));
        }
        hashes.push(fnv1a(snapshot(w)));
      }
      if (process.env.HW_PRINT_HASHES) {
        console.log(`  '${c.name}': ${JSON.stringify(hashes)}, // ${w.status} in ${w.stageId} at ${w.stageTime.toFixed(1)} s, ${w.siblingsLeft} siblings left`);
        return;
      }
      expect(hashes).toEqual(EXPECTED[c.name]);
    });
  }
});
