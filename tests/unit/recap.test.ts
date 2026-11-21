/**
 * The recap stream's pure parts: the coming year seen before it is rolled, what an offspring's
 * traits mean in a year and the Suggested rule, the life route map's layout, and the schema 6 save.
 */
import { describe, expect, it } from 'vitest';
import { advanceGeneration, foundLineage, offerOffspring, peekNextYear, type LifeRecord } from '../../src/sim/lineage';
import { migrate, SCHEMA_VERSION } from '../../src/save/save';
import { buildSave, lifeRecord } from '../../src/app/saving';
import { h2, habitatOffset } from '../../src/sim/genetics';
import { STAGE_IDS, TRAIT_IDS, type FishIdentity, type Habitat, type TraitValues, type YearConditions } from '../../src/sim/types';
import { fitFor, suggestOffspring, traitScore } from '../../src/ui/offspringFit';
import { LAKE, layoutLifeMap, mapFromLife, mapFromRecord, MAP_H, MAP_W, type MapInput } from '../../src/ui/lifeMap';
import captions from '../../src/data/captions.json';
import { newWorld, params } from './helpers';

const p = params();
const plain: YearConditions = { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 };
const CAPTIONS = (captions as { captions: Record<string, string> }).captions;

/** A fish whose inherited traits sit `sd` population standard deviations from the creek average. */
function kid(sex: 'F' | 'M', sd: Partial<Record<keyof TraitValues, number>>, habitat: Habitat = 'creek'): Pick<FishIdentity, 'sex' | 'bv' | 'habitat'> {
  const bv = Object.fromEntries(TRAIT_IDS.map((t) => [t, habitatOffset(p, habitat, t) + (sd[t] ?? 0) * Math.sqrt(h2(p, t))])) as TraitValues;
  return { sex, bv, habitat };
}

describe('the coming year', () => {
  it('peekNextYear is the year advanceGeneration then rolls, and changes nothing', () => {
    for (const seed of [3, 17, 92]) {
      const l = foundLineage(p, { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed });
      const kids = offerOffspring(p, l, l.current);
      const before = JSON.stringify(l);
      const peek = peekNextYear(p, l, kids[0]!.generation);
      expect(JSON.stringify(l)).toBe(before);
      advanceGeneration(p, l, kids[1]!, 'Sedge');
      expect(l.conditions).toEqual(peek);
    }
  });
});

describe('offspring fit and the Suggested rule', () => {
  it('scores traits against the home population, in population SDs', () => {
    expect(traitScore(p, kid('F', {}, 'beach').bv, 'beach', 'size')).toBeCloseTo(0, 6);
    expect(traitScore(p, kid('F', { size: 1 }, 'river').bv, 'river', 'size')).toBeCloseTo(1, 6);
    expect(traitScore(p, kid('F', { size: 9 }).bv, 'creek', 'size')).toBe(2);
  });

  it('a warm year favours early runners and punishes late ones', () => {
    const warm = { ...plain, temperature: 1.25 };
    const early = fitFor(p, kid('F', { runTiming: -1.2 }), warm);
    const late = fitFor(p, kid('F', { runTiming: 1.2 }), warm);
    expect(early.score).toBeGreaterThan(0);
    expect(early.line).toBe('offspring.fit.warm.runTiming.good');
    expect(late.score).toBeLessThan(0);
    expect(late.line).toBe('offspring.fit.warm.runTiming.poor');
  });

  it('low water only punishes deep bodies; a streamlined body is no better than an average one', () => {
    const low = { ...plain, flow: 0.7 };
    expect(fitFor(p, kid('F', { bodyDepth: 1.5 }), low).score).toBeLessThan(0);
    expect(fitFor(p, kid('F', { bodyDepth: -1.5 }), low).score).toBe(0);
  });

  it('run size matters to males only, through the jack leaning', () => {
    const big = { ...plain, runSize: 1.4 };
    expect(fitFor(p, kid('M', { jack: 1.5 }), big).score).toBeGreaterThan(0);
    expect(fitFor(p, kid('M', { jack: -1.5 }), big).score).toBeLessThan(0);
    expect(fitFor(p, kid('F', { jack: 1.5 }), big).score).toBe(0);
    expect(fitFor(p, kid('M', { jack: 1.5 }), { ...plain, runSize: 0.6 }).score).toBeLessThan(0);
  });

  it('an ordinary year has nothing to say and suggests no one', () => {
    const kids = [kid('F', { runTiming: -2 }), kid('M', { jack: 2 }), kid('F', { bodyDepth: 2 })];
    expect(kids.map((k) => fitFor(p, k, plain).line)).toEqual(['offspring.fit.ordinary', 'offspring.fit.ordinary', 'offspring.fit.ordinary']);
    expect(suggestOffspring(p, kids, plain)).toBeNull();
  });

  it('suggests the clear best fit, with its reason', () => {
    const warm = { ...plain, temperature: 1.3 };
    const kids = [kid('F', { runTiming: 0.8 }), kid('M', { runTiming: -1.5 }), kid('F', {})];
    expect(suggestOffspring(p, kids, warm)).toEqual({ index: 1, reason: 'offspring.fit.warm.runTiming.good' });
  });

  it('suggests no one when the best is not clearly better', () => {
    const warm = { ...plain, temperature: 1.3 };
    expect(suggestOffspring(p, [kid('F', { runTiming: -1 }), kid('M', { runTiming: -1.05 })], warm)).toBeNull();
    expect(suggestOffspring(p, [kid('F', { runTiming: -0.2 }), kid('M', {})], warm)).toBeNull();
  });

  it('every line a card can show has a caption', () => {
    const years: YearConditions[] = [plain, { ...plain, temperature: 1.3 }, { ...plain, temperature: 0.7 }, { ...plain, flow: 1.3 }, { ...plain, flow: 0.7 }, { ...plain, runSize: 1.4 }, { ...plain, runSize: 0.6 }, { ...plain, oceanCrowding: 1.3 }];
    const ids = new Set<string>();
    for (const y of years)
      for (const sex of ['F', 'M'] as const)
        for (const v of [-2, -1, 1, 2])
          for (const t of TRAIT_IDS) {
            const f = fitFor(p, kid(sex, { [t]: v }), y);
            ids.add(f.line);
            for (const part of f.parts) ids.add(part.id);
          }
    for (const id of ids) expect(CAPTIONS[id], id).toBeTruthy();
    expect(ids.size).toBeGreaterThan(10);
  });
});

