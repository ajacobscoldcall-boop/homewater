// Screenshots of a bear strike from the player's camera, and the world above the surface.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4183` after a build, then
//   node tests/smoke/above-shots.mjs [outDir]
// ONLY=creek,river,beach,riffle,beat,sky runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/above';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4183/?quality=${process.env.Q ?? 'high'}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'M', gore = 'unflinching') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript((g) => {
    // Play the death beat at its real length (the game shortens it for automated browsers).
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: g, volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  }, gore);
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.locator('.grid3 button.choice', { hasText: sex === 'F' ? '♀' : '♂' }).first().click().catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  return page;
}

async function jump(page, stage, setup = '') {
  await page.evaluate(
    ([i, s]) => {
      const app = window.__hw.app;
      if (s) new Function('app', 'w', s)(app, app.world);
      app.debugJump(i);
    },
    [stage, setup],
  );
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw.step(30));
  await page.waitForTimeout(300);
}

async function snap(page, name) {
  await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  await page.waitForTimeout(250);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  console.log('shot', name);
}

/**
 * Put a bear by the fish, stop the sim, and pose it: warn, then strike at k.
 * yawOff turns the fish from facing the bear (0) so the camera sees it side on.
 */
async function bearPose(page, name, { state, k, yawOff = 0.35, back = 0, near = 0, from = -1 }) {
  await page.evaluate(
    ([state, k, yawOff, back, near, from]) => {
      const app = window.__hw.app;
      const w = app.world;
      app.mode = 'menu';
      let bear = w.live('bear').sort((a, b) => Math.abs(a.pos.x - w.body.pos.x) - Math.abs(b.pos.x - w.body.pos.x))[0];
      const f = w.body.pos;
      if (w.stageId === 'spawn') {
        for (const b of w.live('bear')) b.alive = false;
        const side = w.fish.habitat === 'beach' || f.z > 0 ? 1 : -1;
        // near > 0: the fish this far from the bank's foot (z = +-8).
        if (near > 0) {
          f.z = side * (8 - near);
          f.y = Math.max(w.arena.floor(f.x, f.z) + 0.4, Math.min(f.y, -0.9));
        }
        bear = w.spawn('bear', { x: f.x, y: 0.8, z: side * 8.6 }, { radius: 1.2, state: 'warn', timer: 1, home: { x: f.x, y: 0, z: f.z } });
      } else {
        // Move the fish to the bear's riffle, under it.
        f.x = bear.pos.x - 1;
        f.z = bear.pos.z - Math.sign(bear.pos.z - (w.stage.layout?.homeMouth ?? 0)) * 3.2 * 0 + (bear.pos.z > 0 ? -3.5 : 3.5);
        f.y = Math.max(w.arena.floor(f.x, f.z) + 0.5, f.y);
        bear.home = { x: f.x, y: 0, z: f.z };
      }
      const toBear = Math.atan2(bear.pos.z - f.z, bear.pos.x - f.x);
      w.body.yaw = toBear + yawOff;
      w.body.pitch = 0;
      f.x -= Math.cos(w.body.yaw) * back;
      f.z -= Math.sin(w.body.yaw) * back;
      bear.state = state;
      const warn = w.p.get(w.stageId === 'return' ? 'return.bearWarning' : 'spawn.bearWarning');
      bear.timer = state === 'warn' ? (1 - k) * warn : (1 - k) * 0.6;
      // from >= 0: play the strike from k = from to k over frames, so splashes happen.
      if (from >= 0) {
        // Seen standing first (warn), so the renderer sees the head go in.
        bear.state = 'warn';
        bear.timer = 0.05;
        let frames = 0;
        const end = (1 - k) * 0.6;
        const tick = () => {
          if (bear.state === 'warn' && ++frames > 2) {
            bear.state = 'strike';
            bear.timer = (1 - from) * 0.6;
          }
          if (bear.state === 'warn') return requestAnimationFrame(tick);
          bear.timer = Math.max(end, bear.timer - 0.012);
          if (bear.timer > end) requestAnimationFrame(tick);
          else window.__hwHeld = true;
        };
        window.__hwHeld = false;
        requestAnimationFrame(tick);
      } else window.__hwHeld = true;
    },
    [state, k, yawOff, back, near, from],
  );
  await page.waitForFunction(() => window.__hwHeld, null, { timeout: 60000 });
  if (from < 0) await page.waitForTimeout(1200);
  await snap(page, name);
}

