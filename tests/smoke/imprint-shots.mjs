// Screenshots for imprinting and the return's body change: the gallery's return sequence, the home-water
// plume in the lake, and the home scent at the river mouths for a well and a poorly imprinted fish.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4185` after a build, then
//   node tests/smoke/imprint-shots.mjs [outDir]
// ONLY=gallery,plume,scent runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/imprint';
const ROOT = process.env.SHOTS_URL ?? 'http://localhost:4185/';
const Q = process.env.Q ?? 'high';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'M') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
  await page.goto(`${ROOT}?quality=${Q}`);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.locator('.grid3 button.choice', { hasText: sex === 'F' ? '♀' : '♂' }).first().click().catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  return page;
}

async function jump(page, stage, setup = '', post = '') {
  await page.evaluate(
    ([i, s, after]) => {
      const app = window.__hw.app;
      if (s) new Function('app', 'w', s)(app, app.world);
      app.debugJump(i);
      // After the jump (which fills skipped stages with an average imprint), then restart the stage with it.
      if (after) {
        new Function('app', 'w', after)(app, app.world);
        app.world.restore({ stageIndex: i, marker: 0, progress: { ...app.world.progress } });
        app.world.drainEvents();
      }
    },
    [stage, setup, post],
  );
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw.step(30));
  await page.waitForTimeout(300);
}

/** Hold the fish where `place` puts it (run every step), step the sim, and take a shot. */
async function hold(page, place, steps) {
  await page.evaluate(
    ([src, n]) => {
      const app = window.__hw.app;
      const fn = new Function('w', src);
      app.mode = 'menu';
      for (let i = 0; i < n; i++) {
        fn(app.world);
        app.world.step({ forward: 0, hold: false, turn: 0, mouseX: 0, mouseY: 0, rise: false, dive: false, burst: false, action: false, actionPressed: false, risePressed: false });
      }
      app.world.drainEvents();
      app.mode = 'playing';
    },
    [place, steps],
  );
  await page.waitForTimeout(600);
}

/** hud: true (all), false (none), 'bars' (only the details bars, no captions or guide). */
async function snap(page, name, hud = true) {
  if (!hud) await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  if (hud === 'bars')
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#hud > *')) if (el.id !== 'hud-bars') el.style.visibility = 'hidden';
    });
  await page.waitForTimeout(250);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = '';
    for (const el of document.querySelectorAll('#hud > *')) el.style.visibility = '';
  });
  const s = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const sc = w.live('scent');
    return { stage: w.stageId, status: w.status, imprint: Number(w.progress.imprint.toFixed(2)), home: sc.filter((e) => e.state === 'idle').length, stray: sc.filter((e) => e.state === 'stray').length, plume: sc.filter((e) => e.state === 'plume').length };
  });
  console.log('shot', name, JSON.stringify(s));
}

if (want('gallery')) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${ROOT}?gallery=return&quality=${Q}&spin=0&angle=0&tilt=0.18`);
  await page.waitForFunction(() => window.__gallery?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  writeFileSync(`${OUT}/return-sequence.png`, await page.screenshot());
  await page.evaluate(() => window.__gallery.setAngle(0.6));
  await page.waitForTimeout(400);
  writeFileSync(`${OUT}/return-sequence-angle.png`, await page.screenshot());
  console.log('shot return-sequence');
  await page.close();
}

if (want('plume')) {
  const page = await boot();
  await jump(page, 1, '', 'w.progress.imprint = 0.15;');
  await page.evaluate(() => (window.__hw.app.hudDetailed = true));
  // Just outside the plume in open water, looking back across it toward the inlet and the weeds.
  await hold(page, 'for (const t of w.live("trout")) t.alive = false; w.body.pos = { x: -8, y: -3.2, z: -2 }; w.body.yaw = Math.atan2(-9, -14); w.body.pitch = 0; w.body.vel = { x: 0, y: 0, z: 0 };', 420);
  await snap(page, 'plume-fry-outside', 'bars');
  // Inside it: the home scent bar fills.
  await hold(page, 'for (const t of w.live("trout")) t.alive = false; w.body.pos = { x: -18, y: -2.9, z: -12.6 }; w.body.yaw = Math.atan2(3, 9); w.body.pitch = 0; w.body.vel = { x: 0, y: 0, z: 0 };', 420);
  await snap(page, 'plume-fry', 'bars');
  await page.close();
}

if (want('scent')) {
  for (const [name, imprint, homing] of [
    ['strong', 1, 0.6],
    ['weak', 0.05, -0.6],
  ]) {
    const page = await boot();
    await jump(page, 4, '', `w.progress.imprint = ${imprint}; w.fish = { ...w.fish, z: { ...w.fish.z, homing: ${homing} } };`);
    await page.evaluate(() => (window.__hw.app.hudDetailed = true));
    // Off the coast between the river mouths, looking in at them.
    // Just off the coast, between home and a wrong river, looking along the coast at the wrong river's mouth.
    await hold(page, 'const m = w.stage.homeMouth; const wrong = m === 26 ? 0 : m + 26; for (const b of w.live("bear")) b.alive = false; w.body.pos = { x: 85, y: -2.4, z: wrong - 7 * Math.sign(wrong - m) }; w.body.yaw = Math.atan2(wrong - w.body.pos.z, 97 - 85); w.body.pitch = 0; w.body.vel = { x: 0, y: 0, z: 0 };', 600);
    await snap(page, `scent-mouths-${name}`, 'bars');
    // In the home river below the fork.
    await hold(page, 'const m = w.stage.homeMouth; for (const b of w.live("bear")) b.alive = false; for (const l of w.live("lure")) l.alive = false; w.body.pos = { x: 128, y: -1.4, z: m }; w.body.yaw = 0; w.body.pitch = 0; w.body.vel = { x: 0, y: 0, z: 0 };', 400);
    await snap(page, `scent-river-${name}`, 'bars');
    await page.close();
  }
}

await browser.close();
