/**
 * The play log's file format. Exported files carry `kind: 'homewater-playlog'`
 * and `version`; scripts/playlog/ reads them. Bump PLAYLOG_VERSION when a
 * field changes meaning (the summariser should keep reading older versions).
 */
import type { Difficulty } from '../sim/params';
import type { DeathCause, Habitat, Sex, StageId, YearConditions } from '../sim/types';

export const PLAYLOG_VERSION = 1;
export const PLAYLOG_KIND = 'homewater-playlog';

/** Settings that change how hard or how long a stage plays. */
export interface PlayLogSettings {
  /** Graphics in use, e.g. "Auto: Medium" or "Low (80%)". */
  graphics: string;
  /** Game speed (1, 0.75 or 0.5). */
  gameSpeed: number;
  /** The Field guide's step-by-step guidance is showing. */
  guidance: boolean;
  gore: string;
  cinematics: boolean;
  reducedMotion: boolean;
}

export type Role = 'female' | 'male' | 'jack' | 'male (undecided)';

export type AttemptOutcome = 'completed' | 'died' | 'spawned' | 'unfinished';

/** [stage seconds, x, y, z, energy 0..1, fat 0..1] */
export type TraceSample = [number, number, number, number, number, number];

export interface StageAttempt {
  stage: StageId;
  stageIndex: number;
  /** The fish playing it (a sibling has its own name). */
  fish: string;
  role: Role;
  /** Checkpoint marker the attempt started from (return: 1 = already inside the home river). */
  startMarker: number;
  /** Checkpoint marker reached by the end (return: 0 = still at sea). */
  endMarker: number;
  startedAt: string;
  endedAt: string | null;
  /** Seconds of stage time (sim time; slower at reduced game speed). */
  simSeconds: number;
  /** Seconds the player spent playing it (pauses left out). */
  playSeconds: number;
  outcome: AttemptOutcome;
  deathCause: DeathCause | null;
  /** Where the fish was when the attempt ended (the death position for a death). */
  endPos: [number, number, number];
  endFat: number;
  endEnergy: number;
  siblingsLeft: number;
  settings: PlayLogSettings;
  /** Warnings shown, by kind (bear, seal, char, ...). */
  warnings: Record<string, number>;
  /** [stage seconds, kind] of each warning, up to a cap. */
  warningTimes: [number, string][];
  /** Close calls: strikes that missed and marks taken (the renderer's wound tracker). */
  nearMisses: number;
  nearMissTimes: number[];
  trace: TraceSample[];
}

export type LifeOutcome = 'spawned' | 'broodLost' | 'unfinished';

export interface LifeLog {
  id: string;
  version: number;
  startedAt: string;
  endedAt: string | null;
  difficulty: Difficulty;
  habitat: Habitat;
  /** Sex and role of the fish carrying the life, as last known (a sibling takes over after a death; jack or not is decided at sea). */
  sex: Sex;
  role: Role;
  lockedJack: boolean;
  isStray: boolean;
  generation: number;
  firstLife: boolean;
  /** The log joined after the egg stage began (a reloaded save, or the log was switched on mid-life). */
  partial: boolean;
  conditions: YearConditions;
  siblingsAtStart: number;
  settings: PlayLogSettings;
  outcome: LifeOutcome;
  attempts: StageAttempt[];
}

export interface PlayLogFile {
  kind: typeof PLAYLOG_KIND;
  version: number;
  exportedAt: string;
  lives: LifeLog[];
}
