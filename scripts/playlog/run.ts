/**
 * Summarise exported Homewater play logs.
 *
 *   npm run playlog -- path/to/homewater-playlog-*.json [more files or folders]
 *   npm run playlog -- docs/playtests/logs --out docs/playtests/SUMMARY.md
 *
 * Reads every play log file given (a folder means every .json in it) and
 * writes a markdown summary shaped like docs/balance/REPORT.md. Without --out
 * it prints to the terminal. Reads local files only.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { collectLives, renderSummary } from './summary';

const args = process.argv.slice(2);
let outPath: string | null = null;
const paths: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i] as string;
  if (a === '--out') outPath = args[++i] ?? null;
  else paths.push(a);
}
if (!paths.length) {
  console.error('Usage: npm run playlog -- <play log files or folders> [--out summary.md]');
  process.exit(1);
}

const files = paths.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => join(p, f)) : [p]));
const inputs = files.map((f) => {
  try {
    return { name: basename(f), data: JSON.parse(readFileSync(f, 'utf8')) as unknown };
  } catch {
    return { name: basename(f), data: null };
  }
});
const parsed = collectLives(inputs);
const text = renderSummary(parsed, inputs.map((i) => i.name));
if (outPath) {
  writeFileSync(outPath, text);
  console.log(`Wrote ${outPath}: ${parsed.lives.length} lives from ${parsed.files} file(s).`);
} else {
  process.stdout.write(text);
}
