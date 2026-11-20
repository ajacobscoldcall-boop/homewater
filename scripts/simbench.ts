/**
 * Times World.step per stage in Node, with no rendering: how much of a frame the
 * simulation itself costs. A frame at 60 fps runs about one step.
 *
 *   npx vite-node scripts/simbench.ts [--steps=3000] [--runs=5]
 *
 * Each stage is started with debugJumpTo and played by a scripted intent (dead fish
 * continue as siblings). Prints microseconds per step (median of the runs) and the
 * entity count. Profile with: node --cpu-prof $(which vite-node) scripts/simbench.ts
 */
import paramFile from '../src/data/params.json';
import { foundLineage } from '../src/sim/lineage';
import { Params, type ParamFile } from '../src/sim/params';
import { NO_INTENT, STAGE_IDS, type Intent, type Sex } from '../src/sim/types';
import { World } from '../src/sim/world';

const arg = (name: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d);
const STEPS = arg('steps', 3000);
const RUNS = arg('runs', 5);

function scripted(i: number): Intent {
  const phase = Math.floor(i / 90) % 6;
  return {
    ...NO_INTENT,
    forward: phase === 5 ? 0 : 0.6 + 0.4 * Math.sin(i * 0.013),
    turn: Math.sin(i * 0.021) * 0.5,
    burst: i % 240 < 20,
    hold: phase === 5,
    action: i % 300 > 200,
    actionPressed: i % 300 === 201,
  };
}

function makeWorld(stage: number, sex: Sex, seed: number): World {
  const p = new Params(paramFile as ParamFile, 'fieldGuide');
  const lineage = foundLineage(p, { preset: 'quick', sex, name: 'Bench', difficulty: 'fieldGuide', seed });
  const w = new World(p, {
    fish: lineage.current,
    conditions: { flow: 1, temperature: 1, oceanCrowding: 1, runSize: 1 },
    difficulty: 'fieldGuide',
    siblings: 1000,
    seed,
  });
  if (stage) w.debugJumpTo(stage);
  return w;
}

const rows: string[] = [];
for (const [i, id] of STAGE_IDS.entries()) {
  for (const sex of (id === 'spawn' ? ['F', 'M'] : ['F']) as Sex[]) {
    const times: number[] = [];
    let ents = 0;
    for (let r = 0; r < RUNS; r++) {
      const w = makeWorld(i, sex, 100 + r);
      let steps = 0;
      let busy = 0;
      for (let s = 0; s < STEPS; s++) {
        if (w.status === 'dead' && w.canContinueWithSibling()) w.continueWithSibling('Sib');
        if (w.status !== 'playing') break;
        const intent = scripted(s);
        const t0 = performance.now();
        w.step(intent);
        busy += performance.now() - t0;
        steps++;
        w.drainEvents();
      }
      ents = Math.max(ents, w.entities.length);
      if (steps) times.push((busy / steps) * 1000);
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)] ?? NaN;
    rows.push(`| ${id}${id === 'spawn' ? ` (${sex})` : ''} | ${med.toFixed(1)} | ${(times[0] ?? NaN).toFixed(1)} | ${ents} |`);
  }
}
console.log('| Stage | µs/step (median) | µs/step (best) | entities |');
console.log('|---|---|---|---|');
for (const r of rows) console.log(r);
