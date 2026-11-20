// Documentary view's scent shimmer and light track beside the default view's specks and markers (review shots).
// Usage: start `npx vite preview --port 4194` after a build, then node tests/smoke/camera-cues.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/camera';
const BASE = `http://localhost:${process.env.PW_PORT ?? 4194}/?quality=${process.env.QUALITY ?? 'high'}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(doc) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript((doc) => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'unflinching', volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false, documentaryView: doc }));
  }, doc);
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.evaluate(() => window.__hw.app.debugJump(4));
  await page.click('#btn-play');
  await page.waitForTimeout(300);
  await page.evaluate(() => setInterval(() => (window.__hw.app.world.body.energy = 1), 50));
  return page;
}

for (const doc of [false, true]) {
  const tag = doc ? 'doc' : 'game';
  const page = await boot(doc);
  // On the magnetic track at sea, heading for the coast.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const s = w.stage;
    const x = 12;
    const t = Math.min(1, Math.max(0, x / 90)); // COAST in return.ts
    const z = s.trackStartZ + (s.homeMouth - s.trackStartZ) * t + s.trackBend * Math.sin(Math.PI * t);
    w.body.pos = { x, y: -3, z };
    w.body.yaw = 0;
    w.body.pitch = 0;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  await page.keyboard.up('KeyW');
  console.log(tag, 'track', await page.evaluate(() => window.__hw.app.world.live('track').length));
  writeFileSync(`${OUT}/camera-track-${tag}.png`, await page.screenshot());
  // In the home river's plume of scent.
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const s = w.stage;
    w.entities.forEach((e) => (e.kind === 'bear' || e.kind === 'lure' ? (e.alive = false) : 0));
    w.body.pos = { x: 94, y: -1.4, z: s.homeMouth };
    w.body.yaw = 0;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  console.log(tag, 'scent', await page.evaluate(() => window.__hw.app.world.live('scent').length));
  writeFileSync(`${OUT}/camera-scent-${tag}.png`, await page.screenshot());
  await page.close();
}
await browser.close();
