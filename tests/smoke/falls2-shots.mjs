// Review shots for the falls rework (launch spot, leap gauge, miss captions, practice ledge, side channel)
// and the magnetic track's glows. Not part of the smoke suite. Usage: after a build, start
// `npx vite preview --port 4218`, then
//   node tests/smoke/falls2-shots.mjs [outDir]
// ONLY=pool,ready,miss,practice,side,leap,track runs just those. Q=low|medium|high (default high). DOC=1 for Documentary view.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/falls2';
const Q = process.env.Q ?? 'high';
const DOC = process.env.DOC === '1';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PW_PORT ?? 4218}/?quality=${Q}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const tag = `${Q}${DOC ? '-doc' : ''}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript((doc) => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true, contentSeen: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false, documentaryView: doc }));
}, DOC);
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
await page.evaluate(() => window.__hw.app.debugJump(4));
await page.click('#btn-play');
await page.waitForTimeout(600);

const NONE = { forward: 0, hold: false, turn: 0, mouseX: 0, mouseY: 0, rise: false, dive: false, burst: false, action: false, actionPressed: false, risePressed: false };

/** Place the fish (x, dz from the notch or river centre, y, yaw), clear bears and lures, run a few steps. */
async function place(o) {
  await page.evaluate(
    ({ o, NONE }) => {
      const w = window.__hw.app.world;
      const hm = w.stage.homeMouth;
      const f = w.stage.falls;
      for (const b of w.live('bear')) if (!o.bears) b.alive = false;
      for (const l of w.live('lure')) l.alive = false;
      for (const m of w.live('migrant')) m.alive = false;
      const z = o.at === 'practice' ? hm + f.chuteSide * 6 : o.at === 'center' ? hm : hm + f.notchZ;
      w.body.pos = { x: o.x, y: o.y ?? -1.2, z: z + (o.dz ?? 0) };
      w.body.vel = { x: o.vx ?? 0, y: 0, z: 0 };
      w.body.yaw = o.yaw ?? 0;
      w.body.pitch = o.pitch ?? 0;
      w.body.energy = o.energy ?? 1;
      w.progress.fat = 0.85;
      w.step(NONE);
    },
    { o, NONE },
  );
  await page.evaluate((n) => window.__hw.step(n), o.steps ?? 6);
  await page.waitForTimeout(350);
}
async function snap(name) {
  await page.waitForTimeout(350);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  const s = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const v = w.stage.falls;
    return { x: w.body.pos.x.toFixed(1), y: w.body.pos.y.toFixed(1), leaps: v?.leaps, fails: v?.failures, miss: v?.lastMiss, caption: document.querySelector('.caption')?.textContent?.slice(0, 70) };
  });
  console.log('shot', name, JSON.stringify(s));
}
const freeze = () => page.evaluate(() => (window.__hw.app.mode = 'menu'));
const thaw = () => page.evaluate(() => (window.__hw.app.mode = 'playing'));
/** Step the sim with an intent held, n steps. */
const hold = (intent, n) =>
  page.evaluate(
    ({ intent, n, NONE }) => {
      const w = window.__hw.app.world;
      for (let i = 0; i < n; i++) w.step({ ...NONE, ...intent, burstPressed: !!intent.burstPressed && i === 0 });
    },
    { intent, n, NONE },
  );

if (want('pool')) {
  // In the plunge pool, building speed: the launch foam over the standing wave, the brighter low step, the leap gauge.
  await place({ x: 150.2, y: -1.0, yaw: 0, steps: 2 });
  await hold({ forward: 1 }, 30);
  await freeze();
  await snap(`falls2-pool-${tag}`);
  await thaw();
}
if (want('ready')) {
  // Running at the falls at full speed, just short of the standing wave: the gauge is full.
  await place({ x: 150.0, y: -0.9, yaw: 0, steps: 1 });
  await hold({ forward: 1, burst: true, burstPressed: true }, 24);
  await freeze();
  await snap(`falls2-ready-${tag}`);
  await thaw();
}
if (want('leap')) {
  await place({ x: 150.0, y: -0.9, yaw: 0, steps: 1 });
  // Burst held through the run-up: the leap starts at the standing wave (about 40 steps), then mid-air.
  await hold({ forward: 1, burst: true, burstPressed: true }, 58);
  await freeze();
  await snap(`falls2-leap-${tag}`);
  await thaw();
}
if (want('miss')) {
  // Too slow from the white water: the miss, and the caption saying why.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    Object.assign(w.stage.falls, { passed: false, above: false, leaps: 0, failures: 0, leap: null, runUp: 0 });
  });
  await place({ x: 151, y: -0.8, yaw: 0, steps: 0 });
  // Set up and press in one go (the live game keeps running between calls).
  await page.evaluate((NONE) => {
    const w = window.__hw.app.world;
    w.body.pos.x = 153.2;
    w.body.vel = { x: 3.2, y: 0, z: 0 };
    w.step({ ...NONE, forward: 1, burst: true, burstPressed: true });
  }, NONE);
  await page.evaluate(() => window.__hw.step(60));
  await page.waitForTimeout(900);
  await snap(`falls2-miss-${tag}`);
}
if (want('side')) {
  // From the pool, looking across at the side channel behind its driftwood: there from the start.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    Object.assign(w.stage.falls, { passed: false, above: false, sideOpen: false, failures: 0, leaps: 0, leap: null, runUp: 0 });
  });
  await place({ x: 151.0, y: -1.4, yaw: 0, steps: 2 });
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.stage.falls;
    w.body.pos.z = w.stage.homeMouth + f.chuteSide * 2.5;
    w.body.yaw = f.chuteSide * 0.55;
  });
  await page.evaluate(() => window.__hw.step(3));
  await freeze();
  await snap(`falls2-side-${tag}`);
  await thaw();
}
if (want('practice')) {
  // The practice ledge in the rapids, with the Field guide prompt.
  await place({ x: 137.6, y: -0.9, at: 'practice', yaw: 0, steps: 2 });
  await hold({ forward: 0.6 }, 40);
  await page.waitForTimeout(800);
  await freeze();
  await snap(`falls2-practice-${tag}`);
  await thaw();
}
if (want('track')) {
  // The magnetic track at sea, from the default low chase camera.
  await page.evaluate(() => window.__hw.app.debugJump(4));
  await page.waitForTimeout(400);
  await page.click('#btn-play').catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate((NONE) => {
    const w = window.__hw.app.world;
    const s = w.stage;
    // On the track: the fish where the track runs, heading along it.
    const tz = (x) => s.trackStartZ + (s.homeMouth - s.trackStartZ) * Math.min(1, x / 90) + s.trackBend * Math.sin((Math.PI * Math.min(1, x / 90)));
    w.body.pos = { x: 30, y: -3, z: tz(30) };
    w.body.yaw = Math.atan2(tz(36) - tz(30), 6);
    w.step(NONE);
  }, NONE);
  await hold({ forward: 0.5 }, 150);
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => window.__hw.app.world.live('track').length);
  console.log('track markers', n);
  await freeze();
  await snap(`track-${tag}`);
  await thaw();
}
await browser.close();
