// Screenshots of warm-year realism (Track 2.7): the lasting heat toll on the return (H panel and caption),
// a burdened fish arriving on the spawning grounds (heat toll bar, weaker strength ring, caption), and the
// "Died before spawning" death screen. Not part of the smoke suite.
// Usage: start `npx vite preview --port 4213 --strictPort` after a build, then
//   node tests/smoke/heat-shots.mjs [outDir]
// Q=low|medium|high (default high). PW_PORT overrides the port.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/heat';
const PORT = process.env.PW_PORT ?? 4213;
const BASE = `http://localhost:${PORT}/?quality=${process.env.Q ?? 'high'}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'documentary', volume: 0, muted: true, contentSeen: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
});
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.locator('.grid3 button.choice', { hasText: '♀' }).first().click().catch(() => {});
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');
await page.waitForFunction(() => window.__hw.app.world, null, { timeout: 60000 });

const HOT = { flow: 0.7, temperature: 1.25 };

async function snap(name) {
  await page.waitForTimeout(300);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  const bars = await page.evaluate(() => document.getElementById('hud-bars')?.innerText.replace(/\n/g, ' | '));
  const cap = await page.evaluate(() => [...document.querySelectorAll('.caption')].map((c) => c.textContent).join(' / '));
  console.log('shot', name, '|', bars, '|', cap);
}

// 1. The return in a hot year: held in a warm stretch with heat stress high, so the toll builds and its caption shows.
await page.evaluate((year) => {
  const app = window.__hw.app;
  const w = app.world;
  Object.assign(w.conditions, year);
  w.fish.z.runTiming = 0;
  app.debugJump(4);
}, HOT);
await page.click('#btn-play');
await page.evaluate(() => {
  const app = window.__hw.app;
  const w = app.world;
  app.hudDetailed = true;
  const s = w.stage;
  const mouth = s.homeMouth;
  let riffle = 110;
  for (let x = 100; x < 132; x += 0.5) if (w.arena.floor(x, mouth) > w.arena.floor(riffle, mouth)) riffle = x;
  s.heatToll = 0.38;
  w.carry.heatToll = 0.38;
  window.__hold = setInterval(() => {
    for (const e of w.entities) if (e.kind === 'bear' || e.kind === 'lure' || e.kind === 'migrant') e.alive = false;
    w.body.pos.x = riffle - 1.5;
    w.body.pos.z = mouth;
    w.body.pos.y = -1.1;
    w.body.yaw = 0;
    w.body.pitch = 0;
    w.progress.fat = 0.6;
    s.heatStress = Math.max(s.heatStress ?? 0, 0.85);
  }, 4);
});
await page.waitForTimeout(4500);
await snap('heat-return-toll');
await page.evaluate(() => clearInterval(window.__hold));

// 2. The grounds: arriving with a heavy toll in a hot year (the jump clears the carried toll, so restart the stage with one).
await page.evaluate(() => {
  const app = window.__hw.app;
  const w = app.world;
  app.debugJump(5);
  w.carry.heatToll = 0.6;
  w.startStage(5, 0);
  app.pending = w.drainEvents();
});
await page.click('#btn-play');
await page.evaluate(() => {
  const app = window.__hw.app;
  app.hudDetailed = true;
  app.world.stage.bearTimer = 1e9;
});
await page.waitForTimeout(5000);
await snap('heat-grounds-burden');

// 3. Died before spawning.
await page.evaluate(() => {
  const app = window.__hw.app;
  const w = app.world;
  w.die('prespawn');
  app.afterStatus(w);
});
await page.waitForTimeout(3500);
await page.mouse.click(5, 5).catch(() => {});
await page.waitForTimeout(1500);
await snap('heat-death-prespawn');
await browser.close();
