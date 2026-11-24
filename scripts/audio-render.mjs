/**
 * Renders the game's procedural sound offline, so it can be listened to
 * without playing: each place's ambience, each music slot, each cue, and a
 * couple of mixes as played. It bundles scripts/audio/page.ts (which runs
 * the real AudioEngine on an OfflineAudioContext), loads it into headless
 * Chromium and writes:
 *
 *   docs/audio-samples/<group>/<clip>.wav   16 kHz mono, 16-bit
 *   docs/audio-samples/README.md            what each clip is and what to listen for, with levels
 *   <--spectrograms dir>/<clip>.png         optional, for checking by eye
 *
 *   npm run audio:render -- [clip names or prefixes...] [--spectrograms=dir] [--out=dir]
 *
 * Fails if a clip clips (peak at 0 dBFS) or is silent. No server and no
 * network: the page is about:blank.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const args = process.argv.slice(2);
const out = resolve(args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? 'docs/audio-samples');
const specDir = args.find((a) => a.startsWith('--spectrograms='))?.split('=')[1];
const only = args.filter((a) => !a.startsWith('--'));

const bundleDir = join(tmpdir(), `hw-audio-${process.pid}`);
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: bundleDir,
    emptyOutDir: true,
    minify: false,
    lib: { entry: resolve('scripts/audio/page.ts'), formats: ['iife'], name: 'hwAudioBundle', fileName: () => 'page.js' },
  },
});
const code = readFileSync(join(bundleDir, 'page.js'), 'utf8');
rmSync(bundleDir, { recursive: true, force: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: code });
const clips = await page.evaluate(() => window.hwAudio.clips());
const chosen = clips.filter((c) => !only.length || only.some((o) => c.name.startsWith(o)));
if (!chosen.length) {
  console.error('No clips match. Clips:', clips.map((c) => c.name).join(' '));
  process.exit(1);
}

function wav(pcmBase64, sampleRate) {
  const pcm = Buffer.from(pcmBase64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
const rows = [];
const problems = [];
if (specDir) mkdirSync(specDir, { recursive: true });
for (const c of chosen) {
  const t0 = Date.now();
  const r = await page.evaluate((name) => window.hwAudio.render(name), c.name);
  const dir = join(out, c.group);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${c.name}.wav`), wav(r.pcm, r.sampleRate));
  if (specDir) writeFileSync(join(specDir, `${c.name}.png`), Buffer.from(r.spectrogram.split(',')[1], 'base64'));
  rows.push({ ...c, peak: r.peak, rms: r.rms, voices: r.peakVoices, persistent: r.persistent });
  if (r.peak >= 0.999) problems.push(`${c.name} clips (peak ${db(r.peak)} dBFS)`);
  if (r.rms < 1e-4) problems.push(`${c.name} is silent`);
  console.log(`${c.name.padEnd(34)} peak ${db(r.peak).padStart(6)} dBFS  rms ${db(r.rms).padStart(6)} dBFS  voices ${String(r.peakVoices).padStart(2)}  (${Date.now() - t0} ms)`);
}
await browser.close();

if (!only.length) {
  const groups = [
    ['ambience', 'Ambience: each place on its own (no music, no cues)'],
    ['music', 'Music: each slot of the generated score on its own'],
    ['cue', 'Cues: each event sound on its own'],
    ['mix', 'Mixes: everything together, as played'],
  ];
  const lines = [
    '# Sound samples',
    '',
    'Clips of the game\'s procedural sound, rendered offline by `npm run audio:render` (scripts/audio-render.mjs) from the same code the game plays. They are 16 kHz mono WAV files (the game\'s sound sits well under 8 kHz): open one in any audio player. Headphones help with the quiet ones. Each clip uses a fixed random seed, so re-rendering after a change gives a fair before and after.',
    '',
    'Levels are after the game\'s limiter at the default volume (70%). The script fails if a clip reaches 0 dBFS (clipping) or is silent.',
    '',
  ];
  for (const [g, title] of groups) {
    lines.push(`## ${title}`, '', '| Clip | Length | Listen for | Peak | RMS |', '|---|---|---|---|---|');
    for (const r of rows.filter((x) => x.group === g)) lines.push(`| [${r.name}](${g}/${r.name}.wav) | ${r.seconds} s | ${r.note} | ${db(r.peak)} dB | ${db(r.rms)} dB |`);
    lines.push('');
  }
  lines.push(`Sound graph: ${rows[0]?.persistent ?? '?'} nodes built once; at most ${Math.max(...rows.map((r) => r.voices))} one-shot voices at once in these clips. See docs/audio.md.`, '');
  writeFileSync(join(out, 'README.md'), lines.join('\n'));
}

if (errors.length) problems.push(...errors.map((e) => `page error: ${e}`));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
