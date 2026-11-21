import { describe, expect, it } from 'vitest';
import { foundLineage, offerOffspring, type Lineage } from '../../src/sim/lineage';
import { addToArchive, ARCHIVE_LIMIT, importSave, migrate, SCHEMA_VERSION } from '../../src/save/save';
import { params } from './helpers';

const lineage = () => foundLineage(params(), { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed: 4 });

describe('save migrations', () => {
  it('upgrades a version 6 save: deaths keep their shape and do not say where (the river), a lake death keeps its place', () => {
    const l = lineage();
    const deaths = [{ name: 'Alder', stage: 'return' as const, cause: 'bear' as const }];
    const v6 = { schemaVersion: 6, savedAt: '', game: 'homewater', lineage: { ...l, records: [] }, life: { checkpoint: { stageIndex: 4, marker: 3, progress: {} }, siblingsLeft: 2, firstLife: false, seed: 1, deaths, lakeYears: 1 }, pendingOffspring: null, archive: [] };
    const s = migrate(JSON.parse(JSON.stringify(v6)));
    expect(s.schemaVersion).toBe(7);
    expect(s.life?.deaths).toEqual(deaths);
    expect(s.life?.deaths[0]!.where).toBeUndefined();
    const v7 = { ...v6, schemaVersion: 7, life: { ...v6.life, deaths: [{ ...deaths[0]!, where: 'lake' }] } };
    expect(migrate(JSON.parse(JSON.stringify(v7))).life?.deaths[0]!.where).toBe('lake');
  });

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
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
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

  it('upgrades a version 3 save: the lineage and archive get a population rebuilt from their recorded run sizes', () => {
    const l = lineage() as unknown as Record<string, unknown>;
    delete l.population;
    const plain = { flow: 1, temperature: 1, oceanCrowding: 1 };
    l.conditions = { ...plain, runSize: 0.6 };
    l.generation = 3;
    const rec = (generation: number, runSize: number) => ({ fishId: `f${generation}`, name: 'Alder', sex: 'F', generation, isJack: null, oceanYears: 2, adultSize: 1, conditions: { ...plain, runSize }, deaths: [], spawned: true, result: null, isStray: false, lockedJack: false, bv: null, habitat: 'creek', offspring: [], chosenId: null });
    l.records = [rec(1, 1.8), rec(2, 1)];
    const archived = { ...l, id: 'Lold', difficulty: 'wild', records: [rec(1, 0.5)], generation: 1, conditions: { ...plain, runSize: 0.5 } };
    const v3 = { schemaVersion: 3, savedAt: '', game: 'homewater', lineage: l, life: null, pendingOffspring: null, archive: [archived] };
    const s = migrate(JSON.parse(JSON.stringify(v3)));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    const hist = s.lineage.population.history;
    expect(hist.map((y) => y.generation)).toEqual([1, 2, 3]);
    expect(hist.map((y) => y.run)).toEqual([1.8, 1, 0.6]);
    // The big first run left more spawners, so generation 2's lake was crowded with fry.
    expect(hist[1]!.fry).toBeGreaterThan(1);
    expect(hist[1]!.parentSpawners).toBeCloseTo(hist[0]!.spawners, 9);
    // The current year now carries the lake and the fishery.
    expect(s.lineage.conditions.runSize).toBe(0.6);
    expect(s.lineage.conditions.lakeFood).toBeCloseTo(hist[2]!.lakeFood, 9);
    expect(s.lineage.conditions.harvestRate).toBeGreaterThanOrEqual(0);
    expect(s.archive[0]!.population.history).toHaveLength(1);
    // A current save is left alone.
    const now = lineage();
    const again = migrate(JSON.parse(JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: '', game: 'homewater', lineage: now, life: null, pendingOffspring: null, archive: [] })));
    expect(again.lineage.population).toEqual(now.population);
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

  it('upgrades a version 3 save: a life in progress gets an average imprint, a newer one keeps its own', () => {
    const progress = { yolk: 0.2, fryBites: 10, fryRichBites: 5, oceanBites: 0, growthPerf: 0.5, isJack: null, oceanYears: null, adultSize: null, fat: 1 };
    const life = { checkpoint: { stageIndex: 2, marker: 0, progress }, siblingsLeft: 3, firstLife: false, seed: 9, deaths: [] };
    const v3 = { schemaVersion: 3, savedAt: '', game: 'homewater', lineage: lineage(), life, pendingOffspring: null, archive: [] };
    const s = migrate(JSON.parse(JSON.stringify(v3)));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.life?.checkpoint.progress.imprint).toBe(params().get('imprint.default'));
    expect(s.life?.checkpoint.progress.fryBites).toBe(10);
    expect(s.life?.checkpoint.stageIndex).toBe(2);
    // No life in progress: nothing to upgrade.
    const noLife = migrate(JSON.parse(JSON.stringify({ ...v3, life: null })));
    expect(noLife.life).toBeNull();
    // A checkpoint that already has an imprint keeps it.
    const kept = migrate(JSON.parse(JSON.stringify({ ...v3, life: { ...life, checkpoint: { ...life.checkpoint, progress: { ...progress, imprint: 0.9 } } } })));
    expect(kept.life?.checkpoint.progress.imprint).toBe(0.9);
  });

  it('refuses saves from a newer version and non-saves', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, game: 'homewater', lineage: lineage() })).toThrow(/newer/);
    expect(() => migrate({ game: 'other' })).toThrow();
  });
});
