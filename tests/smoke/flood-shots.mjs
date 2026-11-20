// Screenshots of the egg stage's flood: the warning, the flood, brood-mates washed out, and after.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4184` after a build, then
//   node tests/smoke/flood-shots.mjs [outDir]
// Q=low|medium|high (default high). The fish is held facing upstream and low so it lives through it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/flood';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4184/?quality=${process.env.Q ?? 'high'}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
});
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');

// Keep the alevin facing into the current and deep in the gravel.
await page.evaluate(() => {
  setInterval(() => {
    const w = window.__hw.app.world;
    if (w?.stageId !== 'egg') return;
    w.body.yaw = w.stage.currentAngle + Math.PI;
    w.stage.height = 0;
  }, 4);
});

const phase = (want, extra = 0) =>
  page.waitForFunction(
    ([p, t]) => {
      const s = window.__hw.app.world?.stage;
      return s && s.flood === p && (p === 'warning' ? s.floodLeft < t : p === 'flood' ? s.floodTaken >= t : s.floodLeft < -t);
    },
    [want, extra],
    { timeout: 120000, polling: 50 },
  );

async function snap(name, hud = true) {
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  await page.waitForTimeout(150);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  const s = await page.evaluate(() => {
    const w = window.__hw.app.world;
    return { t: w.stageTime.toFixed(1), flood: w.stage.flood, lost: w.stage.broodLost, status: w.status };
  });
  console.log('shot', name, JSON.stringify(s));
}

await page.waitForFunction(() => window.__hw.app.world?.stage?.phase === 'alevin', null, { timeout: 60000 });
await page.waitForTimeout(1500);
await snap('flood-0-before');
await phase('warning', 1.5);
await snap('flood-1-warning');
await phase('flood', 3);
await snap('flood-2-flood');
await snap('flood-2-flood-nohud', false);
await phase('over', 0.2);
await snap('flood-3-over');
await browser.close();
