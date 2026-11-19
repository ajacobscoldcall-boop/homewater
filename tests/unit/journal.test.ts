import { HABITATS } from '../../src/sim/types';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGE_IDS, type SimEvent } from '../../src/sim/types';
import { FieldJournal, JOURNAL, newlyUnlocked, triggersFor, type KeyValueStore } from '../../src/ui/journal';
import { DEATH_TITLES } from '../../src/ui/text';
import { intent, newWorld, run } from './helpers';

const captions = (JSON.parse(readFileSync('src/data/captions.json', 'utf8')) as { captions: Record<string, string> }).captions;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Death causes the simulation can produce (some DeathCause values are no longer used). */
const deathCauses = new Set(files('src/sim').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/die\((?:[^)]*\? )?'(\w+)'(?: : '(\w+)')?\)/g)].flatMap((m) => m.slice(1).filter(Boolean) as string[])));

/** Warning kinds the simulation can emit. */
const warningKinds = new Set(files('src/sim').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/emit\('warning', '(\w+)'\)/g)].map((m) => m[1] as string)));

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const ev = (type: SimEvent['type'], key?: string): SimEvent => ({ t: 0, type, ...(key ? { key } : {}) });

describe('journal data', () => {
  it('has well-formed, uniquely named entries for real stages', () => {
    const ids = new Set<string>();
    for (const e of JOURNAL.entries) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(STAGE_IDS).toContain(e.stage);
      expect(e.title.length).toBeGreaterThan(2);
      expect(e.text.length).toBeGreaterThan(40);
      expect(e.unlock.length).toBeGreaterThan(0);
    }
    for (const s of STAGE_IDS) expect(JOURNAL.entries.some((e) => e.stage === s), s).toBe(true);
  });

  it('unlocks only on triggers the game can actually produce', () => {
    const bad: string[] = [];
    for (const e of JOURNAL.entries) {
      for (const t of e.unlock) {
        const [kind, rest] = [t.split('.')[0], t.slice(t.indexOf('.') + 1)];
        const ok =
          kind === 'warning' ? warningKinds.has(rest) : kind === 'death' ? rest in DEATH_TITLES : kind === 'spawned' ? (HABITATS as readonly string[]).includes(rest) : t === 'life.complete' || t in captions;
        if (!ok) bad.push(`${e.id}: ${t}`);
      }
    }
    expect(warningKinds.size).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });

  it('covers every stage, every death cause, and the key moments', () => {
    const all = new Set(JOURNAL.entries.flatMap((e) => e.unlock));
    for (const s of STAGE_IDS) expect(all.has(`${s}.intro`), `${s}.intro`).toBe(true);
    expect(deathCauses.size).toBeGreaterThan(10);
    for (const cause of deathCauses) expect(all.has(`death.${cause}`), cause).toBe(true);
    for (const t of ['ocean.revealJack', 'return.netSlip', 'return.pastNets', 'spawned.creek', 'life.complete']) expect(all.has(t), t).toBe(true);
  });

  it('has the three facts to remember', () => {
    expect(JOURNAL.facts.items).toHaveLength(3);
    expect(JOURNAL.facts.items.map((f) => f.text).join(' ')).toMatch(/diversity/);
    expect(JOURNAL.facts.items.map((f) => f.text).join(' ')).toMatch(/random/);
    expect(JOURNAL.facts.items.map((f) => f.text).join(' ')).toMatch(/miracle/);
  });
});

describe('journal unlocks', () => {
  it('maps events to trigger keys', () => {
    expect(triggersFor(ev('caption', 'fry.trout'))).toEqual(['fry.trout']);
    expect(triggersFor(ev('reveal', 'ocean.revealJack'))).toEqual(['ocean.revealJack']);
    expect(triggersFor(ev('warning', 'orca'))).toEqual(['warning.orca']);
    expect(triggersFor(ev('death', 'death.bear'))).toEqual(['death.bear']);
    expect(triggersFor(ev('spawned', 'spawn.jackSuccess'), { habitat: 'creek' })).toEqual(['spawn.jackSuccess', 'spawned.creek']);
    expect(triggersFor(ev('lifeComplete'))).toEqual(['life.complete']);
    expect(triggersFor(ev('eat'))).toEqual([]);
    expect(triggersFor(ev('stageComplete', 'fry'))).toEqual([]);
  });

  it('unlocks each entry once, by any of its triggers', () => {
    const first = newlyUnlocked(JOURNAL.entries, new Set(), ['death.trout']);
    expect(first.map((e) => e.id)).toEqual(['fry.char']);
    expect(newlyUnlocked(JOURNAL.entries, new Set(['fry.char']), ['fry.trout'])).toEqual([]);
    expect(newlyUnlocked(JOURNAL.entries, new Set(), [])).toEqual([]);
    expect(newlyUnlocked(JOURNAL.entries, new Set(), ['no.such.key'])).toEqual([]);
  });

  it('a jack reveal unlocks both the jack page and the life-history page', () => {
    const ids = newlyUnlocked(JOURNAL.entries, new Set(), ['ocean.revealJack']).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['ocean.jack', 'ocean.paths']));
  });

  it('persists to storage and reloads', () => {
    const store = new MemoryStore();
    const j = new FieldJournal(store);
    expect(j.count).toBe(0);
    expect(j.recordEvents([ev('caption', 'egg.intro'), ev('warning', 'flow')]).map((e) => e.id)).toEqual(['egg.redd', 'egg.rheotaxis']);
    expect(j.recordEvents([ev('caption', 'egg.intro')])).toEqual([]);
    const again = new FieldJournal(store);
    expect([...again.unlocked].sort()).toEqual(['egg.redd', 'egg.rheotaxis']);
    expect(again.count).toBe(2);
    expect(again.total).toBe(JOURNAL.entries.length);
  });

  it('works with no storage, corrupt storage, or storage that throws', () => {
    const none = new FieldJournal(null);
    expect(none.record(['death.scour'])).toHaveLength(1);
    const corrupt = new MemoryStore();
    corrupt.setItem('homewater.journal', '{not json');
    expect(new FieldJournal(corrupt).count).toBe(0);
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const j = new FieldJournal(throwing);
    expect(j.record(['death.scour']).map((e) => e.id)).toEqual(['egg.scour']);
    expect(j.unlocked.has('egg.scour')).toBe(true);
  });

  it('unlocks from a real simulated egg stage', () => {
    const { w } = newWorld({ seed: 7 });
    const j = new FieldJournal(null);
    j.recordEvents(w.drainEvents(), { habitat: w.fish.habitat });
    run(w, 60 * 6, () => intent());
    j.recordEvents(w.drainEvents(), { habitat: w.fish.habitat });
    expect(j.unlocked.has('egg.redd')).toBe(true);
    expect(j.unlocked.has('egg.rheotaxis')).toBe(true);
  });
});