for (const hab of ['creek', 'river', 'beach']) {
  if (!want(hab)) continue;
  const page = await boot('M');
  await jump(page, 5, `w.fish.habitat = '${hab}'; w.progress.isJack = false; w.progress.adultSize = 1;`);
  await bearPose(page, `bear-${hab}-warn`, { state: 'warn', k: 0.7, near: 1.2, back: 1.5 });
  await bearPose(page, `bear-${hab}-strike`, { state: 'strike', k: 0.45, near: 1.2, back: 1.5, from: 0.15 });
  await bearPose(page, `bear-${hab}-strike-late`, { state: 'strike', k: 0.8, near: 1.2, back: 1.5 });
  await bearPose(page, `bear-${hab}-strike-far`, { state: 'strike', k: 0.8 });
  await page.close();
}

if (want('riffle')) {
  const page = await boot('M');
  await jump(page, 4);
  await bearPose(page, 'bear-riffle-warn', { state: 'warn', k: 0.7 });
  await bearPose(page, 'bear-riffle-strike', { state: 'strike', k: 0.45, from: 0.15 });
  await bearPose(page, 'bear-riffle-strike-late', { state: 'strike', k: 0.8 });
  await page.close();
}

for (const [tag, z] of want('beat') ? [['near', 6.6], ['far', 0]] : []) {
  const page = await boot('M');
  await jump(page, 5, `w.fish.habitat = 'creek'; w.progress.isJack = false; w.progress.adultSize = 1;`);
  await page.evaluate((z) => {
    const app = window.__hw.app;
    const w = app.world;
    const f = w.body.pos;
    f.z = z;
    f.y = Math.max(w.arena.floor(f.x, f.z) + 0.5, -1.0);
    w.body.yaw = Math.PI / 2 - 0.5;
    app.stepSim(0);
  }, z);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const app = window.__hw.app;
    const w = app.world;
    const f = w.body.pos;
    w.spawn('bear', { x: f.x, y: 0.8, z: 8.6 }, { radius: 1.2, state: 'strike', timer: 0.3, home: { x: f.x, y: 0, z: f.z } });
    w.die('bear');
    app.stepSim(0);
  });
  for (const ms of [400, 1000, 1800]) {
    await page.waitForTimeout(ms === 400 ? 400 : ms - (ms === 1000 ? 400 : 1000));
    writeFileSync(`${OUT}/beat-bear-${tag}-${ms}.png`, await page.screenshot());
    console.log('shot beat', tag, ms);
  }
  await page.close();
}

// Looking up at the surface in each stage.
if (want('sky')) {
  for (const [stage, name, setup] of [
    [1, 'fry', ''],
    [2, 'smolt', ''],
    [3, 'ocean', ''],
    [4, 'return', ''],
    [5, 'spawn-creek', `w.fish.habitat = 'creek';`],
    [5, 'spawn-beach', `w.fish.habitat = 'beach';`],
  ]) {
    const page = await boot('M');
    await jump(page, stage, setup);
    await page.evaluate(() => {
      const app = window.__hw.app;
      const w = app.world;
      app.mode = 'menu';
      // First person, looking up through the window.
      app.renderer.cameraMode = 'first';
      w.body.pitch = 0.95;
      w.body.pos.y = Math.max(w.arena.floor(w.body.pos.x, w.body.pos.z) + 0.6, w.arena.surfaceY - 3.5);
    });
    await page.waitForTimeout(1500);
    await snap(page, `sky-${name}`);
    await page.close();
  }
}

await browser.close();
console.log('done');
