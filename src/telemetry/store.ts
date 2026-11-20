/**
 * Where the play log is kept: this browser's localStorage, capped by lives and
 * size, never in the save file and never sent anywhere. Each life is its own
 * entry (`homewater.playlog.life.<id>`) with a small index, so saving the life
 * in progress writes only that life, not the whole log. The Storage is passed
 * in so tests can use a plain object.
 */
import { PLAYLOG } from './config';
import { PLAYLOG_KIND, PLAYLOG_VERSION, type LifeLog, type PlayLogFile } from './types';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface IndexEntry {
  id: string;
  chars: number;
}

const lifeKey = (id: string): string => `${PLAYLOG.storageKey}.life.${id}`;

function readIndex(store: KeyValueStore | null): IndexEntry[] {
  try {
    const raw = store?.getItem(PLAYLOG.storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { lives?: unknown };
    return Array.isArray(parsed.lives) ? (parsed.lives as IndexEntry[]).filter((e) => typeof e?.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(store: KeyValueStore | null, index: IndexEntry[]): void {
  store?.setItem(PLAYLOG.storageKey, JSON.stringify({ version: PLAYLOG_VERSION, lives: index }));
}

function remove(store: KeyValueStore | null, id: string): void {
  try {
    store?.removeItem(lifeKey(id));
  } catch {
    // ignore
  }
}

/** Every logged life, oldest first. */
export function readLives(store: KeyValueStore | null): LifeLog[] {
  const out: LifeLog[] = [];
  for (const e of readIndex(store)) {
    try {
      const raw = store?.getItem(lifeKey(e.id));
      if (raw) out.push(JSON.parse(raw) as LifeLog);
    } catch {
      // a damaged entry is skipped
    }
  }
  return out;
}

/**
 * Put one life into the log (replacing an earlier copy of it), dropping the
 * oldest lives past the caps. Returns the ids kept, oldest first.
 */
export function upsertLife(store: KeyValueStore | null, life: LifeLog, maxLives: number = PLAYLOG.maxLives, maxChars: number = PLAYLOG.maxChars): string[] {
  const json = JSON.stringify(life);
  const index = readIndex(store).filter((e) => e.id !== life.id);
  index.push({ id: life.id, chars: json.length });
  const total = () => index.reduce((s, e) => s + e.chars, 0);
  while (index.length > 1 && (index.length > maxLives || total() > maxChars)) remove(store, (index.shift() as IndexEntry).id);
  // The browser's own quota can be smaller than ours: drop old lives until it fits.
  for (;;) {
    try {
      store?.setItem(lifeKey(life.id), json);
      writeIndex(store, index);
      return index.map((e) => e.id);
    } catch {
      if (index.length <= 1) return index.map((e) => e.id);
      remove(store, (index.shift() as IndexEntry).id);
    }
  }
}

export function clearLives(store: KeyValueStore | null): void {
  for (const e of readIndex(store)) remove(store, e.id);
  try {
    store?.removeItem(PLAYLOG.storageKey);
  } catch {
    // ignore
  }
}

export function exportFile(lives: LifeLog[], now: Date = new Date()): PlayLogFile {
  return { kind: PLAYLOG_KIND, version: PLAYLOG_VERSION, exportedAt: now.toISOString(), lives };
}

export function readEnabled(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(PLAYLOG.enabledKey) === '1';
  } catch {
    return false;
  }
}

export function writeEnabled(store: KeyValueStore | null, on: boolean): void {
  try {
    if (on) store?.setItem(PLAYLOG.enabledKey, '1');
    else store?.removeItem(PLAYLOG.enabledKey);
  } catch {
    // ignore
  }
}
