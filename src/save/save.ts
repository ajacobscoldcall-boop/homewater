/**
 * Saves the lineage in IndexedDB (falling back to localStorage), with a
 * schema version and migrations, plus export and import as a .json file.
 * Saves store seeds and trait values, not derived data.
 */
import paramFile from '../data/params.json';
import type { Lineage } from '../sim/lineage';
import { Params, type Difficulty, type ParamFile } from '../sim/params';
import { populationFromConditions, yearFromPopulation } from '../sim/population';
import type { FishIdentity, YearConditions } from '../sim/types';
import type { Checkpoint } from '../sim/world';

export const SCHEMA_VERSION = 8;

export interface LifeSave {
  checkpoint: Checkpoint;
  siblingsLeft: number;
  firstLife: boolean;
  /** Seed for this life's world. */
  seed: number;
  /** Fish played so far in this life who died. */
  deaths: Lineage['records'][number]['deaths'];
  /** Years in the nursery lake once the fish has left it (1 or 2), for the life route map; null before then or when not known (schema 6). */
  lakeYears?: number | null;
}

export interface SaveFile {
  schemaVersion: number;
  savedAt: string;
  game: 'homewater';
  lineage: Lineage;
  life: LifeSave | null;
  /** Offspring offered at the end of a life, while the player is still choosing (schema 2). */
  pendingOffspring: FishIdentity[] | null;
  /** Archived lineages (extinct or replaced), newest first, kept short. */
  archive: Lineage[];
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a save from version n to n + 1. */
const migrations: Record<number, Migration> = {
  // 1 -> 2: the offspring choice is saved, so a reload at that screen reopens it.
  1: (old) => ({ ...old, pendingOffspring: null }),
  // 2 -> 3: life records keep traits, habitat and the offspring on offer; lineages may name an ancestor line.
  2: (old) => {
    const pending = Array.isArray(old.pendingOffspring) ? (old.pendingOffspring as FishIdentity[]) : null;
    const lineage = old.lineage ? upgradeLineage3(old.lineage as Record<string, unknown>, old.life ? null : pending) : old.lineage;
    const archive = Array.isArray(old.archive) ? (old.archive as Record<string, unknown>[]).map((l) => upgradeLineage3(l, null)) : [];
    return { ...old, lineage, archive };
  },
  // 3 -> 4: lineages carry the river's population; old saves get one rebuilt from their recorded run sizes.
  3: (old) => {
    const lineage = old.lineage ? upgradeLineage4(old.lineage as Record<string, unknown>) : old.lineage;
    const archive = Array.isArray(old.archive) ? (old.archive as Record<string, unknown>[]).map(upgradeLineage4) : [];
    return { ...old, lineage, archive };
  },
  // 4 -> 5: life progress gains the imprint (how well the fish learned home); a life saved before then gets an average one.
  4: (old) => {
    const life = old.life as { checkpoint?: { progress?: Record<string, unknown> } } | null | undefined;
    const progress = life?.checkpoint?.progress;
    if (!life || !progress || typeof progress.imprint === 'number') return old;
    return { ...old, life: { ...life, checkpoint: { ...life.checkpoint, progress: { ...progress, imprint: averageImprint() } } } };
  },
  // 5 -> 6: life records and the life in progress note the years spent in the lake (route map); older ones are not known.
  5: (old) => {
    const lineage = old.lineage ? upgradeLineage6(old.lineage as Record<string, unknown>) : old.lineage;
    const archive = Array.isArray(old.archive) ? (old.archive as Record<string, unknown>[]).map(upgradeLineage6) : [];
    const life = old.life && typeof old.life === 'object' ? { lakeYears: null, ...(old.life as Record<string, unknown>) } : old.life;
    return { ...old, lineage, archive, life };
  },
  // 6 -> 7: a death may note where on the return it happened (`where: 'lake'`, the lake crossing); older deaths don't say, which reads as the river.
  6: (old) => old,
  // 7 -> 8: lineages say whether their river is healthy or changing (the changing river mode); older lines are healthy.
  // Year conditions and population years gain optional change fields (absent on a healthy river), so nothing else moves.
  7: (old) => {
    const lineage = old.lineage ? upgradeLineage8(old.lineage as Record<string, unknown>) : old.lineage;
    const archive = Array.isArray(old.archive) ? (old.archive as Record<string, unknown>[]).map(upgradeLineage8) : [];
    return { ...old, lineage, archive };
  },
};

/** Schema 8 lineage: a river mode, healthy for every line founded before the mode existed. */
function upgradeLineage8(l: Record<string, unknown>): Record<string, unknown> {
  return { riverMode: 'healthy', ...l };
}

/** Schema 6 lineage: records gain lakeYears, unknown (null) for lives recorded before. */
function upgradeLineage6(l: Record<string, unknown>): Record<string, unknown> {
  const records = Array.isArray(l.records) ? (l.records as Record<string, unknown>[]).map((r) => ({ lakeYears: null, ...r })) : l.records;
  return { ...l, records };
}

/** Schema 4 lineage: a population rebuilt from the run sizes it has already lived through. */
function upgradeLineage4(l: Record<string, unknown>): Record<string, unknown> {
  if (l.population) return l;
  const difficulty: Difficulty = l.difficulty === 'wild' ? 'wild' : 'fieldGuide';
  const p = new Params(paramFile as ParamFile, difficulty);
  const records = Array.isArray(l.records) ? (l.records as { generation: number; conditions: YearConditions }[]) : [];
  const byGen = new Map<number, YearConditions>();
  for (const r of records) if (r?.conditions) byGen.set(r.generation, r.conditions);
  const generation = Number(l.generation) || 1;
  const current = l.conditions as YearConditions | undefined;
  if (current) byGen.set(generation, current);
  const years = [...byGen.entries()].sort((a, b) => a[0] - b[0]).map(([g, conditions]) => ({ generation: g, conditions }));
  const population = populationFromConditions(p, years);
  const now = population.history.find((y) => y.generation === generation);
  return { ...l, population, conditions: current && now ? yearFromPopulation(current, now) : current };
}

/** The imprint given to lives saved before imprinting (params: imprint.default). */
function averageImprint(): number {
  const e = (paramFile as { params: { id: string; value: number }[] }).params.find((x) => x.id === 'imprint.default');
  if (!e) throw new Error('params.json lacks imprint.default');
  return e.value;
}

/** Schema 3 lineage: older records get the new fields with what can be recovered. */
function upgradeLineage3(l: Record<string, unknown>, pending: FishIdentity[] | null): Record<string, unknown> {
  const current = l.current as FishIdentity | undefined;
  const habitat = current?.habitat ?? 'creek';
  const records = Array.isArray(l.records) ? (l.records as Record<string, unknown>[]) : [];
  const upgraded = records.map((r, i) => {
    const last = i === records.length - 1;
    // A pending choice belongs to the last life: keep it so the tree can show the offspring.
    const offspring = last && pending ? pending.map((k) => ({ id: k.id, name: k.name, sex: k.sex, bv: k.bv })) : [];
    return { bv: null, habitat, chosenId: null, ...r, offspring: Array.isArray(r.offspring) ? r.offspring : offspring };
  });
  return { ancestor: null, ...l, records: upgraded };
}

export function migrate(raw: unknown): SaveFile {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Homewater save.');
  let data = raw as Record<string, unknown>;
  if (data.game !== 'homewater') throw new Error('Not a Homewater save.');
  let v = Number(data.schemaVersion);
  if (!Number.isInteger(v) || v < 1) throw new Error('Save has no valid version.');
  if (v > SCHEMA_VERSION) throw new Error('This save comes from a newer version of the game.');
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error(`No upgrade path from save version ${v}.`);
    data = m(data);
    v += 1;
    data.schemaVersion = v;
  }
  const lineage = data.lineage as Lineage | undefined;
  if (!lineage || typeof lineage !== 'object' || !lineage.current || !Array.isArray(lineage.records)) throw new Error('Save is missing its lineage.');
  return data as unknown as SaveFile;
}

const DB = 'homewater';
const STORE = 'saves';
const KEY = 'current';
const LS_KEY = 'homewater.save';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not available; saves still work, but the browser may clear them.
  }
}

export async function writeSave(save: SaveFile): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(save, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return;
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable (private window). The game still runs; export to keep the lineage.
  }
}

export async function readSave(): Promise<SaveFile | null> {
  const db = await openDb();
  let raw: unknown = null;
  if (db) {
    raw = await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } else {
    try {
      const s = localStorage.getItem(LS_KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    return migrate(raw);
  } catch {
    return null;
  }
}

export async function clearSave(): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

export function exportSave(save: SaveFile): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = save.lineage.current.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.download = `homewater-lineage-gen${save.lineage.generation}-${name}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export async function importSave(file: File): Promise<SaveFile> {
  const text = await file.text();
  return migrate(JSON.parse(text));
}

/** How many past lineages a save keeps for the Lineages page and records. */
export const ARCHIVE_LIMIT = 20;

/** Put a lineage at the front of the archive, replacing an older copy of the same line. */
export function addToArchive(archive: readonly Lineage[], l: Lineage): Lineage[] {
  return [l, ...archive.filter((a) => a.id !== l.id)].slice(0, ARCHIVE_LIMIT);
}
