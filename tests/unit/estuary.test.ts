/** The estuary at the end of the smolt run (src/sim/stages/estuary.ts and its hooks in smolt.ts). */
import { describe, expect, it } from 'vitest';
import { estuarySpan, haloclineDepth, salinityAt, saltEffects, saltOver } from '../../src/sim/stages/estuary';
import { smoltSection, smoltView } from '../../src/sim/stages/smolt';
import { parrLeft } from '../../src/render/estuary';
import { estuaryChip } from '../../src/ui/vitals';
import { layoutLifeMap } from '../../src/ui/lifeMap';
import { intent, newWorld } from './helpers';
import type { World } from '../../src/sim/world';

const SMOLT = 2;

/** Clear the predators so a test measures only the water. */
function calm(w: World): void {
  for (const e of w.entities) if (e.kind !== 'smolt' && e.kind !== 'cover') e.alive = false;
  const s = w.stage as { birdTimer: number; mergTimer: number; sealTimer: number };
  s.birdTimer = s.mergTimer = s.sealTimer = 1e9;
}

/** Put the fish at (x, depth) and keep it there for `secs`, holding still. */
function holdAt(w: World, x: number, depth: number, secs: number): void {
  for (let i = 0; i < secs * 60 && w.status === 'playing'; i++) {
    w.body.pos.x = x;
    w.body.pos.y = -depth;
    w.body.pos.z = 0;
    w.body.vel = { x: 0, y: 0, z: 0 };
    w.step(intent());
  }
}

describe('estuary salinity', () => {
  const { p } = newWorld({ startStage: SMOLT });
  const span = estuarySpan(p);
  const mid = span.start + (span.end - span.start) * 0.2;

  it('is fresh upstream of the river mouth', () => {
    expect(salinityAt(p, span.mouth - 20, 1)).toBe(0);
    expect(salinityAt(p, span.mouth - 20, 6)).toBe(0);
  });

  it('is fresher on top and saltier below', () => {
    for (const x of [span.start, mid, span.start + 40]) expect(salinityAt(p, x, 0.3)).toBeLessThan(salinityAt(p, x, 6));
  });

  it('rises seaward, at the surface and at the bottom', () => {
    expect(salinityAt(p, span.start, 0.3)).toBeLessThan(salinityAt(p, span.end - 5, 0.3));
    expect(salinityAt(p, span.start, 6)).toBeLessThan(salinityAt(p, span.end - 5, 6));
    expect(salinityAt(p, span.end - 5, 6)).toBeGreaterThan(0.95);
  });

  it('has a halocline that rises toward the surface seaward', () => {
    expect(haloclineDepth(p, span.start)).toBeGreaterThan(haloclineDepth(p, span.end));
    // The brackish band near the mouth sits below the gulls' reach.
    expect(haloclineDepth(p, span.start)).toBeGreaterThan(p.get('smolt.birdReachDepth'));
  });

  it('costs nothing within the tolerance, and energy beyond it', () => {
    expect(saltOver(p, 0.4, 0.3)).toBe(0);
    expect(saltEffects(p, 0).drain).toBe(0);
    const e = saltEffects(p, saltOver(p, 1, 0.3));
    expect(e.drain).toBeGreaterThan(0);
    expect(e.regenScale).toBeLessThan(1);
    expect(e.burstScale).toBeLessThan(1);
  });
});

describe('readiness for salt water', () => {
  it('grows slowly in fresh water and faster in brackish water', () => {
    const fresh = newWorld({ startStage: SMOLT }).w;
    const brackish = newWorld({ startStage: SMOLT }).w;
    calm(fresh);
    calm(brackish);
    const span = estuarySpan(fresh.p);
    const r0 = smoltView(fresh)!.ready;
    holdAt(fresh, 100, 2, 10);
    // Just below the middle of the halocline at the estuary's start: brackish, and within tolerance.
    holdAt(brackish, span.start + 3, haloclineDepth(brackish.p, span.start + 3) + 0.1, 10);
    const f = smoltView(fresh)!;
    const b = smoltView(brackish)!;
    expect(f.ready).toBeGreaterThan(r0);
    expect(b.ready - r0).toBeGreaterThan(3 * (f.ready - r0));
    expect(b.over).toBe(0);
    expect(b.salinity).toBeGreaterThanOrEqual(brackish.p.get('estuary.brackishMin'));
  });

  it('drains energy when the fish rushes into full salt water before it is ready, and stops once it is', () => {
    const { w } = newWorld({ startStage: SMOLT });
    calm(w);
    const span = estuarySpan(w.p);
    w.body.energy = 1;
    holdAt(w, span.end - 20, 6, 3);
    const v = smoltView(w)!;
    expect(v.over).toBeGreaterThan(0);
    expect(w.body.energy).toBeLessThan(0.75);
    expect(w.events.some((e) => e.key === 'estuary.saltStress')).toBe(true);
    // Readiness keeps growing in salt water: after a while the cost ends.
    holdAt(w, span.end - 20, 6, 60);
    expect(smoltView(w)!.over).toBe(0);
    expect(smoltView(w)!.ready).toBeGreaterThanOrEqual(w.p.get('estuary.readyDone'));
  });

  it('fades the last parr marks as the fish gets ready', () => {
    const { w } = newWorld({ startStage: SMOLT });
    const v = smoltView(w)!;
    expect(parrLeft(v)).toBeGreaterThan(0);
    expect(parrLeft({ ...v, ready: v.readyDone })).toBe(0);
    expect(parrLeft({ ...v, ready: 0.5 })).toBeLessThan(parrLeft(v));
  });
});

