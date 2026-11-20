/**
 * Homewater balance simulator.
 *
 *   npm run balance                 # full run, writes docs/balance/REPORT.md
 *   npm run balance -- --quick      # small run for a quick look (does not overwrite the report)
 *   npm run balance -- --lives 400 --lineages 30 --gens 8 --workers 4 --seed 7
 *   npm run balance -- --quick --set smolt.schoolShield=0.6 --mult wild:return.fatDrainBase=1
 *                                   # what-if: try a proposed change without editing params.json
 *                                   # (with --set or --mult the report goes to a temp folder unless --out is given)
 *
 * Plays thousands of lives with bot players of three skill levels on both
 * difficulties, through the public World API only, and reports survival per
 * stage. Seeded and reproducible: the same arguments give the same numbers.
 * Work is split across child processes (each runs this file in worker mode).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Difficulty } from '../../src/sim/params';
import { playLineage, playSingleLife, playSpawnRole, setOverrides, type LifeResult, type LineageResult, type Overrides } from './play';
import { renderReport, type ReportData } from './report';
import { SKILL_NAMES, type SkillName } from './skills';
import { cellStats, lineageStats, roleStats } from './stats';

const DIFFICULTIES: Difficulty[] = ['fieldGuide', 'wild'];
const ROLES = ['female', 'largeMale', 'jack'] as const;
type Role = (typeof ROLES)[number];

type Task =
  | { kind: 'lives'; difficulty: Difficulty; skill: SkillName; from: number; to: number }
  | { kind: 'roles'; difficulty: Difficulty; skill: SkillName; role: Role; from: number; to: number }
  | { kind: 'lineages'; difficulty: Difficulty; skill: SkillName; from: number; to: number; gens: number };

interface TaskResult {
  task: Task;
  lives?: LifeResult[];
  lineages?: LineageResult[];
}

interface Options {
  lives: number;
  roles: number;
  lineages: number;
  gens: number;
  workers: number;
  seed: number;
  quick: boolean;
  out: string;
  overrides: Overrides;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const quick = argv.includes('--quick');
  const overrides: Overrides = { values: {}, mults: {} };
  argv.forEach((a, i) => {
    const v = argv[i + 1];
    if ((a === '--set' || a === '--mult') && v) {
      const [k, n] = v.split('=');
      if (!k || n === undefined || !Number.isFinite(Number(n))) throw new Error(`Bad ${a} ${v}`);
      if (a === '--set') overrides.values[k] = Number(n);
      else overrides.mults[k] = Number(n);
    }
  });
  const whatIf = Object.keys(overrides.values).length + Object.keys(overrides.mults).length > 0;
  const num = (name: string, full: number, small: number): number => Number(get(name) ?? (quick ? small : full));
  return {
    quick,
    lives: num('lives', 800, 60),
    roles: num('roles', 150, 20),
    lineages: num('lineages', 50, 6),
    gens: num('gens', 10, 5),
    workers: num('workers', Math.max(1, Math.min(8, availableParallelism())), Math.max(1, Math.min(8, availableParallelism()))),
    seed: num('seed', 20261119, 20261119),
    out: get('out') ?? (quick || whatIf ? join(tmpdir(), 'homewater-balance') : join(ROOT, 'docs/balance')),
    overrides,
  };
}

function runTask(t: Task, seed: number): TaskResult {
  if (t.kind === 'lives') {
    const lives: LifeResult[] = [];
    for (let i = t.from; i < t.to; i++) lives.push(strip(playSingleLife(t.difficulty, t.skill, i, seed)));
    return { task: t, lives };
  }
  if (t.kind === 'roles') {
    const lives: LifeResult[] = [];
    for (let i = t.from; i < t.to; i++) lives.push(strip(playSpawnRole(t.difficulty, t.skill, t.role, i, seed)));
    return { task: t, lives };
  }
  const lineages: LineageResult[] = [];
  for (let i = t.from; i < t.to; i++) lineages.push(playLineage(t.difficulty, t.skill, i, t.gens, seed));
  return { task: t, lineages };
}

/** Drop the bulky fish identity from single-life results. */
function strip(l: LifeResult): LifeResult {
  const { fish: _fish, ...rest } = l;
  return rest as LifeResult;
}

function chunks(n: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i += size) out.push([i, Math.min(n, i + size)]);
  return out;
}

function buildTasks(o: Options): Task[] {
  const tasks: Task[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (const skill of SKILL_NAMES) {
      for (const [from, to] of chunks(o.lineages, 2)) tasks.push({ kind: 'lineages', difficulty, skill, from, to, gens: o.gens });
      for (const [from, to] of chunks(o.lives, 20)) tasks.push({ kind: 'lives', difficulty, skill, from, to });
      for (const role of ROLES) for (const [from, to] of chunks(o.roles, 50)) tasks.push({ kind: 'roles', difficulty, skill, role, from, to });
    }
  }
  return tasks;
}

