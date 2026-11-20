/**
 * Quick per-stage probe for tuning (not part of the report): plays one stage
 * many times per difficulty and skill with one fish and no siblings, and
 * prints the death rate, mean attempt length and causes. Overrides work like
 * the balance run's --set and --mult, written id=value or difficulty:id=mult.
 *
 *   npx vite-node scripts/balance/probe.ts -- egg 400
 *   npx vite-node scripts/balance/probe.ts -- smolt 300 smolt.strikeDilution=0.4 fieldGuide:smolt.nearMissGrace=1
 *
 * For the egg stage it also prints the mean hold lost (drift) during the flood.
 */
import { foundLineage } from '../../src/sim/lineage';
import { rollYear } from '../../src/sim/genetics';
import { Rng } from '../../src/sim/rng';
import { STAGE_IDS, type StageId } from '../../src/sim/types';
import { World } from '../../src/sim/world';
import type { Difficulty } from '../../src/sim/params';
import { Bot } from './bots';
import { alevinView } from '../../src/sim/stages/egg';
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
for (const d of ['fieldGuide', 'wild'] as Difficulty[]) {
  for (const skill of SKILL_NAMES) {
    const causes = new Map<string, number>();
    let dead = 0;
    let secs = 0;
    let floodDrift = 0;
    for (let i = 0; i < n; i++) {
      const p = paramsFor(d);
      const r = new Rng(7919 * i + 13 + skill.length * 101 + (d === 'wild' ? 50000 : 0));
      const sex = r.chance(0.5) ? 'F' : 'M';
      const l = foundLineage(p, { preset: 'quick', sex, name: 'P', difficulty: d, seed: r.int(1, 2 ** 31) });
      const w = new World(p, { fish: l.current, conditions: rollYear(p, r, 1 + (i % 2)), difficulty: d, siblings: 0, seed: r.int(1, 2 ** 31), firstLife: false });
      if (index > 0) w.debugJumpTo(index);
      const bot = new Bot(SKILLS[skill], r.int(1, 2 ** 31));
      bot.begin();
      let steps = 0;
      while (w.status === 'playing' && steps < 400 * 60) {
        w.step(bot.act(w));
        const av = alevinView(w);
        if (av?.flood === 'flood') floodDrift += av.drift / n / (w.p.get('alevin.floodDuration') * 60);
        steps++;
        if ((steps & 255) === 0) w.drainEvents();
      }
      secs += w.stageTime;
      if (w.status === 'dead') {
        dead++;
        causes.set(w.deathCause ?? '?', (causes.get(w.deathCause ?? '?') ?? 0) + 1);
      }
    }
    const c = [...causes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / n).toFixed(0)}%`).join(', ');
    console.log(`${d.padEnd(10)} ${skill.padEnd(8)} dead ${((100 * dead) / n).toFixed(1).padStart(5)}%  ${stage === 'egg' ? `flood drift ${floodDrift.toFixed(2)}  ` : ''}${(secs / n).toFixed(0)} s  ${c}`);
  }
}
