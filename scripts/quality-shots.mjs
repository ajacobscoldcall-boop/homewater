/**
 * Screenshots of the ocean (orca charging) and the spawning grounds (a bear
 * at the bank) at Low and High, for checking that Low still reads.
 *
 *   npm run build && PW_PORT=4182 node scripts/quality-shots.mjs [outDir=docs/gallery]
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const port = Number(process.env.PW_PORT ?? 4182);
const out = process.argv[2] ?? 'docs/gallery';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 200));
}

// Stage index, the threat to wait for, and the states worth showing.
const SCENES = [
  { name: 'ocean', stage: 3, kind: 'orca', states: ['charge', 'warn'], within: 22 },
  { name: 'spawn', stage: 5, kind: 'bear', states: ['warn'], within: 99 },
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const preset of ['low', 'high']) {
    for (const scene of SCENES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(base);
      await page.evaluate((q) => localStorage.setItem('homewater.settings', JSON.stringify({ quality: q })), preset);
      await page.reload();
      await page.click('#btn-new');
      await page.click('[data-preset="quick"]');
      await page.click('#btn-setup-next');
      await page.click('#btn-accept-name');
      await page.evaluate((i) => window.__hw.app.debugJump(i), scene.stage);
      await page.click('#btn-play');
      // Run the simulation until the threat shows itself (or give up after a while).
      const found = await page.evaluate(({ kind, states, within }) => {
        const app = window.__hw.app;
        const w = app.world;
        // Freeze the simulation (it would run on in real time while the screenshot is taken).
        app.acc = -1e9;
        const near = (e) => Math.hypot(e.pos.x - w.body.pos.x, e.pos.z - w.body.pos.z) < within;
        for (let i = 0; i < 2000; i++) {
          if (w.live(kind).some((e) => states.includes(e.state) && near(e))) return true;
          if (w.status !== 'playing') return false;
          window.__hw.step(3);
        }
        return false;
      }, scene);
      // Turn the fish towards the threat so it is in view, and snap the camera behind it.
      await page.evaluate(({ kind }) => {
        const app = window.__hw.app;
        const w = app.world;
        const e = w.live(kind)[0];
        if (e) {
          w.body.yaw = Math.atan2(e.pos.z - w.body.pos.z, e.pos.x - w.body.pos.x);
          w.body.pitch = 0;
        }
        app.renderer.camPos.set(0, 0, 0);
      }, scene);
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${out}/quality-${preset}-${scene.name}.png`, timeout: 120_000 });
      process.stderr.write(`${preset} ${scene.name}: ${found ? scene.kind : 'no threat seen'} (${await page.evaluate(() => window.__hw.app.graphics.describe())})\n`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
