// Screenshots of the gore setting: wounds, senescence, death beats and the post-spawn sequence.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4181` after a build, then
//   node tests/smoke/gore-shots.mjs [outDir]
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/gore';
const BASE = process.env.SHOTS_URL ?? 'http://localhost:4181/';
// ONLY=wounds,wear,beats,end runs just those sections.
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(gore, { sex = 'F', preset = 'quick' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts/.test(m.text()) && console.error('console', m.text()));
  // Play the sequences at their real length (the game shortens them for automated browsers).
  await page.addInitScript((g) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: g, volume: 0, muted: true }));
  }, gore);
  // A fake clock, so timed moments can be captured frame-exactly in a slow software renderer.
  await page.clock.install();
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click(`[data-preset="${preset}"]`);
  if (preset !== 'jack') await page.locator('.grid3 button.choice', { hasText: sex === 'F' ? '♀' : '♂' }).first().click().catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  return page;
}

/** Jump to a stage and start playing it. */
async function jump(page, stage, setup = '') {
  await page.evaluate(
    ([i, s]) => {
      const app = window.__hw.app;
      app.debugJump(i);
      if (s) new Function('app', 'w', s)(app, app.world);
    },
    [stage, setup],
  );
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw.step(30));
  await page.waitForTimeout(300);
}

async function freeze(page) {
  // Pause a moment ahead of the page's clock (retrying if the clock has moved on meanwhile).
  for (let tries = 0; ; tries++) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + 250 * (tries + 1));
      return;
    } catch (e) {
      if (tries > 6) throw e;
    }
  }
}

const shot = (page, name) => frozenShot(page, name);
/** With the clock paused, take the picture through the DevTools protocol (Playwright's own waits on timers). */
const sessions = new WeakMap();
async function frozenShot(page, name) {
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
  const cdp = sessions.get(page);
  for (let tries = 0; ; tries++) {
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
      return;
    } catch (e) {
      // The software renderer is sometimes mid-frame; nudge the clock and try again.
      if (tries > 10) throw e;
      console.log('retry', name, e.message);
      await page.clock.runFor(16).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// 1. Wounds on a large male on the spawning grounds, side on.
for (const gore of want('wounds') ? ['unflinching', 'documentary'] : []) {
  const page = await boot(gore, { sex: 'M' });
  await jump(page, 5, 'w.progress.isJack = false; w.progress.adultSize = 1; w.debugJumpTo(5);');
  await page.evaluate(() => {
    const g = window.__hw.app.renderer.gore;
    g.inspect = true;
    for (const k of ['claw', 'bite', 'net', 'hook', 'scrape']) g.tracker.add(k, 1);
  });
  await page.waitForTimeout(400);
  await shot(page, `wounds-${gore}`);
  // Let them age into scars.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.time += 60;
  });
  await page.waitForTimeout(300);
  await shot(page, `wounds-healed-${gore}`);
  await page.close();
}

// 2. Senescence: a female late on the grounds, after spawning.
if (want('wear')) {
  const page = await boot('unflinching', { sex: 'F' });
  await jump(page, 5);
  await page.evaluate(() => {
    const app = window.__hw.app;
    app.renderer.gore.inspect = true;
    app.mode = 'menu';
  });
  for (const [t, name] of [
    [0, 'wear-arrive'],
    [44, 'wear-spent'],
  ]) {
    await page.evaluate((tt) => {
      const w = window.__hw.app.world;
      w.stageTime = tt;
      if (tt > 0) Object.assign(w.stage, { spawned: true, spawnedAt: 10 });
    }, t);
    await page.waitForTimeout(400);
    await shot(page, name);
  }
  // Others on the grounds, from the normal camera.
  await page.evaluate(() => (window.__hw.app.renderer.gore.inspect = false));
  await page.waitForTimeout(400);
  await shot(page, 'wear-grounds');
  await page.close();
}

// 3. Death beats: a bear on the grounds and an orca at sea, in both settings.
async function deathBeat(gore, stage, setup, name, times) {
  const page = await boot(gore, { sex: 'M' });
  await jump(page, stage, setup);
  await page.evaluate(() => (window.__hw.app.mode = 'menu'));
  await page.waitForTimeout(200);
  await freeze(page);
  await page.evaluate(() => {
    const app = window.__hw.app;
    const w = app.world;
    w.__kill(w);
    app.stepSim(0);
  });
  let at = 0;
  for (const ms of times) {
    await page.clock.runFor(ms - at);
    at = ms;
    await frozenShot(page, `${name}-${gore}-${ms}`);
  }
  await page.close();
}
const BEAR = `w.progress.isJack = false; w.progress.adultSize = 1; w.debugJumpTo(5);
  w.__kill = (w) => { const f = w.body.pos; w.spawn('bear', {x: f.x, y: 0.8, z: f.z > 0 ? 8.6 : -8.6}, { radius: 1.2, state: 'strike', timer: 0.3, home: {x: f.x, y: 0, z: f.z} }); w.die('bear'); };`;
const ORCA = `w.__kill = (w) => { const f = w.body.pos; const o = w.spawn('orca', {x: f.x + 2.2, y: f.y - 0.4, z: f.z + 0.6}, { radius: 2, state: 'charge', vel: {x: -8, y: 0, z: -1} }); o.yaw = Math.PI; w.die('orca'); };`;
for (const gore of want('beats') ? ['unflinching', 'documentary'] : []) {
  await deathBeat(gore, 5, BEAR, 'beat-bear', [150, 450, 900, 1500, 2300]);
  await deathBeat(gore, 3, ORCA, 'beat-orca', [150, 450, 900, 1500]);
}

// 4. The post-spawn sequence.
for (const gore of want('end') ? ['unflinching', 'documentary'] : []) {
  const page = await boot(gore, { sex: 'F' });
  await jump(page, 5);
  await freeze(page);
  await page.evaluate(() => window.__hw.completeStage());
  const card = 2300 + 650;
  const n = gore === 'unflinching' ? 6 : 5;
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(i === 0 ? 2000 : card);
    await frozenShot(page, `end-${gore}-${i + 1}`);
  }
  await page.clock.runFor(card);
  await frozenShot(page, `end-${gore}-recap`);
  await page.close();
}

await browser.close();
console.log('done');
