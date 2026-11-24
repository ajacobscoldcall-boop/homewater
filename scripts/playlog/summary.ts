/**
 * Summarise exported play logs (src/telemetry/) as markdown, in the shape of
 * the balance report (docs/balance/REPORT.md): deaths per stage and cause,
 * stage lengths and lives completed, so real players can be set beside the
 * bots. Pure: takes parsed files, returns text. The CLI is run.ts.
 */
import type { Difficulty } from '../../src/sim/params';
import { STAGE_IDS, type StageId } from '../../src/sim/types';
import { PLAYLOG_KIND, type LifeLog, type PlayLogFile, type StageAttempt } from '../../src/telemetry/types';

export const ROWS = ['egg', 'fry', 'smolt', 'ocean', 'return:sea', 'return:river', 'return:lake', 'spawn'] as const;
export type Row = (typeof ROWS)[number];

/** Row names as in docs/balance/REPORT.md. */
const ROW_NAME: Record<Row, string> = {
  egg: 'Egg and alevin',
  fry: 'Fry in the lake',
  smolt: 'Smolt run',
  ocean: 'Ocean years',
  'return:sea': 'Return: sea and nets',
  'return:river': 'Return: home river',
  'return:lake': 'Return: across the lake',
  spawn: 'Spawning',
};
const STAGE_NAME: Record<StageId, string> = { egg: 'Egg and alevin', fry: 'Fry', smolt: 'Smolt run', ocean: 'Ocean', return: 'Return', spawn: 'Spawning' };
const DIFFS: Difficulty[] = ['fieldGuide', 'wild'];
const DIFF_NAME: Record<Difficulty, string> = { fieldGuide: 'Field guide', wild: 'Wild' };
/** Deaths listed one by one, at most. */
const MAX_DEATH_ROWS = 60;

export interface ParsedLogs {
  lives: LifeLog[];
  files: number;
  skipped: string[];
}

