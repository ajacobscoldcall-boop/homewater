// Screenshots of the behaviour stream: schools flashing apart, the bear on the bank,
// what it leaves, and the scavengers. Not part of the smoke suite. Usage: start
// `npx vite preview --port 4185 --strictPort` after a build, then
//   node tests/smoke/behaviour-shots.mjs [outDir]
// ONLY=smolt,patch,bear,eat,scav,end,gallery runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/behaviour';
const PORT = process.env.PW_PORT ?? 4185;
const BASE = `http://localhost:${PORT}/?quality=${process.env.Q ?? 'high'}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'M', gore = 'unflinching') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript((g) => {
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

/** Freeze play and hold the camera at a point, looking at another (above or below the water). */
async function camera(page, pos, at) {
  await page.evaluate(
    ([p, a]) => {
      const app = window.__hw.app;
      app.mode = 'menu';
      const r = app.renderer;
      r.updateCamera = () => {
        r.camera.position.set(p[0], p[1], p[2]);
        r.camera.lookAt(a[0], a[1], a[2]);
      };
    },
    [pos, at],
  );
}

/** Run the sim n steps in small slices so the renderer sees each. */
async function steps(page, n) {
  for (let i = 0; i < n; i += 4) {
    await page.evaluate(() => window.__hw.step(4));
    await page.waitForTimeout(16);
  }
}

if (want('smolt')) {
  const page = await boot('M');
  await jump(page, 2);
  // Into the river; a seal lunges through the school beside the fish.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.body.pos.x = 120;
    w.stage.sealTimer = 99;
    w.stage.birdTimer = 99;
    w.stage.mergTimer = 99;
    for (const s of w.live('smolt')) {
      s.pos.x += 114;
      s.vel = { x: 0, y: 0, z: 0 };
    }
  });
  await steps(page, 120);
  await snap(page, 'smolt-school');
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.body.pos;
    // A gull's plunge has just landed among the school (the school bursts away from it).
    w.spawn('birdShadow', { x: f.x + 2.5, y: 0, z: f.z + 1.5 }, { radius: 2.6, state: 'strike', timer: 0.5 });
    w.stage.grace = 5;
  });
  await steps(page, 16);
  await snap(page, 'smolt-flash');
  await steps(page, 120);
  await snap(page, 'smolt-regroup');
  await page.close();
}

if (want('patch')) {
  const page = await boot('M');
  await jump(page, 3);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.stage.predatorSpawned = true;
  });
  await steps(page, 60);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const c = w.stage.ballCenter;
    w.body.pos = { x: c.x, y: c.y + 1, z: c.z - 9 };
    w.body.yaw = Math.PI / 2;
    w.body.vel = { x: 0, y: 0, z: 0 };
  });
  await steps(page, 8);
  await snap(page, 'patch-calm');
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const c = w.stage.ballCenter;
    w.spawn('shark', { x: c.x - 9, y: c.y - 1, z: c.z + 2 }, { radius: 1.5, state: 'charge', timer: 3, vel: { x: 12, y: 1, z: 0 } });
    w.body.pos = { x: c.x, y: c.y + 1, z: c.z - 9 };
  });
  await steps(page, 36);
  await snap(page, 'patch-flash');
  await page.close();
}

/** Spawning grounds as a large male in a creek, with the bear placed and frozen. */
async function grounds(page, run = 1) {
  await jump(page, 5, `w.fish.habitat = 'creek'; w.progress.isJack = false; w.progress.adultSize = 1; w.conditions.runSize = ${run};`);
}

if (want('bear')) {
  const page = await boot('M');
  await grounds(page);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const b = w.live('bear')[0];
    b.pos.x = 18;
    w.stage.bearSide = 1;
    b.pos.z = 8.6;
    w.stage.bearGoalX = 36;
    w.stage.bearTimer = 99;
  });
  await steps(page, 40);
  await camera(page, [14, 3.2, -2], [19, 1.1, 8.6]);
  await page.waitForTimeout(600);
  await snap(page, 'bear-patrol-above');
  await page.close();
}

if (want('eat')) {
  const page = await boot('M');
  await grounds(page, 1.8);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const b = w.live('bear')[0];
    w.stage.bearSide = 1;
    b.pos.x = 20;
    b.pos.z = w.p.get('spawn.bearEatBank');
    b.state = 'eat';
    b.timer = 99;
    b.vel = { x: 0, y: 0, z: 0 };
    w.stage.bearMeal = 'male';
    w.stage.bearTimer = 99;
    w.spawn('carcass', { x: 14, y: 0, z: 8.6 }, { radius: 1, state: 'female', value: 0.4, yaw: 0.4 });
    w.spawn('carcass', { x: 25, y: 0, z: 8.6 }, { radius: 1.1, state: 'male', value: 0.2, yaw: 2.2 });
  });
  await steps(page, 8);
  await camera(page, [17.2, 2.2, 6.2], [20, 0.6, 9.6]);
  await page.waitForTimeout(800);
  await snap(page, 'bear-eat-above');
  await page.close();
}

if (want('scav')) {
  const page = await boot('M');
  await grounds(page, 1.8);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.stage.bearTimer = 999;
    w.stage.vigour = 0.2;
    w.spawn('carcass', { x: 16, y: 0, z: 8.6 }, { radius: 1, state: 'female', value: 0.4, yaw: 0.4 });
    w.spawn('carcass', { x: 23, y: 0, z: 8.6 }, { radius: 1.1, state: 'male', value: 0.2, yaw: 2.2 });
  });
  // Time for the gulls and the eagle to come down.
  await steps(page, 60);
  await page.evaluate(() => (window.__hw.app.mode = 'menu'));
  await page.waitForTimeout(14000);
  await camera(page, [12, 3.5, 2], [19, 0, 8]);
  await page.waitForTimeout(500);
  await snap(page, 'scavengers-above');
  // From under the water: gulls on the surface beside a dead fish drifting over.
  await page.evaluate(() => {
    const app = window.__hw.app;
    const r = app.renderer;
    const d = r.scavengers.drifters.find((x) => x.mesh.visible);
    const p = d ? d.mesh.position.clone() : { x: 20, y: 0, z: 0 };
    r.updateCamera = () => {
      r.camera.position.set(p.x - 3.2, -1.5, p.z - 1.2);
      r.camera.lookAt(p.x, p.y, p.z);
    };
    app.world.body.pos.x = 2;
  });
  await page.waitForTimeout(600);
  await snap(page, 'scavengers-below');
  await page.close();
}

if (want('end')) {
  const page = await boot('F');
  await jump(page, 5, `w.fish.habitat = 'creek';`);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.stage.bearTimer = 999;
    w.debugComplete();
  });
  // Through to the carcass scene.
  await page.waitForTimeout(9000);
  await snap(page, 'end-scavengers');
  await page.close();
}

if (want('gallery')) {
  for (const id of ['eagle', 'eagleFly', 'eaglePerch', 'eagleGrab', 'gullFloat']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`http://localhost:${PORT}/?gallery=${id}&quality=high`);
    await page.waitForFunction(() => window.__gallery?.ready, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    writeFileSync(`${OUT}/gallery-${id}.png`, await page.screenshot());
    console.log('shot gallery', id);
    await page.close();
  }
}

await browser.close();
console.log('done');
