/**
 * Estuary probe (tuning only, not part of the report): plays the smolt run per difficulty and skill and prints,
 * for the estuary, deaths by cause, seconds spent there, readiness on arrival and at the sea, and time spent
 * with salt beyond readiness.
 *   npx vite-node scripts/balance/estuaryProbe.ts -- 200
 * PATIENCE=0 (or 1) gives every bot that estuary patience, to compare rushing with holding.
 */
import { foundLineage } from '../../src/sim/lineage';
import { rollYear } from '../../src/sim/genetics';
import { Rng } from '../../src/sim/rng';
import { STAGE_IDS } from '../../src/sim/types';
import { World } from '../../src/sim/world';
import type { Difficulty } from '../../src/sim/params';
import { smoltView } from '../../src/sim/stages/smolt';
import { Bot } from './bots';
import { paramsFor } from './play';
import { SKILLS, SKILL_NAMES } from './skills';

const args = process.argv.slice(2).filter((a) => a !== '--');
const n = Number(args[0] ?? 200);
const index = STAGE_IDS.indexOf('smolt');
for (const d of ['fieldGuide', 'wild'] as Difficulty[]) {
  for (const skill of SKILL_NAMES) {
    let reached = 0;
    let deadIn = 0;
    let deadBefore = 0;
    let secs = 0;
    let readyIn = 0;
    let readyOut = 0;
    let stressSecs = 0;
    let out = 0;
    let minE = 0;
    const causes = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const p = paramsFor(d);
      const r = new Rng(7919 * i + 13 + skill.length * 101 + (d === 'wild' ? 50000 : 0));
      const sex = r.chance(0.5) ? 'F' : 'M';
      const l = foundLineage(p, { preset: 'quick', sex, name: 'P', difficulty: d, seed: r.int(1, 2 ** 31) });
      const w = new World(p, { fish: l.current, conditions: rollYear(p, r, 1 + (i % 2)), difficulty: d, siblings: 0, seed: r.int(1, 2 ** 31), firstLife: false });
      w.debugJumpTo(index);
      const patience = process.env.PATIENCE;
      const bot = new Bot(patience === undefined ? SKILLS[skill] : { ...SKILLS[skill], estuaryPatience: Number(patience) }, r.int(1, 2 ** 31));
      bot.begin();
      let steps = 0;
      let inside = false;
      let lowE = 1;
      let t0 = 0;
      while (w.status === 'playing' && steps < 400 * 60) {
        w.step(bot.act(w));
        const v = smoltView(w);
        if (v && v.section === 'estuary') {
          if (!inside) {
            inside = true;
            reached++;
            t0 = w.stageTime;
            readyIn += v.ready;
          }
          if (v.over > 0.02) stressSecs += 1 / 60;
          lowE = Math.min(lowE, w.body.energy);
        }
        steps++;
        if ((steps & 255) === 0) w.drainEvents();
      }
      if (inside) minE += lowE;
      if (w.status === 'dead') {
        if (inside) {
          deadIn++;
          causes.set(w.deathCause ?? '?', (causes.get(w.deathCause ?? '?') ?? 0) + 1);
        } else deadBefore++;
      } else if (inside) {
        out++;
        secs += w.stageTime - t0;
        readyOut += smoltView(w)?.ready ?? 0;
      }
    }
    const c = [...causes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / Math.max(1, reached)).toFixed(0)}%`).join(', ');
    console.log(
      `${d.padEnd(10)} ${skill.padEnd(8)} before ${((100 * deadBefore) / n).toFixed(0).padStart(3)}%  estuary dead ${((100 * deadIn) / Math.max(1, reached)).toFixed(0).padStart(3)}%  ${(secs / Math.max(1, out)).toFixed(0)} s  ready in ${(readyIn / Math.max(1, reached)).toFixed(2)} out ${(readyOut / Math.max(1, out)).toFixed(2)}  salt-stressed ${(stressSecs / Math.max(1, reached)).toFixed(1)} s  lowest energy ${(minE / Math.max(1, reached)).toFixed(2)}  ${c}`,
    );
  }
}
