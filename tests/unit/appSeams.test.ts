/** Pieces of the app shell that the split into screens made testable on their own. */
import { describe, expect, it } from 'vitest';
import { captionDuration, flashDuration } from '../../src/app/messages';
import { buildSave, lifeRecord } from '../../src/app/saving';
import { DEFAULT_VOLUME, parseSettings } from '../../src/app/settings';
import { placeMarker, threatMarkers } from '../../src/app/screens/markers';
import { nameSuggester } from '../../src/app/screens/naming';
import { foundLineage, NAMES, offerOffspring } from '../../src/sim/lineage';
import { SCHEMA_VERSION } from '../../src/save/save';
import { newWorld, params } from './helpers';

const lineage = () => foundLineage(params(), { preset: 'quick', sex: 'F', name: 'Alder', difficulty: 'fieldGuide', seed: 4 });

describe('settings', () => {
  it('fills defaults for nothing stored, bad JSON and bad values', () => {
    const def = { gore: 'unflinching', volume: DEFAULT_VOLUME, muted: false, narrationVolume: 1, quality: 'auto', contentSeen: false };
    expect(parseSettings(null)).toEqual(def);
    expect(parseSettings('{oops')).toEqual(def);
    expect(parseSettings('null')).toEqual(def);
    expect(parseSettings(JSON.stringify({ gore: 'x', volume: 2, muted: 'yes', narrationVolume: -1, quality: 'ultra', contentSeen: 'yes' }))).toEqual(def);
  });

  it('keeps valid values', () => {
    const s = { gore: 'documentary', volume: 0.3, muted: true, narrationVolume: 0.5, quality: 'low', contentSeen: true } as const;
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('reads settings stored before narration volume and first-run setup existed', () => {
    const old = parseSettings(JSON.stringify({ gore: 'documentary', volume: 0.4, muted: false, quality: 'high' }));
    expect(old).toMatchObject({ gore: 'documentary', volume: 0.4, narrationVolume: 1, quality: 'high', contentSeen: false });
  });
});

describe('messages', () => {
  it('captions stay longer for longer text, up to 11 s', () => {
    expect(captionDuration('')).toBe(3000);
    expect(captionDuration('x'.repeat(100))).toBe(7200);
    expect(captionDuration('x'.repeat(1000))).toBe(9000);
  });

  it('a jack opening flashes longest, a hit shortest', () => {
    expect(flashDuration('opening')).toBeGreaterThan(flashDuration('on'));
    expect(flashDuration('on')).toBeGreaterThan(flashDuration('hit'));
  });
});

describe('naming', () => {
  it('suggests the same names for the same seed, never a used one', () => {
    const used = NAMES.slice(0, 5);
    const a = nameSuggester(42, used);
    const b = nameSuggester(42, used);
    const names = Array.from({ length: 20 }, () => a());
    expect(names).toEqual(Array.from({ length: 20 }, () => b()));
    for (const n of names) expect(used).not.toContain(n);
  });

  it('falls back to Alder when every name is used', () => {
    expect(nameSuggester(1, NAMES)()).toBe('Alder');
  });
});

describe('threat markers', () => {
  it('an on-screen point keeps its place', () => {
    const m = placeMarker({ x: 0.3, y: 0.6, behind: false });
    expect(m.off).toBe(false);
    expect(m.x).toBeCloseTo(0.3);
    expect(m.y).toBeCloseTo(0.6);
  });

  it('an off-screen or behind point is pinned near the edge, pointing at it', () => {
    const right = placeMarker({ x: 3, y: 0.5, behind: false });
    expect(right.off).toBe(true);
    expect(right.x).toBeCloseTo(0.94);
    expect(right.angle).toBeCloseTo(0);
    const behind = placeMarker({ x: 0.5, y: 0.2, behind: true });
    expect(behind.off).toBe(true);
    expect(behind.y).toBeGreaterThan(0.5); // mirrored: behind and up means below on screen
  });

  it('only warning or attacking threats are marked, at most eight', () => {
    const { w } = newWorld({ seed: 3, startStage: 3 });
    w.entities.length = 0;
    const seals = Array.from({ length: 10 }, (_, i) => w.spawn('seal', { x: i, y: -5, z: 0 }, { state: 'cruise' }));
    const centre = () => ({ x: 0.5, y: 0.5, behind: false });
    expect(threatMarkers(w, centre)).toEqual([]);
    seals[0]!.state = 'warn';
    expect(threatMarkers(w, centre).map((m) => [m.label, m.hot])).toEqual([['seal', false]]);
    for (const s of seals) s.state = 'lunge';
    const hot = threatMarkers(w, centre);
    expect(hot).toHaveLength(8);
    expect(hot.every((m) => m.hot && !m.off)).toBe(true);
  });
});

describe('saving', () => {
  it('no lineage, no save', () => {
    expect(buildSave({ lineage: null, world: null, lifeSeed: 1, deaths: [], pendingKids: null, archive: [] })).toBeNull();
  });

  it('between lives it saves the offspring on offer, not a life', () => {
    const l = lineage();
    const kids = offerOffspring(params(), l, l.current);
    const s = buildSave({ lineage: l, world: null, lifeSeed: 1, deaths: [], pendingKids: kids, archive: [], now: new Date('2026-11-20T00:00:00Z') })!;
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.savedAt).toBe('2026-11-20T00:00:00.000Z');
    expect(s.life).toBeNull();
    expect(s.pendingOffspring).toBe(kids);
  });

  it('during a life it saves the checkpoint, seed and deaths, and drops pending offspring', () => {
    const { w, lineage: l } = newWorld({ seed: 9 });
    const deaths = [{ name: 'Birch', stage: 'egg' as const, cause: 'exhaustion' as const }];
    const s = buildSave({ lineage: l, world: w, lifeSeed: 77, deaths, pendingKids: [], archive: [] })!;
    expect(s.life?.seed).toBe(77);
    expect(s.life?.deaths).toEqual(deaths);
    expect(s.life?.deaths).not.toBe(deaths);
    expect(s.life?.checkpoint).toBe(w.checkpoint);
    expect(s.pendingOffspring).toBeNull();
    expect(l.current).toBe(w.fish);
  });

  it('a life record copies the deaths and has a result only if the fish spawned', () => {
    const { w } = newWorld({ seed: 2 });
    const deaths = [{ name: 'Birch', stage: 'fry' as const, cause: 'exhaustion' as const }];
    const rec = lifeRecord(w, deaths, false);
    expect(rec.name).toBe(w.fish.name);
    expect(rec.deaths).toEqual(deaths);
    expect(rec.deaths).not.toBe(deaths);
    expect(rec.result).toBeNull();
    expect(rec.offspring).toEqual([]);
  });
});
