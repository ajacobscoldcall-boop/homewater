/**
 * Loads and validates the parameter file. Every tunable number in the game
 * is read through Params.get(id); code never hard-codes biology or tuning.
 */
export interface ParamEntry {
  id: string;
  value: number;
  units: string;
  min: number;
  max: number;
  source: string;
  placeholder: boolean;
  note?: string;
}

export interface ParamFile {
  schema: number;
  params: ParamEntry[];
  difficulty: Record<string, Record<string, number>>;
}

export type Difficulty = 'fieldGuide' | 'wild';

export class ParamError extends Error {}

export class Params {
  private readonly values = new Map<string, number>();
  readonly entries: ReadonlyMap<string, ParamEntry>;

  constructor(file: ParamFile, readonly difficulty: Difficulty = 'fieldGuide') {
    const errors = validateParamFile(file);
    if (errors.length) throw new ParamError(`Invalid params file:\n- ${errors.join('\n- ')}`);
    const entries = new Map<string, ParamEntry>();
    for (const e of file.params) entries.set(e.id, e);
    this.entries = entries;
    const mult = file.difficulty[difficulty] ?? {};
    for (const e of file.params) this.values.set(e.id, e.value * (mult[e.id] ?? 1));
  }

  get(id: string): number {
    const v = this.values.get(id);
    if (v === undefined) throw new ParamError(`Unknown parameter "${id}"`);
    return v;
  }

  /** Override a value at runtime (playtest tools only). */
  set(id: string, value: number): void {
    if (!this.values.has(id)) throw new ParamError(`Unknown parameter "${id}"`);
    this.values.set(id, value);
  }

  withDifficulty(file: ParamFile, difficulty: Difficulty): Params {
    return new Params(file, difficulty);
  }
}

export function validateParamFile(file: ParamFile): string[] {
  const errors: string[] = [];
  if (file.schema !== 1) errors.push(`Unsupported schema ${String(file.schema)}`);
  const seen = new Set<string>();
  for (const e of file.params) {
    if (!e.id || typeof e.id !== 'string') errors.push('Entry without id');
    if (seen.has(e.id)) errors.push(`Duplicate id ${e.id}`);
    seen.add(e.id);
    for (const k of ['value', 'min', 'max'] as const) {
      if (typeof e[k] !== 'number' || !Number.isFinite(e[k])) errors.push(`${e.id}: ${k} must be a finite number`);
    }
    if (e.min > e.max) errors.push(`${e.id}: min > max`);
    if (e.value < e.min || e.value > e.max) errors.push(`${e.id}: value ${e.value} outside [${e.min}, ${e.max}]`);
    if (typeof e.units !== 'string' || !e.units) errors.push(`${e.id}: units missing`);
    if (typeof e.source !== 'string' || !e.source) errors.push(`${e.id}: source missing`);
    if (typeof e.placeholder !== 'boolean') errors.push(`${e.id}: placeholder must be true or false`);
  }
  for (const [level, mults] of Object.entries(file.difficulty)) {
    for (const [id, m] of Object.entries(mults)) {
      if (!seen.has(id)) errors.push(`difficulty.${level}: unknown id ${id}`);
      if (typeof m !== 'number' || m <= 0) errors.push(`difficulty.${level}.${id}: multiplier must be > 0`);
    }
  }
  return errors;
}
