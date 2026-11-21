// Screenshots of the lake crossing at the end of the return (returnLake.ts, env/lakeHome.ts).
// Not part of the smoke suite. Usage: start `npx vite preview --port 4201` after a build, then
//   node tests/smoke/lakehome-shots.mjs [outDir]
// ONLY=inlet,open,warm,mouth,ready,beach runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/lakehome';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PORT ?? 4201}/?quality=${process.env.Q ?? 'high'}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function start(habitat) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true, contentSeen: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.click(`[data-habitat="${habitat}"]`);
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.evaluate(() => window.__hw.app.debugJump(4));
  await page.click('#btn-play');
  return page;
}

/** Put the fish in the lake: `at(lay)` gives { x, y, z, yaw }; options clear bears, set ripeness or a warm year. */
async function place(page, o) {
  await page.evaluate((o) => {
    const w = window.__hw.app.world;
    const lake = w.stage.lake;
    const lay = lake.layout;
    const home = lay.sites[lay.home];
    const f = new Function('lay', 'home', `return (${o.at})`);
    const p = f(lay, home);
    if (!o.bears) for (const b of w.live('bear')) b.alive = false;
    for (const l of w.live('lure')) l.alive = false;
    for (const m of w.live('migrant')) m.alive = false;
    if (o.warm) Object.assign(w.conditions, { temperature: 1.3, flow: 0.7 });
    w.body.pos = { x: p.x, y: p.y, z: p.z };
    w.body.vel = { x: 0, y: 0, z: 0 };
    w.body.yaw = p.yaw ?? 0;
    w.body.pitch = p.pitch ?? 0;
    w.stage.falls.passed = true;
    w.stage.falls.above = true;
    w.stage.upstream = 1;
    lake.entered = true;
    lake.ripe = o.ripe ?? 0.3;
    w.progress.fat = 0.6;
  }, o);
  await page.evaluate((n) => window.__hw.step(n), o.steps ?? 90);
  await page.waitForTimeout(600);
}

async function snap(page, name, hud = false) {
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  await page.waitForTimeout(300);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  const s = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const l = w.stage.lake;
    return { x: w.body.pos.x.toFixed(1), y: w.body.pos.y.toFixed(1), z: w.body.pos.z.toFixed(1), ripe: l.ripe.toFixed(2), status: w.status, scent: w.live('scent').length, home: l.layout.home };
  });
  console.log('shot', name, JSON.stringify(s));
}

const freeze = (page) => page.evaluate(() => (window.__hw.app.mode = 'menu'));

{
  const page = await start('creek');
  if (want('inlet')) {
    // Out of the river's trough, looking into the open lake.
    await place(page, { at: '{ x: lay.start + 16, y: -3, z: (lay.inletZ0 + lay.inletZ1) / 2 * 0.8, yaw: -0.35 * Math.sign((lay.inletZ0 + lay.inletZ1) / 2) }', steps: 30 });
    await freeze(page);
    await snap(page, 'lakehome-inlet');
    await page.evaluate(() => (window.__hw.app.mode = 'play'));
  }
  if (want('open')) {
    // Mid lake along the home plume, the scent ahead.
    await place(page, { at: '{ x: lay.start + 60, y: -3, z: (lay.inletZ0 + lay.inletZ1) / 2 * 0.5 + home.z * 0.5, yaw: Math.atan2(home.z - ((lay.inletZ0 + lay.inletZ1) / 2), home.x - lay.start - 60) }', steps: 120 });
    await snap(page, 'lakehome-open', true);
  }
  if (want('warm')) {
    // A warm year: waiting deep below the warm top layer, the details panel open.
    await place(page, { at: '{ x: lay.start + 90, y: -7, z: 0, yaw: 0.4, pitch: 0.1 }', warm: true, steps: 120 });
    await page.keyboard.press('h');
    await snap(page, 'lakehome-warm-deep', true);
    await page.keyboard.press('h');
  }
  if (want('mouth')) {
    // At the home stream's mouth, with its bear.
    await place(page, { at: '{ x: lay.end - 7, y: -1.2, z: home.z, yaw: 0 }', bears: true, ripe: 0.6, steps: 40 });
    await snap(page, 'lakehome-mouth', true);
  }
  if (want('ready')) {
    // Colours on: the fish side-on, close to home.
    await place(page, { at: '{ x: lay.end - 14, y: -2.5, z: home.z, yaw: 1.2 }', ripe: 1, steps: 60 });
    await freeze(page);
    await snap(page, 'lakehome-ready');
    await page.evaluate(() => (window.__hw.app.mode = 'play'));
  }
  await page.close();
}

if (want('beach')) {
  const page = await start('beach');
  await place(page, { at: '{ x: home.x - 6, y: -1.4, z: home.z - home.side * 3, yaw: home.side * 1.2 }', bears: true, ripe: 0.6, steps: 60 });
  await snap(page, 'lakehome-beach', true);
  // Arriving ready: the stage card and caption for the beach grounds.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const lay = w.stage.lake.layout;
    const home = lay.sites[lay.home];
    for (const b of w.live('bear')) b.alive = false;
    w.stage.lake.ripe = 1;
    w.body.pos = { x: home.x, y: -0.8, z: home.z + home.side * 1 };
  });
  await page.evaluate(() => window.__hw.step(30));
  await page.waitForTimeout(2500);
  writeFileSync(`${OUT}/lakehome-beach-card.png`, await page.screenshot());
  console.log('shot lakehome-beach-card');
  await page.close();
}

await browser.close();
