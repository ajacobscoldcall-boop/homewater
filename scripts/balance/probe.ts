/**
 * Quick per-stage probe for tuning (not part of the report): plays one stage
 * many times per difficulty and skill with one fish and no siblings, and
 * prints the death rate, mean attempt length and causes. Overrides work like
 * the balance run's --set and --mult, written id=value or difficulty:id=mult.
 *
 *   npx vite-node scripts/balance/probe.ts -- egg 400
 *   npx vite-node scripts/balance/probe.ts -- smolt 300 smolt.strikeDilution=0.4 fieldGuide:smolt.nearMissGrace=1
 *
 * For the egg stage it also prints the mean hold lost (drift) during the flood and the brood-mates left when the alevin
 * is ready (PROBE_FIRST=1 plays a first life: all four egg threats and the longer stage); for the fry, the survivors'
 * mean lake growth.
 * For the ocean it prints the mean ocean bites at the maturation decision, growthPerf, adult size and jacks among males.
 * For the return it also prints deaths on the lake crossing, timeouts, and the mean time in the lake for fish that got home.
 * For the spawning
 * grounds it prints the crowd's mean size, the share that spawned, their mean relative fitness and,
 * for females, the share of eggs char and gulls took (PROBE_RUN=x fixes the run size).
 * The return also prints the heat toll carried home (mean, and the share over the grounds' pre-spawn
 * threshold); the spawning grounds print the mean burden there. PROBE_TOLL=x starts the grounds with that
 * carried toll instead of the year's typical one (heatToll.ts).
 * PROBE_FIRST=1 plays first lives (longer moments where a stage has them).
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
import { fallsView } from '../../src/sim/stages/falls';
import { returnLayout } from '../../src/sim/stages/return';
import { spawnState } from '../../src/sim/stages/spawn';
import { groundsHeat } from '../../src/sim/stages/heatToll';
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
    let broodLeft = 0;
    let broodTotal = 0;
    let fryLake = 0;
    let lived = 0;
    let lakeDead = 0;
    let timeouts = 0;
    let lakeSecs = 0;
    let home = 0;
    const lakeCauses = new Map<string, number>();
    const fatIn: number[] = [];
    const sp = { crowd: 0, spawned: 0, fitness: 0, females: 0, taken: 0, buried: 0, burden: 0 };
    // The falls: fish that reached the plunge pool, their tries, how they got past, deaths in the home river.
    const fl = { pool: 0, passed: 0, leapt: 0, within3: 0, side: 0, tries: 0, homeDead: 0, fallsDead: 0, reasons: new Map<string, number>() };
    const tolls: number[] = [];
    const sea = { decided: 0, bites: 0, growth: 0, males: 0, jacks: 0, size: 0 };
    for (let i = 0; i < n; i++) {
      const p = paramsFor(d);
      const r = new Rng(7919 * i + 13 + skill.length * 101 + (d === 'wild' ? 50000 : 0));
      const sex = r.chance(0.5) ? 'F' : 'M';
      const l = foundLineage(p, { preset: 'quick', sex, name: 'P', difficulty: d, seed: r.int(1, 2 ** 31) });
      const year = fixedYear ? { ...rollYear(p, r, 1 + (i % 2)), flow: fixedYear[0] ?? 1, temperature: fixedYear[1] ?? 1 } : rollYear(p, r, 1 + (i % 2));
      if (process.env.PROBE_RUN) year.runSize = Number(process.env.PROBE_RUN);
      const w = new World(p, { fish: l.current, conditions: year, difficulty: d, siblings: 0, seed: r.int(1, 2 ** 31), firstLife: process.env.PROBE_FIRST === '1' });
      if (index > 0) w.debugJumpTo(index);
      if (stage === 'spawn' && process.env.PROBE_TOLL) {
        w.carry.heatToll = Number(process.env.PROBE_TOLL);
        w.startStage(index, 0);
      }
      if (stage === 'spawn') sp.burden += (groundsHeat(w)?.burden ?? 0) / n;
      const bot = new Bot(SKILLS[skill], r.int(1, 2 ** 31));
      bot.begin();
      let steps = 0;
      let enteredAt: number | null = null;
      let enteredFat: number | null = null;
      let reachedPool = false;
      let broodSeen = false;
      while (w.status === 'playing' && steps < 700 * 60) {
        if (enteredAt === null && lakeView(w)?.entered) {
          enteredAt = w.stageTime;
          enteredFat = w.progress.fat;
        }
        w.step(bot.act(w));
        const fv0 = fallsView(w);
        if (fv0 && !reachedPool && w.body.pos.x > fv0.poolStart && Math.abs(w.body.pos.z - fv0.notchZ) < 9) reachedPool = true;
        const av = alevinView(w);
        if (av?.flood === 'flood') floodDrift += av.drift / n / (w.p.get('alevin.floodDuration') * 60);
        if (av?.ready && !broodSeen) {
          broodSeen = true;
          broodLeft += w.live('brood').filter((b) => b.state === 'hidden').length;
          broodTotal += av.broodTotal;
        }
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
      if (w.status === 'stageComplete') tolls.push(w.carry.heatToll ?? 0);
      if (stage === 'ocean' && w.progress.isJack !== null) {
        sea.decided++;
        sea.bites += w.progress.oceanBites;
        sea.growth += w.progress.growthPerf;
        sea.size += w.progress.adultSize ?? 0;
        if (w.fish.sex === 'M') {
          sea.males++;
          if (w.progress.isJack) sea.jacks++;
        }
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
      const fv = fallsView(w);
      if (stage === 'return' && fv) {
        const lay = returnLayout(w)!;
        const x = w.body.pos.x;
        if (reachedPool) {
          fl.pool++;
          fl.tries += fv.leaps;
          for (const [k, v] of Object.entries((fv as unknown as { missReasons?: Record<string, number> }).missReasons ?? {})) fl.reasons.set(k, (fl.reasons.get(k) ?? 0) + v);
          if (fv.passed) {
            fl.passed++;
            if (fv.leaps > fv.failures) {
              fl.leapt++;
              if (fv.leaps <= 3) fl.within3++;
            } else fl.side++;
          }
        }
        if (w.status === 'dead' && x > lay.coast + 2 && x < lay.riverEnd && Math.abs(w.body.pos.z - lay.homeMouth) <= lay.riverHalf + 1) {
          fl.homeDead++;
          if (x > fv.rapidsStart - 3 && x < fv.lipEnd + 5) fl.fallsDead++;
        }
      }
      if (w.status === 'dead') {
        dead++;
        causes.set(w.deathCause ?? '?', (causes.get(w.deathCause ?? '?') ?? 0) + 1);
      }
    }
    const w0 = { p: paramsFor(d) };
    const c = [...causes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / n).toFixed(0)}%`).join(', ');
    const lc = [...lakeCauses].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' ');
    const fi = fatIn.length ? (fatIn.reduce((a, b) => a + b, 0) / fatIn.length).toFixed(2) : '-';
    const tollMean = tolls.length ? (tolls.reduce((a, b) => a + b, 0) / tolls.length).toFixed(2) : '-';
    const tollHigh = tolls.length ? ((100 * tolls.filter((t) => t > w0.p.get('heat.prespawnFrom')).length) / tolls.length).toFixed(0) : '-';
    const lake = stage === 'return' ? `lake: ${fatIn.length} in (fat ${fi}), dead ${lakeDead} [${lc}], ${home ? (lakeSecs / home).toFixed(0) : '-'} s; timeout ${timeouts}; toll home ${tollMean} (${tollHigh}% over)  ` : '';
    const spawnCols = stage === 'spawn' ? `burden ${sp.burden.toFixed(2)}, crowd ${(sp.crowd / n).toFixed(0)}, spawned ${((100 * sp.spawned) / n).toFixed(0)}% at ${(sp.fitness / Math.max(1, sp.spawned)).toFixed(2)}x, eggs taken ${((100 * sp.taken) / Math.max(1, sp.females)).toFixed(0)}%, covered ${((100 * sp.buried) / Math.max(1, sp.females)).toFixed(0)}%  ` : '';
    const rs = [...fl.reasons].map(([k, v]) => `${k} ${v}`).join(' ');
    const fallsCols = stage === 'return' ? `falls: pool ${fl.pool}, over ${fl.passed} (leapt ${fl.leapt}, ≤3 tries ${fl.within3}, side ${fl.side}), ${(fl.tries / Math.max(1, fl.pool)).toFixed(1)} tries${rs ? ` [${rs}]` : ''}; home-river dead ${((100 * fl.homeDead) / n).toFixed(0)}% (falls ${((100 * fl.fallsDead) / n).toFixed(0)}%)  ` : '';
    const k = Math.max(1, sea.decided);
    const seaCols = stage === 'ocean' ? `bites ${(sea.bites / k).toFixed(1)}, growth ${(sea.growth / k).toFixed(2)}, size ${(sea.size / k).toFixed(2)}, jacks ${sea.jacks}/${sea.males}  ` : '';
    console.log(`${d.padEnd(10)} ${skill.padEnd(8)} dead ${((100 * dead) / n).toFixed(1).padStart(5)}%  ${seaCols}${stage === 'egg' ? `flood drift ${floodDrift.toFixed(2)}  brood left ${((100 * broodLeft) / Math.max(1, broodTotal)).toFixed(0)}%  ` : ''}${lake}${fallsCols}${stage === 'fry' ? `lake growth ${(fryLake / Math.max(1, lived)).toFixed(2)}  ` : ''}${spawnCols}${(secs / n).toFixed(0)} s  ${c}`);
  }
}
