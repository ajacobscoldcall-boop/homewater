/**
 * Captures the sharing clip and stills from a running build.
 *
 *   npm run build && npx vite preview --port 4180 --strictPort &
 *   node scripts/capture-media.mjs [http://localhost:4180/]
 *   PREVIEW=1 node scripts/capture-media.mjs   # stills only, a few frames per scene
 *
 * Writes docs/media/homewater-clip.webm (needs ffmpeg with libvpx-vp9) and
 * docs/screenshots/*.png. Time is driven by Playwright's fake clock, one
 * animation frame at a time, so the clip plays smoothly at 30 fps however slow
 * the machine's WebGL is. A simple autopilot holds W and steers toward each
 * scene's point of interest through the real keyboard input, and deaths are
 * switched off on the page so every scene plays out.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4180/';
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const W = 1280;
const H = 720;
const PREVIEW = !!process.env.PREVIEW;

/** Scenes in life order: stage index, seconds of warm-up, seconds filmed, what to steer toward, which frames to keep as stills. */
const ONLY = process.env.ONLY;
const SCENES_ALL = [
  { name: 'fry', stage: 1, warm: 3, film: 4.5, seek: ['plankton'], still: 0.6 },
  { name: 'smolt-run', stage: 2, warm: 3, film: 5, seek: ['smolt'], still: 0.5, centroid: true },
  { name: 'ocean-krill', stage: 3, warm: 1, film: 8, seek: ['herring'], still: 0.45 },
  { name: 'return', stage: 4, marker: 1, warm: 4, film: 5, seek: ['bear', 'lure'], still: 0.5 },
  { name: 'spawning', stage: 5, male: true, warm: 3, film: 6, seek: ['female'], still: 0.5 },
];
const SCENES = SCENES_ALL;

const tmp = mkdtempSync(join(tmpdir(), 'hw-clip-'));
mkdirSync('docs/media', { recursive: true });
mkdirSync('docs/screenshots', { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let page;
const tick = async (frames = 1) => page.clock.runFor(FRAME_MS * frames);

/** A fresh browser context and a new lineage (quick start, female), so every scene starts clean. */
async function freshLife(male = false) {
  if (page) await page.context().close();
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.clock.install();
  await page.goto(BASE);
  // Stop the clock flowing with real time: only tick() moves it from here on.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await tick(10);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  if (male) await page.getByRole('button', { name: '♂' }).click();
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.waitForSelector('#btn-play');
}

const keys = new Set();
async function setKey(code, on) {
  if (on && !keys.has(code)) {
    keys.add(code);
    await page.keyboard.down(code);
  } else if (!on && keys.has(code)) {
    keys.delete(code);
    await page.keyboard.up(code);
  }
}

/** Steer toward the nearest entity of the given kinds through the A/D keys. */
async function autopilot(seek, vertical, centroid) {
  const aim = await page.evaluate(([kinds, centroid]) => {
    const w = window.__hw?.app.world;
    if (!w) return null;
    const b = w.body;
    let best = null;
    let bd = Infinity;
    for (const k of kinds) {
      for (const e of w.live(k)) {
        const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
        if (d > 0.8 && d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) break;
    }
    if (centroid) {
      const all = w.live(kinds[0]);
      if (all.length) best = { pos: { x: all.reduce((a, e) => a + e.pos.x, 0) / all.length, y: all.reduce((a, e) => a + e.pos.y, 0) / all.length, z: all.reduce((a, e) => a + e.pos.z, 0) / all.length } };
    }
    if (!best) return { turn: 0, dy: 0 };
    // Heading convention from src/sim/vec.ts: forward is (cos yaw, sin yaw) in x/z.
    const want = Math.atan2(best.pos.z - b.pos.z, best.pos.x - b.pos.x);
    let diff = want - b.yaw;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return { turn: Math.abs(diff) < 0.12 ? 0 : Math.sign(diff), dy: best.pos.y - b.pos.y };
  }, [seek, !!centroid]);
  await setKey('KeyW', true);
  await setKey('KeyD', aim?.turn === 1);
  await setKey('KeyA', aim?.turn === -1);
  await setKey('Space', !!vertical && (aim?.dy ?? 0) > 0.8);
  await setKey('KeyC', !!vertical && (aim?.dy ?? 0) < -0.8);
}

let frame = 0;
for (const sc of SCENES) {
  if (ONLY && !ONLY.split(',').includes(sc.name)) continue;
  await freshLife(!!sc.male);
  keys.clear();
  await page.evaluate((i) => window.__hw?.app.debugJump(i), sc.stage);
  await page.click('#btn-play');
  // Hide the step-by-step guide so the frame stays clear (skipping it would shorten the stage).
  await page.addStyleTag({ content: '#guide { display: none !important; }' });
  if (sc.marker) await page.evaluate(([i, m]) => window.__hw?.app.world?.startStage(i, m), [sc.stage, sc.marker]);
  // For filming only: the autopilot is no match for the predators, so strikes miss.
  await page.evaluate(() => {
    const w = window.__hw?.app.world;
    if (w) w.die = () => undefined;
  });
  for (let i = 0; i < sc.warm * FPS; i++) {
    if (i % 3 === 0) await autopilot(sc.seek, sc.vertical, sc.centroid);
    await tick();
  }
  const n = Math.round(sc.film * FPS);
  for (let i = 0; i < n; i++) {
    if (i % 3 === 0) await autopilot(sc.seek, sc.vertical, sc.centroid);
    await tick();
    if (!PREVIEW) await page.screenshot({ path: join(tmp, `f${String(frame++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i === Math.min(n - 1, Math.round(n * sc.still))) await page.screenshot({ path: `docs/screenshots/${String(SCENES.indexOf(sc) + 1).padStart(2, '0')}-${sc.name}.png` });
  }
  for (const k of [...keys]) await setKey(k, false);
  const st = await page.evaluate(() => window.__hw?.state());
  const phase = await page.evaluate(() => { const w = window.__hw?.app.world; return w ? `${w.stage.phase ?? ''} t=${w.stageTime.toFixed(1)}` : ''; });
  console.log(phase);
  console.log(`${sc.name}: ${n} frames, stage ${st?.stage}, status ${st?.status}`);
}
// The title screen, for the README.
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
page = await ctx.newPage();
await page.clock.install();
await page.goto(BASE);
await tick(10);
await page.screenshot({ path: 'docs/screenshots/title.png' });
await browser.close();
if (PREVIEW) process.exit(0);

const out = 'docs/media/homewater-clip.webm';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(tmp, 'f%05d.jpg'), '-vf', 'scale=1280:720', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-an', out]);
rmSync(tmp, { recursive: true, force: true });
console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(2)} MB`);
