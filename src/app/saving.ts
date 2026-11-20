/**
 * What the app writes to disk: the save file for the current state, and the
 * record of a finished life. Pure apart from `buildSave` bringing the
 * lineage's current fish up to date (as it always has).
 */
import type { LifeRecord, Lineage } from '../sim/lineage';
import type { FishIdentity } from '../sim/types';
import type { World } from '../sim/world';
import { SCHEMA_VERSION, type LifeSave, type SaveFile } from '../save/save';

export interface SaveInput {
  lineage: Lineage | null;
  world: World | null;
  /** Seed of the life being played. */
  lifeSeed: number;
  /** Fish of this life who died so far. */
  deaths: LifeRecord['deaths'];
  /** Offspring on offer at the end of a life, until one is chosen. */
  pendingKids: FishIdentity[] | null;
  archive: Lineage[];
  now?: Date;
}

/**
 * The save for the current state, or null with no lineage. A life still being
 * played (the world's fish is the lineage's current generation and the life
 * isn't complete) is saved with its checkpoint; otherwise the offspring on
 * offer are. Updates `lineage.current` to the world's fish while a life is active.
 */
export function buildSave(s: SaveInput): SaveFile | null {
  const l = s.lineage;
  if (!l) return null;
  const w = s.world;
  const active = w && w.status !== 'lifeComplete' && w.fish.generation === l.current.generation;
  const life: LifeSave | null = active ? { checkpoint: w.checkpoint, siblingsLeft: w.siblingsLeft, firstLife: w.firstLife, seed: s.lifeSeed, deaths: [...s.deaths] } : null;
  if (active) l.current = w.fish;
  return { schemaVersion: SCHEMA_VERSION, savedAt: (s.now ?? new Date()).toISOString(), game: 'homewater', lineage: l, life, pendingOffspring: active ? null : s.pendingKids, archive: s.archive };
}

/** The record of a life that has ended, spawned or with the whole brood dead. */
export function lifeRecord(w: World, deaths: LifeRecord['deaths'], spawned: boolean): LifeRecord {
  return {
    fishId: w.fish.id,
    name: w.fish.name,
    sex: w.fish.sex,
    generation: w.fish.generation,
    isJack: w.progress.isJack,
    oceanYears: w.progress.oceanYears,
    adultSize: w.progress.adultSize,
    conditions: w.conditions,
    deaths: [...deaths],
    spawned,
    result: spawned ? w.spawnResult : null,
    isStray: w.fish.isStray,
    lockedJack: w.fish.lockedJack,
    bv: { ...w.fish.bv },
    habitat: w.fish.habitat,
    offspring: [],
    chosenId: null,
  };
}
