// Screenshots of the egg stage's threats (Track 2.5): the low-oxygen pocket, the sculpin, the silt, the stones.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4212` after a build, then
//   node tests/smoke/egg-shots.mjs [outDir]
// Q=low|medium|high (default high). The first life of a quick lineage meets all four events; the yolk is set
// to each event's trigger to get there quickly. VIEW=high uses the high camera view.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/egg';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PW_PORT ?? 4212}/?quality=${process.env.Q ?? 'high'}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript((view) => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false, cameraView: view }));
}, process.env.VIEW ?? 'chase');
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');

// Hold the alevin: facing into the current, at a height and place the script chooses.
await page.evaluate(() => {
  window.__hold = { h: 0, x: null, z: null, yaw: null };
  setInterval(() => {
    const w = window.__hw.app.world;
    if (w?.stageId !== 'egg' || w.status !== 'playing') return;
    const hold = window.__hold;
    w.body.yaw = hold.yaw ?? w.stage.currentAngle + Math.PI;
    w.stage.height = hold.h;
    if (hold.x !== null) {
      w.body.pos.x = hold.x;
      w.body.pos.z = hold.z;
    }
    w.body.energy = Math.max(w.body.energy, 0.3);
  }, 4);
});

const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 120000, polling: 50 });
const yolk = (v) => page.evaluate((y) => (window.__hw.app.world.progress.yolk = Math.min(window.__hw.app.world.progress.yolk, y)), v);

async function snap(name, hud = true) {
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  await page.waitForTimeout(200);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  const s = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const t = w.stage.threats;
    return { t: w.stageTime.toFixed(1), threat: t?.active, o2: t?.o2.toFixed(2), energy: w.body.energy.toFixed(2), status: w.status };
  });
  console.log('shot', name, JSON.stringify(s));
}

await until(() => window.__hw.app.world?.stage?.phase === 'alevin');
await page.waitForTimeout(1500);
await snap('egg-stones');

// The pocket: the water around the alevin stops; the flecks freeze and a dark film lies on the bed.
await yolk(0.9);
await until(() => window.__hw.app.world.stage.threats.pocket.phase === 'still');
await page.waitForTimeout(2500);
await snap('egg-pocket');

// Out of it to moving water; the pocket clears.
await page.evaluate(() => {
  const t = window.__hw.app.world.stage.threats;
  t.pocket.left = 0.1;
});
await until(() => window.__hw.app.world.stage.threats.pocket.phase === 'over');

// The sculpin: coming in, then probing. The alevin is held deep against the nearest stone.
await page.evaluate(() => {
  const w = window.__hw.app.world;
  const st = [...w.stage.threats.stones].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  const a = Math.atan2(-st.z, -st.x);
  window.__hold.x = st.x + Math.cos(a) * (st.r + 0.07);
  window.__hold.z = st.z + Math.sin(a) * (st.r + 0.07);
});
await yolk(0.75);
await until(() => window.__hw.app.world.live('sculpin')[0]?.state === 'warn');
await page.waitForTimeout(1800);
await snap('egg-sculpin-coming');
await until(() => window.__hw.app.world.live('sculpin')[0]?.state === 'probe');
await page.waitForTimeout(700);
await snap('egg-sculpin-probe');
await snap('egg-sculpin-probe-nohud', false);
await until(() => window.__hw.app.world.stage.threats.active !== 'sculpin');

// Skip the flood (it has its own shots) and on to the silt.
await page.evaluate(() => {
  const w = window.__hw.app.world;
  w.progress.yolk = 0.58;
});
await until(() => window.__hw.app.world.stage.flood === 'flood');
await page.evaluate(() => (window.__hw.app.world.stage.floodLeft = 0.05));
await until(() => window.__hw.app.world.stage.flood === 'over');
await yolk(0.42);
await until(() => window.__hw.app.world.stage.threats.silt.phase === 'warning' && window.__hw.app.world.stage.threats.silt.left < 1.5);
await snap('egg-silt-coming');
// Beside a stone whose gap is high, at its height.
await page.evaluate(() => {
  const w = window.__hw.app.world;
  const st = [...w.stage.threats.stones].sort((a, b) => b.gap - a.gap)[0];
  const a = Math.atan2(-st.z, -st.x);
  window.__hold.x = st.x + Math.cos(a) * (st.r + 0.07);
  window.__hold.z = st.z + Math.sin(a) * (st.r + 0.07);
  window.__hold.h = st.gap;
});
await until(() => window.__hw.app.world.stage.threats.silt.phase === 'settled');
await page.waitForTimeout(3000);
await snap('egg-silt-gap');
// The same spot, down at the bottom: the water has stopped.
await page.evaluate(() => (window.__hold.h = 0));
await page.waitForTimeout(4000);
await snap('egg-silt-stopped');
await browser.close();
