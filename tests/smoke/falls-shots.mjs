// Screenshots of the return's rapids, falls and fellow migrants.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4185` after a build, then
//   node tests/smoke/falls-shots.mjs [outDir]
// ONLY=rapids,pool,leap,face,side,school runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/falls';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4185/?quality=${process.env.Q ?? 'high'}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
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
await page.evaluate(() => window.__hw.app.debugJump(4));
await page.click('#btn-play');

/** Place the fish (x, dz from the river centre, y, yaw), bring the school along, clear bears unless asked, run a few steps. */
async function place(o) {
  await page.evaluate((o) => {
    const app = window.__hw.app;
    const w = app.world;
    const hm = w.stage.homeMouth;
    if (!w.live('migrant').length) {
      w.body.pos = { x: 95, y: -2, z: hm };
      w.step({ forward: 0, hold: false, turn: 0, mouseX: 0, mouseY: 0, rise: false, dive: false, burst: false, action: false, actionPressed: false, risePressed: false });
    }
    if (!o.bears) for (const b of w.live('bear')) b.alive = false;
    for (const l of w.live('lure')) l.alive = false;
    w.body.pos = { x: o.x, y: o.y ?? -1.5, z: hm + (o.dz ?? 0) };
    w.body.vel = { x: 0, y: 0, z: 0 };
    w.body.yaw = o.yaw ?? 0;
    w.body.pitch = o.pitch ?? 0;
    w.progress.fat = 0.9;
    // Bring the school along, loosely around the fish (below the falls if the fish is).
    let i = 0;
    for (const m of w.live('migrant')) {
      const x = o.x - 3 + ((i * 2.3) % 9);
      m.pos = { x: o.x < 156 ? Math.min(x, 155) : Math.max(x, 158.5), y: -2 + ((i * 0.7) % 1.4), z: hm + ((i * 1.9) % 9) - 4.5 };
      m.vel = { x: 0, y: 0, z: 0 };
      i++;
    }
    if (o.open) w.stage.falls.sideOpen = true;
  }, o);
  await page.evaluate((n) => window.__hw.step(n), o.steps ?? 20);
  await page.waitForTimeout(400);
}

async function snap(name, hud = false) {
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  await page.waitForTimeout(300);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  const s = await page.evaluate(() => {
    const w = window.__hw.app.world;
    return { x: w.body.pos.x.toFixed(1), y: w.body.pos.y.toFixed(1), z: (w.body.pos.z - w.stage.homeMouth).toFixed(1), mig: w.live('migrant').length, fps: 0 };
  });
  console.log('shot', name, JSON.stringify(s));
}

// Freeze the sim so a pose holds (the renderer still draws).
const freeze = () => page.evaluate(() => (window.__hw.app.mode = 'menu'));
const thaw = () => page.evaluate(() => (window.__hw.app.mode = 'play'));

if (want('rapids')) {
  await place({ x: 133.5, y: -1.6, dz: -1, yaw: 0.15, pitch: 0.05 });
  await freeze();
  await snap('falls-rapids');
  await thaw();
}
if (want('pool')) {
  await place({ x: 149.6, y: -1.2, dz: 0, yaw: 0, steps: 10 });
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const v = w.stage.falls;
    w.body.pos.z = w.stage.homeMouth + v.notchZ;
    let i = 0;
    for (const m of w.live('migrant')) {
      m.pos = { x: 150.5 + (i % 4) * 1.2, y: -1.6 + (i % 3) * 0.4, z: w.stage.homeMouth + ((i * 1.7) % 9) - 4.5 };
      i++;
    }
  });
  await page.evaluate(() => window.__hw.step(3));
  await freeze();
  await snap('falls-pool');
  await thaw();
}
if (want('leap')) {
  // Mid-leap: the player and a migrant in the air over the falls, seen from below.
  await place({ x: 152.2, y: -0.6, dz: 0, yaw: 0, steps: 2 });
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.stage.falls;
    w.body.pos.z = w.stage.homeMouth + f.notchZ;
    w.body.pos.x = 153.8;
    w.body.vel = { x: 8.5, y: 0, z: 0 };
    w.body.energy = 1;
    w.body.pitch = 0.3;
    w.step({ forward: 1, hold: false, turn: 0, mouseX: 0, mouseY: 0, rise: true, dive: false, burst: true, action: false, actionPressed: false, risePressed: false });
  });
  await page.evaluate(() => window.__hw.step(18));
  await freeze();
  await snap('falls-leap');
  await thaw();
  await page.evaluate(() => window.__hw.step(40));
  await page.waitForTimeout(300);
  await snap('falls-landed');
}
if (want('face')) {
  // Looking at the face of the falls from the plunge pool, side on.
  await place({ x: 151.5, y: -2.6, dz: 0, yaw: 0.25, pitch: 0.12, steps: 4 });
  await freeze();
  await snap('falls-face');
  await thaw();
}
if (want('side')) {
  await place({ x: 152.5, y: -1.6, dz: 0, yaw: 0, steps: 2, open: true });
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.stage.falls;
    w.body.pos.z = w.stage.homeMouth + f.chuteSide * 4.5;
    w.body.yaw = f.chuteSide * 0.35;
  });
  await page.evaluate(() => window.__hw.step(200));
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.stage.falls;
    w.body.pos = { x: 152.5, y: -1.6, z: w.stage.homeMouth + f.chuteSide * 3.8 };
    w.body.yaw = f.chuteSide * 0.45;
  });
  await page.evaluate(() => window.__hw.step(2));
  await freeze();
  await snap('falls-side');
  await thaw();
}
if (want('school')) {
  await place({ x: 112, y: -2, dz: 1, yaw: 0, steps: 2 });
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    let i = 0;
    for (const m of w.live('migrant')) {
      m.pos = { x: w.body.pos.x + 2 + (i % 5) * 1.3, y: -2.2 + (i % 3) * 0.5, z: w.stage.homeMouth + ((i * 1.9) % 8) - 4 };
      i++;
    }
  });
  await page.evaluate(() => window.__hw.step(30));
  await freeze();
  await snap('falls-school');
  await thaw();
}
await browser.close();
