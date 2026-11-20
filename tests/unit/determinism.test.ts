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
  egg: ['b2c28344', 'dd10ca25', 'be9caab7', 'dd4ff863'],
  fry: ['0a9edf9f', '84574f87', '6e0a5427', '64b9cd65'],
  smolt: ['672c5f08', '257729cb', '5a18184f', 'b80eeafe'],
  ocean: ['bd400d57', '3f004311', '521dfaa4', '935ae1b3'],
  return: ['f3781035', 'd2701c0d', '6cc063e2', '6104ecf0'],
  'spawn female': ['1647f38f', '0eb3e886', '67083792', 'c32285b1'],
  'spawn male': ['01cf95f0', 'b7eb5338', '78be6385', 'a593f25b'],
  'spawn jack': ['c8b46c2f', 'b810ddab', '040c82da', 'cf3354e9'], // updated: a jack's charge for a hiding spot now rolls once per press
  'spawn wild': ['23c00598', '5f0d0306', '908f4866', 'fc24deaa'],
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
