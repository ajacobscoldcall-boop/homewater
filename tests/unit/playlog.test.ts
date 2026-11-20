import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attemptRows, collectLives, renderSummary } from '../../scripts/playlog/summary';
import { PlayLogRecorder } from '../../src/telemetry/recorder';
import { PlayLog } from '../../src/telemetry/playLog';
import { readLives, upsertLife, type KeyValueStore } from '../../src/telemetry/store';
import type { LifeLog, PlayLogSettings, StageAttempt } from '../../src/telemetry/types';
import { intent, newWorld } from './helpers';

const SETTINGS: PlayLogSettings = { graphics: 'High', gameSpeed: 1, guidance: true, gore: 'unflinching', cinematics: true, reducedMotion: false };

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function recorder() {
  let clock = 1_800_000_000_000;
  const changes: { life: LifeLog; ended: boolean }[] = [];
  const rec = new PlayLogRecorder({ now: () => clock, settings: () => SETTINGS, onChange: (life, ended) => changes.push({ life, ended }) });
  return { rec, changes, tick: (ms: number) => (clock += ms) };
}

describe('play log recorder', () => {
  it('records stage attempts, deaths, siblings, warnings, near misses and a trace from a real world', () => {
    const { w } = newWorld({ seed: 7 });
    const { rec, tick } = recorder();
    // Egg: play a few seconds, then finish it.
    for (let i = 0; i < 200; i++) {
      w.step(intent());
      tick(16);
      rec.observe(w, w.drainEvents(), 0);
    }
    w.debugComplete();
    rec.observe(w, w.drainEvents(), 0);
    const life = rec.current as LifeLog;
    expect(life.partial).toBe(false);
    expect(life.difficulty).toBe('fieldGuide');
    expect(life.attempts).toHaveLength(1);
    const egg = life.attempts[0] as StageAttempt;
    expect(egg.outcome).toBe('completed');
    expect(egg.stage).toBe('egg');
    expect(egg.trace.length).toBeGreaterThanOrEqual(3); // one sample per second of stage time
    expect(egg.playSeconds).toBeGreaterThan(2);
    expect(egg.settings).toEqual(SETTINGS);

    // Fry: a warning and a near miss, then death.
    w.advance();
    w.drainEvents();
    for (let i = 0; i < 30; i++) {
      w.step(intent({ forward: 1 }));
      tick(16);
      rec.observe(w, w.drainEvents(), i < 10 ? 0 : 1);
    }
    w.emit('warning', 'trout');
    rec.observe(w, w.drainEvents(), 2);
    const left = w.siblingsLeft;
    w.die('trout');
    rec.observe(w, w.drainEvents(), 2);
    const fry = life.attempts[1] as StageAttempt;
    expect(fry.outcome).toBe('died');
    expect(fry.deathCause).toBe('trout');
    expect(fry.warnings).toEqual({ trout: 1 });
    expect(fry.nearMisses).toBe(2);
    expect(fry.endPos).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(fry.siblingsLeft).toBe(left);
    expect(life.outcome).toBe('unfinished'); // siblings remain

    // A sibling picks up: a new attempt at the same stage.
    w.continueWithSibling('Sib');
    w.drainEvents();
    w.step(intent());
    rec.observe(w, w.drainEvents(), 2);
    expect(life.attempts).toHaveLength(3);
    expect(life.attempts[2]?.fish).toBe('Sib');
    expect(life.attempts[2]?.nearMisses).toBe(0);

    // Last fish dies: the brood is lost.
    w.siblingsLeft = 0;
    w.die('trout');
    rec.observe(w, w.drainEvents(), 2);
    expect(life.outcome).toBe('broodLost');
    expect(life.endedAt).not.toBeNull();
  });

  it('starts a new life for a new world and closes the old attempt as unfinished', () => {
    const a = newWorld({ seed: 1 }).w;
    const b = newWorld({ seed: 2, startStage: 3 }).w;
    const { rec } = recorder();
    a.step(intent());
    rec.observe(a, a.drainEvents());
    const first = rec.current as LifeLog;
    b.step(intent());
    rec.observe(b, b.drainEvents());
    expect(first.attempts[0]?.outcome).toBe('unfinished');
    expect(rec.current).not.toBe(first);
    expect(rec.current?.partial).toBe(true);
    expect(rec.current?.attempts[0]?.stage).toBe('ocean');
  });

  it('thins a long trace instead of growing without end', () => {
    const { w } = newWorld({ seed: 3, startStage: 1 }); // an idle fry lives through a minute
    const rec = new PlayLogRecorder({ now: () => 0, settings: () => SETTINGS, onChange: () => {}, maxSamples: 20 });
    for (let i = 0; i < 60 * 60 && w.status === 'playing'; i++) {
      w.step(intent());
      rec.observe(w, w.drainEvents());
    }
    const trace = rec.current?.attempts[0]?.trace ?? [];
    expect(trace.length).toBeLessThanOrEqual(20);
    expect(trace.at(-1)?.[0]).toBeGreaterThan(50); // still covers the whole minute, more sparsely
  });
});

