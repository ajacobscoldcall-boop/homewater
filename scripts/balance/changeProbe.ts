/**
 * The changing river mode in the balance simulator's lineage runs (not part of
 * the report): plays lineages on a healthy and a changing river, per difficulty
 * and skill, and prints how quickly lines decline. Wild lines die out when a
 * brood fails; Field guide lines are carried on by strays, so for them it prints
 * strays and completion. Also prints the river's run by generation (wild fish
 * only, hatchery strays left out), the causes of death that grow in later
 * generations, and the mean relative fitness.
 *
 *   npx vite-node scripts/balance/changeProbe.ts -- 40 10
 *   (lineages per cell, generations; overrides as in probe.ts: id=value, difficulty:id=mult)
 *   CHANGE_SKILLS=skilled CHANGE_DIFF=wild npx vite-node scripts/balance/changeProbe.ts -- 60 12
 */
import type { Difficulty } from '../../src/sim/params';
import type { RiverMode } from '../../src/sim/riverChange';
import { playLineage, setOverrides, type LineageResult } from './play';
import { SKILL_NAMES, type SkillName } from './skills';

const args = process.argv.slice(2).filter((a) => a !== '--');
const n = Number(args[0] ?? 30);
const gens = Number(args[1] ?? 10);
const values: Record<string, number> = {};
const mults: Record<string, number> = {};
for (const a of args.slice(2)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  if (k.includes(':')) mults[k] = Number(v);
  else values[k] = Number(v);
}
setOverrides({ values, mults });
const skills = (process.env.CHANGE_SKILLS?.split(',') ?? SKILL_NAMES) as SkillName[];
const diffs = (process.env.CHANGE_DIFF?.split(',') ?? ['wild', 'fieldGuide']) as Difficulty[];
const modes = (process.env.CHANGE_MODES?.split(',') ?? ['healthy', 'changing']) as RiverMode[];
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

console.log(`changing river probe: ${n} lineages x ${gens} generations per cell`);
for (const d of diffs) {
  for (const skill of skills) {
    for (const mode of modes) {
      const t0 = Date.now();
      const runs: LineageResult[] = [];
      // CHANGE_SEEDOFF=k plays lineages k*n..(k+1)*n-1, so several processes can share a cell.
      const off = Number(process.env.CHANGE_SEEDOFF ?? 0) * n;
      for (let i = off; i < off + n; i++) runs.push(playLineage(d, skill, i, gens, 7, mode));
      const rows = runs.flatMap((r) => r.generations);
      const alive = Array.from({ length: gens }, (_, g) => runs.filter((r) => r.generations.length > g).length / runs.length);
      const done = Array.from({ length: gens }, (_, g) => {
        const at = rows.filter((x) => x.generation === g + 1);
        return at.length ? at.filter((x) => x.completed).length / at.length : NaN;
      });
      const early = rows.filter((x) => x.generation <= 3);
      const late = rows.filter((x) => x.generation > gens / 2);
      const causeShare = (rs: typeof rows, c: string) => rs.reduce((a, x) => a + (x.causes ?? []).filter((y) => y === c).length, 0) / Math.max(1, rs.length);
      const run = Array.from({ length: gens }, (_, g) => mean(rows.filter((x) => x.generation === g + 1).map((x) => x.conditions.runSize * (1 - (x.conditions.hatchery ?? 0)))));
      const extinct = runs.filter((r) => r.extinctAt !== null).map((r) => r.extinctAt!);
      console.log(`\n${d} ${skill} ${mode} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      console.log(`  lines going at gen  ${alive.map(pct).join(' ')}`);
      console.log(`  brood spawned (gen) ${done.map((x) => (Number.isNaN(x) ? '   -' : pct(x))).join(' ')}`);
      console.log(`  wild run (gen)      ${run.map((x) => (Number.isNaN(x) ? '   -' : x.toFixed(2).padStart(4))).join(' ')}`);
      if (d === 'wild') console.log(`  extinct ${extinct.length}/${n}, mean generation ${mean(extinct).toFixed(1)}`);
      else console.log(`  strays per line ${mean(runs.map((r) => r.strays)).toFixed(2)}`);
      console.log(`  deaths per life, gen 1-3 vs late: heat ${causeShare(early, 'heat').toFixed(2)} -> ${causeShare(late, 'heat').toFixed(2)}, gillnet ${causeShare(early, 'gillnet').toFixed(2)} -> ${causeShare(late, 'gillnet').toFixed(2)}`);
      console.log(`  mean fitness of spawners ${mean(rows.filter((x) => x.fitness !== undefined).map((x) => x.fitness!)).toFixed(2)}, timeouts ${runs.reduce((a, r) => a + r.timeouts, 0)}`);
    }
  }
}
