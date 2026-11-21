/**
 * Quick per-stage probe for tuning (not part of the report): plays one stage
 * many times per difficulty and skill with one fish and no siblings, and
 * prints the death rate, mean attempt length and causes. Overrides work like
 * the balance run's --set and --mult, written id=value or difficulty:id=mult.
 *
 *   npx vite-node scripts/balance/probe.ts -- egg 400
 *   npx vite-node scripts/balance/probe.ts -- smolt 300 smolt.strikeDilution=0.4 fieldGuide:smolt.nearMissGrace=1
 *
 * For the egg stage it also prints the mean hold lost (drift) during the flood; for the fry, the survivors' mean lake growth.
 * For the return it also prints deaths on the lake crossing, timeouts, and the mean time in the lake for fish that got home.
 * For the spawning
 * grounds it prints the crowd's mean size, the share that spawned, their mean relative fitness and,
 * for females, the share of eggs char and gulls took (PROBE_RUN=x fixes the run size).
 * PROBE_YEAR=flow,temperature fixes the year's conditions instead of rolling them, e.g.
 *   PROBE_YEAR=0.75,1.25 npx vite-node scripts/balance/probe.ts -- return 200
 */
import { foundLineage } from '../../src/sim/lineage';
import { rollYear } from '../../src/sim/genetics';
import { Rng } from '../../src/sim/rng';
import { STAGE_IDS, type StageId } from '../../src/sim/types';
import { World } from '../../src/sim/world';
import type { Difficulty } from '../../src/sim/params';
import { Bot } from './bots';
import { alevinView } from '../../src/sim/stages/egg';
import { lakeGrowth } from '../../src/sim/stages/fry';
import { lakeView } from '../../src/sim/stages/returnLake';
import { spawnState } from '../../src/sim/stages/spawn';
import { paramsFor, setOverrides } from './play';
import { SKILLS, SKILL_NAMES } from './skills';

const args = process.argv.slice(2).filter((a) => a !== '--');
const stage = (args[0] ?? 'egg') as StageId;
const n = Number(args[1] ?? 300);
const values: Record<string, number> = {};
const mults: Record<string, number> = {};
for (const a of args.slice(2)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  if (k.includes(':')) mults[k] = Number(v);
  else values[k] = Number(v);
}
setOverrides({ values, mults });
const index = STAGE_IDS.indexOf(stage);
const fixedYear = process.env.PROBE_YEAR?.split(',').map(Number);
for (const d of ['fieldGuide', 'wild'] as Difficulty[]) {
  for (const skill of SKILL_NAMES) {
    const causes = new Map<string, number>();
    let dead = 0;
    let secs = 0;
    let floodDrift = 0;
    let fryLake = 0;
    let lived = 0;
    let lakeDead = 0;
    let timeouts = 0;
    let lakeSecs = 0;
    let home = 0;
    const lakeCauses = new Map<string, number>();
    const fatIn: number[] = [];
    const sp = { crowd: 0, spawned: 0, fitness: 0, females: 0, taken: 0, buried: 0 };
    for (let i = 0; i < n; i++) {
      const p = paramsFor(d);
      const r = new Rng(7919 * i + 13 + skill.length * 101 + (d === 'wild' ? 50000 : 0));
      const sex = r.chance(0.5) ? 'F' : 'M';
      const l = foundLineage(p, { preset: 'quick', sex, name: 'P', difficulty: d, seed: r.int(1, 2 ** 31) });
      const year = fixedYear ? { ...rollYear(p, r, 1 + (i % 2)), flow: fixedYear[0] ?? 1, temperature: fixedYear[1] ?? 1 } : rollYear(p, r, 1 + (i % 2));
      if (process.env.PROBE_RUN) year.runSize = Number(process.env.PROBE_RUN);
      const w = new World(p, { fish: l.current, conditions: year, difficulty: d, siblings: 0, seed: r.int(1, 2 ** 31), firstLife: false });
      if (index > 0) w.debugJumpTo(index);
      const bot = new Bot(SKILLS[skill], r.int(1, 2 ** 31));
      bot.begin();
      let steps = 0;
      let enteredAt: number | null = null;
      let enteredFat: number | null = null;
      while (w.status === 'playing' && steps < 400 * 60) {
        if (enteredAt === null && lakeView(w)?.entered) {
          enteredAt = w.stageTime;
          enteredFat = w.progress.fat;
        }
        w.step(bot.act(w));
        const av = alevinView(w);
        if (av?.flood === 'flood') floodDrift += av.drift / n / (w.p.get('alevin.floodDuration') * 60);
        steps++;
        if ((steps & 255) === 0) w.drainEvents();
      }
      secs += w.stageTime;
      if (w.status !== 'dead') {
        fryLake += lakeGrowth(w.p, w.progress);
        lived++;
      }
      if (w.status === 'playing') timeouts++;
      if (w.status === 'dead' && lakeView(w)?.inside) {
        lakeDead++;
        lakeCauses.set(w.deathCause ?? '?', (lakeCauses.get(w.deathCause ?? '?') ?? 0) + 1);
      }
      if (enteredFat !== null) fatIn.push(enteredFat);
      if (w.status === 'stageComplete' && enteredAt !== null) {
        home++;
        lakeSecs += w.stageTime - enteredAt;
      }
      if (stage === 'spawn') {
        const st = spawnState(w) ?? (w.stage as unknown as ReturnType<typeof spawnState>);
        sp.crowd += st?.crowd?.start ?? 0;
        if (w.spawnResult) {
          sp.spawned++;
          sp.fitness += w.spawnResult.relativeFitness;
        }
        if (st?.role === 'female' && st.spawned) {
          sp.females++;
          sp.taken += st.eggsTaken;
          sp.buried += st.burial;
        }
      }
      if (w.status === 'dead') {
        dead++;
        causes.set(w.deathCause ?? '?', (causes.get(w.deathCause ?? '?') ?? 0) + 1);
      }
    }
    const c = [...causes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / n).toFixed(0)}%`).join(', ');
    const lc = [...lakeCauses].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' ');
    const fi = fatIn.length ? (fatIn.reduce((a, b) => a + b, 0) / fatIn.length).toFixed(2) : '-';
    const lake = stage === 'return' ? `lake: ${fatIn.length} in (fat ${fi}), dead ${lakeDead} [${lc}], ${home ? (lakeSecs / home).toFixed(0) : '-'} s; timeout ${timeouts}  ` : '';
    const spawnCols = stage === 'spawn' ? `crowd ${(sp.crowd / n).toFixed(0)}, spawned ${((100 * sp.spawned) / n).toFixed(0)}% at ${(sp.fitness / Math.max(1, sp.spawned)).toFixed(2)}x, eggs taken ${((100 * sp.taken) / Math.max(1, sp.females)).toFixed(0)}%, covered ${((100 * sp.buried) / Math.max(1, sp.females)).toFixed(0)}%  ` : '';
    console.log(`${d.padEnd(10)} ${skill.padEnd(8)} dead ${((100 * dead) / n).toFixed(1).padStart(5)}%  ${stage === 'egg' ? `flood drift ${floodDrift.toFixed(2)}  ` : ''}${lake}${stage === 'fry' ? `lake growth ${(fryLake / Math.max(1, lived)).toFixed(2)}  ` : ''}${spawnCols}${(secs / n).toFixed(0)} s  ${c}`);
  }
}
