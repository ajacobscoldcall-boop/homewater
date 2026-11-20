// Screenshots for the scale and fish-look stream: every stage from the play camera,
// side-on and top-down views of the fish, the egg nest, the krill patch, the night
// smolt run and the mid-water drift. Not part of the smoke suite. Usage: start
// `npx vite preview --port 4193 --strictPort` after a build, then
//   node tests/smoke/scale-shots.mjs [outDir]
// ONLY=egg,alevin,fry,smolt,night,ocean,return,spawn,gallery runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/scale';
const PORT = process.env.PW_PORT ?? 4193;
const Q = process.env.Q ?? 'high';
const BASE = `http://localhost:${PORT}/?quality=${Q}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'M') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'documentary', volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
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
  await page.waitForTimeout(300);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  console.log('shot', name);
}

/** Run the sim n steps in small slices so the renderer sees each. */
async function steps(page, n) {
  for (let i = 0; i < n; i += 4) {
    await page.evaluate(() => window.__hw.step(4));
    await page.waitForTimeout(16);
  }
}

/** Freeze play and hold the camera, given relative to the player's fish (or absolute). */
async function camera(page, off, at = [0, 0, 0], rel = true) {
  await page.evaluate(
    ([o, a, r]) => {
      const app = window.__hw.app;
      app.mode = 'menu';
      const re = app.renderer;
      const b = app.world.body.pos;
      const base = r ? [b.x, b.y, b.z] : [0, 0, 0];
      re.updateCamera = () => {
        re.camera.position.set(base[0] + o[0], base[1] + o[1], base[2] + o[2]);
        re.camera.lookAt(base[0] + a[0], base[1] + a[1], base[2] + a[2]);
      };
    },
    [off, at, rel],
  );
  await page.waitForTimeout(500);
}

if (want('egg')) {
  const page = await boot();
  await jump(page, 0);
  // Still in the egg phase (first 4 s): the nest from close above.
  await page.evaluate(() => (window.__hw.app.world.stageTime = 2.5));
  await camera(page, [0.25, 0.45, 0.35], [0, -0.05, 0]);
  await snap(page, 'egg-nest');
  await camera(page, [0.06, 0.03, 0.16], [0, -0.07, 0]);
  await snap(page, 'egg-close');
  await page.close();
}

if (want('alevin')) {
  const page = await boot();
  await jump(page, 0);
  await steps(page, 360);
  await snap(page, 'alevin-play');
  await camera(page, [0, 0.05, 0.42], [0, 0, 0]);
  await snap(page, 'alevin-side');
  await page.close();
}

if (want('fry')) {
  const page = await boot();
  await jump(page, 1);
  await steps(page, 120);
  await snap(page, 'fry-play');
  // Out in open water, beside a plankton swarm.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const pl = w.live('plankton')[0];
    if (pl) w.body.pos = { x: pl.pos.x - 0.6, y: pl.pos.y, z: pl.pos.z - 0.2 };
    w.body.yaw = 0;
  });
  await steps(page, 4);
  await camera(page, [0.1, 0.08, 0.75], [0.25, 0, 0]);
  await snap(page, 'fry-side');
  await page.close();
}

if (want('smolt') || want('night')) {
  const page = await boot();
  await jump(page, 2);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.stage.sealTimer = 99;
    w.stage.birdTimer = 99;
    w.stage.mergTimer = 99;
    for (const t of w.live('trout')) t.alive = false;
  });
  await steps(page, 240);
  await snap(page, 'smolt-play');
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.body.pos;
    w.spawn('birdShadow', { x: f.x + 3, y: 0, z: f.z + 1 }, { radius: 2.6, state: 'warn', timer: 1.2 });
  });
  await steps(page, 12);
  await page.evaluate(() => (document.querySelector('#hud').dataset.keep = '1'));
  writeFileSync(`${OUT}/smolt-bird-warning-hud.png`, await page.screenshot());
  await snap(page, 'smolt-bird-warning');
  await camera(page, [-1.5, -0.6, 0.8], [2.5, 2.5, 1]);
  await snap(page, 'smolt-up');
  await camera(page, [0, 0.1, 1.4], [0, 0, 0]);
  await snap(page, 'smolt-side');
  await page.close();
}

if (want('ocean')) {
  const page = await boot();
  await jump(page, 3);
  await page.evaluate(() => (window.__hw.app.world.stage.predatorSpawned = true));
  await steps(page, 60);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const c = w.stage.ballCenter;
    if (c) {
      w.body.pos = { x: c.x, y: c.y + 0.5, z: c.z - 5 };
      w.body.yaw = Math.PI / 2;
      w.body.vel = { x: 0, y: 0, z: 0 };
    }
  });
  await steps(page, 8);
  await snap(page, 'ocean-krill-play');
  await camera(page, [-0.6, 0.15, 1.3], [0.4, 0, 2.5]);
  await snap(page, 'ocean-krill-close');
  await page.close();
}

if (want('return')) {
  const page = await boot();
  await jump(page, 4, 'w.progress.adultSize = 1; w.progress.isJack = false;');
  await steps(page, 120);
  await snap(page, 'return-play');
  await camera(page, [0, 2.2, 0.01], [0, 0, 0]);
  await snap(page, 'return-top');
  await camera(page, [0, 0.1, 1.8], [0, 0, 0]);
  await snap(page, 'return-side');
  await page.close();
}

if (want('spawn')) {
  for (const sex of ['F', 'M']) {
    const page = await boot(sex);
    await jump(page, 5, `w.fish.habitat = 'creek'; w.progress.isJack = false; w.progress.adultSize = 1;`);
    await page.evaluate(() => (window.__hw.app.world.stage.bearTimer = 999));
    await steps(page, 120);
    await snap(page, `spawn-${sex}-play`);
    await camera(page, [0, 2.2, 0.01], [0, 0, 0]);
    await snap(page, `spawn-${sex}-top`);
    await camera(page, [0, 0.1, 1.8], [0, 0, 0]);
    await snap(page, `spawn-${sex}-side`);
    await page.close();
  }
}

if (want('gallery')) {
  for (const g of ['salmon', 'animals']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`http://localhost:${PORT}/?gallery=${g}&quality=${Q}`);
    await page.waitForTimeout(2500);
    writeFileSync(`${OUT}/gallery-${g}.png`, await page.screenshot());
    console.log('shot gallery', g);
    await page.close();
  }
}

await browser.close();