function life(o: Partial<MapInput> = {}): MapInput {
  return { habitat: 'creek', sex: 'F', isJack: null, oceanYears: 2, lakeYears: 1, stage: 'spawn', state: 'spawned', deaths: [], eggs: 3200, name: 'Alder', ...o };
}

describe('life route map layout', () => {
  it('lays out every habitat, lake years and years at sea inside the map', () => {
    for (const habitat of ['creek', 'river', 'beach'] as const)
      for (const lakeYears of [1, 2])
        for (const [oceanYears, isJack] of [[1, true], [2, false], [3, false]] as const) {
          const m = layoutLifeMap(life({ habitat, lakeYears, oceanYears, isJack, sex: 'M' }));
          expect(m.seaLaps).toHaveLength(oceanYears);
          expect(m.totalYears).toBe(lakeYears + oceanYears + 1);
          for (const q of [...m.route, ...m.stops.map((s) => s.at), ...m.marks.map((k) => k.at)]) {
            expect(q.x).toBeGreaterThanOrEqual(0);
            expect(q.x).toBeLessThanOrEqual(MAP_W);
            expect(q.y).toBeGreaterThanOrEqual(0);
            expect(q.y).toBeLessThanOrEqual(MAP_H);
          }
          // Stages follow each other along the route, and the route ends where it began: the nest.
          let prev = 0;
          for (const s of STAGE_IDS) {
            const [a, b] = m.spans[s];
            expect(a).toBeGreaterThanOrEqual(prev);
            expect(b).toBeGreaterThanOrEqual(a);
            prev = b;
          }
          expect(m.route.at(-1)).toEqual(m.route[0]);
          expect(m.reached).toBe(m.route.length - 1);
        }
  });

  it('a life in progress stops at the start of its stage; years at sea are uncertain until decided', () => {
    for (const [i, stage] of STAGE_IDS.entries()) {
      const m = layoutLifeMap(life({ stage, state: 'playing', oceanYears: null }));
      expect(m.reached).toBe(m.spans[stage][0]);
      expect(m.seaUncertain).toBe(true);
      expect(m.timeline.find((t) => t.id === 'sea')?.uncertain).toBe(true);
      expect(m.timeline.every((t) => t.done >= 0 && t.done <= 1)).toBe(true);
      if (i === 0) expect(m.timeline.every((t) => t.done === 0)).toBe(true);
    }
    const jack = layoutLifeMap(life({ stage: 'ocean', state: 'playing', oceanYears: null, isJack: true, sex: 'M' }));
    expect(jack.seaUncertain).toBe(false);
    expect(jack.seaLaps).toHaveLength(1);
  });

  it('marks where siblings died, and ends a died life at the last death', () => {
    const deaths = [
      { name: 'Rill', stage: 'smolt' as const, cause: 'merganser' as const },
      { name: 'Sedge', stage: 'return' as const, cause: 'gillnet' as const },
      { name: 'Tern', stage: 'return' as const, cause: 'bear' as const },
    ];
    const m = layoutLifeMap(life({ stage: 'return', state: 'died', deaths }));
    const marks = m.marks.filter((k) => k.kind === 'death');
    expect(marks.map((k) => k.stage)).toEqual(['smolt', 'return', 'return']);
    expect(marks.filter((k) => k.final)).toHaveLength(1);
    const [a, b] = m.spans.return;
    expect(m.reached).toBeGreaterThan(a);
    expect(m.reached).toBeLessThanOrEqual(b);
    // The net death sits near the coast, the bear death up the river at the falls.
    const net = marks[1]!.at;
    const bear = marks[2]!.at;
    expect(net.x).toBeGreaterThan(bear.x);
    // A spawned life lists its events, a died one does not claim it spawned.
    expect(layoutLifeMap(life()).marks.some((k) => k.label.startsWith('Spawned'))).toBe(true);
    expect(m.marks.some((k) => k.label.startsWith('Spawned'))).toBe(false);
  });

  it('the return crosses the nursery lake, and a death on the crossing is marked in the lake', () => {
    const inLake = (q: { x: number; y: number }) => ((q.x - LAKE.cx) / LAKE.rx) ** 2 + ((q.y - LAKE.cy) / LAKE.ry) ** 2 < 1;
    for (const habitat of ['creek', 'river', 'beach'] as const) {
      const deaths = [
        { name: 'Rill', stage: 'return' as const, cause: 'bear' as const },
        { name: 'Tern', stage: 'return' as const, cause: 'bear' as const, where: 'lake' as const },
      ];
      const m = layoutLifeMap(life({ habitat, stage: 'return', state: 'died', deaths }));
      const [a, b] = m.spans.return;
      expect(m.route.slice(a, b + 1).filter(inLake).length).toBeGreaterThan(3);
      const marks = m.marks.filter((k) => k.kind === 'death');
      expect(inLake(marks[0]!.at)).toBe(false);
      expect(inLake(marks[1]!.at)).toBe(true);
    }
    expect(layoutLifeMap(life()).marks.some((k) => k.label === 'Home across the lake')).toBe(true);
  });

  it('builds its input from a saved record and from a world in play', () => {
    const { w } = newWorld({ seed: 5, startStage: 2 });
    const live = mapFromLife(w, [], null);
    expect(live.stage).toBe('smolt');
    expect(live.state).toBe('playing');
    const rec: LifeRecord = lifeRecord(w, [{ name: 'Rill', stage: 'egg', cause: 'silt' }], false, 2);
    const m = mapFromRecord(rec);
    expect(m.state).toBe('died');
    expect(m.stage).toBe('egg');
    expect(m.lakeYears).toBe(2);
  });
});

