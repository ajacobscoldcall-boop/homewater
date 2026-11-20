import { describe, expect, it } from 'vitest';
import { foundLineage, offerOffspring, type Lineage } from '../../src/sim/lineage';
import { addToArchive, ARCHIVE_LIMIT, importSave, migrate, SCHEMA_VERSION } from '../../src/save/save';
import { params } from './helpers';

const lineage = () => foundLineage(params(), { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed: 4 });

describe('save migrations', () => {
  it('upgrades a version 1 save: no pending offspring choice', () => {
    const v1 = { schemaVersion: 1, savedAt: '2026-01-01T00:00:00Z', game: 'homewater', lineage: lineage(), life: null, archive: [] };
    const s = migrate(JSON.parse(JSON.stringify(v1)));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.pendingOffspring).toBeNull();
    expect(s.lineage.current.name).toBe('Alder');
  });

  it('keeps a pending offspring choice through a JSON round trip', () => {
    const l = lineage();
    const kids = offerOffspring(params(), l, l.current);
    const save = { schemaVersion: SCHEMA_VERSION, savedAt: '', game: 'homewater', lineage: l, life: null, pendingOffspring: kids, archive: [] };
    const s = migrate(JSON.parse(JSON.stringify(save)));
    expect(s.pendingOffspring?.map((k) => k.name)).toEqual(kids.map((k) => k.name));
  });

  it('upgrades a version 2 save: records gain traits, habitat and offspring; pending offspring are kept on the last record', () => {
    const l = lineage() as unknown as Record<string, unknown>;
    delete l.ancestor;
    const oldRec = { fishId: 'f1', name: 'Alder', sex: 'F', generation: 1, isJack: null, oceanYears: 2, adultSize: 1, conditions: { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 }, deaths: [], spawned: true, result: { eggs: 3000, young: 30, relativeFitness: 1, detail: '' }, isStray: false, lockedJack: false };
    l.records = [oldRec];
    const kids = offerOffspring(params(), lineage(), lineage().current);
    const archived = { ...l, id: 'Lold', records: [oldRec] };
    const v2 = { schemaVersion: 2, savedAt: '', game: 'homewater', lineage: l, life: null, pendingOffspring: kids, archive: [archived] };
    const s = migrate(JSON.parse(JSON.stringify(v2)));
    expect(s.schemaVersion).toBe(3);
    const r = s.lineage.records[0]!;
    expect(r.bv).toBeNull();
    expect(r.habitat).toBe('creek');
    expect(r.chosenId).toBeNull();
    expect(r.offspring.map((o) => o.name)).toEqual(kids.map((k) => k.name));
    expect(s.lineage.ancestor).toBeNull();
    expect(s.archive[0]!.records[0]!.offspring).toEqual([]);
    expect(s.archive[0]!.ancestor).toBeNull();
    expect(s.pendingOffspring).toHaveLength(kids.length);
  });

  it('imports a version 1 lineage file through to the current schema', async () => {
    const l = lineage() as unknown as Record<string, unknown>;
    delete l.ancestor;
    const v1 = { schemaVersion: 1, savedAt: '2026-01-01T00:00:00Z', game: 'homewater', lineage: l, life: null, archive: [] };
    const file = new File([JSON.stringify(v1)], 'homewater-lineage-gen1-alder.json', { type: 'application/json' });
    const s = await importSave(file);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.pendingOffspring).toBeNull();
    expect(s.lineage.ancestor).toBeNull();
    expect(s.lineage.current.name).toBe('Alder');
    await expect(importSave(new File(['{"game":"other"}'], 'x.json'))).rejects.toThrow();
  });

  it('archives a lineage once, newest first, up to the limit', () => {
    const ls: Lineage[] = Array.from({ length: ARCHIVE_LIMIT + 3 }, (_, i) => foundLineage(params(), { preset: 'quick', sex: 'F', name: 'A', difficulty: 'fieldGuide', seed: i + 1 }));
    let a: Lineage[] = [];
    for (const l of ls) a = addToArchive(a, l);
    expect(a).toHaveLength(ARCHIVE_LIMIT);
    expect(a[0]).toBe(ls.at(-1));
    const again = addToArchive(a, a[5]!);
    expect(again).toHaveLength(ARCHIVE_LIMIT);
    expect(again[0]).toBe(a[5]);
    expect(new Set(again.map((l) => l.id)).size).toBe(ARCHIVE_LIMIT);
  });

  it('refuses saves from a newer version and non-saves', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, game: 'homewater', lineage: lineage() })).toThrow(/newer/);
    expect(() => migrate({ game: 'other' })).toThrow();
  });
});
