// Screenshots of the return's water temperature and oxygen: a hot riffle, a cool seep, a deep pool, and an ordinary year.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4185` after a build, then
//   node tests/smoke/thermal-shots.mjs [outDir]
// Q=low|medium|high (default high). Bears and lures are cleared; the details bar (H) is on.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/thermal';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4185/?quality=${process.env.Q ?? 'high'}`;
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
await page.waitForFunction(() => window.__hw.app.world, null, { timeout: 60000 });

/** Jump to the return in a given year and hold the fish at a spot (kind: riffle, seep, pool). */
async function place(year, kind, stress) {
  await page.evaluate(
    ([year, kind, stress]) => {
      const app = window.__hw.app;
      const w = app.world;
      Object.assign(w.conditions, year);
      w.fish.z.runTiming = 0;
      if (w.stageId !== 'return') w.debugJumpTo(4);
      app.hudDetailed = true;
      clearInterval(window.__hold);
      const s = w.stage;
      const mouth = s.homeMouth;
      // Find spots from the arena's floor, as the sim does.
      let riffle = 116, pool = 133;
      for (let x = 100; x < 170; x += 0.5) {
        if (w.arena.floor(x, mouth) > w.arena.floor(riffle, mouth)) riffle = x;
        if (w.arena.floor(x, mouth) < w.arena.floor(pool, mouth)) pool = x;
      }
      const seepList = window.__seeps ?? [];
      const target =
        kind === 'riffle' ? { x: riffle, z: mouth, y: -0.9 } : kind === 'pool' ? { x: pool, z: mouth, y: w.arena.floor(pool, mouth) + 0.6 } : seepList[0];
      window.__hold = setInterval(() => {
        for (const e of w.entities) if (e.kind === 'bear' || e.kind === 'lure') e.alive = false;
        w.body.pos.x = target.x - 1.5;
        w.body.pos.z = target.z;
        w.body.pos.y = target.y;
        w.body.yaw = 0;
        w.body.pitch = 0;
        w.progress.fat = 0.7;
        if (stress !== null) s.heatStress = stress;
      }, 4);
    },
    [year, kind, stress],
  );
  await page.waitForTimeout(2500);
}

async function seepSpot() {
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    window.__seeps = window.__hw.water().seeps.map((q) => ({ x: q.x, z: q.z, y: w.arena.floor(q.x, q.z) + 0.5 }));
  });
}

async function snap(name) {
  await page.waitForTimeout(200);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  const bars = await page.evaluate(() => document.getElementById('hud-bars')?.innerText.replace(/\n/g, ' | '));
  console.log('shot', name, bars);
}

const HOT = { flow: 0.7, temperature: 1.3 };
const ORDINARY = { flow: 1, temperature: 1 };
await place(HOT, 'riffle', 0.45);
await snap('thermal-hot-riffle');
await place(HOT, 'pool', 0.3);
await snap('thermal-hot-pool');
await seepSpot();
await place(HOT, 'seep', 0.2);
await snap('thermal-cool-seep');
await place(ORDINARY, 'riffle', 0);
await snap('thermal-ordinary-riffle');
await browser.close();