describe('saves schema 6: lake years', () => {
  it('a life in progress and its record keep the years in the lake', () => {
    const { w, lineage: l } = newWorld({ seed: 9, startStage: 3 });
    const s = buildSave({ lineage: l, world: w, lifeSeed: 1, deaths: [], pendingKids: null, archive: [], lakeYears: 2 })!;
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.life?.lakeYears).toBe(2);
    expect(migrate(JSON.parse(JSON.stringify(s))).life?.lakeYears).toBe(2);
  });

  it('upgrades a version 5 save: records and the life in progress get unknown lake years', () => {
    const { w, lineage: l } = newWorld({ seed: 2 });
    const rec = lifeRecord(w, [], true) as unknown as Record<string, unknown>;
    delete rec.lakeYears;
    l.records.push(rec as unknown as LifeRecord);
    const v5 = { schemaVersion: 5, savedAt: '', game: 'homewater', lineage: l, life: { checkpoint: w.checkpoint, siblingsLeft: 3, firstLife: true, seed: 1, deaths: [] }, pendingOffspring: null, archive: [l] };
    const s = migrate(JSON.parse(JSON.stringify(v5)));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.lineage.records[0]!.lakeYears).toBeNull();
    expect(s.archive[0]!.records[0]!.lakeYears).toBeNull();
    expect(s.life?.lakeYears).toBeNull();
    expect(mapFromRecord(s.lineage.records[0]!).lakeYears).toBeNull();
  });
});