describe('the estuary in the smolt run', () => {
  it('is the last section of the run, and a checkpoint a sibling resumes from', () => {
    const { w } = newWorld({ startStage: SMOLT });
    calm(w);
    const span = estuarySpan(w.p);
    expect(smoltSection(w, span.start - 1)).toBe('mouth');
    expect(smoltSection(w, span.start + 1)).toBe('estuary');
    w.body.pos.x = span.start + 1;
    w.step(intent());
    expect(w.checkpoint.marker).toBe(1);
    expect(w.events.some((e) => e.key === 'estuary.enter')).toBe(true);
    w.die('seal');
    w.continueWithSibling('Sib');
    expect(w.stageId).toBe('smolt');
    expect(w.body.pos.x).toBeGreaterThanOrEqual(span.start);
    expect(smoltView(w)!.ready).toBeCloseTo(w.p.get('estuary.checkpointReady'), 5);
    // The school comes too.
    expect(w.live('smolt').length).toBe(w.p.get('smolt.schoolSize'));
  });

  it('ends at the open sea', () => {
    const { w } = newWorld({ startStage: SMOLT });
    calm(w);
    w.body.pos.x = w.arena.max.x - 5.5;
    for (let i = 0; i < 120 && w.status === 'playing'; i++) w.step(intent({ forward: 1 }));
    expect(w.status).toBe('stageComplete');
    expect(w.events.some((e) => e.key === 'smolt.salt')).toBe(true);
  });

  it('shows the water in a chip from the estuary on', () => {
    const { w } = newWorld({ startStage: SMOLT });
    calm(w);
    expect(estuaryChip(w)).toBe('');
    const span = estuarySpan(w.p);
    holdAt(w, span.start + 3, haloclineDepth(w.p, span.start + 3) + 0.1, 0.5);
    expect(estuaryChip(w)).toBe('brackish water');
    holdAt(w, span.end - 20, 6, 1);
    expect(estuaryChip(w)).toBe('salt water: not ready');
  });
});

describe('the estuary on the life map', () => {
  const base = { habitat: 'creek' as const, sex: 'F' as const, isJack: null, oceanYears: 2, lakeYears: 1, eggs: null, name: 'Alder' };
  it('places gull and seal deaths on the smolt run at the estuary', () => {
    const m = layoutLifeMap({ ...base, stage: 'smolt', state: 'died', deaths: [{ name: 'A', stage: 'smolt', cause: 'gull' }, { name: 'B', stage: 'smolt', cause: 'seal' }] });
    const estuary = m.stops.find((s) => s.id === 'mouth')!;
    const marks = m.marks.filter((k) => k.kind === 'death');
    expect(marks).toHaveLength(2);
    for (const k of marks) expect(Math.hypot(k.at.x - estuary.at.x, k.at.y - estuary.at.y)).toBeLessThan(30);
    expect(marks[0]!.label).toContain('a gull');
  });
  it('notes the passage to sea at the estuary once the smolt run is done', () => {
    const m = layoutLifeMap({ ...base, stage: 'ocean', state: 'playing', deaths: [] });
    expect(m.stops.find((s) => s.id === 'mouth')!.sub.some((x) => x.text === 'To sea at first light')).toBe(true);
    const before = layoutLifeMap({ ...base, stage: 'smolt', state: 'playing', deaths: [] });
    expect(before.stops.find((s) => s.id === 'mouth')!.sub.some((x) => x.text === 'To sea at first light')).toBe(false);
  });
});
