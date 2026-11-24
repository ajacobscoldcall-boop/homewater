// Times first lives against later lives (the report plays later lives). npx vite-node scripts/balance/firstLife.ts (N=40 lives per row).
import { playLife, paramsFor, hashSeed } from './play';
import { foundLineage } from '../../src/sim/lineage';
import { randomPopulationYear } from '../../src/sim/population';
import { Rng } from '../../src/sim/rng';
const N = Number(process.env.N ?? 40);
for (const [d, sk] of [['fieldGuide','novice'],['fieldGuide','average'],['fieldGuide','skilled'],['wild','skilled']] as const) {
  for (const first of [true, false]) {
    const p = paramsFor(d); const per: Record<string, number[]> = {}; const tot: number[] = [];
    for (let i = 0; i < N; i++) {
      const seed = hashSeed(777, d, sk, i); const r = new Rng(seed);
      const sex = r.chance(0.5) ? 'F' : 'M';
      const l = foundLineage(p, { preset: 'quick', sex, name: 'B', difficulty: d, seed: r.int(1, 2 ** 31) });
      const conditions = randomPopulationYear(p, r, 1 + (i % 2));
      const res = playLife({ difficulty: d, skill: sk, fish: l.current, conditions, siblings: 5, seed: r.int(1, 2 ** 31), firstLife: first }).result;
      if (!res.completed) continue;
      tot.push(res.playSeconds);
      for (const a of res.attempts) if (a.outcome === 'ok') (per[a.stage] ??= []).push(a.seconds);
    }
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    console.log(d, sk, first ? 'FIRST' : 'later', `n=${tot.length}`, `life ${(m(tot) / 60).toFixed(1)} min`, Object.entries(per).map(([k, v]) => `${k} ${Math.round(m(v))}s`).join(' '));
  }
}