/** Gather lives from parsed JSON files, dropping repeats (the same life exported twice). */
export function collectLives(inputs: { name: string; data: unknown }[]): ParsedLogs {
  const byId = new Map<string, LifeLog>();
  const skipped: string[] = [];
  let files = 0;
  for (const { name, data } of inputs) {
    const f = data as Partial<PlayLogFile> | null;
    if (!f || f.kind !== PLAYLOG_KIND || !Array.isArray(f.lives)) {
      skipped.push(name);
      continue;
    }
    files++;
    for (const l of f.lives) {
      const old = byId.get(l.id);
      // Keep the copy with more recorded (a later export of a life in progress).
      if (!old || l.attempts.length >= old.attempts.length) byId.set(l.id, l);
    }
  }
  const lives = [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { lives, files, skipped };
}

/** The return's row for a checkpoint marker: 0 at sea, 1-2 in the home river, 3 in the lake. */
const returnRow = (marker: number): Row => (marker >= 3 ? 'return:lake' : marker > 0 ? 'return:river' : 'return:sea');

/** The report rows an attempt counts in, and whether it died there. The return is split at its checkpoints, as the bots' report does. */
export function attemptRows(a: StageAttempt): { row: Row; dead: boolean }[] {
  if (a.outcome === 'unfinished') return [];
  const died = a.outcome === 'died';
  if (a.stage !== 'return') return [{ row: a.stage, dead: died }];
  // Each part from where the attempt started to where it ended; the fish died (if it did) in the last.
  const parts: Row[] = ['return:sea', 'return:river', 'return:lake'];
  const from = parts.indexOf(returnRow(a.startMarker));
  const to = Math.max(from, parts.indexOf(returnRow(a.endMarker)));
  return parts.slice(from, to + 1).map((row, i, all) => ({ row, dead: died && i === all.length - 1 }));
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const sec = (x: number): string => (Number.isFinite(x) ? `${Math.round(x)}` : '-');
const mins = (s: number): string => `${(s / 60).toFixed(1)} min`;
const table = (head: string[], rows: string[][]): string[] => [
  `| ${head.join(' | ')} |`,
  `|${head.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
];

interface RowStats {
  attempts: number;
  deaths: number;
  causes: Record<string, number>;
}

function rowStats(lives: LifeLog[]): Record<Row, RowStats> {
  const out = Object.fromEntries(ROWS.map((r) => [r, { attempts: 0, deaths: 0, causes: {} }])) as Record<Row, RowStats>;
  for (const l of lives)
    for (const a of l.attempts)
      for (const { row, dead } of attemptRows(a)) {
        const s = out[row];
        s.attempts++;
        if (dead) {
          s.deaths++;
          const c = a.deathCause ?? 'unknown';
          s.causes[c] = (s.causes[c] ?? 0) + 1;
        }
      }
  return out;
}

const lifePlaySeconds = (l: LifeLog): number => l.attempts.reduce((s, a) => s + a.playSeconds, 0);

export function renderSummary(parsed: ParsedLogs, sources: string[] = []): string {
  const { lives } = parsed;
  const out: string[] = [];
  const diffs = DIFFS.filter((d) => lives.some((l) => l.difficulty === d));
  const of = (d: Difficulty) => lives.filter((l) => l.difficulty === d);
  const attempts = lives.reduce((n, l) => n + l.attempts.length, 0);
  const totalPlay = lives.reduce((s, l) => s + lifePlaySeconds(l), 0);
  sources = sources.filter((s) => !parsed.skipped.includes(s));
  const first = lives[0]?.startedAt.slice(0, 10);
  const last = lives.at(-1)?.startedAt.slice(0, 10);

  out.push('# Homewater play log summary', '');
  out.push(
    `Generated by \`npm run playlog\` (scripts/playlog/) from ${parsed.files} play log file${parsed.files === 1 ? '' : 's'}${sources.length ? ` (${sources.map((s) => `\`${s}\``).join(', ')})` : ''}. ${lives.length} ${lives.length === 1 ? 'life' : 'lives'}, ${attempts} stage attempts, ${mins(totalPlay)} of play${first ? `, ${first === last ? first : `${first} to ${last}`}` : ''}.`,
  );
  if (parsed.skipped.length) out.push('', `Skipped (not a Homewater play log): ${parsed.skipped.map((s) => `\`${s}\``).join(', ')}.`);
  out.push(
    '',
    'How to read it:',
    '- The rows and measures match `docs/balance/REPORT.md`, so a column here can be set beside a bot column there.',
    '- **Per-fish death rate:** the share of attempts at a stage that end in death. A sibling resuming at a checkpoint is a new attempt. Attempts left unfinished (quit to the title, tab closed) are not counted.',
    '- **Partial lives** started being logged after the egg stage (a reloaded save, or the log switched on mid-life); they count for the stages they cover.',
    '- These are real people, in small numbers: one player who dies five times at the smolt run moves the figure a lot. Read the counts in brackets.',
    '',
  );
  if (!lives.length) {
    out.push('No lives in these files.', '');
    return out.join('\n');
  }

  // Key numbers
  out.push('## Key numbers', '');
  out.push(
    ...table(
      ['', 'Lives logged', 'Finished', 'Life completed', 'Siblings used', 'Play time (completed)', 'Partial'],
      diffs.map((d) => {
        const ls = of(d);
        const done = ls.filter((l) => l.outcome !== 'unfinished');
        const spawned = done.filter((l) => l.outcome === 'spawned');
        const full = done.filter((l) => !l.partial);
        const sibs = full.map((l) => new Set(l.attempts.map((a) => a.fish)).size - 1);
        const times = spawned.filter((l) => !l.partial).map(lifePlaySeconds);
        return [
          DIFF_NAME[d],
          String(ls.length),
          String(done.length),
          done.length ? `${pct(spawned.length / done.length)} (${spawned.length}/${done.length})` : '-',
          sibs.length ? (sibs.reduce((a, b) => a + b, 0) / sibs.length).toFixed(2) : '-',
          times.length ? mins(median(times)) : '-',
          String(ls.filter((l) => l.partial).length),
        ];
      }),
    ),
  );
  out.push('', 'Finished: spawned, or the whole brood lost. Life completed: spawned, of finished lives. Siblings used: mean over finished lives logged from the egg. Play time: median, pauses left out.', '');

  // Deaths per stage
  const stats = Object.fromEntries(diffs.map((d) => [d, rowStats(of(d))])) as Record<Difficulty, Record<Row, RowStats>>;
  out.push('## Per-fish death rate by stage', '');
  out.push(
    ...table(
      ['Stage', ...diffs.map((d) => DIFF_NAME[d])],
      ROWS.map((r) => [ROW_NAME[r], ...diffs.map((d) => {
        const s = stats[d][r];
        return s.attempts ? `${pct(s.deaths / s.attempts)} (${s.deaths}/${s.attempts})` : '-';
      })]),
    ),
  );
  out.push('', '### Causes of death', '');
  out.push(
    ...table(
      ['Stage', ...diffs.map((d) => DIFF_NAME[d])],
      ROWS.map((r) => [ROW_NAME[r], ...diffs.map((d) => {
        const s = stats[d][r];
        const c = Object.entries(s.causes).sort((a, b) => b[1] - a[1]);
        return c.length ? c.map(([k, n]) => `${k} ${pct(n / s.attempts)}`).join(', ') : '-';
      })]),
    ),
  );
  out.push('', 'Shares are of attempts, as in the bots\' report.', '');

  // Stage lengths
  out.push('## Stage length (seconds)', '');
  const lenRows = STAGE_IDS.map((st) => {
    const cells = diffs.map((d) => {
      const done = of(d).flatMap((l) => l.attempts).filter((a) => a.stage === st && a.startMarker === 0 && (a.outcome === 'completed' || a.outcome === 'spawned'));
      if (!done.length) return '-';
      return `${sec(median(done.map((a) => a.playSeconds)))} / ${sec(median(done.map((a) => a.simSeconds)))} (${done.length})`;
    });
    return [STAGE_NAME[st], ...cells];
  });
  out.push(...table(['Stage', ...diffs.map((d) => DIFF_NAME[d])], lenRows));
  out.push('', 'Median of attempts that finished the stage and started at its beginning: seconds played / seconds of stage time (the bots\' report shows stage time; they differ when the game speed is slowed). Count in brackets.', '');

  // Warnings and near misses
  out.push('## Warnings and close calls per attempt', '');
  out.push(
    ...table(
      ['Stage', 'Attempts', 'Warnings', 'Close calls', 'Most common warnings'],
      STAGE_IDS.map((st) => {
        const as = lives.flatMap((l) => l.attempts).filter((a) => a.stage === st);
        if (!as.length) return [STAGE_NAME[st], '0', '-', '-', '-'];
        const kinds: Record<string, number> = {};
        let warn = 0;
        for (const a of as)
          for (const [k, n] of Object.entries(a.warnings)) {
            kinds[k] = (kinds[k] ?? 0) + n;
            warn += n;
          }
        const near = as.reduce((s, a) => s + a.nearMisses, 0);
        const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ');
        return [STAGE_NAME[st], String(as.length), (warn / as.length).toFixed(1), (near / as.length).toFixed(1), top || '-'];
      }),
    ),
  );
  out.push('');

  // The falls: leaps per attempt that tried, tries to clear, and why misses missed
  const tried = lives.flatMap((l) => l.attempts).filter((a) => a.stage === 'return' && a.leaps?.length);
  out.push('## Leaps at the falls', '');
  if (!tried.length) out.push('No leaps logged (logs from before the leap was recorded have none).', '');
  else {
    const why: Record<string, number> = {};
    let cleared = 0;
    const toClear: number[] = [];
    for (const a of tried) {
      const leaps = a.leaps ?? [];
      const first = leaps.findIndex(([, r]) => r === 'clear');
      if (first >= 0) {
        cleared++;
        toClear.push(first + 1);
      }
      for (const [, r] of leaps) if (r !== 'clear') why[r] = (why[r] ?? 0) + 1;
    }
    out.push(
      `- **Attempts that leapt:** ${tried.length}; cleared by a leap: ${cleared}${toClear.length ? `, in a median of ${median(toClear)} tries, within 3 tries ${toClear.filter((n) => n <= 3).length}` : ''}.`,
      `- **Misses by reason:** ${Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'} (slow: too little speed; deep: started too deep; close: into the falling water; spot: away from the standing wave and low step; nearly: good enough, unlucky).`,
      '',
    );
  }

  // Every death
  const deaths = lives.flatMap((l) => l.attempts.filter((a) => a.outcome === 'died').map((a) => ({ l, a })));
  out.push('## Deaths, one by one', '');
  if (!deaths.length) out.push('None.', '');
  else {
    out.push(
      ...table(
        ['Life started', 'Difficulty', 'Fish', 'Stage', 'Cause', 'After (s)', 'Where (x, y, z)', 'Fat', 'Energy', 'Warnings', 'Close calls'],
        deaths.slice(0, MAX_DEATH_ROWS).map(({ l, a }) => [
          l.startedAt.slice(0, 16).replace('T', ' '),
          DIFF_NAME[l.difficulty] ?? l.difficulty,
          `${a.fish} (${a.role})`,
          a.stage === 'return' ? ROW_NAME[returnRow(Math.max(a.startMarker, a.endMarker))] : STAGE_NAME[a.stage],
          a.deathCause ?? '-',
          sec(a.simSeconds),
          a.endPos.join(', '),
          pct(a.endFat),
          pct(a.endEnergy),
          String(Object.values(a.warnings).reduce((s, n) => s + n, 0)),
          String(a.nearMisses),
        ]),
      ),
    );
    if (deaths.length > MAX_DEATH_ROWS) out.push('', `... and ${deaths.length - MAX_DEATH_ROWS} more.`);
    out.push('');
  }

  // Settings
  out.push('## Settings', '');
  const count = (f: (a: StageAttempt) => string): string => {
    const c: Record<string, number> = {};
    for (const l of lives) for (const a of l.attempts) c[f(a)] = (c[f(a)] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', ');
  };
  out.push(
    `- **Graphics:** ${count((a) => a.settings.graphics)}`,
    `- **Game speed:** ${count((a) => (a.settings.gameSpeed === 1 ? 'normal' : `${a.settings.gameSpeed}×`))}`,
    `- **Guidance:** ${count((a) => (a.settings.guidance ? 'on' : 'off'))}`,
    `- **Gore:** ${count((a) => a.settings.gore)}`,
    `- **Cinematics:** ${count((a) => (a.settings.cinematics ? 'on' : 'off'))}`,
    `- **Reduced motion:** ${count((a) => (a.settings.reducedMotion ? 'on' : 'off'))}`,
    `- **Habitats:** ${Object.entries(lives.reduce<Record<string, number>>((c, l) => ((c[l.habitat] = (c[l.habitat] ?? 0) + 1), c), {})).map(([k, n]) => `${k} (${n})`).join(', ')}`,
    `- **Roles (last known):** ${Object.entries(lives.reduce<Record<string, number>>((c, l) => ((c[l.role] = (c[l.role] ?? 0) + 1), c), {})).map(([k, n]) => `${k} (${n})`).join(', ')}`,
    '',
    'Counts are of stage attempts (graphics to reduced motion) or lives (habitats, roles).',
    '',
  );
  return out.join('\n');
}