async function runWorkers(o: Options, tasks: Task[]): Promise<TaskResult[]> {
  const dir = mkdtempSync(join(tmpdir(), 'hw-balance-'));
  const cli = join(ROOT, 'node_modules/vite-node/vite-node.mjs');
  const script = fileURLToPath(import.meta.url);
  const n = Math.min(o.workers, tasks.length);
  const lists: Task[][] = Array.from({ length: n }, () => []);
  // Lineage tasks are the longest; deal them out first so the load evens out.
  tasks.forEach((t, i) => lists[i % n]?.push(t));
  let done = 0;
  const started = Date.now();
  const results = await Promise.all(
    lists.map(
      (list, k) =>
        new Promise<TaskResult[]>((resolveP, reject) => {
          const job = join(dir, `job${k}.json`);
          const out = join(dir, `out${k}.json`);
          writeFileSync(job, JSON.stringify({ seed: o.seed, tasks: list, overrides: o.overrides }));
          const child = spawn(process.execPath, [cli, script], { cwd: ROOT, env: { ...process.env, BALANCE_JOB: job, BALANCE_OUT: out }, stdio: ['ignore', 'ignore', 'pipe'] });
          child.stderr.on('data', (d: Buffer) => {
            for (const line of d.toString().split('\n')) {
              if (line.startsWith('task-done')) {
                done++;
                const step = Math.max(1, Math.round(tasks.length / 20));
                if (done % step === 0 || done === tasks.length) console.log(`  ${done}/${tasks.length} tasks, ${((Date.now() - started) / 1000).toFixed(0)} s`);
              } else if (line.trim()) process.stderr.write(`[worker ${k}] ${line}\n`);
            }
          });
          child.on('exit', (code) => {
            if (code !== 0) return reject(new Error(`worker ${k} exited with ${code}`));
            resolveP(JSON.parse(readFileSync(out, 'utf8')) as TaskResult[]);
          });
        }),
    ),
  );
  rmSync(dir, { recursive: true, force: true });
  return results.flat();
}

function workerMain(job: string, out: string): void {
  const { seed, tasks, overrides } = JSON.parse(readFileSync(job, 'utf8')) as { seed: number; tasks: Task[]; overrides: Overrides };
  setOverrides(overrides);
  const results: TaskResult[] = [];
  for (const t of tasks) {
    results.push(runTask(t, seed));
    process.stderr.write('task-done\n');
  }
  writeFileSync(out, JSON.stringify(results));
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const tasks = buildTasks(o);
  console.log(
    `${Object.keys(o.overrides.values).length + Object.keys(o.overrides.mults).length ? `What-if ${JSON.stringify(o.overrides)}. ` : ''}Homewater balance: ${o.lives} lives, ${o.roles} spawning trials per role and ${o.lineages} lineages x ${o.gens} generations, per difficulty and skill; seed ${o.seed}; ${o.workers} workers`,
  );
  const t0 = Date.now();
  const results = await runWorkers(o, tasks);
  const seconds = (Date.now() - t0) / 1000;

  const data: ReportData = {
    meta: {
      seed: o.seed,
      lives: o.lives,
      roles: o.roles,
      lineages: o.lineages,
      gens: o.gens,
      workers: o.workers,
      seconds,
      paramsHash: createHash('sha256').update(readFileSync(join(ROOT, 'src/data/params.json'))).digest('hex').slice(0, 12),
      overrides: o.overrides,
      livesPlayed: 0,
      simSeconds: 0,
    },
    cells: [],
    roles: [],
    lineages: [],
  };
  for (const difficulty of DIFFICULTIES) {
    for (const skill of SKILL_NAMES) {
      const mine = results.filter((r) => r.task.difficulty === difficulty && r.task.skill === skill);
      const lives = mine.filter((r) => r.task.kind === 'lives').flatMap((r) => r.lives ?? []);
      data.cells.push(cellStats(difficulty, skill, lives));
      for (const role of ROLES) {
        const rl = mine.filter((r) => r.task.kind === 'roles' && r.task.role === role).flatMap((r) => r.lives ?? []);
        data.roles.push(roleStats(difficulty, skill, role, rl));
      }
      const lin = mine.filter((r) => r.task.kind === 'lineages').flatMap((r) => r.lineages ?? []);
      data.lineages.push(lineageStats(difficulty, skill, lin, o.gens));
    }
  }
  const allLives = results.flatMap((r) => r.lives ?? []);
  const lineageLives = results.flatMap((r) => r.lineages ?? []).reduce((a, l) => a + l.generations.length, 0);
  data.meta.livesPlayed = allLives.length + lineageLives;
  data.meta.simSeconds = allLives.reduce((a, l) => a + l.playSeconds, 0);

  if (!existsSync(o.out)) mkdirSync(o.out, { recursive: true });
  const reportPath = join(o.out, 'REPORT.md');
  const previous = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : '';
  writeFileSync(reportPath, renderReport(data, previous));
  writeFileSync(join(o.out, 'summary.json'), `${JSON.stringify(data, null, 1)}\n`);
  console.log(`Done in ${seconds.toFixed(0)} s. Report: ${reportPath}`);
}

const job = process.env.BALANCE_JOB;
const out = process.env.BALANCE_OUT;
if (job && out) workerMain(job, out);
else
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
