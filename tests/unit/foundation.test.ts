import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateParamFile } from '../../src/sim/params';
import { Rng, inverseNormalCdf } from '../../src/sim/rng';
import { FILE, params } from './helpers';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('parameter file', () => {
  it('is valid', () => {
    expect(validateParamFile(FILE)).toEqual([]);
  });

  it('defines every parameter the code asks for', () => {
    const p = params();
    const missing: string[] = [];
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.get\('([a-zA-Z0-9_.]+)'\)/g)) {
        const id = m[1] as string;
        if (!p.entries.has(id)) missing.push(`${f}: ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('applies difficulty multipliers', () => {
    expect(params('fieldGuide').get('fry.troutSpeed')).toBeLessThan(params('wild').get('fry.troutSpeed'));
  });
});

describe('captions', () => {
  it('defines every caption the code emits', () => {
    const captions = (JSON.parse(readFileSync('src/data/captions.json', 'utf8')) as { captions: Record<string, string> }).captions;
    const missing: string[] = [];
    let checked = 0;
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/emit(?:Once)?\('(?:caption|reveal|spawned)', '([a-zA-Z.]+)'/g)) {
        checked++;
        if (!captions[m[1] as string]) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(checked).toBeGreaterThan(30);
    for (const stage of ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn']) if (!captions[`${stage}.intro`]) missing.push(`${stage}.intro`);
    expect(missing).toEqual([]);
  });
});

describe('simulation stays separate from rendering', () => {
  it('has no three.js, DOM or browser imports under src/sim', () => {
    const offenders: string[] = [];
    for (const f of files('src/sim')) {
      const src = readFileSync(f, 'utf8');
      if (/from ['"]three/.test(src) || /\b(window|document|localStorage|indexedDB|requestAnimationFrame)\b/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe('random numbers', () => {
  it('replays exactly from a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('draws a standard normal', () => {
    const r = new Rng(7);
    const xs = Array.from({ length: 20000 }, () => r.normal());
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });

  it('inverts the normal CDF', () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 6);
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959964, 3);
    expect(inverseNormalCdf(0.08)).toBeCloseTo(-1.405072, 3);
  });
});
