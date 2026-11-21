/** Aggregation of raw bot results into the numbers the report shows. */
import type { Difficulty } from '../../src/sim/params';
import { STAGE_IDS, TRAIT_IDS, type StageId, type TraitId } from '../../src/sim/types';
import type { GenerationRow, LifeResult, LineageResult } from './play';
import type { SkillName } from './skills';

/** Stages as reported: the return is split at its checkpoints (the home river; the lake, marker 3). */
export const ROWS = ['egg', 'fry', 'smolt', 'ocean', 'return:sea', 'return:river', 'return:lake', 'spawn'] as const;
export type Row = (typeof ROWS)[number];

export interface StageStats {
  attempts: number;
  deaths: number;
  rate: number;
  /** 95% interval half-width for the rate. */
  ci: number;
  causes: Record<string, number>;
}

export interface StageTime {
  /** Mean seconds of play for an attempt from the stage's start that got through, and for any attempt from the start. */
  ok: number;
  all: number;
}

export interface CellStats {
  difficulty: Difficulty;
  skill: SkillName;
  lives: number;
  brood: number;
  completion: number;
  completionCi: number;
  timeouts: number;
  /** Lives finished by the first fish, with no sibling used. */
  firstFishCompletion: number;
  siblingsUsedMean: number;
  siblingsUsedCompletedMean: number;
  playSecondsMean: number;
  playSecondsCompletedMean: number;
  stages: Record<Row, StageStats>;
  seconds: Record<StageId, StageTime>;
  /** Probability the brood is lost at each stage (unconditional), and conditional on reaching it. */
  broodLoss: Record<StageId, number>;
  broodLossGivenReach: Record<StageId, number>;
  offscreenShare: number;
  /** Ocean-stage deaths that were the late-ocean dice ('sea') vs. predators. */
  oceanSeaShare: number;
  jackShareOfMales: number;
  malesMatured: number;
  /** Jacks per maturation decision (every male fish that finished feeding at sea, siblings included). */
  jackPerDecision: number;
  decisions: number;
  /** Egg stage: mean share of the nest's brood-mates that emerged alongside the player. */
  broodEmerged: number;
}

export interface RoleStats {
  difficulty: Difficulty;
  skill: SkillName;
  role: string;
  n: number;
  spawned: number;
  causes: Record<string, number>;
  fitnessMean: number;
}

export interface LineageStats {
  difficulty: Difficulty;
  skill: SkillName;
  lineages: number;
  gens: number;
  /** Fraction of lineages still going at the start of each generation (Wild), index 0 = generation 1. */
  alive: number[];
  meanGenerationsPlayed: number;
  completionByGen: number[];
  strayRate: number;
  jackShareOfMales: number;
  malesMatured: number;
  jackByGen: { males: number; jacks: number }[];
  /** Mean breeding value of the played fish per generation, per trait. */
  bvByGen: Record<TraitId, number[]>;
  timeouts: number;
}

const ci95 = (p: number, n: number): number => (n > 0 ? 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / n) : 0);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function rowOf(stage: StageId, marker: number): Row {
  if (stage !== 'return') return stage;
  return marker >= 3 ? 'return:lake' : marker > 0 ? 'return:river' : 'return:sea';
}

