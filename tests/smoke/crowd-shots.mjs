// Screenshots of the crowded spawning grounds (Track 2.2): small, typical and big runs from
// above the bed and from the play camera, char and a gull at a female's loose eggs, a jack's
// opening at a crowd pair (often cut short by the season's 180 s cap; not kept in the gallery), and the crowd's dead
// along the edge. Not part of the smoke suite.
// Usage: start `npx vite preview --port 4202 --strictPort` after a build, then
//   node tests/smoke/crowd-shots.mjs [outDir]
// ONLY=small,typical,big,play,eggs,gull,jack,dead runs just those. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/crowd';
const PORT = process.env.PW_PORT ?? 4202;
const BASE = `http://localhost:${PORT}/?quality=${process.env.Q ?? 'high'}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'F') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'documentary', volume: 0, muted: true, contentSeen: true }));
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

/** Jump to the grounds with this run size (relative to a typical run) and habitat. */
async function grounds(page, run, habitat = 'creek', jack = false) {
  await page.evaluate(
    ([r, h, j]) => {
      const app = window.__hw.app;
      const w = app.world;
      w.conditions.runSize = r;
      delete w.conditions.harvestRate;
      w.fish.habitat = h;
      if (j) w.progress.isJack = true;
      app.debugJump(5);
    },
    [run, habitat, jack],
  );
  await page.click('#btn-play');
  // Hold the bear off (its strikes are timed by the stage) and let only our steps move the sim.
  await page.evaluate(() => {
    const app = window.__hw.app;
    app.world.stage.bearTimer = 1e9;
    for (const b of app.world.live('bear')) b.state = 'patrol';
    app.mode = 'menu';
    window.__hw.step(30);
  });
  await page.waitForTimeout(300);
}

async function snap(page, name) {
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = 'hidden';
    for (const el of document.querySelectorAll('#captions, .caption, #guide')) el.style.visibility = 'hidden';
  });
  await page.waitForTimeout(250);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  await page.evaluate(() => (document.getElementById('hud').style.visibility = ''));
  console.log('shot', name);
}

/** Freeze play and hold the camera at a point, looking at another. */
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
  await page.waitForTimeout(400);
}

async function steps(page, n) {
  for (let i = 0; i < n; i += 6) {
    await page.evaluate(() => window.__hw.step(6));
    await page.waitForTimeout(12);
  }
}

const count = (page) =>
  page.evaluate(() => {
    const n = {};
    for (const e of window.__hw.app.world.entities) if (e.alive && e.kind.startsWith('crowd')) n[e.kind] = (n[e.kind] ?? 0) + 1;
    return JSON.stringify(n);
  });

for (const [name, run] of [['small', 0.4], ['typical', 1], ['big', 2.4]]) {
  if (!want(name)) continue;
  const page = await boot('F');
  await grounds(page, run);
  // Some way into the season, so pairs have formed and the first fish have died.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    for (const b of w.live('bear')) b.timer = 99;
  });
  await steps(page, 900);
  console.log(name, await count(page));
  // Low over the bed, looking up the grounds from downstream.
  await camera(page, [-3, -0.9, -2], [22, -2.2, 0.5]);
  await snap(page, `crowd-${name}`);
  // From above the middle of the bed (seen through the water).
  await camera(page, [20, -0.25, -7.5], [20, -2.3, 1.5]);
  await snap(page, `crowd-${name}-across`);
  await page.close();
}

if (want('play')) {
  const page = await boot('M');
  await grounds(page, 1.8);
  await steps(page, 600);
  await page.waitForTimeout(400);
  await snap(page, 'crowd-play-male');
  await page.close();
}

if (want('eggs') || want('gull')) {
  // A female who has spawned and not covered her eggs: the char come (and in the creek, a gull).
  const page = await boot('F');
  await grounds(page, 1.2, 'creek');
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const s = w.stage;
    const g = w.live('gravelPatch').sort((a, b) => b.value - a.value)[0];
    w.body.pos = { x: g.pos.x, y: -1.5, z: g.pos.z };
    const r = w.spawn('redd', { x: g.pos.x, y: -2.2, z: g.pos.z }, { radius: 1.2, value: 1, state: 'dug' });
    s.dig = 1;
    s.quality = g.value;
    s.spawned = true;
    s.spawnedAt = w.stageTime;
    for (const b of w.live('bear')) b.timer = 99;
    s.bearTimer = 999;
    s.rivalTimer = 999;
    void r;
    // Only the steps below move the sim.
    window.__hw.app.mode = 'menu';
  });
  await steps(page, 60 * 6);
  const fish = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const r = w.live('redd')[0];
    return [r.pos.x, r.pos.z];
  });
  // Side-on along the bed, a little above it, toward the char at the redd.
  const char = await page.evaluate(() => {
    const c = window.__hw.app.world.live('trout').find((t) => t.state === 'strike' || t.state === 'warn') ?? window.__hw.app.world.live('trout')[0];
    return [c.pos.x, c.pos.y, c.pos.z];
  });
  await camera(page, [char[0] - 0.6, char[1] + 0.35, char[2] - 2.6], [char[0], char[1] - 0.05, char[2]]);
  await snap(page, 'crowd-char-eggs');
  // The gull settles on the water over the redd a few seconds later.
  await steps(page, 60 * 2);
  console.log('gull', await page.evaluate(() => JSON.stringify(window.__hw.app.world.live('gull').map((g) => [g.state, g.pos]))));
  await camera(page, [fish[0] - 1.2, -1.3, fish[1] - 1.0], [fish[0] + 0.6, 0.2, fish[1] + 0.4]);
  await snap(page, 'crowd-gull-eggs');
  await page.close();
}

if (want('jack')) {
  const page = await boot('M');
  await grounds(page, 2.2, 'creek', true);
  // Wait for a crowd opening near the jack.
  let seen = false;
  for (let k = 0; k < 120 && !seen; k++) {
    await steps(page, 30);
    seen = await page.evaluate(() => {
      const w = window.__hw.app.world;
      const c = w.stage.crowd;
      w.stage.vigour = 1;
      if (c.openId) return true;
      // Move the jack beside the busiest pairs so an opening comes his way.
      const f = w.entities.find((e) => e.alive && e.kind === 'crowdFemale' && e.state === 'dig');
      if (f) w.body.pos = { x: f.pos.x + 4, y: -1.5, z: f.pos.z + 2 };
      return false;
    });
  }
  await page.evaluate(() => (window.__hw.app.mode = 'menu'));
  await page.waitForTimeout(400);
  await snap(page, 'crowd-jack-opening');
  await page.close();
}

if (want('dead')) {
  const page = await boot('F');
  await grounds(page, 2.4);
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    for (const b of w.live('bear')) b.timer = 99;
  });
  await steps(page, 60 * 70);
  console.log('dead', await count(page));
  await camera(page, [14, -0.6, -3], [22, -2.3, -7]);
  await snap(page, 'crowd-dead-edge');
  await page.close();
}

await browser.close();
