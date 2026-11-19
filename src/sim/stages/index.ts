import type { Intent, StageId, Vec3 } from '../types';
import type { World } from '../world';
import { eggStage } from './egg';
import { fryStage } from './fry';
import { oceanStage } from './ocean';
import { returnStage } from './return';
import { smoltStage } from './smolt';
import { spawnStage } from './spawn';

export type ArenaKind = 'gravel' | 'lake' | 'river' | 'ocean' | 'bayCreek' | 'spawnBed';

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Arena {
  kind: ArenaKind;
  min: Vec3;
  max: Vec3;
  surfaceY: number;
  water: 'fresh' | 'salt';
  /** Height of the bottom at (x, z). */
  floor(x: number, z: number): number;
  /** Water velocity at a point, before the year's flow multiplier. */
  current(p: Vec3): Vec3;
  walls?: Box[];
}

export interface StageDef {
  id: StageId;
  arena(w: World): Arena;
  init(w: World, marker: number): void;
  step(w: World, intent: Intent, dt: number): void;
  /** Finish as a success (playtest tools and tests). */
  debugComplete(w: World): void;
  /** Fill in plausible progress when a stage is skipped. */
  fillProgress?(w: World): void;
}

export const STAGES: Record<StageId, StageDef> = {
  egg: eggStage,
  fry: fryStage,
  smolt: smoltStage,
  ocean: oceanStage,
  return: returnStage,
  spawn: spawnStage,
};