describe('play log store and switch', () => {
  it('is off by default and records nothing until switched on', () => {
    const store = memoryStore();
    const log = new PlayLog(() => SETTINGS, store, () => 0);
    const { w } = newWorld();
    w.step(intent());
    log.observe(w, w.drainEvents());
    expect(log.enabled).toBe(false);
    expect(log.lives()).toHaveLength(0);
    log.setEnabled(true);
    log.observe(w, w.drainEvents());
    w.debugComplete();
    log.observe(w, w.drainEvents());
    expect(log.lives()).toHaveLength(1);
    expect(log.file().kind).toBe('homewater-playlog');
    expect(new PlayLog(() => SETTINGS, store).enabled).toBe(true); // remembered
    log.clear();
    expect(log.lives()).toHaveLength(0);
  });

  it('keeps the newest lives within the caps', () => {
    const store = memoryStore();
    const life = (id: string): LifeLog => ({ id, attempts: [] }) as unknown as LifeLog;
    for (let i = 0; i < 8; i++) upsertLife(store, life(`l${i}`), 5);
    expect(readLives(store).map((l) => l.id)).toEqual(['l3', 'l4', 'l5', 'l6', 'l7']);
    upsertLife(store, life('l5'), 5); // an update moves it to the end, no duplicate
    expect(readLives(store).map((l) => l.id)).toEqual(['l3', 'l4', 'l6', 'l7', 'l5']);
    upsertLife(store, life('big'), 5, 30); // each of these is about 26 characters of JSON
    expect(readLives(store).map((l) => l.id)).toEqual(['big']);
    expect([...store.data.keys()].sort()).toEqual(['homewater.playlog', 'homewater.playlog.life.big']); // dropped lives are removed
  });

  it('has no network code', () => {
    const files = [
      ...readdirSync('src/telemetry').map((f) => join('src/telemetry', f)),
      'src/ui/playLogPanel.ts',
      ...readdirSync('scripts/playlog').map((f) => join('scripts/playlog', f)),
    ];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection)\b|https?:\/\//);
  });
});

describe('play log summary', () => {
  const load = (f: string) => ({ name: f, data: JSON.parse(readFileSync(join('tests/unit/fixtures', f), 'utf8')) as unknown });
  const parsed = collectLives([load('playlog-a.json'), load('playlog-b.json'), { name: 'other.json', data: { hello: 1 } }]);

  it('merges files and drops repeated lives', () => {
    expect(parsed.files).toBe(2);
    expect(parsed.lives.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(parsed.skipped).toEqual(['other.json']);
  });

  it('splits the return at its checkpoint like the bots report', () => {
    const b = parsed.lives[1] as LifeLog;
    const rows = b.attempts.filter((a) => a.stage === 'return').map(attemptRows);
    expect(rows).toEqual([
      [{ row: 'return:sea', dead: true }],
      [{ row: 'return:sea', dead: false }, { row: 'return:river', dead: true }],
      [{ row: 'return:river', dead: true }],
    ]);
    expect(attemptRows({ outcome: 'unfinished' } as StageAttempt)).toEqual([]);
  });

  it('writes deaths per stage and cause, stage lengths and completion', () => {
    const md = renderSummary(parsed, ['playlog-a.json', 'playlog-b.json', 'other.json']);
    expect(md).toContain('| Field guide | 2 | 1 | 100% (1/1) | 1.00 | 7.7 min | 1 |');
    expect(md).toContain('| Wild | 1 | 1 | 0% (0/1) | 2.00 | - | 0 |');
    expect(md).toContain('| Smolt run | 50% (1/2) | 0% (0/1) |');
    expect(md).toContain('| Return: sea and nets | 0% (0/1) | 50% (1/2) |');
    expect(md).toContain('| Return: home river | 0% (0/1) | 100% (2/2) |');
    expect(md).toContain('| Return: home river | - | bear 50%, exhaustion 50% |');
    expect(md).toContain('| Fry | 85 / 80 (1) | 110 / 80 (1) |');
    expect(md).toContain('Skipped (not a Homewater play log): `other.json`');
    expect(md).not.toContain('`other.json`)');
  });

  it('copes with no lives', () => {
    expect(renderSummary(collectLives([]))).toContain('No lives in these files.');
  });
});
