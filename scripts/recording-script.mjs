// Builds the narration recording script from src/data/captions.json.
// Usage: node scripts/recording-script.mjs   (writes docs/narration/recording-script.md and .csv)
//        node scripts/recording-script.mjs --manifest   (lists recorded files into public/audio/manifest.json)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

if (process.argv.includes('--manifest')) {
  const lines = readdirSync('public/audio').filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\.mp3$/, '')).sort();
  writeFileSync('public/audio/manifest.json', JSON.stringify({ lines }, null, 2) + '\n');
  console.log(`manifest: ${lines.length} recorded lines`);
  process.exit(0);
}

const { captions } = JSON.parse(readFileSync('src/data/captions.json', 'utf8'));
const STAGE = { egg: '1 Egg and alevin', fry: '2 Fry in the lake', smolt: '3 Smolt run', ocean: '4 Ocean', return: '5 The return', spawn: '6 Spawning', death: 'Deaths', end: 'End of life' };
const WHEN = {
  intro: 'At the start of the stage',
  emerge: 'At the end of the stage',
  winter: 'At the end of the stage',
  salt: 'At the end of the stage',
  arrive: 'At the end of the stage',
  controls: 'At the start, first life only',
};
// Values that captions can contain, and the variants worth recording.
const VARIANTS = { 'ocean.revealLarge': ['2', '3'], 'ocean.revealFemale': ['2', '3'] };

const ORDER = ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn', 'death', 'end'];
const rows = [];
const entries = Object.entries(captions).sort((a, b) => ORDER.indexOf(a[0].split('.')[0]) - ORDER.indexOf(b[0].split('.')[0]));
for (const [id, raw] of entries) {
  const [group, key] = id.split('.');
  const stage = STAGE[group] ?? group;
  // Text diet: a `.short` line is what plays in place of its full line; `card.*` lines sit on the stage card and are not narrated.
  const when = group === 'death' ? 'On the death screen' : group === 'end' ? 'After spawning, as the life ends' : group === 'card' ? 'On the stage card' : group === 'help' ? 'The first time the mouse steers' : id.endsWith('.short') ? `Shown and played in place of ${id.slice(0, -6)}` : WHEN[key] ?? 'When it happens in play';
  if (group === 'card') {
    rows.push({ file: '(not recorded: stage card text)', stage: 'Stage cards', when, text: raw });
    continue;
  }
  // Key placeholders ({key:burst}, {hold:act}) show the player's key on screen only; narration leaves them out.
  const text = raw.replace(/\s*\{(key|hold):\w+\}/g, '');
  const vars = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (!vars.length) rows.push({ file: `${id}.mp3`, stage, when, text });
  else if (VARIANTS[id]) for (const v of VARIANTS[id]) rows.push({ file: `${id}--${v}.mp3`, stage, when, text: text.replace(/\{\w+\}/g, v) });
  else rows.push({ file: '(not recorded: contains a number that changes)', stage, when, text });
}
const md = [
  '# Homewater narration: recording script',
  '',
  `${rows.length} lines. Record each as its own file, named exactly as in the File column. See \`README.md\` in this folder for how to record.`,
  '',
  '| # | File | Stage | When it plays | Line |',
  '|---|---|---|---|---|',
  ...rows.map((r, i) => `| ${i + 1} | \`${r.file}\` | ${r.stage} | ${r.when} | ${r.text.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
writeFileSync('docs/narration/recording-script.md', md);
const csv = ['number,file,stage,when,line', ...rows.map((r, i) => [i + 1, r.file, r.stage, r.when, r.text].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';
writeFileSync('docs/narration/recording-script.csv', csv);
console.log(`recording script: ${rows.length} lines`);
