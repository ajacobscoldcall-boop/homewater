// Review screenshots of weather, season, lake ice and the world above the water (render only).
// Not part of the smoke suite. Usage: start `npx vite preview --port 4215` after a build, then
//   node tests/smoke/weather-shots.mjs [outDir]
// ONLY=name,name runs just those shots. Q=low|medium|high (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/weather';
const PORT = process.env.PW_PORT ?? '4215';
const Q = process.env.Q ?? 'high';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${PORT}/?quality=${Q}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'documentary', volume: 0, muted: true, contentSeen: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
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
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = 'hidden';
    for (const id of ['captions', 'guide', 'toasts', 'journal-chip']) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = 'hidden';
    }
  });
  await page.waitForTimeout(1200);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  console.log('shot', name);
}

/**
 * One shot: jump to a stage, run setup (app, w) in the page, freeze play, fix the weather, place the fish and look.
 * view: 'up' first person looking up through the window; 'chase' the play camera.
 */
async function shot(name, { stage, setup = '', after = '', weather = null, view = 'up', pitch = 0.95, depth = 3.5 }) {
  if (!want(name)) return;
  const page = await boot();
  await jump(page, stage, setup);
  await page.evaluate(
    ([after, weather, view, pitch, depth]) => {
      const app = window.__hw.app;
      const w = app.world;
      if (after) new Function('app', 'w', after)(app, w);
      app.mode = 'menu';
      app.renderer.weatherOverride = weather;
      if (view === 'up') {
        app.renderer.cameraMode = 'first';
        w.body.pitch = pitch;
        w.body.pos.y = Math.max(w.arena.floor(w.body.pos.x, w.body.pos.z) + 0.6, w.arena.surfaceY - depth);
      } else {
        w.body.pos.y = Math.max(w.arena.floor(w.body.pos.x, w.body.pos.z) + 0.6, w.arena.surfaceY - depth);
        w.body.pitch = pitch;
      }
    },
    [after, weather, view, pitch, depth],
  );
  await snap(page, name);
  await page.close();
}

const CLEAR = { overcast: 0, rain: 0, wind: 0.1 };
const GREY = { overcast: 0.9, rain: 0, wind: 0.3 };
const RAIN = { overcast: 1, rain: 1, wind: 0.4 };

// Weather looking up, the same place three ways: the home river on the return.
await shot('weather-return-clear', { stage: 4, weather: CLEAR });
await shot('weather-return-overcast', { stage: 4, weather: GREY });
await shot('weather-return-rain', { stage: 4, weather: RAIN });
// The play camera in rain near the surface.
await shot('weather-return-rain-chase', { stage: 4, weather: RAIN, view: 'chase', pitch: 0.25, depth: 1.2 });
// The lake on a broken-cloud day, and the open sea in a breeze.
await shot('weather-fry-cloud', { stage: 1, weather: { overcast: 0.5, rain: 0, wind: 0.3 } });
await shot('weather-ocean-wind', { stage: 3, weather: { overcast: 0.4, rain: 0, wind: 1 } });
await shot('weather-ocean-calm', { stage: 3, weather: { overcast: 0.1, rain: 0, wind: 0 } });
// The smolt run's night under cloud and rain.
await shot('weather-smolt-rain', { stage: 2, weather: RAIN });
// Winter under the ice (fry checkpoint 1).
await shot('weather-ice-up', { stage: 1, after: 'w.startStage(1, 1); window.__hw.step(10);', pitch: 0.9, depth: 2.5 });
await shot('weather-ice-chase', { stage: 1, after: 'w.startStage(1, 1); window.__hw.step(10);', view: 'chase', pitch: 0.1, depth: 2.5 });
// The year's own weather on the spawning grounds: autumn alders on the banks.
await shot('weather-spawn-autumn', { stage: 5, setup: `w.fish.habitat = 'creek';`, weather: { overcast: 0.35, rain: 0, wind: 0.1 }, pitch: 0.75, depth: 1.2 });

// The world above: the gillnet skiffs and their crew on the return's coast, seen from below.
const AT_NET = `const n = w.live('netLine')[0]; const half = n.size.z / 2; w.body.pos.x = n.pos.x + 6; w.body.pos.z = half - 9; w.body.yaw = Math.PI * 0.5 + 0.9;`;
const NETS = `delete w.conditions.harvestRate;`;
await shot('above2-skiff-up', { stage: 4, setup: NETS, after: AT_NET, weather: CLEAR, pitch: 0.8, depth: 2.5 });
await shot('above2-skiff-chase', { stage: 4, setup: NETS, after: AT_NET, weather: GREY, view: 'chase', pitch: 0.1, depth: 2.2 });
// Bears and the tree line on a creek's bank, looking up toward the bank.
await shot('above2-bank-creek', { stage: 5, setup: `w.fish.habitat = 'creek';`, after: `w.body.pos.z = 5; w.body.yaw = Math.PI / 2;`, weather: CLEAR, pitch: 0.7, depth: 1.0 });
await shot('above2-return-bank', { stage: 4, after: `const b = w.live('bear')[0]; w.body.pos.x = b.pos.x - 4; w.body.pos.z = b.pos.z - Math.sign(b.pos.z) * 4; w.body.yaw = Math.atan2(b.pos.z - w.body.pos.z, b.pos.x - w.body.pos.x);`, weather: CLEAR, pitch: 0.65, depth: 1.0 });

await browser.close();
console.log('done');