export function cellStats(difficulty: Difficulty, skill: SkillName, lives: LifeResult[]): CellStats {
  const stages = Object.fromEntries(
    ROWS.map((r) => [r, { attempts: 0, deaths: 0, rate: 0, ci: 0, causes: {} } as StageStats]),
  ) as Record<Row, StageStats>;
  const okSec: Record<string, number[]> = {};
  const allSec: Record<string, number[]> = {};
  const broodLoss = Object.fromEntries(STAGE_IDS.map((s) => [s, 0])) as Record<StageId, number>;
  const reached = Object.fromEntries(STAGE_IDS.map((s) => [s, 0])) as Record<StageId, number>;
  let offscreen = 0;
  let deathsAll = 0;
  let males = 0;
  let jacks = 0;
  let decisions = 0;
  let decidedJack = 0;
  let broodSum = 0;
  let broodN = 0;
  for (const l of lives) {
    const seen = new Set<StageId>();
    for (const a of l.attempts) {
      seen.add(a.stage);
      if (a.brood !== undefined) {
        broodSum += a.brood;
        broodN++;
      }
      if (a.jack !== undefined) {
        decisions++;
        if (a.jack) decidedJack++;
      }
      // Durations are per whole stage, from attempts that started at the stage's beginning.
      if (a.marker === 0) {
        (allSec[a.stage] ??= []).push(a.seconds);
        if (a.outcome === 'ok') (okSec[a.stage] ??= []).push(a.seconds);
      }
      // The return is split at its checkpoints: a fish that started at sea and reached the river
      // got through the sea part, and one that reached the lake got through the river.
      const rows: { row: Row; dead: boolean }[] = [];
      if (a.stage === 'return' && a.marker < 3) {
        const dead = a.outcome === 'dead';
        const diedAtSea = dead && a.where === 'sea';
        const reachedLake = a.outcome === 'ok' || (dead && a.where === 'lake') || (a.outcome === 'timeout' && a.where === 'lake');
        if (a.marker === 0) rows.push({ row: 'return:sea', dead: diedAtSea });
        if (!diedAtSea && (a.outcome !== 'timeout' || reachedLake)) rows.push({ row: 'return:river', dead: dead && !reachedLake });
        if (reachedLake) rows.push({ row: 'return:lake', dead: dead && a.where === 'lake' });
      } else {
        rows.push({ row: rowOf(a.stage, a.marker), dead: a.outcome === 'dead' });
      }
      for (const { row, dead } of rows) {
        const st = stages[row];
        st.attempts++;
        if (dead) {
          st.deaths++;
          deathsAll++;
          const c = a.cause ?? 'unknown';
          st.causes[c] = (st.causes[c] ?? 0) + 1;
          if (c === 'sea') offscreen++;
        }
      }
      if (a.outcome === 'timeout') {
        const st = stages[a.stage === 'return' && a.where === 'lake' ? 'return:lake' : rowOf(a.stage, a.marker)];
        st.causes.timeout = (st.causes.timeout ?? 0) + 1;
      }
    }
    for (const s of seen) reached[s]++;
    if (!l.completed && l.failedAt) broodLoss[l.failedAt]++;
    if (l.sex === 'M' && l.isJack !== null) {
      males++;
      if (l.isJack) jacks++;
    }
  }
  for (const r of ROWS) {
    const s = stages[r];
    s.rate = s.attempts ? s.deaths / s.attempts : 0;
    s.ci = ci95(s.rate, s.attempts);
  }
  const n = lives.length;
  const completed = lives.filter((l) => l.completed);
  const completion = n ? completed.length / n : 0;
  const oceanDeaths = stages.ocean.deaths;
  return {
    difficulty,
    skill,
    lives: n,
    brood: lives[0]?.brood ?? 0,
    completion,
    completionCi: ci95(completion, n),
    timeouts: lives.filter((l) => l.timeout).length,
    firstFishCompletion: n ? lives.filter((l) => l.completed && l.fishUsed === 1).length / n : 0,
    siblingsUsedMean: mean(lives.map((l) => l.fishUsed - 1)),
    siblingsUsedCompletedMean: mean(completed.map((l) => l.fishUsed - 1)),
    playSecondsMean: mean(lives.map((l) => l.playSeconds)),
    playSecondsCompletedMean: mean(completed.map((l) => l.playSeconds)),
    stages,
    seconds: Object.fromEntries(STAGE_IDS.map((st) => [st, { ok: mean(okSec[st] ?? []), all: mean(allSec[st] ?? []) }])) as Record<StageId, StageTime>,
    broodLoss: Object.fromEntries(STAGE_IDS.map((s) => [s, n ? broodLoss[s] / n : 0])) as Record<StageId, number>,
    broodLossGivenReach: Object.fromEntries(STAGE_IDS.map((s) => [s, reached[s] ? broodLoss[s] / reached[s] : 0])) as Record<StageId, number>,
    offscreenShare: deathsAll ? offscreen / deathsAll : 0,
    oceanSeaShare: oceanDeaths ? (stages.ocean.causes.sea ?? 0) / oceanDeaths : 0,
    jackShareOfMales: males ? jacks / males : 0,
    malesMatured: males,
    jackPerDecision: decisions ? decidedJack / decisions : 0,
    decisions,
    broodEmerged: broodN ? broodSum / broodN : 0,
  };
}

export function roleStats(difficulty: Difficulty, skill: SkillName, role: string, lives: LifeResult[]): RoleStats {
  const causes: Record<string, number> = {};
  for (const l of lives) {
    if (l.completed) continue;
    const c = l.attempts[l.attempts.length - 1]?.cause ?? (l.timeout ? 'timeout' : 'unknown');
    causes[c] = (causes[c] ?? 0) + 1;
  }
  const spawned = lives.filter((l) => l.completed);
  return { difficulty, skill, role, n: lives.length, spawned: spawned.length, causes, fitnessMean: mean(spawned.map((l) => l.fitness ?? 0)) };
}

export function lineageStats(difficulty: Difficulty, skill: SkillName, runs: LineageResult[], gens: number): LineageStats {
  const alive: number[] = [];
  const completionByGen: number[] = [];
  const jackByGen: { males: number; jacks: number }[] = [];
  const bvByGen = Object.fromEntries(TRAIT_IDS.map((t) => [t, [] as number[]])) as Record<TraitId, number[]>;
  const rowsAt = (g: number): GenerationRow[] => runs.map((r) => r.generations[g]).filter((x): x is GenerationRow => !!x);
  for (let g = 0; g < gens; g++) {
    const rows = rowsAt(g);
    alive.push(runs.length ? rows.length / runs.length : 0);
    completionByGen.push(rows.length ? rows.filter((r) => r.completed).length / rows.length : 0);
    const males = rows.filter((r) => r.sex === 'M' && r.isJack !== null);
    jackByGen.push({ males: males.length, jacks: males.filter((r) => r.isJack).length });
    for (const t of TRAIT_IDS) bvByGen[t].push(mean(rows.map((r) => r.bv[t])));
  }
  const allRows = runs.flatMap((r) => r.generations);
  const males = allRows.filter((r) => r.sex === 'M' && r.isJack !== null);
  return {
    difficulty,
    skill,
    lineages: runs.length,
    gens,
    alive,
    meanGenerationsPlayed: mean(runs.map((r) => r.generations.length)),
    completionByGen,
    strayRate: allRows.length ? allRows.filter((r) => r.isStray).length / allRows.length : 0,
    jackShareOfMales: males.length ? males.filter((r) => r.isJack).length / males.length : 0,
    malesMatured: males.length,
    jackByGen,
    bvByGen,
    timeouts: runs.reduce((a, r) => a + r.timeouts, 0),
  };
}
