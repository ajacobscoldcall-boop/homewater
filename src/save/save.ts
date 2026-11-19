/**
 * Saves the lineage in IndexedDB (falling back to localStorage), with a
 * schema version and migrations, plus export and import as a .json file.
 * Saves store seeds and trait values, not derived data.
 */
import type { Lineage } from '../sim/lineage';
import type { Checkpoint } from '../sim/world';

export const SCHEMA_VERSION = 1;

export interface LifeSave {
  checkpoint: Checkpoint;
  siblingsLeft: number;
  firstLife: boolean;
  /** Seed for this life's world. */
  seed: number;
  /** Fish played so far in this life who died. */
  deaths: Lineage['records'][number]['deaths'];
}

export interface SaveFile {
  schemaVersion: number;
  savedAt: string;
  game: 'homewater';
  lineage: Lineage;
  life: LifeSave | null;
  /** Archived lineages (extinct or replaced), newest first, kept short. */
  archive: Lineage[];
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a save from version n to n + 1. */
const migrations: Record<number, Migration> = {};

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
