// Screenshots of each cinematic camera moment (src/render/cinematics.ts), at High quality.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4182` after a build, then
//   node tests/smoke/cinematic-shots.mjs [outDir]
// ONLY=hatch,lake,smolt,sea,maturation,home,spawn runs just those. HUD=1 keeps the HUD in the picture.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/cinematics';
const BASE = process.env.SHOTS_URL ?? 'http://localhost:4182/?quality=high';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'F') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'unflinching', volume: 0, muted: true }));
    localStorage.removeItem('homewater.cinematics.seen');
  });
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.locator('.grid3 button.choice', { hasText: sex === 'F' ? '♀' : '♂' }).first().click().catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  return page;
}

async function jump(page, stage) {
  await page.evaluate((i) => window.__hw.app.debugJump(i), stage);
  await page.click('#btn-play');
}

/** Wait until the shot is in its hold (full weight), then take the picture. */
async function capture(page, name, moment, at = 0.5) {
  const ok = await page
    .waitForFunction(
      ([m, a]) => {
        const d = window.__hw.app.renderer.cinematics.director;
        const s = d.active;
        return s && s.moment === m && s.t >= s.duration * a;
      },
      [moment, at],
      { timeout: 30000, polling: 50 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    console.error(`no ${moment} shot`, await page.evaluate(() => ({ q: window.__hw.app.renderer.cinematics.director.queued, s: window.__hw.state() })));
    return;
  }
  if (!process.env.HUD) await page.evaluate(() => (document.getElementById('hud').style.visibility = 'hidden'));
  const buf = await page.screenshot();
  await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  writeFileSync(`${OUT}/cinematic-${name}.png`, buf);
  console.log('shot', name);
}

/** Emit a sim event and let App hand it to the renderer. */
const emit = (page, type, key, setup = '') =>
  page.evaluate(
    ([t, k, s]) => {
      const app = window.__hw.app;
      if (s) new Function('w', s)(app.world);
      app.world.emit(t, k);
      window.__hw.step(0);
    },
    [type, key, setup],
  );

if (want('hatch')) {
  const page = await boot('F');
  await page.click('#btn-play');
  // Hatching comes at the end of the egg phase; step the sim there.
  await page.evaluate(() => {
    for (let i = 0; i < 3000 && window.__hw.app.world.stage.phase === 'egg'; i++) window.__hw.step(1);
  });
  await capture(page, 'hatch', 'hatch', 0.4);
  await page.close();
}

if (want('lake') || want('smolt') || want('sea') || want('maturation') || want('home')) {
  const page = await boot('F');
  if (want('lake')) {
    await jump(page, 1);
    await capture(page, 'lake', 'lakeFirstLook', 0.7);
  }
  if (want('smolt')) {
    await jump(page, 2);
    await page.evaluate(() => window.__hw.step(60));
    await capture(page, 'smolt', 'smoltNight', 0.5);
  }
  if (want('sea') || want('maturation')) {
    await jump(page, 3);
    if (want('sea')) await capture(page, 'sea', 'sea', 0.5);
    if (want('maturation')) {
      await page.waitForFunction(() => !window.__hw.app.renderer.cinematics.director.active, null, { timeout: 30000 });
      await emit(page, 'reveal', 'ocean.revealFemale');
      await capture(page, 'maturation', 'maturation', 0.55);
    }
  }
  if (want('home')) {
    await jump(page, 4);
    // Put the fish at the home river's mouth, heading in.
    await emit(page, 'caption', 'return.rightRiver', 'w.body.pos = { x: 86, y: -2.5, z: w.stage.homeMouth }; w.body.yaw = 0;');
    await capture(page, 'home', 'homeRiver', 0.6);
  }
  await page.close();
}

if (want('spawn')) {
  const page = await boot('M');
  await jump(page, 5);
  // Beside the female over her redd, side by side.
  await emit(
    page,
    'spawned',
    'spawn.maleSpawned',
    "const f = w.live('female')[0]; f.state = 'spawn'; w.body.pos = { x: f.pos.x, y: f.pos.y + 0.1, z: f.pos.z + 0.9 }; w.body.yaw = f.yaw;",
  );
  await capture(page, 'spawn', 'spawning', 0.5);
  await page.close();
}

await browser.close();
